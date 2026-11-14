/** Map layers the user can switch on from the layer sheet. */
export type LayerKey = "dong" | "subway" | "rank";
/** Layers that bring a tab into the info dock when on. */
export type DockKey = Exclude<LayerKey, "rank">;
export type LayerState = Record<LayerKey, boolean>;

export const DEFAULT_LAYERS: LayerState = { dong: false, subway: false, rank: true };
export const DOCK_KEYS: DockKey[] = ["dong", "subway"];
export const DOCK_LABEL: Record<DockKey, string> = { dong: "동별 증감", subway: "지하철 노선" };
