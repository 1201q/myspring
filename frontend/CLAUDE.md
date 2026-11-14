# frontend — 동네의 기록

전국 개업·폐업 기록을 시간 흐름으로 보여 주는 지도 앱(React 19 + Vite, MapLibre, deck.gl).
화면 전체가 지도이고, 모든 UI는 그 위에 블러 처리된 글래스 조각으로 떠 있습니다. 다크 테마가 기본입니다.

## 디자인 시스템

- UI를 만들거나 고치기 전에 디자인 시스템을 먼저 읽습니다: https://claude.ai/artifact/PP65wz9nDgthiLiXUiZ4dc
  - Artifact 도구의 `read`로 `project/README.md`(브랜드 북: 원칙, 화면 구성, 색·글자·간격, 문구)를 먼저 읽고,
    고칠 요소의 `project/components/<이름>/README.md`(FilterCapsule, PlaybackBar, LayerSheet, InfoDock, RankPanel, MapPopup 등)를 읽습니다.
  - 토큰 원본은 `project/tokens.json`입니다.
- 디자인 시스템과 코드가 다르면 코드가 현재 동작입니다. 의도한 변경이면 디자인 시스템 문서도 같이 고칩니다.

## 지켜야 할 규칙

- **색·간격·모서리·크기는 토큰 변수만** 씁니다(`var(--ink)`, `var(--space-4)`, `var(--radius-lg)` …). 정의는 `src/styles/tokens.css`.
  CSS에 hex나 rgba를 새로 쓰지 않습니다. 테마별 값은 토큰이 처리하므로 `[data-theme="dark"]` 덮어쓰기 블록을 만들지 않습니다.
- `src/styles/tokens.css`는 디자인 시스템 `tokens.json`에서 생성한 파일입니다. 값을 바꿀 때는 `tokens.json`을 먼저 고치고 이 파일을 다시 맞춥니다.
- deck.gl·MapLibre 레이어는 CSS 변수를 읽지 못하므로, 지도 위 색은 `src/lib/theme.ts`의 `MAP_PALETTE`에 같은 값을 둡니다. 토큰을 바꾸면 여기도 맞춥니다.
  지도 바탕 색은 `public/styles/quiet-{dark,light}.json`(토큰 `map-*`).
- **글래스는 세 단계뿐**입니다(`src/styles/glass.css`): `dn-glass-sm`(칩·툴팁·토스트), `dn-glass`(늘 떠 있는 것), `dn-glass-strong`(시트·독·팝업).
  - 블러 없는 반투명 배경, 그라디언트는 쓰지 않습니다.
  - 시트·피커는 다른 글래스의 **자식이 아니라 형제**로 둡니다. `backdrop-filter`가 겹치면 안쪽 블러가 지도를 흐리지 못합니다.
- 색은 데이터에만: 개업 `open`(채운 점), 폐업 `close`(빈 고리), 동별 증감 `dong-*`. 상호작용·선택·포커스는 `accent`, 선택 상태는 반전(`selected`/`on-selected`). 개업·폐업은 항상 점/고리 모양을 색과 함께 씁니다.
- 숫자에는 `dn-num`(tabular-nums), 천 단위는 `toLocaleString("ko-KR")`. 월은 `2024.03`(`playbackSeries.ts`의 `formatMonth`), 일자는 `2019.05.14`(`lib/format.ts`의 `formatDate`), 기간은 `2024.01 – 2024.03`.
- 아이콘은 `lucide-react`(선 1.75). 문자 기호(▶, ×, ▾)나 이모지를 아이콘으로 쓰지 않습니다. 글꼴은 Pretendard(`pretendard` 패키지).
- 문구: 존댓말, 짧게. 화면에는 '개업/폐업'('인허가'는 날짜 이름과 집계 설명에서만). 자료가 말하는 것보다 세게 말하지 않습니다 — 폐업일이 없으면 '영업 중'이 아니라 '폐업 기록 없음'.

## 화면 배치

| 자리 | 요소 | 파일 |
| --- | --- | --- |
| 왼쪽 위 | 필터 캡슐(로고 · 지역(시도 · 시군구) · 업종, 각각 시트) | `ui/FilterCapsule.tsx` |
| 캡슐 아래 왼쪽 | 개업 많은 순(모든 업종, 행 클릭 = 업종 필터, 1100px 미만은 접혀서 시작) | `ui/RankPanel.tsx` |
| 오른쪽 위 | 레일(레이어 · 테마 / 확대 · 축소 · 지역 전체 보기) | `ui/MapRail.tsx` |
| 레일 왼쪽 | 레이어 시트(동별 증감 · 지하철 · 개업 순위) | `ui/LayerSheet.tsx`, 상태는 `ui/layers.ts` + `app/App.tsx` |
| 오른쪽 아래 | 정보 독 — 동별 증감이나 지하철이 켜졌을 때만(둘 다 기본 꺼짐) | `ui/InfoDock.tsx` |
| 아래 가운데 | 재생 바(60px, 900px 이하 두 줄 약 118px) | `features/playback/PlaybackBar.tsx`, `playbackSeries.ts` |
| 점 옆 | 업소 팝업 · 같은 위치 목록 | `app/App.tsx`의 `.detail`, `features/business/LocationRecords.tsx`, `BusinessStatus.tsx` |
| 위 가운데 | 오류 토스트 | `features/playback/NationalPlayback.tsx`의 `.toasts` |

- 아래쪽 92px(재생 바 + 여백)는 재생 바 전용입니다. 순위 패널과 정보 독은 그 위에서 멈춥니다. 새 플로팅 요소를 넣으면 1440·820·375px에서 서로 겹치지 않는지 확인합니다.
- 정보 독은 틀과 탭만 그리고, 탭 내용은 자료를 가진 컴포넌트가 `createPortal`로 넣습니다(동별 증감 → `NationalPlayback.tsx`, 지하철 → `SubwayOverlay.tsx`). 새 레이어도 같은 방식으로 붙입니다.
- 시군구로 좁혀 보기: 재생 자료는 시도 단위 그대로이고 브라우저에서 거릅니다. 동별 Worker(`features/dong/dongStatistics.worker.ts`)가 점마다 행정동을 배정하면,
  행정동 코드 앞 5자리 = 시군구로 `data/sigungu.ts`가 점 필터(deck.gl 두 번째 필터 카테고리)와 `monthlyCounts`와 같은 모양의 시군구 집계를 만듭니다.
  합계·순위·그래프는 이 `monthlyCounts`만 바꿔 끼워 계산하므로, 새 통계도 `manifest.monthlyCounts`를 직접 읽지 말고 `NationalPlayback.tsx`의 `monthlyCounts`를 씁니다.
  경계는 `public/data/sigungu/`(행정동 경계를 합쳐 `npm run build:sigungu`로 생성). 묶음은 `kind: "si"` 피처로 하나 더 두고 소속 시군구 코드를 `members`에 적습니다:
  일반구가 있는 시(수원시 등), 그리고 코드가 없는 이름 묶음(스크립트의 `NAMED_GROUPS` — 전남광주의 '광주 5구' = 동구·서구·남구·북구·광산구, 구 라벨은 '광주 동구', 합성 코드 12200).
  묶음 소속은 코드 계산이 아니라 `members`로 판단합니다.
- 지도 상호작용 규칙: **지금 고른 시도는 지도에서 반응하지 않습니다**(hover 색 변화·빈 곳 클릭 없음, 점만 동작). 다른 시도만 hover 경계·클릭 전환.
  시군구는 지역 시트에서만 고르고, 칩 hover/focus 때만 지도에 미리 그립니다. 고른 시군구의 경계·바깥 덮개는 pickable이 아닙니다.
  시도 '전체'일 때는 그 시도의 윤곽(`region-outline`)만, 시군구를 고르면 그 시군구 윤곽만 accent 2.5px로 그립니다(둘 다 pickable 아님).
  동별 증감 레이어는 `showDongs`(레이어 시트)만 따릅니다 — 동별 Worker가 시군구 때문에 돌고 있어도 색을 그리지 않습니다.

## 확인

- `npm run build`(tsc 포함), `npm run lint`(oxlint), `node --test "src/**/*.test.mjs"`.
- 개발 서버는 `npm run dev`(127.0.0.1:5173, `/api`는 127.0.0.1:8080 백엔드로 프록시).
- 지도는 첫 프레임이 그려져야 `load`되므로, 창이 가려진 브라우저에서는 지도·지하철·동별 레이어가 시작되지 않습니다. 화면 확인은 창이 보이는 상태에서 합니다.
