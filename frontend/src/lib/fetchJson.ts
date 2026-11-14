/**
 * JSON을 불러옵니다. `signal`이나 `timeout`(ms)이 지나면 중단합니다.
 * 응답이 OK가 아니면 이 요청의 사용자용 메시지인 `error`로 예외를 던집니다.
 */
export async function fetchJson<T>(
  url: string | URL,
  {
    signal,
    timeout,
    error,
    cache,
  }: {
    signal: AbortSignal;
    timeout?: number;
    error: string;
    cache?: RequestCache;
  },
): Promise<T> {
  const response = await fetch(url, {
    cache,
    signal: timeout ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : signal,
  });
  if (!response.ok) throw new Error(error);
  return response.json();
}
