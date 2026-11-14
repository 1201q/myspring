import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, MapPin, Search, Store } from "lucide-react";
import type { AreaOption, SigunguProperties } from "./sigungu";
import "./FilterCapsule.css";

type Option = { id: string; name: string };
type Props = {
  regions: Option[];
  regionId: string;
  regionName: string;
  onRegionChange: (id: string) => void;
  /** 시군구 of the current region (cities with 일반구 carry them as children). */
  areas: AreaOption[];
  area: SigunguProperties | null;
  onAreaChange: (code: string | null) => void;
  /** 시군구 under the pointer or focus in the sheet (null when none), outlined on the map. */
  onAreaPreview: (code: string | null) => void;
  categories: Option[];
  category: string;
  onCategoryChange: (id: string) => void;
  /** Openings in the current playback period, by category id. */
  categoryCounts: Map<string, number> | null;
  categoryError: string;
  onRetryCategories: () => void;
};
type Open = "region" | "category" | null;

const LOGO = (
  <svg className="fc-logo" viewBox="0 0 18 18" aria-hidden="true">
    <circle className="a" cx="6.5" cy="9" r="4.5" />
    <circle className="b" cx="11.5" cy="9" r="4.5" />
  </svg>
);

/** Top-left capsule: logo · region · category, each opening a glass sheet below. */
export default function FilterCapsule({
  regions,
  regionId,
  regionName,
  onRegionChange,
  areas,
  area,
  onAreaChange,
  onAreaPreview,
  categories,
  category,
  onCategoryChange,
  categoryCounts,
  categoryError,
  onRetryCategories,
}: Props) {
  const [open, setOpen] = useState<Open>(null);
  const [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const sheetId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  useEffect(() => {
    if (open !== "region") onAreaPreview(null);
  }, [open, onAreaPreview]);

  // Move focus to the current choice when a sheet opens.
  useEffect(() => {
    if (!open) return;
    const el = root.current?.querySelector<HTMLElement>(
      open === "region" ? ".fc-chip[aria-pressed=true]" : ".fc-search input",
    );
    el?.focus();
  }, [open]);

  const toggle = (next: Open) => {
    setQuery("");
    setOpen((value) => (value === next ? null : next));
  };
  const placeName = area ? `${regionName} · ${area.label}` : regionName;
  // The top-level choice in the 시군구 row: a 일반구 selects its city there.
  const topCode = area?.kind === "gu" ? area.parent : (area?.code ?? null);
  const city = areas.find((o) => o.code === topCode && o.children.length);
  // Pointing at a 시군구 chip outlines it on the map; leaving clears it.
  const preview = (code: string | null) => ({
    onPointerEnter: () => onAreaPreview(code),
    onPointerLeave: () => onAreaPreview(null),
    onFocus: () => onAreaPreview(code),
    onBlur: () => onAreaPreview(null),
  });
  const pickArea = (code: string | null, keepOpen = false) => {
    if (!keepOpen) setOpen(null);
    onAreaChange(code);
  };
  const categoryName = categoryError
    ? "업종 불러오기 실패"
    : (categories.find((c) => c.id === category)?.name ?? "전체 업종");
  const visible = useMemo(() => {
    const q = query.trim();
    const list = q ? categories.filter((c) => c.name.includes(q)) : categories;
    return categoryCounts
      ? [...list].sort((a, b) => (categoryCounts.get(b.id) ?? 0) - (categoryCounts.get(a.id) ?? 0))
      : list;
  }, [categories, categoryCounts, query]);

  return (
    <div className="fc" ref={root}>
      <div className="fc-capsule dn-glass" role="group" aria-label="지역과 업종">
        <span className="fc-brand">
          {LOGO}
          <span className="fc-brand-name">동네의 기록</span>
        </span>
        <span className="fc-div" aria-hidden="true" />
        <button
          type="button"
          className="fc-seg"
          aria-haspopup="dialog"
          aria-expanded={open === "region"}
          aria-controls={open === "region" ? sheetId : undefined}
          aria-label={`재생 지역: ${placeName}`}
          disabled={!regions.length}
          onClick={() => toggle("region")}
        >
          <MapPin className="fc-ico" aria-hidden="true" />
          <span>{placeName}</span>
          <ChevronDown className="fc-chev" aria-hidden="true" />
        </button>
        <span className="fc-div" aria-hidden="true" />
        <button
          type="button"
          className="fc-seg"
          aria-haspopup="dialog"
          aria-expanded={open === "category"}
          aria-controls={open === "category" ? sheetId : undefined}
          aria-label={`업종: ${categoryName}`}
          disabled={!categories.length && !categoryError}
          onClick={() => (categoryError ? onRetryCategories() : toggle("category"))}
        >
          <Store className="fc-ico" aria-hidden="true" />
          <span className={categoryError ? "fc-error" : undefined}>
            {categories.length || categoryError ? categoryName : "업종 불러오는 중"}
          </span>
          <ChevronDown className="fc-chev" aria-hidden="true" />
        </button>
      </div>

      {open === "region" && (
        <div id={sheetId} className="fc-sheet dn-glass-strong" role="dialog" aria-label="재생 지역">
          <div className="fc-sheet-head">
            <h2>재생 지역</h2>
            <small>다른 시도는 지도에서 눌러도 바뀝니다</small>
          </div>
          <div className="fc-chips">
            {regions.map((r) => (
              <button
                type="button"
                key={r.id}
                className="fc-chip"
                aria-pressed={r.id === regionId}
                // Stay open after a region change so a 시군구 can be picked next.
                onClick={() => onRegionChange(r.id)}
              >
                {r.name}
              </button>
            ))}
          </div>
          {areas.length > 1 && (
            <div className="fc-tier">
              <h3>{regionName} 안에서</h3>
              <div className="fc-chips">
                <button
                  type="button"
                  className="fc-chip"
                  aria-pressed={!area}
                  onClick={() => pickArea(null)}
                >
                  전체
                </button>
                {areas.map((o) => (
                  <button
                    type="button"
                    key={o.code}
                    className="fc-chip"
                    aria-pressed={o.code === topCode}
                    title={o.label}
                    {...preview(o.code)}
                    // A city with 일반구 keeps the sheet open to offer its 구.
                    onClick={() => pickArea(o.code, o.children.length > 0)}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {city && (
            <div className="fc-tier">
              <h3>{city.name} 안에서</h3>
              <div className="fc-chips">
                <button
                  type="button"
                  className="fc-chip"
                  aria-pressed={area?.code === city.code}
                  {...preview(city.code)}
                  onClick={() => pickArea(city.code)}
                >
                  {city.name} 전체
                </button>
                {city.children.map((o) => (
                  <button
                    type="button"
                    key={o.code}
                    className="fc-chip"
                    aria-pressed={o.code === area?.code}
                    title={o.label}
                    {...preview(o.code)}
                    onClick={() => pickArea(o.code)}
                  >
                    {o.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {open === "category" && (
        <div id={sheetId} className="fc-sheet dn-glass-strong" role="dialog" aria-label="업종">
          <div className="fc-sheet-head">
            <h2>업종</h2>
            {categoryCounts && <small>이 기간 개업 수</small>}
          </div>
          <label className="fc-search">
            <Search className="fc-ico" aria-hidden="true" />
            <input
              type="search"
              placeholder="업종 이름으로 찾기"
              aria-label="업종 찾기"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <ul className="fc-rows" role="listbox" aria-label="업종 목록">
            {!query && (
              <Row
                selected={!category}
                name="전체 업종"
                onSelect={() => {
                  setOpen(null);
                  onCategoryChange("");
                }}
              />
            )}
            {visible.map((c) => (
              <Row
                key={c.id}
                selected={c.id === category}
                name={c.name}
                count={categoryCounts?.get(c.id)}
                onSelect={() => {
                  setOpen(null);
                  onCategoryChange(c.id);
                }}
              />
            ))}
            {!visible.length && <li className="fc-empty">'{query}'에 맞는 업종이 없습니다.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

function Row({
  selected,
  name,
  count,
  onSelect,
}: {
  selected: boolean;
  name: string;
  count?: number;
  onSelect: () => void;
}) {
  return (
    <li
      className="fc-row"
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <Check className="fc-check" aria-hidden="true" />
      <span className="fc-row-name">{name}</span>
      {count !== undefined && (
        <span className="fc-row-n dn-num">{count.toLocaleString("ko-KR")}</span>
      )}
    </li>
  );
}
