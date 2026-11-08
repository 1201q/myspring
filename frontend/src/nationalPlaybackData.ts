export type Region = { id: string; name: string; bbox: [number, number, number, number] };
export type Manifest = {
  version: string; binaryUrl: string; count: number; minMonth: number; maxMonth: number;
  recordBytes: number; monthBase: number; regionId: string; region: string;
  categories: { code: number; id: string; name: string }[]; monthlyCounts: number[];
  opens: number; closes: number;
};
export type Points = { length: number; pos: Float32Array; month: Float32Array; cat: Float32Array; ids: Uint32Array };
export type Dataset = { manifest: Manifest; open: Points; close: Points };
export type LoadProgress = { stage: "preparing" | "downloading" | "decoding"; bytes: number; total: number };
const base = "/api/v1/map/playback/national";

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = window.setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
export async function loadRegions(signal: AbortSignal): Promise<Region[]> {
  const response = await fetch(`${base}/regions`, { signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]) });
  if (!response.ok) throw new Error("재생 지역 목록을 불러오지 못했습니다.");
  const body = await response.json();
  const regions: Region[] = body.regions;
  if (!Array.isArray(regions) || !regions.length || regions.some(r => !/^[a-z]+$/.test(r.id) || !r.name || r.bbox?.length !== 4 || r.bbox.some(v => !Number.isFinite(v))))
    throw new Error("지역 정보 형식이 올바르지 않습니다.");
  return regions;
}
export async function loadRegionDataset(regionId: string, signal: AbortSignal, progress: (value: LoadProgress) => void): Promise<Dataset> {
  const deadline = Date.now() + 600000;
  let manifest: Manifest;
  progress({ stage: "preparing", bytes: 0, total: 0 });
  while (true) {
    const response = await fetch(`${base}/${encodeURIComponent(regionId)}/manifest.json`, {
      cache: "no-store", signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    if (response.status === 503) {
      if (Date.now() >= deadline) throw new Error("첫 데이터 준비가 오래 걸립니다. 잠시 후 다시 조회해 주세요.");
      const retry = Number(response.headers.get("retry-after"));
      await delay(Math.min(10000, Math.max(1000, Number.isFinite(retry) && retry > 0 ? retry * 1000 : 2000)), signal);
      continue;
    }
    if (!response.ok) throw new Error("지역 재생 정보를 불러오지 못했습니다.");
    manifest = await response.json();
    break;
  }
  if (manifest.regionId !== regionId || manifest.recordBytes !== 16 || manifest.monthBase !== 1990
    || !Number.isSafeInteger(manifest.count) || manifest.count < 0 || manifest.count > 20000000
    || !Number.isInteger(manifest.minMonth) || !Number.isInteger(manifest.maxMonth) || manifest.minMonth < 0 || manifest.maxMonth < manifest.minMonth
    || !manifest.categories.length || manifest.categories.some((c, i) => c.code !== i)
    || manifest.monthlyCounts.length !== (manifest.maxMonth - manifest.minMonth + 1) * 2 * manifest.categories.length)
    throw new Error("지원하지 않는 재생 데이터 형식입니다.");
  // Only accept this API's same-origin binary URLs.
  const url = new URL(manifest.binaryUrl, window.location.origin);
  if (url.origin !== window.location.origin || !url.pathname.startsWith(`${base}/${regionId}/`)) throw new Error("이벤트 파일 주소가 올바르지 않습니다.");
  const total = manifest.count * 16;
  progress({ stage: "downloading", bytes: 0, total });
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]) });
  if (!response.ok) throw new Error("지역 이벤트 파일을 불러오지 못했습니다.");
  const bytes = new Uint8Array(total);
  let offset = 0, reported = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        if (offset + chunk.value.length > total) throw new Error("이벤트 파일 크기가 일치하지 않습니다.");
        bytes.set(chunk.value, offset); offset += chunk.value.length;
        if (offset - reported >= 1048576 || offset === total) { progress({ stage: "downloading", bytes: offset, total }); reported = offset; }
      }
    } finally { await reader.cancel(); reader.releaseLock(); }
  } else {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength !== total) throw new Error("이벤트 파일 크기가 일치하지 않습니다.");
    bytes.set(new Uint8Array(buffer)); offset = buffer.byteLength;
  }
  if (offset !== total) throw new Error("이벤트 파일이 일부만 도착했습니다. 다시 조회해 주세요.");
  signal.throwIfAborted();
  progress({ stage: "decoding", bytes: total, total });
  const view = new DataView(bytes.buffer), counts = [0, 0];
  for (let p = 0; p < total; p += 16) {
    const kind = view.getUint8(p + 10);
    if (kind > 1 || view.getUint8(p + 11) >= manifest.categories.length) throw new Error("이벤트 파일 내용이 올바르지 않습니다.");
    counts[kind]++;
  }
  const make = (length: number): Points => ({ length, pos: new Float32Array(length * 2), month: new Float32Array(length), cat: new Float32Array(length), ids: new Uint32Array(length) });
  const points = [make(counts[0]), make(counts[1])], offsets = [0, 0];
  for (let p = 0; p < total; p += 16) {
    const kind = view.getUint8(p + 10), target = points[kind], i = offsets[kind]++;
    target.pos[i * 2] = view.getFloat32(p, true); target.pos[i * 2 + 1] = view.getFloat32(p + 4, true);
    target.month[i] = view.getInt16(p + 8, true); target.cat[i] = view.getUint8(p + 11); target.ids[i] = view.getUint32(p + 12, true);
  }
  return { manifest, open: points[0], close: points[1] };
}
