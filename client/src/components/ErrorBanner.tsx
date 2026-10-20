import type { ApiError } from "../api/qc";

interface ErrorBannerProps {
  error: ApiError;
}

export function ErrorBanner({ error }: ErrorBannerProps) {
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner-code">{error.code}</span>
      <div>
        <p className="error-banner-title">检查未完成</p>
        <p className="error-banner-message">{error.message}</p>
      </div>
    </div>
  );
}
