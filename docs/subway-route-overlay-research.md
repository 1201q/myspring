# 지하철 노선 색상 레이어 조사

조사일: 2026-11-09. 범위: 현재 전국 인허가 지도에 국내 도시철도·광역철도 노선을 겹쳐 표시하는 방법. 구현 변경이나 노선 원본 수집은 수행하지 않았다.

후속 작업: 실제 수도권 데이터를 수집하고 시험 레이어를 구현했다. 결과와 남은 정확성 한계는 [확보·검증 보고서](subway-route-overlay-verification.md)에 정리했다. 아래는 최초 조사 시점의 기록이다.

## 결론

현재 MapLibre 지도에 별도 GeoJSON 노선 소스와 선 레이어를 추가하는 방식이 적합하다. 우선 OSM의 노선 relation 데이터를 후보로 삼고, 운영기관의 역 정보와 공식 색상으로 검증한다. 실제 국내 노선 데이터의 누락률·최신성은 아직 검증하지 않았으므로 전국 완전 제공을 확정할 수 없다.

## 프로젝트에서 확인한 사항

- `frontend/package.json`: React, MapLibre GL JS, deck.gl 사용.
- `frontend/src/App.tsx`: 지도 생성, OpenFreeMap 기반 로컬 스타일 로딩, 테마 전환 시 paint 속성 변경.
- `frontend/public/styles/quiet-light.json`, `quiet-dark.json`: `railway_transit`은 `transportation` 소스의 회색 선이며 최소 줌 16, 해당 레이어에서 터널을 제외한다. 이는 노선별 서비스 경로 레이어가 아니다.
- 배경 철도 전체에 색을 일괄 적용하면 호선 구분·공용 구간·지하 구간 처리가 해결되지 않는다. 별도 노선 소스가 필요하다.

## 데이터 후보

| 후보 | 확보할 수 있는 정보 | 판단 및 남은 확인 |
| --- | --- | --- |
| OpenStreetMap 노선 relation | 경로를 구성하는 way, 노선명·번호, `colour` 등의 태그 | 1차 후보. 국내 권역별 누락·중복·지선·개통 반영 검증 필요. 태그가 항상 완전하거나 공식 검증된 것은 아님 |
| 운영기관 공공데이터 | 역사 위치, 호선 등 | 역 위치 대조용. 역 좌표가 있다고 실제 선로 곡선까지 제공되는 것은 아님 |
| GTFS Schedule | `routes.txt` 색상, `trips.txt` 경로 연결, `shapes.txt` 경로 좌표, `stops.txt` 역 위치 | 해외 확장에도 적합한 표준. 색상·shape는 공급 피드에 없을 수 있음. 국내 권역별 공개 피드와 이용 조건은 미확인 |
| ODsay | 노선 그래픽·역 정보 관련 API | 대안. 인증 필요. 전국 데이터를 수집해 정적 재배포하는 용도가 허용되는지는 별도 확인 필요. 현재 지도와의 이용 가능 범위도 확인 대상 |

확인한 공식 역 데이터 사례:

- 서울교통공사 1~8호선 역사 좌표: https://data.seoul.go.kr/dataList/OA-22534/L/1/datasetView.do
- 인천교통공사 도시철도역사정보: https://www.data.go.kr/data/15083751/fileData.do?recommendDataYn=Y
- 위 두 자료로 전국 도시철도나 수도권 전체가 충족되는 것은 아니다. 파일 내용·개별 이용허락 조건의 최종 검증은 남아 있다.

## 권장 구현안

1. 수도권, 부산·울산권, 대구권, 광주권, 대전권 등 권역별 데이터 목록을 관리한다. 이는 수집 구분안이며 완전성 확인 결과가 아니다.
2. 운행 중인 `subway`, `light_rail`, `monorail` 및 필요한 광역철도 `train` 노선을 선별한다. `subway`만 수집하면 광역철도·경전철이 빠질 수 있다.
3. 방향별 relation 중복을 정리하고 분기·순환·공용 구간을 보존한다. 독립 선분을 임의로 한 줄로 연결하지 않는다.
4. WGS84 GeoJSON LineString/MultiLineString으로 변환한다. 속성은 `routeId`, `networkId`, `name`, `color`, `source`, `sourceUpdatedAt`, 가능한 경우 운행 개시·종료일을 둔다.
5. MapLibre `line-color: ['get', 'color']`로 표시한다. 밝은 노선색은 외곽선으로 가독성을 확보한다. 공용 선로는 겹침 순서나 선 오프셋을 검토한다.
6. 권역 파일을 필요할 때 읽고 캐시한다. 브라우저에서 공용 Overpass 서버로 매번 질의하는 구조는 피한다. 파일 크기를 측정한 뒤 벡터 타일 전환 여부를 결정한다.
7. 초기 제안: 줌 9~10부터 노선, 줌 12부터 역, 줌 13~14부터 역명. 실제 화면에서 조정한다. 표시 토글과 노선명 범례를 제공한다.

현재 지도는 과거 월을 재생한다. 최신 노선만 표시하는 초기 버전에는 반드시 ‘현재 노선 기준’을 명시해야 한다. 과거 개통 상태까지 재현하려면 별도의 개통·폐선 이력 데이터가 필요하다.

## 도입 전에 검증할 항목

- 각 권역의 운영기관 공식 노선 목록과 수집 결과 비교: 누락 노선, 신설·연장 구간, 역명 변경.
- 서울 2호선 순환·지선, 여러 노선의 공용 구간, 수도권 행정경계 횡단, 지방 경전철·광역철도 등 대표 사례.
- 공식 색상과 데이터 태그 대조, 좌표계, 역과 선로의 이격, 불필요한 차량기지 선로 포함 여부.
- 수집물의 배포 조건, 출처와 갱신일 표시. OSM은 ODbL이므로 가공 데이터 배포 시 적용 조건을 원문에 따라 검토한다.
- 라이트·다크 테마, 가게 점 및 클릭과의 간섭, 다운로드 크기와 렌더링 성능.

## 공식 기술·이용 조건 출처

- MapLibre 데이터 속성별 선 색상 예제: https://maplibre.org/maplibre-gl-js/docs/examples/style-lines-with-a-data-driven-property/
- OpenMapTiles transportation 스키마: https://github.com/openmaptiles/openmaptiles/blob/master/layers/transportation/transportation.yaml
- OSM 지하철 노선 모델과 색상 태그: https://wiki.openstreetmap.org/wiki/Tag:route%3Dsubway
- OSM 도시철도 모델: https://wiki.openstreetmap.org/wiki/Metro_Mapping
- OSM 이용 조건: https://www.openstreetmap.org/copyright
- GTFS 명세: https://gtfs.org/documentation/schedule/reference/
- ODsay 가이드: https://lab.odsay.com/guide/guide?platform=web
- ODsay 서비스 이용 범위 안내: https://labdev.odsay.com/contact/contact?act=srvc

참고 사이트: https://seoulpulse.vercel.app/ — 공개 소개에서 지하철역 승하차 겹쳐보기를 확인했다. 내부 지도 구현 기술이나 노선 원본 출처는 확인하지 않았다.
