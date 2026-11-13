// Map-layer colors per theme, mirrored from src/styles/tokens.css (the design system's tokens.json).
// deck.gl and MapLibre paint properties cannot read CSS variables, so the values live here as well.
export type Theme = "light" | "dark";
type RGB = [number, number, number];

export type MapPalette = {
  open: RGB;
  close: RGB;
  accent: RGB;
  accentHex: string;
  mapLand: RGB;
  mapLandHex: string;
  inkHex: string;
  inkMutedHex: string;
  selected: RGB;
  onSelected: RGB;
  dongStroke: RGB;
  /** neg-3, neg-2, neg-1, even, pos-1, pos-2, pos-3 */
  dong: [RGB, RGB, RGB, RGB, RGB, RGB, RGB];
  dongEmpty: [number, number, number, number];
};

export const MAP_PALETTE: Record<Theme, MapPalette> = {
  dark: {
    open: [65, 207, 182],
    close: [244, 166, 107],
    accent: [138, 180, 255],
    accentHex: "#8ab4ff",
    mapLand: [15, 20, 23],
    mapLandHex: "#0f1417",
    inkHex: "#eef3f1",
    inkMutedHex: "#a3b1ad",
    selected: [238, 243, 241],
    onSelected: [15, 20, 23],
    dongStroke: [15, 20, 23],
    dong: [[242, 154, 92], [176, 106, 59], [94, 65, 48], [76, 86, 90], [29, 90, 81], [31, 158, 138], [47, 212, 184]],
    dongEmpty: [110, 125, 133, 26],
  },
  light: {
    open: [19, 161, 137],
    close: [224, 122, 53],
    accent: [47, 107, 219],
    accentHex: "#2f6bdb",
    mapLand: [236, 238, 234],
    mapLandHex: "#eceeea",
    inkHex: "#0f1a17",
    inkMutedHex: "#4f5d58",
    selected: [15, 26, 23],
    onSelected: [255, 255, 255],
    dongStroke: [255, 255, 255],
    dong: [[196, 98, 31], [233, 154, 99], [244, 210, 184], [195, 202, 203], [179, 227, 216], [92, 194, 174], [14, 143, 124]],
    dongEmpty: [110, 125, 133, 26],
  },
};
