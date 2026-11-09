# 수도권 도시·광역철도 지도 데이터

후속 확장: 부산·울산권·대구권·광주·대전의 12개 노선을 `regional-manifest.json`, `regional-routes.geojson`, `regional-stations.geojson`으로 추가했다. 수도권을 포함해 36개 선정 노선이다. [지역별 확보·검증 보고서](../../../../docs/subway-regional-overlay-verification.md)를 참고한다. 아래 수도권 수치와 기준 시각은 기존 스냅샷의 기록이다.

OSM 기준 시각: **2026-11-09 05:53:46 UTC** (한국시간 14:53:46).
운행 현황을 보증하는 공식 자료가 아닌 시험용 스냅샷이다. 과거 월을 재생해도 노선은 바뀌지 않는다.

- 24개 노선, OSM 운행 경로 relation 232개.
- 같은 노선의 같은 way 중복을 제거한 선분 feature 3,216개. 선로 자체의 곡선을 유지하며, 서로 떨어진 선로를 직선으로 연결하지 않는다.
- 역 표식 801개. 노선별 집계이므로 환승역이 중복되며, 독립된 실제 역사 801곳을 뜻하지 않는다.
- 선로 파일 약 1.31MB, 역 파일 약 0.17MB (압축 전).
- 색상은 OSM relation의 `colour` 값을 사용한다. 모든 색상을 운영기관의 최신 공식 RGB와 대조한 것은 아니다.
- 대상: 1~9호선, 인천 1·2호선, 경의중앙·경춘·수인분당·신분당·공항철도 일반열차·경강·서해·우이신설·신림·의정부경전철·용인에버라인·김포골드라인·GTX-A.
- 제외: KTX/SRT/일반철도·ITX, 공항철도 직통열차의 별도 운행계통, 공항 내부 셔틀 및 관광철도. 공항철도 일반열차의 선로는 포함한다.

## 출처와 이용 조건

노선과 역 데이터는 [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)에 기반하며 [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)로 제공한다. 원본 압축 스냅샷, 질의문, 가공 코드와 보정 내역을 저장소에 함께 제공한다. 지도 출처 표시를 유지한다.

원본·검증 파일: `docs/data-samples/subway/`.
가공 스크립트: `scripts/build-subway-overlay.mjs`.

별도 대조 자료는 [서울교통공사 1~8호선 역사 좌표](https://data.seoul.go.kr/dataList/OA-22534/L/1/datasetView.do), 공공누리 제1유형(출처표시)이다. 지도에 이 CSV의 좌표를 덮어쓰지 않으며, 정확성 대조에만 사용한다. 우이신설선과 의정부경전철의 보정 근거 URL은 `station-corrections.json`에 있다.

## 재생성과 검증

프로젝트 루트에서:

```powershell
node scripts/build-subway-overlay.mjs
node scripts/build-subway-overlay.mjs --regional
node scripts/verify-subway-overlay.mjs
```

원본을 갱신할 때만 `node scripts/build-subway-overlay.mjs --download`를 실행한다. 네트워크가 필요하며, 수동 보정의 전제와 원본이 달라지면 오류로 멈추므로 보정 근거를 재검토해야 한다. 갱신 후 문서의 기준 시각과 검증 결과도 갱신한다.

브라우저 검증은 로컬 지도 서버와 Edge, Playwright가 필요하다. `scripts/verify-subway-overlay.mjs --browser`를 사용한다. Playwright 경로는 `PLAYWRIGHT_MODULE`로 지정할 수 있으며, 기본 경로는 프로젝트의 임시 `data/subway-browser/node_modules/playwright/index.mjs`이다.
