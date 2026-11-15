import { X } from "lucide-react";
import type { DockKey } from "./layers";
import { DOCK_LABEL } from "./layers";
import styles from "./InfoDock.module.css";

type Props = {
  tabs: DockKey[];
  active: DockKey;
  onTab: (key: DockKey) => void;
  onClose: () => void;
  /** Receives the body element; each layer's owner portals its content into it. */
  bodyRef: (el: HTMLDivElement | null) => void;
};

/** Bottom-right card that exists only while a dock layer is on. One tab per such layer. */
export default function InfoDock({ tabs, active, onTab, onClose, bodyRef }: Props) {
  return (
    <section className={`${styles["dock"]} dn-glass-strong`} aria-label="레이어 정보">
      <div className={styles["dock-head"]}>
        <div className={styles["dock-tabs"]} role="tablist" aria-label="켜진 레이어">
          {tabs.map((key) => (
            <button
              type="button"
              role="tab"
              key={key}
              id={`dock-tab-${key}`}
              aria-selected={key === active}
              aria-controls="dock-body"
              onClick={() => onTab(key)}
            >
              {DOCK_LABEL[key]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className={styles["dock-close"]}
          aria-label="정보 닫기 (레이어는 켜진 채로 둡니다)"
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </button>
      </div>
      <div
        id="dock-body"
        className={`${styles["dock-body"]} dn-scroll${active === "subway" ? ` ${styles["is-split"]}` : ""}`}
        role="tabpanel"
        aria-labelledby={`dock-tab-${active}`}
        ref={bodyRef}
      />
    </section>
  );
}
