# 구로구 일반음식점 샘플 적재

## 실행

로컬 SSH 터널을 켠 상태에서 프로젝트 루트에서 실행합니다.

```powershell
.\gradlew.bat importRestaurantSample
```

기본 PostgreSQL 프로필과 `.env.postgres`를 사용합니다.
이 명령은 DB에 실제로 저장합니다. HTTP 서버는 열지 않으며 평소 `bootRun` 시 자동 적재되지 않습니다.
처음 실행할 때 Flyway가 V2로 `permit_businesses` 테이블을 생성합니다.
기존 학습용 `restaurants` 테이블과 API는 별도로 유지합니다.

예상 출력은 첫 실행에서 다음과 같습니다.

```text
Rows: 50
Inserted: 50
Updated: 0
Unchanged: 0
Rejected: 0
Accepted without source coordinates: 10
```

같은 파일을 다시 넣으면 `Inserted: 0`, `Updated: 0`, `Unchanged: 50`이고 저장 건수는 50건입니다.
좌표 누락 10건도 사업장으로 저장하며 좌표 두 필드는 null, 경고는 `issues_json`에 기록됩니다.

## 저장 규칙

- 원천 구분: `seoul:OA-18668`
- 허용 지역: 구로구 기관코드 `3160000`
- 유일 키: `(source_dataset, management_number)`
- 관리번호의 앞뒤 공백은 제거해 비교하고, 원문은 별도 JSON에 유지합니다.
- 새 키는 등록, 같은 키의 원문 또는 검증 경고가 바뀌면 기존 행을 갱신합니다.
- 같은 내용은 갱신하지 않으므로 `last_imported_at`도 유지됩니다. 이 컬럼은 마지막 저장 시각입니다.
- 주소나 상호가 같아도 관리번호가 다르면 별도 사업장입니다.
- 입력 파일에 없는 기존 행을 삭제하거나 폐업 처리하지 않습니다.
- 다른 지역의 유효 행이 있으면 저장 전에 파일 전체를 거절합니다.

`source_json`은 DTO가 보유한 원천 필드의 JSON입니다. 원천 시스템 전체 응답이나 사업장 전체 변경 이력을 보관하는 필드는 아닙니다.
좌표는 `source_x`, `source_y`, `source_crs=5174`로 저장합니다. 아직 PostGIS나 위경도 변환은 사용하지 않습니다.
일반음식점 안의 세부 업태는 `business_type`이며 원천 데이터셋 구분과 별개입니다.

## 오류 처리와 트랜잭션

행 검증에서 오류가 난 행은 제외하고 나머지를 저장합니다.
행별 오류·경고 코드와 신규·갱신·변경 없음·거절 건수는 명령 결과에 출력합니다.
거절 행 자체는 DB에 보관하지 않습니다. 실행 이력을 저장하는 `import_run` 테이블은 아직 없습니다.

파일 파싱 실패, 지역 불일치, DB 저장 실패는 명령 실패로 처리합니다.
DB 저장은 파일당 하나의 트랜잭션이며 DB 오류가 발생하면 이번 파일의 저장을 모두 롤백합니다.
반환 결과는 커밋이 끝난 뒤 출력하므로 롤백된 건수를 성공으로 보고하지 않습니다.

현재는 수동으로 한 번에 하나의 적재 명령을 실행하는 범위입니다.
유일 제약은 중복 행 생성을 막지만 동시 적재 충돌의 자동 재시도나 원천 갱신 시점에 따른 선후 판단은 구현하지 않았습니다.
동시 실행 중 유일 제약 충돌이 발생하면 한 실행이 롤백될 수 있습니다.
과거 스냅샷을 최신 파일 위에 덮어쓰지 않도록 수동 적재 파일을 확인해야 합니다.

## DB 확인

VS Code PostgreSQL 확장에서 `permit_map_dev`에 연결한 후 실행합니다.

```sql
SELECT version, description, success
FROM flyway_schema_history
ORDER BY installed_rank;

SELECT COUNT(*) FROM permit_businesses;

SELECT id, management_number, name, permitted_at, closed_at,
       source_x, source_y, source_crs
FROM permit_businesses
ORDER BY id;

SELECT COUNT(*) AS without_coordinates
FROM permit_businesses
WHERE source_x IS NULL OR source_y IS NULL;
```

현재 샘플은 전체 50건, 좌표 없음 10건입니다. 기존 `/api/restaurants`는 이 테이블을 조회하지 않습니다.
인허가 자료 조회 API는 별도로 구현할 예정입니다.

## 검증

- 실제 샘플 50건을 두 번 적재했을 때 저장 건수 50건 유지.
- 같은 관리번호의 이름·폐업일 변경 시 ID를 유지하면서 갱신.
- 날짜 오류 행 제외, 좌표 누락 행은 경고와 함께 저장.
- 다른 지역 파일 거절, DB 유일 제약 검증.
- DB 숫자 범위 초과를 일으켜 같은 파일의 앞선 저장도 롤백되는지 검증.
- 테스트는 메모리 H2를 사용하며 실제 PostgreSQL 적재는 별도로 확인.

원천 조사는 [데이터 조사](data-source-audit.md), 검증 기준은 [샘플 검증](sample-validation.md)을 참고하세요.
