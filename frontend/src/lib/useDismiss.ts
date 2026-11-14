import { useEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * `active`인 동안 Escape를 누르거나 `root` 바깥을 누르면 `onClose`를 부릅니다.
 * `ignore`에 맞는 요소(시트를 여닫는 버튼) 안을 누른 것은 그 버튼에 맡깁니다.
 */
export function useDismiss(
  root: RefObject<HTMLElement | null>,
  onClose: () => void,
  { active = true, ignore }: { active?: boolean; ignore?: string } = {},
) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!active) return;
    const outside = (e: PointerEvent) => {
      const target = e.target as Element;
      if (root.current?.contains(target) || (ignore && target.closest?.(ignore))) return;
      close.current();
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [root, active, ignore]);
}
