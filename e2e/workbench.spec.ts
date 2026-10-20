import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const SAMPLE_CSV = path.resolve(
  process.cwd(),
  "server/tests/fixtures/sample-segments.csv",
);

test("上传、筛选、刷新恢复、导出与失败清空旧结果", async ({ page }) => {
  await page.goto("/");

  await page.locator("#csv-file").setInputFiles(SAMPLE_CSV);
  await page.locator("#duration-ms").fill("10000");
  await page.getByRole("button", { name: "开始检查" }).click();

  await expect(page.locator(".run-id")).toBeVisible();
  await expect(page.locator(".stat-total .stat-value")).toHaveText("6");
  await expect(page.locator(".stat-valid .stat-value")).toHaveText("2");
  await expect(page.locator(".stat-invalid .stat-value")).toHaveText("4");
  await expect(page.locator("tbody tr")).toHaveCount(6);

  const runId = (await page.locator(".run-id").innerText()).trim();
  expect(runId).toMatch(/^qc-/);
  await expect.poll(() => page.url()).toContain("?runId=");

  // 筛选只影响表格，不改变统计。
  await page.getByRole("button", { name: /^Invalid/ }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await expect(page.locator(".stat-total .stat-value")).toHaveText("6");

  // 导出不受筛选影响，应包含完整 6 条数据。
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 CSV" }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();

  expect(download.suggestedFilename()).toContain("qc-report-");
  expect(downloadPath).not.toBeNull();

  const csv = readFileSync(downloadPath!, "utf8").replace(/^\uFEFF/, "");
  const lines = csv.split(/\r?\n/).filter((line) => line !== "");

  expect(lines).toHaveLength(7);
  expect(lines[0]).toBe("rowIndex,segmentId,startMs,endMs,action,status,errors");
  expect(lines[1]).toContain("s1");
  expect(lines[5]).toContain("EMPTY_ACTION");

  // 刷新必须重新走 GET /api/qc/{runId}，而不是从浏览器存储恢复整份报告。
  const getResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/qc/") &&
      response.request().method() === "GET" &&
      response.status() === 200,
  );

  await page.reload();
  await getResponsePromise;

  await expect(page.locator(".run-id")).toHaveText(runId);
  await expect(page.locator(".stat-total .stat-value")).toHaveText("6");
  await expect(page.locator("tbody tr")).toHaveCount(6);

  // 新请求失败时旧报告与旧 runId 都应被清空。
  await page.locator("#csv-file").setInputFiles({
    name: "bad-header.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("segment_id,start_ms,end_ms\ns1,0,1000\n"),
  });
  await page.locator("#duration-ms").fill("10000");
  await page.getByRole("button", { name: "开始检查" }).click();

  await expect(page.getByText("MISSING_HEADER")).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(0);
  await expect.poll(() => page.url()).not.toContain("runId");
});
