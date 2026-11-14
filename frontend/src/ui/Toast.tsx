import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

/** 다시 시도 버튼이 있는 오류 토스트. `.toasts` 안에 둡니다. */
export default function Toast({
  children,
  onRetry,
  retryLabel = "다시 시도",
}: {
  children: ReactNode;
  onRetry: () => void;
  retryLabel?: string;
}) {
  return (
    <p className="toast dn-glass-strong" role="alert">
      <TriangleAlert aria-hidden="true" />
      <span>{children}</span>
      <button type="button" onClick={onRetry}>
        {retryLabel}
      </button>
    </p>
  );
}
