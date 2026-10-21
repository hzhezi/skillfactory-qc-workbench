# 页面测试数据

本目录提供可直接在页面上传的 CSV，用于手工验证正常流程、QC 边界和文件级错误。
这些文件不参与自动化测试；自动化测试使用 `server/tests/fixtures/` 下的独立夹具。

## 使用方式

```bash
pnpm dev
```

打开 <http://localhost:5173>，选择下表中的 CSV，按“时长”列填写视频总时长（毫秒），点击「开始检查」。

## 文件与预期结果

| 文件 | 时长（`durationMs`） | 预期统计 | 预期错误 / 说明 | 对应验收 |
| --- | ---: | --- | --- | --- |
| `01-official-example.csv` | 10000 | total 6 / valid 2 / invalid 4 | `s2`、`s3` 为 `OVERLAP`；`s4` 为 `OUT_OF_BOUNDS`；`s5` 为 `EMPTY_ACTION` | T02、T05 |
| `02-touching-boundaries.csv` | 10000 | total 3 / valid 3 / invalid 0 | 三段时间首尾相接，不产生 `OVERLAP` | T03 |
| `03-contained-unordered.csv` | 10000 | total 3 / valid 1 / invalid 2 | `outer` 完全包含 `inner`，双方均为 `OVERLAP`；输入顺序保持不变 | T04 |
| `04-multi-errors.csv` | 10000 | total 6 / valid 1 / invalid 5 | `s1` 同时有 `EMPTY_ACTION`、`OVERLAP`；`s2` 为 `OVERLAP`；`s3`、`s4` 为 `INVALID_RANGE`；`s5` 为 `OUT_OF_BOUNDS`；`s6` 有效 | T05、T06、T07 |
| `05-quoted-duplicate-ids.csv` | 5000 | total 2 / valid 2 / invalid 0 | 两条记录 `segment_id` 都是 `dup`，分别保留；`action` 含引号内逗号和转义双引号 | T08、T09 |
| `06-reordered-extra-columns.csv` | 5000 | total 2 / valid 2 / invalid 0 | 必需列顺序打乱，并带有额外列 `note` | T09、2.1 节 |
| `07-missing-header.csv` | 10000 | HTTP 400 | `MISSING_HEADER`，缺少 `action` 表头 | T10 |
| `08-header-only.csv` | 10000 | HTTP 400 | `NO_RECORDS`，只有表头没有数据记录 | T10 |
| `09-invalid-range.csv` | 10000 | total 5 / valid 0 / invalid 5 | 五条记录均为 `INVALID_RANGE`：非整数、小数、空值、负数、`end_ms <= start_ms` | T06 |
| `10-empty.csv` | 10000 | HTTP 400 | `EMPTY_FILE`，文件内容为空 | T10 |
| `11-unclosed-quote.csv` | 10000 | HTTP 400 | `INVALID_CSV`，引号未闭合 | T10 |
| `12-bom-crlf.csv` | 5000 | total 2 / valid 2 / invalid 0 | UTF-8 BOM + CRLF 换行，两条记录均有效 | T09、2.1 节 |

## 补充测试

- **非法视频时长**不需要 CSV：在页面把时长留空，或输入 `0`、`-1`、`1.5`、`abc`，应显示 `INVALID_DURATION`。
- **文件级错误**（`07`、`08`、`10`、`11`）不会创建报告；如果页面上已有报告，提交这些文件时应先清空旧结果，再显示错误提示。
- **刷新恢复**：成功上传后，URL 会带有 `?runId=...`；刷新页面应通过 `GET /api/qc/{runId}` 从 SQLite 重新读取报告。
- **筛选与导出**：切换 All / Valid / Invalid 只影响表格；导出 CSV 始终包含完整报告。

## 核对记录

核对日期：2026-10-21。

以上统计和错误码已使用项目真实的 `parseSegmentsCsv()` 与 `evaluateSegments()` 逐文件运行核对，不是手工估算。
