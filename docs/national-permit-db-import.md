# 전국 인허가 공통 DB와 청크 적재

2026-11-04 구현·검증. Java/Spring JDBC로 동작하며 CSV 다운로드는 앞서 만든 Python 수집기를 사용한다.
현재 적재 CLI는 **로컬 전용 H2**를 사용한다. 원격 PostgreSQL 접속이나 기존 Docker 작업은 수행하지 않았다.

## 실제 확인 결과

| 항목 | 확인 결과 |
| --- | ---: |
| 전국 약국 인허가 | 70,770건 |
| 전국 목재수입유통업 인허가 | 3,444건 |
| 인허가 합계 | 74,214건 |
| 관측 버전 | 74,214건 |
| OPEN 사건 | 74,146건 |
| CLOSE 사건 | 38,916건 |
| 완료 후 임시 적재 행 | 0건 |

약국 파일의 두 번째 실행은 `inserted=0, updated=0, unchanged=70770`이었다.
약국 68건의 1950년 이전 인허가 날짜는 원문과 품질 사유를 보존하고 검토 전 OPEN 사건 생성을 보류했다.
목재수입유통업은 폐업일 필드가 없어 CLOSE 사건을 만들지 않는다.
새 통합 테스트 9개를 포함해 전체 Java 테스트 52개와 `bootJar`가 통과했다.
SQL 검증과 파일 공간 정리 후 로컬 H2 파일 크기는 약 47 MB였다. 일괄 반영 중에는 임시 행/인덱스로 파일이 커질 수 있다.

이번 실제 SQL 검증 대상은 H2다. PostgreSQL 실제 엔진에서의 실행계획·대량 적재 검증과 PostGIS 도입은 별도 단계이며 완료했다고 주장하지 않는다.

## 테이블

[V3 마이그레이션](../src/main/resources/db/migration/V3__create_national_permit_import.sql)은 기존 테이블을 삭제하거나 바꾸지 않고 아래 테이블을 추가한다.

| 테이블 | 역할 |
| --- | --- |
| `permit_category` | 이번에 적재한 업종의 서비스 ID·이름·분류·폐업일 지원 여부 |
| `permit_import_run` | 원본 해시·분석 기준일·정규화 계약 해시·진행 위치·처리 결과 |
| `permit_import_lock` | 수집기 간 반영 순서 충돌 방지용 단일 실행 소유권 |
| `permit_import_stage` | 전체 파일 검사가 끝나기 전의 임시 행 |
| `national_permit` | 업종+기관코드+관리번호로 식별하는 인허가와 현재 버전 포인터 |
| `national_permit_version` | 상호·주소·날짜·상태·원천 좌표·품질 사유의 관측 버전 |
| `permit_event` | 해당 버전에서 근거 날짜가 있는 OPEN/CLOSE 사건 |

`permit_category`는 적재한 업종을 등록한다. 전체 195종의 목록은 JSON 카탈로그에 유지한다.
현재 지도/API가 사용하던 `permit_businesses`의 50건 샘플은 그대로 남아 있으며 새 테이블과 아직 연결하지 않았다.
`restaurants`도 기존 Spring 학습용 테이블이다.

## 실행

다운로드 출처 기록이 함께 있는 공식 CSV가 필요하다.

```powershell
# 필요한 경우 먼저 원본 확보
python scripts/collect-national-permits.py --category 약국 --download

# Spring 적재: 별도의 로컬 H2 파일 DB에 실행
.\gradlew.bat importNationalPermits `
  '-Pcategory=pharmacies' `
  '-Pinput=data/national-audit/pharmacies.csv' `
  '-Psnapshot=2026-11-04'
```

PowerShell에서는 `-Pinput=...csv` 같은 Gradle 속성 인자를 위처럼 따옴표로 감싼다.
기준일은 예시 값을 무조건 재사용하지 말고 수집한 스냅샷에 맞게 지정한다. 미래 기준일은 거절한다.
`source_as_of`는 이 실행에서 선언한 스냅샷 기준일이고 `started_at`은 실제 적재 관측 시각이다. 원천 수정시각은 선택 원문 JSON에 별도로 보존한다.

CLI는 명령행 우선순위로 DB URL/드라이버/사용자/프로필을 로컬 H2로 고정하고 `.env.postgres` import를 끈다.
DB 파일은 Git에서 제외되는 `data/national-import-db.mv.db`다. 이 명령을 실행해도 기존 PostgreSQL 확장 프로그램에는 자료가 나타나지 않는다.

새 V3 파일은 일반 Spring 애플리케이션의 Flyway 경로에도 포함된다. **기본 PostgreSQL 프로필로 `bootRun`을 다시 실행하면 원격 DB에도 V3 테이블이 자동 생성된다.** 이번 작업에서는 해당 실행을 하지 않았다.
원격에 테이블이 생기는 것과 전국 CSV가 적재되는 것은 별개다. 현재 적재 CLI는 원격 DB를 선택할 옵션을 제공하지 않는다.

## 처리 순서와 실패 처리

1. 공식 출처 URL, 파일 크기와 SHA-256을 확인한다. 초기 3종처럼 다운로드 해시 기록이 없으면 카탈로그의 기존 전량 검사 해시와 대조한다.
2. 업종 필드 계약과 정규화 버전의 해시를 만들고 단일 실행 소유권을 얻는다.
3. CP949 또는 UTF-8 CSV를 스트리밍으로 읽고 500건씩 JDBC batch insert한다. 따옴표 안의 쉼표·줄바꿈과 UTF-8 BOM을 처리한다.
4. 임시 행과 체크포인트를 같은 청크 트랜잭션에서 커밋한다. 전체 CSV를 Java 리스트에 올리지 않는다.
5. 파일 끝까지 읽고 파일 해시를 다시 확인한다. 파일이 처리 중 변경됐거나 행 수가 맞지 않으면 공개하지 않는다.
6. 한 반영 트랜잭션에서 신규 인허가/변경 버전/현재 포인터/사건/최종 건수를 갱신한다.
7. 반영 트랜잭션 안에서 임시 행을 제거한다. 실패하면 공개 테이블 변경은 롤백되고 이전 청크와 체크포인트는 재개용으로 남는다.

동일 복합키가 파일 안에 두 번 있거나 식별자가 누락되거나 CSV 열이 깨진 경우 전체 실행이 실패한다. 일부 행을 조용히 버리고 완전한 스냅샷인 것처럼 반영하지 않는다.
날짜 오류·좌표 누락 같은 품질 문제는 해당 인허가와 품질 사유를 보존하고 부정확한 사건 생성만 보류한다.

실패 로그의 실행 ID로 재개한다.

```powershell
.\gradlew.bat importNationalPermits `
  '-Pcategory=pharmacies' `
  '-Pinput=data/national-audit/pharmacies.csv' `
  '-Psnapshot=2026-11-04' `
  '-Presume=실패한-실행-UUID'
```

재개에는 같은 업종·파일 바이트·기준일·정규화 계약이 필요하다. 완료된 청크는 다시 넣지 않으며 CSV는 처음부터 읽어 체크포인트까지 건너뛴다. 바이트 오프셋 기반 재개는 아니다.
정상 예외는 잠금을 해제한다. 프로세스 강제 종료 시 남은 소유권은 동일 실행의 명시적 재개로만 이어받는다.
다른 업종을 포함해 한 번에 하나의 적재기만 반영한다. 실패 후 더 나중의 같은 업종 실행이 이미 완료됐다면 오래된 실행의 재개를 거절한다.
이미 반영한 것보다 오래된 기준일을 새로 적재하는 것도 거절한다.

## 버전과 사건의 의미

같은 현재 내용이면 버전을 추가하지 않고 마지막 관측 실행만 갱신한다.
날짜/이름/주소/상태 등이 달라지면 버전을 추가한다. 내용 A → B → A로 되돌아와도 3개의 관측 버전으로 보존한다.
사건의 현재 채택 여부는 `national_permit.current_version_id`와의 일치로 판단한다. 이전 버전의 사건을 누적 합산하면 정정 건을 중복 집계하게 된다.

```sql
-- 현재 채택된 사건만 조회
SELECT p.category_id, p.municipality_code, e.event_type, e.event_date,
       v.name, v.source_x, v.source_y, v.source_crs, v.issues_json
FROM national_permit p
JOIN national_permit_version v ON v.id = p.current_version_id
JOIN permit_event e ON e.version_id = v.id AND e.permit_id = p.id
ORDER BY e.event_date, p.id;
```

- 인허가일을 OPEN, 폐업일을 CLOSE의 근거로 사용한다. 실제 개점 시각이나 실제 폐점 시각이라고 표현하지 않는다.
- 없거나 잘못된 날짜, 기준일 이후 날짜, 날짜 역전, 검토 대상인 1950년 이전 날짜는 사건을 보류한다. 해당 원천 문자열은 남긴다.
- 현재 폐업 상태인데 날짜가 없는 건을 수집일에 폐업한 것으로 만들지 않는다. `CLOSED_DATE_UNKNOWN`으로 기록한다.
- 단순히 파일에서 사라진 인허가를 삭제하거나 폐업 처리하지 않는다.
- 원천의 모든 영업상태 코드·명칭과 상세 코드를 그대로 보관한다. 모든 업종의 코드를 같은 영업/폐업 의미로 단정하지 않는다.
- 버전의 `raw_json`은 선택 필드 문자열을 trim한 투영이며 전체 CSV 원문이 아니다. 원래 공백과 나머지 필드는 보존한 원본 CSV와 해시로 추적한다. 전화번호·대표자 정보 등은 이 투영에 넣지 않는다.
- 좌표는 원천 X/Y와 검증한 좌표계 선언을 저장한다. 확인되지 않은 좌표계는 NULL이다. 전국 좌표를 구로구용 변환기로 일괄 변환하지 않는다.
- 사건의 `location_basis=LATEST_KNOWN_SOURCE`는 최신 원부 위치를 근거로 삼는다는 뜻이다. 과거의 정확한 위치 이력을 복원했다고 주장하지 않는다.

현재 DB는 사건과 관측 버전의 기반이다. 영업 추정 재고·격자 집계·지도 재생 API는 아직 구현하지 않았다.
특히 `CLOSED_DATE_UNKNOWN`처럼 종료일을 모르는 기록을 `closed_on IS NULL`이라는 이유로 전 기간 영업 중에 넣으면 안 된다. 재생 시작 재고, 불확실 건수, 원천 현재 상태를 함께 다루어야 한다.

## 검증

```powershell
.\gradlew.bat test bootJar
```

통합 테스트는 분리된 메모리 H2에서 실행한다. 주요 시나리오는 기관 간 같은 관리번호, 동일 파일 재실행, 날짜 정정과 내용 되돌림, 반영 실패 롤백과 동일 실행 재개, 뒤 청크 중복 실패, 폐업일 미제공, 오류/미래 날짜, 오래된 스냅샷 방지, CP949 다중행 값이다.
PostgreSQL에서의 검증과 공간 인덱스는 다음 단계이며, 이 결과를 PostgreSQL 성능 증거로 사용하지 않는다.
