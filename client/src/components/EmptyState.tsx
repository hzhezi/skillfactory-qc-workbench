export function EmptyState() {
  return (
    <section className="empty-state" aria-labelledby="empty-title">
      <p className="panel-label">WAITING FOR INPUT</p>
      <h2 id="empty-title">还没有 QC 报告</h2>
      <p>选择分段 CSV、填写视频总时长，然后点击「开始检查」。</p>
      <ol className="empty-steps">
        <li>上传 UTF-8 CSV，必需列：segment_id、start_ms、end_ms、action</li>
        <li>后端执行时间范围、视频边界、动作名称、片段重叠检查</li>
        <li>报告写入 SQLite，结果会在这里展示</li>
      </ol>
    </section>
  );
}
