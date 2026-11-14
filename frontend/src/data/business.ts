import { fetchJson } from "../lib/fetchJson";

export type Business = {
  id: number;
  categoryId: string;
  name: string;
  businessType: string | null;
  roadAddress: string | null;
  lotAddress: string | null;
  permittedAt: string | null;
  closedAt: string | null;
  longitude: number | null;
  latitude: number | null;
  coordinateStatus: string;
  sourceUrl: string | null;
};

/** 변환이 끝난 유효한 지도 좌표가 있는지??? */
export const located = (b: Business) =>
  b.coordinateStatus === "CONVERTED" &&
  b.longitude !== null &&
  b.latitude !== null &&
  Number.isFinite(b.longitude) &&
  Number.isFinite(b.latitude);

export const fetchBusiness = (id: number, signal: AbortSignal) =>
  fetchJson<Business>(`/api/v1/map/businesses/${id}`, { signal, error: "상세 조회 실패" });
