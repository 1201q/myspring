import type { Points } from "../../data/nationalPlaybackData";

export type LocationGroup = { position: [number, number]; ids: number[] };
export const locationKey = (longitude: number, latitude: number) => `${longitude},${latitude}`;

// Use the exact coordinates rendered by the binary layers; nearby buildings stay separate.
// `inArea[kind][i]` (1/0), when given, keeps only points inside the selected 시군구.
export function groupLocations(
  points: Points[],
  from: number,
  to: number,
  codes: number[],
  inArea?: Float32Array[] | null,
) {
  const groups = new Map<string, LocationGroup>();
  const allowed = new Set(codes);
  for (const [kind, entries] of points.entries()) {
    const area = inArea?.[kind];
    for (let i = 0; i < entries.length; i++) {
      if (entries.month[i] < from || entries.month[i] > to || !allowed.has(entries.cat[i]))
        continue;
      if (area && !area[i]) continue;
      const longitude = entries.pos[i * 2],
        latitude = entries.pos[i * 2 + 1];
      const key = locationKey(longitude, latitude);
      const existing = groups.get(key);
      if (existing) existing.ids.push(entries.ids[i]);
      else groups.set(key, { position: [longitude, latitude], ids: [entries.ids[i]] });
    }
  }
  for (const group of groups.values()) group.ids = [...new Set(group.ids)].sort((a, b) => a - b);
  return groups;
}
