# 비수도권 도시·광역철도 확장 검증

검증일: 2026-11-09. 기존 수도권 24개 노선에 부산·울산권, 대구권, 광주, 대전의 12개 노선을 추가했다. 합계 36개 선정 노선을 로컬 지도에서 표시한다. 운영 서비스 배포는 수행하지 않았다.

## 추가한 노선

| 권역 | 노선 | 노선별 역 표식 수 |
| --- | --- | --- |
| 부산·울산권 | 부산 1·2·3·4호선 | 40 / 43 / 17 / 14 |
| 부산·울산권 | 부산김해경전철 / 동해선 | 21 / 23 |
| 대구권 | 대구 1·2·3호선 / 대경선 | 35 / 29 / 30 / 8 |
| 광주 | 광주 1호선 | 20 |
| 대전 | 대전 1호선 | 22 |
| 합계 | 12개 노선 | 302개 표식 |

환승역은 노선별 중복 집계다. 수도권의 기존 801개 표식을 더하면 1,103개이며 실제 독립 역사 수를 뜻하지 않는다. 동해선은 부전~태화강 광역전철을 포함하며 같은 이름의 장거리 일반열차 운행계통은 제외했다. 공사·계획 중 노선도 포함하지 않았다.

## 실제 데이터와 완전성 대조

- 원본: OpenStreetMap 운행 경로 relation 24개(양방향), 고유 선로 way 661개. 기준 시각 **2026-11-09 18:32:20 KST**.
- 노선 GeoJSON 349,333 bytes, 역 GeoJSON 65,665 bytes. 약 415KB 추가(압축 전).
- 사용 대상 선로·정차역 참조 누락 0건, 좌표 범위 오류 0건. 실제 선로 조각 사이를 임의의 직선으로 연결하지 않는다.
- [국가철도공단 도시·광역철도 현황](https://station.kric.go.kr/v2/statistics/index.do)의 해당 12개 노선 **역 목록 302개를 모두 대조**했다. 역명 구두점·부역명·끝의 ‘역’ 표기를 정규화하고, 아래 보정을 적용한 뒤 누락명 0개·추가명 0개였다.
- 노선별 종점 및 주요 연장 구간을 검사했다. 대구 1호선 하양, 대경선 북삼도 포함된다.
- 역 표식에서 같은 노선의 선로까지 거리를 검사했다. 302개 모두 200m 이내, 최대 54m. 이는 OSM 내부의 위치 일관성 검사이며 독립적인 측량 정확도 인증이 아니다.
- 색상은 OSM 노선 relation의 `colour`를 사용한다. 모든 색상의 최신 공식 RGB와 실제 선로의 모든 구간을 별도 측량 자료로 대조한 것은 아니다. 과거 노선 재현이나 실시간 운행 상태도 제공하지 않는다.

공식 목록 스냅샷, 원본 압축본, 수집 질의와 해시, 노선별 비교 결과는 [검증 자료](data-samples/subway-regional/verification.json)에 보존했다. 공식 비교 목록과 OSM 원본은 별도 출처로 관리한다.

## 발견한 오류와 보완

1. 부산 4호선의 양방향 OSM 정차 노드 두 개는 한국어 역명이 ‘영신대’였다. 공식 목록의 ‘영산대’로 이름을 보정했다. 좌표는 원본을 유지한다.
2. 부산원동역은 공식 동해선 목록에 있으나 양방향 OSM 운행 경로의 정차역 구성에서 빠져 있었다. OSM 원본 지도 API의 기존 역사 중심 노드 `7461024100`을 별도 수집해 표식을 추가했다. 좌표를 추정하거나 선로를 새로 그리지 않았다.

보정 근거는 [station-corrections.json](data-samples/subway-regional/station-corrections.json), 보완 원본은 [supplemental-stops.osm.json](data-samples/subway-regional/supplemental-stops.osm.json)에 기록했다. 원본 운행 경로 압축 파일은 보정하지 않았다.

## 지도 동작

지도 중심에 따라 해당 철도권역의 노선 목록을 표시한다. 기존 하단 재생 지역을 부산·울산·대구·전남광주·대전으로 바꾸면 노선 목록도 따라 바뀐다. 부산과 울산은 같은 6개 노선 목록을 공유한다. 지역을 바꾸면 이전의 단일 노선 선택은 해제되며, 되돌아가도 이전 필터가 다시 살아나지 않는다.

기존 API는 광주를 `jeonnamgwangju`(전남광주)로 묶어 제공한다. 통합 지역의 중심이 광주시 밖에 있어도 광주 노선 목록을 안내한다. ‘노선 선택 → 노선 범위 보기’를 누르면 해당 노선의 실제 경로 범위로 확대한다. 사업장 통계는 계속 선택한 재생 지역의 통계이며, 확대된 화면 범위의 통계로 바꾸지 않는다.

정적 파일 6개를 한 번 받아 캐시하고, 지역·줌·테마·표시 여부 변경으로 다시 수집하지 않는다. 브라우저에서 Overpass를 직접 호출하지 않는다.

## 검증 결과

- 데이터 검사: 수도권 기존 검사 및 비수도권 302개 공식 역명·종점·참조 무결성·역-선로 거리 검사 통과.
- 브라우저: 실제 로컬 API와 사업장 점을 유지하며 부산→울산→대구→전남광주→대전→서울 전환, 노선 범위 확대, 필터 초기화 확인.
- 기존 표시 켜기·끄기, 2호선 선택, 역명 표시, 테마 전환, 모바일 390px 가로 넘침 검사 통과.
- 최초 정적 파일 요청 6개만 발생. 런타임 pageerror 0건, 지도 오류 안내 0건.
- 개발 모드 효과 정리와 화면 이동에 따른 타일 요청 취소(`net::ERR_ABORTED`)는 로그에 기록되었다. 지하철 파일 요청 실패는 없었다.
- TypeScript/Vite 빌드·oxlint 통과. 기존 대형 번들 경고는 남는다.

자동화 기록: [지역별 브라우저 결과](data-samples/subway-regional/browser-verification.json), [전체 브라우저 결과](data-samples/subway/browser-verification.json).

화면: [부산](data-samples/subway-regional/map-busan.jpg), [울산](data-samples/subway-regional/map-ulsan.jpg), [대구](data-samples/subway-regional/map-daegu.jpg), [광주](data-samples/subway-regional/map-jeonnamgwangju.jpg), [대전](data-samples/subway-regional/map-daejeon.jpg).

## 재생성

프로젝트 루트에서:

```powershell
node scripts/build-subway-overlay.mjs
node scripts/build-subway-overlay.mjs --regional
node scripts/verify-subway-overlay.mjs
node scripts/verify-subway-overlay.mjs --browser
```

원본 갱신은 `node scripts/build-subway-overlay.mjs --regional --download`다. 네트워크가 필요하며, 원본에서 오타가 수정되면 기존 수동 보정 전제가 달라져 검토를 요구하는 오류로 멈춘다. 최초 공식 목록 조회·수집 과정은 공개 서버 오류 때문에 미러 및 OSM 원본 API를 사용했다. 최종 수집 주소와 질의는 보존돼 있다.

노선·역 GeoJSON은 OpenStreetMap 기반 [ODbL 1.0](https://www.openstreetmap.org/copyright)으로 제공한다. 원본·가공 코드와 출처 표시를 유지한다. 공식 목록은 정확성 대조 자료이며 OSM 데이터와 같은 라이선스라고 표시하지 않는다.
