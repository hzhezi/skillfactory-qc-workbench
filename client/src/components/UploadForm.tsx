import { useRef, useState, type FormEvent } from "react";

interface UploadFormProps {
  loading: boolean;
  onAttempt: () => void;
  onSubmit: (file: File, durationMs: number) => Promise<void>;
}

// 与后端保持一致：十进制正整数，可带首尾空白；前导零允许。
const POSITIVE_INTEGER = /^\d+$/;

export function UploadForm({ loading, onAttempt, onSubmit }: UploadFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [durationText, setDurationText] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    // 只要用户尝试提交，就先清空上一份报告，即使接下来是客户端校验失败。
    // 这样旧报告不会被误认为本次新请求的结果。
    onAttempt();

    if (file === null) {
      setValidationError("请选择 CSV 文件。");
      return;
    }

    const trimmed = durationText.trim();
    const durationMs = Number(trimmed);

    if (
      !POSITIVE_INTEGER.test(trimmed) ||
      !Number.isSafeInteger(durationMs) ||
      durationMs <= 0
    ) {
      setValidationError("视频总时长必须是正整数（毫秒）。");
      return;
    }

    setValidationError(null);

    try {
      await onSubmit(file, durationMs);
    } finally {
      // 清空 input value，保证用户下次还能重新选择同一个文件。
      // File 对象在 onSubmit 期间仍然有效，不受这里重置影响。
      setFile(null);

      if (inputRef.current !== null) {
        inputRef.current.value = "";
      }
    }
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit} aria-busy={loading}>
      <div className="field">
        <label className="field-label" htmlFor="csv-file">
          分段 CSV
        </label>
        <label className="file-drop" htmlFor="csv-file">
          <input
            ref={inputRef}
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            disabled={loading}
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
              setValidationError(null);
            }}
          />
          <span className="file-drop-mark" aria-hidden="true">
            CSV
          </span>
          <span className="file-drop-text">
            {file === null ? "选择文件" : file.name}
          </span>
          <span className="file-drop-hint">
            {file === null
              ? "UTF-8，支持 BOM、引号字段与 CRLF"
              : `${Math.max(1, Math.ceil(file.size / 1024))} KB · 点击可重新选择`}
          </span>
        </label>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="duration-ms">
          视频总时长（毫秒）
        </label>
        <input
          id="duration-ms"
          className="text-input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="例如 10000"
          value={durationText}
          disabled={loading}
          onChange={(event) => {
            setDurationText(event.currentTarget.value);
            setValidationError(null);
          }}
        />
      </div>

      {validationError !== null ? (
        <p className="form-error" role="alert">
          {validationError}
        </p>
      ) : null}

      <button className="primary-button" type="submit" disabled={loading}>
        {loading ? "检查中…" : "开始检查"}
      </button>
    </form>
  );
}
