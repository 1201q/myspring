# Feature 레이어 브랜치 통합

통합일: 2026-11-23. 로컬 통합 브랜치는 `codex/feature-layer-integration`이다.

## 포함 브랜치

| 브랜치 | 통합 기준 커밋 | 처리 |
| --- | --- | --- |
| `feature-commercial-area` | `6bb10ec` | 통합 브랜치의 시작점. 상권 경계·트렌드 6종·상권 길 유지 |
| `feature-population` | `7e05022` | merge commit으로 병합. 인구·연령·세대·전월 증감 연결 |
| `feature-transport-layers` | `201feaf` | merge commit으로 병합. 버스정류장과 시설 감사 기록 포함 |
| `feature-overpasses` | `74117d9` | 이미 포함된 조상 커밋. 별도 육교 UI 구현은 없음 |
| `codex/feature-resident-population` | `5fd4046` | 이미 포함된 공통 기반 커밋 |

원래 feature 브랜치와 `dev`, `main`은 변경하지 않았다. 직전 작업의 제공 현황·메타데이터 규격 문서도 통합 브랜치에 커밋해 보존했다. 원격 push와 배포는 수행하지 않았다.

## 충돌 해결

- `layers.ts`: 인구·지하철·버스·상권 영역·상권 길·동별 증감·개업 순위 키와 기본값을 모두 유지한다.
- `LayerSheet.tsx`: 각 기능의 선택 항목·아이콘과 기준일·인구 색상 우선 안내를 함께 보존한다.
- `App.tsx`: 상권과 버스 오버레이를 함께 연결하고, 인구·상권 길의 재생 컴포넌트 속성을 유지한다. 활성 정보 탭에만 해당 패널의 포털을 연결한다.
- `NationalPlayback.tsx`: 인구 면·통계 패널과 상권 길 오버레이를 함께 유지한다. 개폐업 점 표시와 기간·업종 필터를 보존한다.

인구 데이터 무결성 검사에서 Windows checkout의 CRLF 변환으로 SHA-256 불일치가 발견됐다. 원래 LF 바이트를 복원하고 `.gitattributes`에 인구 발행 JSON의 LF 규칙을 추가했다. 원천 수치·기록된 해시·검증 조건은 변경하지 않았다.

## 검증 범위

프로젝트 루트에서 기존 Node 테스트를 모두 실행한다.

```powershell
$testFiles = @(rg --files frontend/src scripts -g '*test.mjs')
node --test @testFiles
```

프런트엔드에서 `npm run build`, `npm run lint`와 충돌 해결 파일의 Prettier 검사를 수행한다. 백엔드 코드는 변경하지 않았으며, DB 접속·실제 브라우저에서의 레이어 동시 조작·운영 배포는 이번 검증 범위에 포함하지 않는다.

통합 후 기존 테스트 39개 전체, 프로덕션 빌드, 린트, 충돌 해결 파일 4개의 Prettier 검사가 통과했다. 빌드에는 500 kB 초과 청크 경고가 남아 있다. 위 표의 모든 브랜치 커밋이 통합 브랜치의 조상인지도 확인했다.

공통 제공 범위 판정은 아직 런타임에 적용하지 않았다. 브랜치를 합쳐도 지역별 원천의 정의·전수성·시계열 차이가 자동으로 해결되지는 않는다. 후속 변경은 [공통 메타데이터 규격](layer-coverage-contract.md)에 따라 진행한다.
