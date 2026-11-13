import { useEffect, useRef } from "react";
import { ListOrdered, Map as MapIcon, TrainFront } from "lucide-react";
import type { LayerKey, LayerState } from "./layers";
import "./LayerSheet.css";

const TILES: { key: LayerKey; label: string; note: string; Icon: typeof MapIcon }[] = [
  { key: "dong", label: "동별 증감", note: "개업 − 폐업", Icon: MapIcon },
  { key: "subway", label: "지하철 노선", note: "현재 노선", Icon: TrainFront },
  { key: "rank", label: "개업 순위", note: "왼쪽 패널", Icon: ListOrdered },
];

type Props = { layers: LayerState; onToggle: (key: LayerKey) => void; onClose: () => void };

/** Sheet beside the rail's layer button: one tile per map layer. */
export default function LayerSheet({ layers, onToggle, onClose }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    root.current?.querySelector<HTMLElement>(".ls-tile")?.focus();
    const outside = (e: PointerEvent) => {
      const target = e.target as Element;
      if (!root.current?.contains(target) && !target.closest?.(".rail-layers")) close.current();
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
  }, []);
  return (
    <div id="layer-sheet" className="ls dn-glass-strong" role="dialog" aria-label="지도 레이어" ref={root}>
      <div className="ls-head">
        <h2>지도 레이어</h2>
        <small>켜면 정보가 함께 나옵니다</small>
      </div>
      <div className="ls-tiles">
        {TILES.map(({ key, label, note, Icon }) => (
          <button type="button" key={key} className="ls-tile" aria-pressed={layers[key]} onClick={() => onToggle(key)}>
            <Icon aria-hidden="true" />
            <span>
              {label}
              <small>{note}</small>
            </span>
          </button>
        ))}
      </div>
      <p className="ls-foot">점은 개업, 고리는 폐업입니다. 동별 증감과 지하철을 모두 끄면 오른쪽 아래 정보도 사라집니다.</p>
    </div>
  );
}
