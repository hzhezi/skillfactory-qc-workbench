import type Database from "better-sqlite3";

/**
 * SQLite schema。
 *
 * 两张表通过 run_id 关联：
 * - qc_runs 保存报告级统计；
 * - qc_segments 每条 Segment 独立一行，重复 segment_id 不会被覆盖。
 *
 * 约束尽量放在数据库层：
 * - status 只允许 VALID / INVALID；
 * - valid + invalid = total；
 * - (run_id, row_index) 唯一，保证同一报告内记录顺序不重复。
 */
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS qc_runs (
  id          TEXT PRIMARY KEY,
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  total       INTEGER NOT NULL CHECK (total >= 0),
  valid       INTEGER NOT NULL CHECK (valid >= 0),
  invalid     INTEGER NOT NULL CHECK (invalid >= 0),
  created_at  TEXT NOT NULL,
  CHECK (valid + invalid = total)
);

CREATE TABLE IF NOT EXISTS qc_segments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id      TEXT NOT NULL REFERENCES qc_runs(id) ON DELETE CASCADE,
  row_index   INTEGER NOT NULL CHECK (row_index > 0),
  segment_id  TEXT NOT NULL,
  start_ms    INTEGER,
  end_ms      INTEGER,
  action      TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('VALID', 'INVALID')),
  errors_json TEXT NOT NULL,
  UNIQUE (run_id, row_index)
);

CREATE INDEX IF NOT EXISTS idx_qc_segments_run_id
  ON qc_segments (run_id, row_index);
`;

export function initializeSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
