import { useEffect, useRef } from "react";
import { BusFront, ListOrdered, Map as MapIcon, TrainFront } from "lucide-react";
import type { LayerKey, LayerState } from "./layers";
import styles from "./LayerSheet.module.css";
import { useDismiss } from "../lib/useDismiss";

const TILES: { key: LayerKey; label: string; note: string; Icon: typeof MapIcon }[] = [
  { key: "dong", label: "동별 증감", note: "개업 − 폐업", Icon: MapIcon },
  { key: "subway", label: "지하철 노선", note: "현재 노선", Icon: TrainFront },
  { key: "bus", label: "버스정류장", note: "확대해서 보기", Icon: BusFront },
  { key: "rank", label: "개업 순위", note: "왼쪽 패널", Icon: ListOrdered },
];

type Props = { layers: LayerState; onToggle: (key: LayerKey) => void; onClose: () => void };

/** 레일의 레이어 버튼 옆 시트: 지도 레이어마다 타일 하나. */
export default function LayerSheet({ layers, onToggle, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, onClose, { ignore: "[data-layer-trigger]" });
  useEffect(() => {
    root.current?.querySelector<HTMLElement>(`.${styles["ls-tile"]}`)?.focus();
  }, []);
  return (
    <div
      id="layer-sheet"
      className={`${styles["ls"]} dn-glass-strong`}
      role="dialog"
      aria-label="지도 레이어"
      ref={root}
    >
      <div className={styles["ls-head"]}>
        <h2>지도 레이어</h2>
        <small>켜면 정보가 함께 나옵니다</small>
      </div>
      <div className={styles["ls-tiles"]}>
        {TILES.map(({ key, label, note, Icon }) => (
          <button
            type="button"
            key={key}
            className={styles["ls-tile"]}
            aria-pressed={layers[key]}
            onClick={() => onToggle(key)}
          >
            <Icon aria-hidden="true" />
            <span>
              {label}
              <small>{note}</small>
            </span>
          </button>
        ))}
      </div>
      <p className={styles["ls-foot"]}>
        개폐업 기록은 개업을 점, 폐업을 고리로 표시합니다.
      </p>
    </div>
  );
}
