# FE 성능 점검 — 2026-11-15

현재 FE가 모든 상황에서 느리다고 단정할 수는 없다. 다만 **누적 기간의 전체 위치 그룹 생성**에는 큰 개선 여지가 확인된다. 초기 번들도 크다. 실제 사용자 로딩 시간·FPS·입력 지연은 브라우저 측정이 추가로 필요하다.

## 측정 범위

- `npm run build` 성공. 현재 소스의 배포 번들 크기를 측정했다.
- CPU: Intel Core Ultra 5 125H, Node v24.22.1. 워밍업 후 7회 중앙값, 각 표본 전 명시적 GC.
- 문서에 기록된 서울 이벤트 수 1,443,310건에 맞춘 **합성 데이터**를 사용했다. 442개월에 대략 균등하게 분산하고 20만 위치와 15개 업종을 사용했다. 실제 서울의 월별 분포·좌표 중복 분포를 재현한 것은 아니다.
- 실제 `loadRegionDataset`, `groupLocations` 함수를 실행했다. 다운로드는 메모리 스트림으로 대체했고 디코딩 단계만 따로 측정했다.
- 로컬 8080 API와 운영 API의 manifest에 연결을 시도했으나 이 실행 환경에서는 모두 fetch가 실패했다. 원인과 운영 서버 상태는 확인되지 않았다. 브라우저·GPU·네트워크·실제 데이터 성능은 측정하지 않았다.

## 확인된 수치

### 배포 번들

| 산출물 | 원본 | gzip |
| --- | ---: | ---: |
| 메인 JS | 1,309.07 kB | 367.44 kB |
| NationalPlayback JS | 831.55 kB | 230.48 kB |
| MapLibre Worker | 518.98 kB | 빌드 출력에 없음 |
| 메인 CSS | 138.04 kB | 29.91 kB |
| 재생 CSS | 16.56 kB | 3.68 kB |

메인과 재생 JS 두 파일만 gzip 기준 약 598 kB다. 기타 청크·Worker·글꼴·지도 타일·바이너리는 별도다. 빌드의 gzip 수치는 실제 서버의 Content-Encoding을 확인한 전송량이 아니다.

`NationalPlayback`은 lazy import지만 첫 화면에서 바로 마운트되므로 최초 사용에 필요한 자산이다. 청크 분할만으로 전체 다운로드·파싱 비용이 사라지지는 않는다. Pretendard는 동적 subset을 쓰므로 출력된 모든 폰트 파일을 첫 진입 다운로드량으로 합산해서도 안 된다.

### CPU 연산

| 연산 | 중앙값 | 7회 범위 |
| --- | ---: | ---: |
| 바이너리 검증·디코딩·배열 할당 | 22.87 ms | 21.74–26.34 ms |
| 위치 그룹: 1개월 | 3.99 ms | 3.80–8.03 ms |
| 위치 그룹: 12개월 | 20.06 ms | 18.85–21.81 ms |
| 위치 그룹: 누적 441개월 | **650.17 ms** | 628.41–692.39 ms |

`NationalPlayback.tsx`의 `locations` 메모는 월·기간·업종·시군구 조건이 바뀔 때 `groupLocations`를 실행한다. 함수는 지역 전체 이벤트를 검사하고, 기간에 포함되는 위치마다 Map·문자열·배열·Set을 생성한다. 이 작업은 React 렌더 중 메인 스레드에서 실행되며 GPU 필터와 별도로 발생한다. `useMemo`는 입력이 달라지는 재생 중의 비용을 없애지 않는다.

60fps의 프레임 간격은 약 16.7ms다. 합성 실험의 누적 그룹 계산만 약 39프레임 분량의 시간이므로, 실제 데이터에서도 비슷한 비용이 나오면 재생·슬라이더 입력이 끊길 가능성이 크다. 이는 실제 FPS 측정값은 아니다.

### 개선 비교 실험

월별 이벤트 인덱스를 한 번 만든 뒤 필요한 월만 추려 **동일한 원본 그룹 함수**에 전달했다. 비교 결과는 `assert.deepEqual`로 순서와 내용 일치를 확인했다.

| 기간 | 현재 | 비교 구현 | 결과 |
| --- | ---: | ---: | --- |
| 1개월 | 3.99 ms | 2.20 ms | 약 45% 감소 |
| 12개월 | 20.06 ms | 24.04 ms | 약 20% 증가 |

인덱스 구축은 31.55ms이고 인덱스의 TypedArray만 약 5.77MB 추가된다. 비교 구현은 추린 점을 복사·정렬하므로 긴 기간에서는 이 부가 비용이 이익을 상쇄한다. **이 구현을 그대로 제품에 적용하자는 결론은 아니다.** 월 인덱스만 추가해서 누적 그룹 병목을 해결할 수도 없다.

### 배열 메모리

이벤트 수 N에 대해 현재 형식의 배열 크기는 다음과 같다. JS 객체·GPU 버퍼·지도·Worker 비용은 포함하지 않았다.

| 항목 | 이벤트당 | 서울 문서 건수 기준 |
| --- | ---: | ---: |
| 다운로드 바이너리 | 16 bytes | 23.09 MB |
| 디코딩 배열: 좌표·월·업종·ID | 28 bytes | 40.41 MB |
| GPU 필터용 업종·지역 입력 배열 | 8 bytes | 11.55 MB |

디코딩 중에는 원본과 결과 배열이 겹쳐 최소 약 63.51MB의 배열이 존재한다. 디코딩 결과와 GPU 필터 입력은 약 51.96MB다. 이는 전체 heap 실측이나 모든 단계의 최대 메모리가 아니다.

행정동 Worker 초기화에서는 `postMessage`에 전체 Points를 전달하고 transfer 목록을 쓰지 않아 배열 복사가 발생한다. 현재 사용하지 않는 ID까지 포함한 중복 비용과 Worker 토글 시 재초기화를 별도로 측정할 가치가 있다. 메인 스레드가 렌더링에 쓰는 버퍼를 그대로 transfer하면 원본이 분리되므로 단순히 transfer 옵션만 붙여서는 안 된다.

## 개선 우선순위

1. **위치 그룹 생성 방식 변경.** 지역 로딩 시 좌표별 이벤트 인덱스를 만들고 hover/click 위치만 조건에 맞게 조회하는 방식을 검토한다. 확대 시 표시하는 중복 건수는 현재 화면 범위에 필요한 위치를 대상으로 계산하거나 Worker로 옮긴다. 누적 전체 그룹 재생성을 줄이는 것이 핵심이다. 동일 좌표 ID 중복 제거와 정렬 의미를 유지해야 한다.
2. **실제 브라우저 프로파일.** 서울·경기에서 1개월/12개월/누적, 슬라이더 드래그, 자동 재생, 확대·이동을 같은 조건으로 반복한다. 동별 레이어와 시군구 선택을 켠 경우도 따로 측정한다.
3. **초기 로딩 분석.** 배포 preview에서 캐시 없음/있음과 데스크톱/제한된 CPU·네트워크를 나눠 잰다. 지도 라이브러리는 필수 비용이 크므로 단순한 청크 수보다 최초 지도 표시와 이벤트 점 표시까지의 시간을 본다.
4. **디코딩·Worker 메모리.** 저사양 기기에서 디코딩이 입력을 막는지 확인한 뒤 Worker 이동을 결정한다. 행정동 초기화의 필요 배열만 복사하고, 재사용과 메모리 상한을 함께 검토한다. Float64 좌표는 현재 고배율 투영을 위한 의도가 있으므로 크기만 보고 Float32로 바꾸지 않는다.

## 실제 개선 판정 방법

같은 데이터 버전·지역·월·업종·화면 크기·확대 배율·브라우저·기기를 고정한다. 다운로드가 없는 조작 성능과 첫 다운로드 성능을 분리한다.

- 첫 지도 표시, 첫 이벤트 점 표시, 지역 전환 후 점 표시까지의 시간.
- 월 변경 입력부터 해당 점과 통계가 그려질 때까지의 p50/p95 지연.
- 재생·이동 중 프레임 간격, 긴 메인 스레드 작업의 수·총시간·최장시간.
- 다운로드 바이트와 지역 전환·레이어 토글 전후 메모리. 메모리 도구가 Worker/GPU를 모두 포함하는지도 기록한다.
- 개선 전후 같은 시나리오를 반복하고 `(개선 전 - 개선 후) / 개선 전 × 100`으로 감소율을 계산한다. 초기 인덱스 생성 시간과 추가 메모리도 함께 비교한다.

일반 페이지용 Lighthouse 점수만으로 WebGL 지도 조작 성능을 판단하기는 어렵다. 위 지도 시나리오를 별도로 기록해야 한다. 현재는 실사용 성능 기준선이 없어 개선 후 체감 속도나 전체 개선율을 확정할 수 없다.

벤치마크 스크립트는 사용자 요청으로 삭제했다. 비교 구현은 측정 전용이었으며 앱에는 적용하지 않았다.

검증: 배포 빌드 성공. 기존 테스트 21개 중 20개 통과, 시군구 자산 해시 검사 1개 실패(`seoul-20261001.geojson`). 이번 작업에서 해당 자산과 테스트는 수정하지 않았으며 이 실패는 성능 결과와 별개다.

## MapLibre·deck.gl 추가 점검

공식 문서와 설치된 라이브러리 소스를 대조했다. 아래 항목의 실제 GPU 시간·FPS 개선율은 아직 측정하지 않았다.

- **이미 적용된 장점:** 배경은 벡터 타일이고 이벤트는 deck.gl 바이너리 속성이다. `binaryData`는 데이터·시군구 조건이 유지되는 동안 같은 참조를 쓰고, 월·업종은 `DataFilterExtension`으로 바꾼다. 따라서 매월 모든 점 버퍼를 다시 만드는 구조라고 해석하면 안 된다. `new ScatterplotLayer` 호출 자체보다 `data` 참조와 속성의 변경 여부가 중요하다. [DataFilterExtension](https://deck.gl/docs/api-reference/extensions/data-filter-extension), [성능 가이드](https://deck.gl/docs/developer-guide/performance).
- **행정동 경계 재처리:** `dongFeatures`는 집계 결과가 바뀔 때 Feature와 FeatureCollection을 다시 만든다. `dong-net-change`의 `data`가 바뀌므로 고정된 경계의 속성 계산과 테셀레이션 재처리 가능성이 있다. 경계 객체는 고정하고 집계 배열을 색상 accessor에서 조회하며 `updateTriggers`로 색상만 갱신하는 방식을 비교한다. 서울 자산은 427개 동, 좌표 4,949개라서 규모만으로 주 병목이라고 단정할 수는 없다. [성능 가이드](https://deck.gl/docs/developer-guide/performance).
- **시군구 마스크:** 레이어 effect 안에서 `data: [{ polygon: ... }]`를 새로 만든다. 월·hover 등으로 effect가 다시 실행되면 선택 경계가 그대로여도 데이터 참조가 달라진다. `areaFeature`에 따라 마스크 geometry와 data를 메모하는 것이 개선 후보다.
- **픽셀 해상도:** 현재 `interleaved: false`로 별도 캔버스를 쓴다. MapLibre의 `pixelRatio`와 deck.gl의 `useDevicePixels`를 각각 비교한다. 예를 들어 CSS 1920×1080, DPR 2에서 DPR 1로 줄이면 캔버스당 픽셀 수는 8,294,400→2,073,600으로 75% 줄어든다. 이는 이론적 픽셀 수 감소이며 GPU 시간 75% 감소나 FPS 4배를 뜻하지 않는다. 선·글자 선명도를 함께 검증해야 한다. [Deck 설정](https://deck.gl/docs/api-reference/core/deck), [MapboxOverlay 설정](https://deck.gl/docs/api-reference/mapbox/mapbox-overlay).
- **Picking:** 두 사업장 점 레이어가 모두 pickable이고 hover를 사용한다. Picking은 별도 오프스크린 렌더링을 수반한다. 진단용으로 picking을 끈 상태와 비교해 `pickTime`, `pickCount`를 본다. 제품에서는 hover 기능을 유지하면서 드래그 중 picking·팝업 갱신을 줄일 수 있는지 확인한다. [성능 가이드](https://deck.gl/docs/developer-guide/performance).
- **React 이벤트 처리:** App은 모든 zoom 이벤트에서 숫자 zoom state를 갱신하지만 그 값의 사용처는 `zoom >= 15`다. 부모에서는 이 임계값의 boolean만 저장하면 확대 중 React 렌더를 줄일 수 있다. hover 팝업 좌표도 매 이벤트마다 부모 state를 바꾸므로 프레임 단위 갱신이나 팝업 분리를 비교한다. 이는 MapLibre 자체의 GPU 최적화와 구분해서 측정한다.
- **MapLibre 스타일·지하철:** 현재 배경 스타일은 48개 레이어(선 28, 심볼 10, 면 9, 배경 1)다. 지하철은 켰을 때 전국 6개 자산을 함께 받고, 수도권 노선 GeoJSON 하나는 1.31MB다. 필요 지역별 로딩·경계 단순화·저배율 레이어 생략이 후보지만 레이어 수나 파일 크기만으로 병목을 확정할 수는 없다. 기존 역/역명 minzoom은 유지할 이유가 있다. 가이드의 GeoJSON 클러스터 옵션은 MapLibre GeoJSON용이며 현재 deck.gl 점에 그대로 적용되는 옵션이 아니다. [MapLibre 대용량 가이드](https://maplibre.org/maplibre-gl-js/docs/guides/large-data/).
- **캔버스 공유 비교:** `interleaved: true`는 MapLibre와 WebGL2 컨텍스트를 공유한다. 구조상 대안이지만 자동으로 더 빠르다는 보장은 없다. 레이어 순서·블렌딩·안티앨리어싱과 메모리를 함께 검증한다. 이 모드에서는 `useDevicePixels`가 무시되므로 MapLibre `pixelRatio`로 해상도를 조절한다. [MapboxOverlay](https://deck.gl/docs/api-reference/mapbox/mapbox-overlay).

수치 비교 시 deck.gl `_onMetrics`의 `cpuTimePerFrame`, `updateAttributesTime`, `pickTime`, `bufferMemory`를 기록한다. GPU 시간은 기본 비활성이므로 측정할 때만 `deviceProps.debugGPUTime: true`를 켜고 지원 여부를 확인한다. GPU 계측 자체의 부가 비용과 실험적 API라는 점도 기록한다. [Deck metrics](https://deck.gl/docs/api-reference/core/deck#member-variables).

MapLibre는 `load`·`idle`로 로딩 시간을, 연속 이동 중 `render` 이벤트 간격으로 렌더링 빈도를 측정할 수 있다. 정지한 지도는 필요할 때만 그리므로 정지 상태의 낮은 render 빈도를 성능 저하로 판단하면 안 된다. 배경만 변경되지 않는 월 재생에서는 MapLibre render 횟수가 deck.gl 재생 FPS를 대표하지 않을 수 있다. [공식 측정 예제](https://maplibre.org/maplibre-gl-js/docs/examples/display-performance-metrics/).
