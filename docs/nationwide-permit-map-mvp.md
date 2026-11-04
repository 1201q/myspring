# 전국 인허가 타임라인 지도 — MVP 구현 계획

> Codex 작업 전 합의 문서. 이 문서에 없는 기능은 임의로 추가하지 않는다.

2026-11-03 목표 구체화: 개업·폐업의 공간적 발생량과 영업 지속 추정을 시간 재생으로 탐색한다. 최신 데이터셋 요건 및 논리 DB 설계는 [개·폐업 변화 지도 설계안](commercial-area-timeline-data-design.md)을 참고한다. 프런트엔드는 후속 합의에 따라 Vite + React + TypeScript + MapLibre를 사용한다.

## 1. 프로젝트 한 줄 정의

전국 지방행정 인허가 데이터를 기반으로 **지도 영역, 기준 날짜, 업종, 상태**를 선택해 사업장의 위치와 개폐업 변화를 탐색하는 웹 서비스.

- 핵심 차별점: 전국 범위 + 복수 업종 + **시간을 움직이면 마커와 통계가 바뀌는 지도**
- 목표: Spring Boot의 데이터 수집, 트랜잭션, 데이터 모델링, 공간 조회를 실제 문제에 적용
- 참고 서비스: https://seoulpulse.vercel.app/ , https://inhu.kr/categories
- 원천 데이터 검증 시작점: 공공데이터포털(https://www.data.go.kr/)의 지방행정 인허가 자료

## 2. MVP 범위

### 반드시 구현 (P0)

1. 지도 이동/확대 및 현재 지도 영역(Bounding Box) 조회
2. 업종 **최소 3종** 필터(서로 다른 원천 데이터 구조를 포함하도록 선정)
3. 기준 날짜(연-월-일) 지정 시 **그날 영업 중이었던 사업장** 마커 표시
4. 기간 지정 시 해당 기간 **신규 인허가 / 폐업** 마커를 선택적으로 표시
5. 마커 클릭 시 상호명, 업종, 주소, 인허가일, 폐업일, 원천 데이터 기준 상태 표시
6. 지도 조회 결과 수와 `좌표/날짜 누락으로 제외된 건수`를 구분한 데이터 품질 통계
7. 초기 적재 프로세스 및 재실행해도 중복되지 않는 적재 로직

### 다음 단계 (P1)

- 월/연도 타임라인 자동 재생 및 애니메이션
- 시도/시군구별 기간 통계와 비교
- 줌 레벨별 클러스터 및 서버 측 집계
- 수집 스케줄링, 수집 실패 재시도와 체크포인트
- 개별 사업장 상태 변경 이력(원본 자료가 제공하는 범위에서만)

### 이번 MVP에서는 하지 않음

- 전체 업종 일괄 수집, 전국 수백만 마커 일괄 반환
- 실시간 SSE, Kafka, 마이크로서비스, Redis, Kubernetes
- 생존율/폐업률 예측, 임대료·유동인구 결합
- 주소가 같다는 이유만으로 '동일 점포 교체'라고 단정
- 완전한 과거 시점 복원 보장: 원본 이력이 불충분하면 불가능

## 3. 첫 번째 작업은 데이터 검증 (코딩보다 우선)

**공식 원천 API/파일의 제공 범위는 변경될 수 있으므로, 실제 응답을 확인한 후 스키마를 확정한다.**

후보 3~5개 업종(예: 일반음식점, 미용업, 노래연습장, 의원)에 대해 다음을 조사한다.

| 검증 항목 | 확인 내용 |
|---|---|
| 식별자 | 사업장을 유일하게 식별하는 관리번호가 있는가? 업종 간 중복 가능성은? |
| 날짜 | 인허가일, 폐업일의 형식과 누락률은? |
| 상태 | 영업/폐업/휴업/취소가 어떤 코드로 제공되는가? |
| 좌표 | 좌표가 있는가? 좌표계(EPSG)는? 범위 오류·누락률은? |
| 주소 | 도로명/지번 주소가 존재하는가? |
| 갱신 | 수정일, 페이지네이션, 변경분 조회 또는 파일 배포 주기는? |
| 이용 조건 | 호출 제한, 이용약관, 출처 표시, 재배포 조건은? |

결과를 `docs/data-source-audit.md`에 표로 정리하고, **실제 샘플 응답 20건 이상**을 보관한다(개인정보·비공개 정보는 저장하지 않음).

**중요한 정의**
- `영업 중(as_of)`: `인허가일 <= 기준일 AND (폐업일 IS NULL OR 폐업일 > 기준일)`은 **날짜 기반 추정 상태**다. 휴업/취소/재개업 이력 부재 시 정확한 행정상 상태와 다를 수 있다.
- `신규 개업`: 우선 `인허가일` 기반 이벤트로 표시하고, 실제 영업 개시일과 동일하다고 주장하지 않는다.
- `폐업`: 원본 `폐업일` 존재 건만 이벤트로 취급한다.
- 월별 집계와 상태 지도는 각자 의미를 구분한다. '폐업 마커'는 모든 누적 폐업이 아닌 **선택 기간 중 폐업**을 기본으로 한다.
- 원천에 상태 변경 이력이 있으면 이후 `status_event` 모델을 추가해 정확도를 개선한다.

## 4. 기술 스택 및 구조

| 영역 | MVP 선택 | 이유 |
|---|---|---|
| Backend | Java 21, Spring Boot, Spring Web, Validation | REST API와 Spring 학습 |
| DB | PostgreSQL + PostGIS | 공간 인덱스 및 지도 영역 검색 |
| Persistence | Spring Data JPA + 필요 시 Native SQL/JdbcTemplate | 관리성 + 공간 조회 최적화 |
| Migration | Flyway | 스키마 변경 이력 관리 |
| Import | Spring Batch 또는 독립 Import Command | 중단/재실행 가능한 대량 적재 |
| Frontend | Next.js + TypeScript + MapLibre GL JS | 지도 UI, 필터, 시계열 조작 |
| Dev | Docker Compose(DB), Gradle, pnpm | 로컬 개발 반복 가능 |
| Test | JUnit 5, Testcontainers(PostgreSQL/PostGIS) | 실제 공간 쿼리/적재 검증 |

MVP는 **단일 Spring Boot 애플리케이션**으로 시작한다. 패키지는 `business`, `category`, `map`, `ingestion`, `common`처럼 기능 기준으로 구분한다. 모듈 분리나 메시지 브로커는 문제가 실제로 확인될 때 도입한다.

## 5. 데이터 모델 초안

> 아래는 검증 전의 논리 모델이며, 실제 식별자/날짜 특성에 맞춰 수정한다.

### `source_dataset`
- `id`, `name`, `source_url`, `license_note`, `last_imported_at`

### `permit_category`
- `id`, `source_type_code`, `source_type_name`, `display_group`, `display_name`
- 원본 인허가 업종 코드와 서비스용 분류 체계를 혼동하지 않는다.

### `business`
- `id` (내부 PK)
- `source_dataset_id`, `source_business_id`, `permit_category_id`
- `name`, `road_address`, `lot_address`
- `permitted_at` (DATE), `closed_at` (DATE nullable), `raw_status_code`
- `geom` (PostGIS `geometry(Point, 4326)`, nullable)
- `source_updated_at`, `ingested_at`
- 유니크 키: `(source_dataset_id, source_business_id)` **단, 식별자 검증 후 확정**
- 원본 응답은 별도 staging/raw 보관을 고려하되 민감정보는 제외

### `import_run`
- `id`, `source_dataset_id`, `started_at`, `finished_at`, `status`
- `received_count`, `inserted_count`, `updated_count`, `skipped_count`, `failed_count`, `error_summary`

### 인덱스 초안
- `UNIQUE (source_dataset_id, source_business_id)`
- `GIST (geom)`
- `(permit_category_id, permitted_at)`, `(permit_category_id, closed_at)`

인덱스는 실제 `EXPLAIN (ANALYZE, BUFFERS)` 결과를 보고 변경한다. 모든 조건에 복합 인덱스를 무작정 추가하지 않는다.

## 6. 백엔드 API 초안

### 6.1 카테고리
`GET /api/v1/categories`

응답: `[{ "id": "restaurant", "name": "일반음식점" }]`

### 6.2 지도 영역 + 시점 조회
`GET /api/v1/map/points?bbox=126.90,37.48,127.05,37.60&date=2020-01-01&categoryIds=restaurant,barbershop&limit=2000`

- `bbox` 순서: `minLng,minLat,maxLng,maxLat` (WGS84)
- 이 API의 의미: **기준 날짜 영업 중 추정 사업장**
- API는 지도 범위 외 데이터를 반환하지 않음
- 최대 결과 개수 제한. 초과 시 `truncated=true`와 안내 메시지 제공 (임의의 2,000개를 전체인 것처럼 표시하지 않음)
- 좌표 없는 데이터는 마커에서 제외

```json
{
  "items": [
    {
      "id": 123,
      "name": "예시식당",
      "categoryId": "restaurant",
      "lat": 37.55,
      "lng": 126.98,
      "permittedAt": "2018-03-10",
      "closedAt": null,
      "statusBasis": "DATE_INFERRED"
    }
  ],
  "returnedCount": 1,
  "truncated": false
}
```

### 6.3 개폐업 이벤트 조회
`GET /api/v1/map/events?bbox=...&from=2020-01-01&to=2020-12-31&categoryIds=restaurant&eventType=OPENED`

- `eventType`: `OPENED` / `CLOSED`
- 기간 양끝 포함 여부를 API 문서에 정의하고 일관되게 구현
- 반환 건수 제한 방식은 `/points`와 동일

### 6.4 사업장 상세
`GET /api/v1/businesses/{id}`

- 상호/주소/업종/인허가일/폐업일/원본상태/데이터 출처
- 날짜 기반 추정과 원본 상태의 차이를 명시

### 6.5 데이터 상태
`GET /api/v1/data-status`

- 업종별 마지막 수집일, 총 건수, 좌표 누락 건수, 날짜 누락 건수

## 7. 지도 화면 요구사항

- 기본 지역: 전국 지도. 초기 줌에서 **개별 업소 전체를 요청하지 않음**. 확대 안내 또는 집계 미리보기만 표시.
- 검색 기준: `date` 또는 `from/to` + `eventType` 중 하나를 선택
- 업종: 다중 선택 가능, 기본은 1종만 켬
- 지도 이동 종료 시 debounce 후 현재 bbox 재조회
- 요청 취소/캐시 키: `[bbox, date, categoryIds, mode]`
- 마커 클릭: 상세 패널 표시
- 좌표 없는 업소는 지도의 Point로 표시하지 않되 누락률 공개
- 빈 결과와 결과 제한 초과를 별도 UI로 표현
- 출처, 갱신 기준일, '인허가일 기반 추정' 안내 표시

## 8. 수집 및 정제 원칙

1. 원천 자료 수집 → staging 정규화 → 필드 검증 → DB upsert
2. 동일 파일/API 페이지를 여러 번 처리해도 중복 사업장이 생기지 않아야 함
3. 오류 행 때문에 전체 수집을 무조건 중단하지 않되, 오류 수/원인은 기록
4. 기존 기록이 다음 자료에 없다는 이유로 자동 폐업 처리하지 않음
5. 좌표가 제공되면 **명시된 EPSG**에서 4326으로 변환하고 한국 영역 밖 좌표를 플래그 처리
6. API 키는 환경변수로 관리. `.env`는 커밋하지 않음
7. 최초 버전은 **샘플 파일 → 특정 시군구 → 3개 업종** 순서로 적재 규모를 키움
8. 수정/삭제 이력의 제공 여부를 검증하기 전에는 '정확한 과거 복원'을 보장하지 않음

## 9. Codex 작업 분할 (순차 진행)

### Task 0 — 원천 데이터 검증 (반드시 선행)
- 공식 데이터셋 3~5종 선정
- 필드 명세/샘플/좌표계/갱신 방식 비교
- `docs/data-source-audit.md` 작성
- **완료 기준:** 3개 업종에서 사업장 식별자·인허가일·폐업일(또는 결측 특성)·좌표 제공 여부가 확인됨

### Task 1 — 로컬 개발 환경 및 DB
- Spring Boot, Flyway, Docker Compose(PostGIS), Next.js 초기화
- migration과 스키마 생성
- **완료 기준:** 한 명령으로 DB 구동, 백엔드/프론트 부팅, migration 성공

### Task 2 — 적재 MVP
- 3개 업종의 샘플 CSV/JSON 임포트
- 유효성 검사와 upsert, `import_run` 로그
- **완료 기준:** 같은 파일을 2회 넣어도 사업장 건수 불변. 오류 행 별도 집계

### Task 3 — 조회 API
- 카테고리, 지도 시점 조회, 개폐업 이벤트, 상세 API 구현
- PostGIS bbox 쿼리와 기본 인덱스
- **완료 기준:** 지정 날짜 이전 개업/이후 폐업 사례가 테스트에서 정확히 구분됨

### Task 4 — 지도 UI
- MapLibre 지도, 업종 필터, 날짜 입력/슬라이더, 마커/상세
- API 조회 취소, 로딩/빈 결과/초과 결과 처리
- **완료 기준:** 날짜나 업종을 바꾸면 현재 지도 범위의 마커가 변경됨

### Task 5 — 데이터 규모 및 성능 검증
- 지역 단위 실제 데이터 확장
- 인덱스 전후 쿼리 계획/응답 시간 측정
- **완료 기준:** 최소 3개 줌/지도 영역에서 요청 건수, 반환 건수, DB 실행 계획, p95 응답 지연 기록

### Task 6 — 전국 확장 준비
- 전체 업종 적재 예상량과 데이터 품질 수치 확인
- 집계/클러스터/벡터 타일의 도입 조건 정의
- **완료 기준:** 데이터 규모·응답 지연·마커 밀도를 근거로 P1 우선순위 결정

## 10. 테스트 시나리오

- 인허가일 전날 → 표시되지 않음 / 인허가일 당일 → 표시됨
- 폐업일 전날 → 표시됨 / 폐업일 당일 → 폐업 처리 (날짜 포함 규칙 명시)
- 폐업일 null → 이후 날짜도 표시(단, 데이터 기준일 이후를 실제 현재 상태로 단정하지 않음)
- bbox 경계의 점, 같은 주소의 여러 사업장, 중복 원천 ID
- 좌표 미존재, 이상 좌표, 잘못된 날짜, 종료일이 시작일보다 빠른 레코드
- 동시 수집/반복 수집 시 중복 및 유실 여부
- 날짜·업종 필터 빠른 변경 시 오래된 API 응답이 새 결과를 덮어쓰지 않는지
- 전국 초기 줌에서는 과도한 Point 조회가 발생하지 않는지

## 11. 성능 측정 기준 (목표치는 측정 후 설정)

- 수집: 전체 소요 시간, 초당 처리 건수, 누락/오류 비율
- API: DB 실행 시간, p50/p95 응답, 결과 건수, 페이로드 크기
- 지도: 변경 후 마커 표시까지 지연, 마커 수 증가에 따른 FPS/메모리
- **합격 기준을 임의의 성능 수치로 정하지 않음.** 최초 기준선 측정 후 개선 목표 수립

## 12. Codex에 전달할 작업 규칙

- 각 Task를 독립 PR/커밋 단위로 구현하고 테스트 결과를 함께 기록한다.
- Task 0의 샘플과 필드 검증 없이 DB 스키마/수집 파서를 확정하지 않는다.
- 인터페이스/원천 필드명을 추측해서 구현하지 않는다. 명세가 없으면 TODO와 차단 사유를 기록한다.
- JPA로 기본 CRUD를 처리하고, PostGIS 공간 연산은 Native SQL/JdbcTemplate을 허용한다.
- 정상 작동 증명은 테스트, SQL 실행 계획, 실제 지도 동작으로 남긴다.
- 편의를 위해 모든 업종을 하나의 원본 스키마로 강제로 뭉개지 않는다.

## 13. 첫 Codex 요청 예시

> 이 프로젝트는 `docs/nationwide-permit-map-mvp.md`를 기준으로 진행한다. 우선 **Task 0만 수행**하라. 공식 전국 지방행정 인허가 데이터에서 일반음식점, 미용업, 노래연습장 등 데이터 구조가 다른 3~5개 업종을 선정하고, 원본 식별자·인허가일·폐업일·영업상태·주소·좌표·좌표계·갱신 방식·이용 조건을 검증하라. 확인된 사실과 미확인 사항을 구분해 `docs/data-source-audit.md`를 작성하라. 아직 애플리케이션 코드는 작성하지 말라.
