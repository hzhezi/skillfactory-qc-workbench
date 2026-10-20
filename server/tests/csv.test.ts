import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSegmentsCsv } from "../src/qc/csv";
import { QcInputError, type FileErrorCode } from "../src/qc/errorCodes";
import { evaluateSegments } from "../src/qc/rules";

// 官方示例放在 fixture 中，后续 API 测试也可以复用。
const SAMPLE_CSV = readFileSync(
  new URL("./fixtures/sample-segments.csv", import.meta.url),
  "utf8",
);

function captureError(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }

  throw new Error("Expected function to throw");
}

function expectInputError(fn: () => unknown, code: FileErrorCode): void {
  const error = captureError(fn);
  expect(error).toBeInstanceOf(QcInputError);
  expect((error as QcInputError).code).toBe(code);
}

describe("parseSegmentsCsv — 正常解析", () => {
  it("解析题目示例并得到 2 valid / 4 invalid", () => {
    const rows = parseSegmentsCsv(SAMPLE_CSV);

    expect(rows).toHaveLength(6);
    expect(rows[0]).toEqual({
      rowIndex: 1,
      segmentId: "s1",
      startMs: 0,
      endMs: 2000,
      action: "Pick up cup",
    });

    const result = evaluateSegments(rows, 10000);

    expect(result.total).toBe(6);
    expect(result.valid).toBe(2);
    expect(result.invalid).toBe(4);
    expect(result.segments.map((segment) => segment.errors)).toEqual([
      [],
      ["OVERLAP"],
      ["OVERLAP"],
      ["OUT_OF_BOUNDS"],
      ["EMPTY_ACTION"],
      [],
    ]);
  });

  it("支持 UTF-8 BOM 和 CRLF", () => {
    const rows = parseSegmentsCsv(
      "\uFEFFsegment_id,start_ms,end_ms,action\r\ns1,0,2000,Pick\r\n",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.segmentId).toBe("s1");
    expect(rows[0]?.action).toBe("Pick");
  });

  it("支持引用字段内的逗号和转义双引号", () => {
    const rows = parseSegmentsCsv(
      'segment_id,start_ms,end_ms,action\ns1,0,1000,"Move, ""cup"""\n',
    );

    expect(rows[0]?.action).toBe('Move, "cup"');
  });

  it("支持任意列顺序和额外列", () => {
    const rows = parseSegmentsCsv(
      "action,end_ms,segment_id,start_ms,note\nPick,2000,s1,0,hello\n",
    );

    expect(rows[0]).toEqual({
      rowIndex: 1,
      segmentId: "s1",
      startMs: 0,
      endMs: 2000,
      action: "Pick",
    });
  });

  it("重复 segment_id 分别保留，不覆盖", () => {
    const rows = parseSegmentsCsv(
      "segment_id,start_ms,end_ms,action\ns1,0,1000,Pick\ns1,1000,2000,Place\n",
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.segmentId)).toEqual(["s1", "s1"]);
  });

  it("忽略前导、中间和末尾的空白行，rowIndex 只统计数据记录", () => {
    const rows = parseSegmentsCsv(
      "\n  \nsegment_id,start_ms,end_ms,action\n\ns1,0,2000,Pick\n   \n\n",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.rowIndex).toBe(1);
  });

  it("没有结尾换行也能解析", () => {
    const rows = parseSegmentsCsv(SAMPLE_CSV.trimEnd());

    expect(rows).toHaveLength(6);
  });

  it("支持引号内的换行，且不破坏后续记录", () => {
    const rows = parseSegmentsCsv(
      'segment_id,start_ms,end_ms,action\ns1,0,1000,"Pick\nup"\ns2,1000,2000,Move\n',
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.action).toBe("Pick\nup");
    expect(rows[1]?.rowIndex).toBe(2);
    expect(rows[1]?.segmentId).toBe("s2");
  });

  it("支持带引号的数字字段", () => {
    const rows = parseSegmentsCsv(
      'segment_id,start_ms,end_ms,action\ns1," 0 ","2000",Pick\n',
    );

    expect(rows[0]?.startMs).toBe(0);
    expect(rows[0]?.endMs).toBe(2000);
  });

  it("允许空 segment_id", () => {
    const rows = parseSegmentsCsv(
      "segment_id,start_ms,end_ms,action\n,0,2000,Pick\n",
    );

    expect(rows[0]?.segmentId).toBe("");
    expect(evaluateSegments(rows, 5000).segments[0]?.errors).toEqual([]);
  });

  it("保留 action 原文，只用 trim 判断是否为空", () => {
    const rows = parseSegmentsCsv(
      "segment_id,start_ms,end_ms,action\ns1,0,1000,   \ns2,1000,2000,  Move  \n",
    );

    expect(rows[0]?.action).toBe("   ");
    expect(rows[1]?.action).toBe("  Move  ");

    const result = evaluateSegments(rows, 5000);
    expect(result.segments[0]?.errors).toEqual(["EMPTY_ACTION"]);
    expect(result.segments[1]?.errors).toEqual([]);
  });

  it("只有逗号的行是数据行，不是空行", () => {
    const rows = parseSegmentsCsv(
      "segment_id,start_ms,end_ms,action\n,,,\n",
    );

    expect(rows[0]).toEqual({
      rowIndex: 1,
      segmentId: "",
      startMs: null,
      endMs: null,
      action: "",
    });

    const result = evaluateSegments(rows, 10000);
    expect(result.segments[0]?.errors).toEqual(["INVALID_RANGE", "EMPTY_ACTION"]);
  });

  it("数字格式不合法时解析为 null，但保留整份文件", () => {
    const rows = parseSegmentsCsv(
      [
        "segment_id,start_ms,end_ms,action",
        "s1, 0 , 2000 ,Pick",
        "s2,+1,2000,Pick",
        "s3,1.0,2000,Pick",
        "s4,1e3,2000,Pick",
        "s5,,2000,Pick",
        "s6,0,2000.5,Pick",
      ].join("\n"),
    );

    expect(rows[0]?.startMs).toBe(0);
    expect(rows[0]?.endMs).toBe(2000);
    expect(rows.slice(1).map((row) => row.startMs ?? null)).toEqual([
      null,
      null,
      null,
      null,
      0,
    ]);
    expect(rows[5]?.endMs).toBeNull();

    const result = evaluateSegments(rows, 5000);
    expect(result.segments[0]?.status).toBe("VALID");
    for (let index = 1; index < rows.length; index += 1) {
      expect(result.segments[index]?.errors).toEqual(["INVALID_RANGE"]);
    }
  });

  it("数据行以空字段结尾时，空 action 产生 EMPTY_ACTION", () => {
    const rows = parseSegmentsCsv(
      "segment_id,start_ms,end_ms,action\ns1,0,1000,\n",
    );

    expect(rows[0]?.action).toBe("");
    expect(evaluateSegments(rows, 5000).segments[0]?.errors).toEqual([
      "EMPTY_ACTION",
    ]);
  });

  it("额外表头重复不影响必需列映射", () => {
    const rows = parseSegmentsCsv(
      "segment_id,start_ms,end_ms,action,note,note\ns1,0,1000,Pick,a,b\n",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.segmentId).toBe("s1");
  });

  it("混合 LF / CRLF 仍能解析", () => {
    const rows = parseSegmentsCsv(
      "segment_id,start_ms,end_ms,action\r\ns1,0,1000,Pick\n",
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.segmentId).toBe("s1");
  });
});

describe("parseSegmentsCsv — 文件级错误", () => {
  it.each(["", "   ", "\uFEFF", "\uFEFF\r\n", "\n\n"])(
    "空文件或只有空白时返回 EMPTY_FILE：%j",
    (text) => {
      expectInputError(() => parseSegmentsCsv(text), "EMPTY_FILE");
    },
  );

  it("缺少必要表头返回 MISSING_HEADER", () => {
    expectInputError(
      () => parseSegmentsCsv("segment_id,start_ms,end_ms\ns1,0,1000\n"),
      "MISSING_HEADER",
    );
  });

  it("表头大小写敏感", () => {
    expectInputError(
      () =>
        parseSegmentsCsv(
          "Segment_id,start_ms,end_ms,action\ns1,0,1000,Pick\n",
        ),
      "MISSING_HEADER",
    );
  });

  it("表头前有空格时不匹配", () => {
    expectInputError(
      () =>
        parseSegmentsCsv(
          " segment_id,start_ms,end_ms,action\ns1,0,1000,Pick\n",
        ),
      "MISSING_HEADER",
    );
  });

  it("必要表头重复返回 INVALID_CSV", () => {
    expectInputError(
      () =>
        parseSegmentsCsv(
          "segment_id,start_ms,end_ms,action,action\ns1,0,1000,Pick,Pick\n",
        ),
      "INVALID_CSV",
    );
  });

  it("数据行列数与表头不一致返回 INVALID_CSV", () => {
    expectInputError(
      () => parseSegmentsCsv("segment_id,start_ms,end_ms,action\ns1,0,1000\n"),
      "INVALID_CSV",
    );
  });

  it("引号未闭合返回 INVALID_CSV", () => {
    expectInputError(
      () =>
        parseSegmentsCsv(
          'segment_id,start_ms,end_ms,action\ns1,0,1000,"Pick\n',
        ),
      "INVALID_CSV",
    );
  });

  it("只有表头返回 NO_RECORDS", () => {
    expectInputError(
      () => parseSegmentsCsv("segment_id,start_ms,end_ms,action\n\n  \n"),
      "NO_RECORDS",
    );
  });

  it("去掉 BOM 后只有表头也返回 NO_RECORDS", () => {
    expectInputError(
      () =>
        parseSegmentsCsv("\uFEFFsegment_id,start_ms,end_ms,action\r\n"),
      "NO_RECORDS",
    );
  });
});
