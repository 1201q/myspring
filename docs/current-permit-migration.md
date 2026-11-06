# 현재 정보와 변경 이력 분리

기존 전국 데이터에서 현재 상세 정보를 직접 읽을 수 있도록 옮긴다. 원본 CSV를 다시 내려받거나 미완료 일반음식점 적재를 재시도하지 않는다.

- `national_permit_current`: 인허가 식별자, 현재 상세 정보, 원천 기준일, 수집 실행 정보. `current_version_id` 연결이 없다.
- `national_permit_history`: 현재 값으로 대체된 과거 상세 스냅샷. 최초 수집 정보는 현재 테이블에만 저장한다. 기존 과거 버전이 있다면 이 테이블로 보존한다.
- `national_permit_current_event`: 현재 인허가일·폐업일에서 개폐업 이벤트를 제공하는 뷰. 날짜가 없는 이벤트는 만들지 않는다. 날짜 정정 시 뷰에도 바로 반영된다.
- 기존 전국 테이블, 수집 실행 기록, 일반음식점 staging, 기존 API 샘플은 유지한다.

## 이전 실행

```powershell
.\gradlew.bat migrateNationalCurrent -Pdatabase=permit_map_dev
```

기존 SSH 터널 `127.0.0.1:15432`와 `.env.postgres`를 사용한다. HTTP 서버나 Docker 서비스를 재시작하지 않는다. Flyway V5는 빈 테이블을 추가하며 데이터 복사는 위 명령으로만 수행한다.

1만 ID 범위마다 복사, 모든 필드의 `EXCEPT` 비교, 체크포인트 저장을 같은 트랜잭션으로 커밋한다. SQL 20초, 잠금 3초, 트랜잭션 30초, 전체 복사 5분 제한이다. 제한에 걸리면 완료된 범위는 보존하고 같은 명령으로 재개한다. 강제 프로세스 종료로 `permit_import_lock.owner_run`이 남으면 실행 중인 이전 프로세스가 없는지 확인한 후 해당 소유자만 해제해야 한다.

이전을 시작하면 구 구조 적재기를 차단한다. **정기 갱신 적재기와 전국 API의 새 테이블 연결은 후속 작업이다.** 아래 최초 적재 복구 기능은 기존 업종의 변경 갱신에는 사용할 수 없다. 기존 테이블 삭제나 용량 회수는 수행하지 않는다. 복사 중에는 두 구조가 공존하므로 디스크 사용량이 증가한다.

## 조회

```sql
SELECT category_id, COUNT(*) FROM national_permit_current GROUP BY category_id ORDER BY category_id;
SELECT * FROM national_permit_current LIMIT 10;
-- 서비스 조회에는 완료된 수집 실행만 노출하는 뷰를 사용한다.
SELECT * FROM national_permit_published LIMIT 10;
SELECT * FROM national_permit_current_event ORDER BY event_date DESC LIMIT 20;
SELECT * FROM national_current_migration;
```

지도 화면의 기존 50건 샘플 API는 이 작업으로 전환되지 않는다. 이력은 관측한 변경만 보존하며, 최초 수집 이전의 변경을 복원하지 않는다.

## 2026-11-06 서버 실행 결과

- 현재 정보 1,773,803건 이전 완료: 대상 14업종 1,770,359건과 기존 목재수입유통업 3,444건.
- 과거 이력 0건: 원래 버전 수와 현재 인허가 수가 같았으며 각 현재 버전 연결도 검증했다.
- 최초 실행은 5분 복사 제한으로 중단됐고 체크포인트부터 한 번 재개해 완료했다. 재개 실행은 앱 초기화와 최종 집계를 포함해 1분 45초였다.
- 모든 복사 범위에서 전체 필드 일치, 최종 현재 건수, 체크포인트 및 `COMPLETED` 상태를 확인했다.
- 일반음식점 2,309,440건의 미완료 임시 적재와 기존 샘플의 내용 지문을 보존했다. Docker 4개 컨테이너의 시작 시각과 재시작 횟수는 이전 전과 같다.
- DB 크기 9,036,150,451바이트(약 8.4GiB). 구 구조를 보존한 복사이므로 이전 전보다 공간을 더 사용한다.
- H2 적재기 회귀 테스트 11개 통과, 성능 실험 1개 제외. 별도 PostgreSQL에서 현재/과거 이력, 날짜 이벤트, 반복 이전 및 구 적재 차단 테스트 1개 통과.

검증 기록: [current-migration-verification.json](data-samples/national/current-migration-verification.json).

## 실패한 최초 적재의 임시 데이터 재사용

```powershell
.\gradlew.bat publishStagedNationalCurrent -Pdatabase=permit_map_dev -Prun=798a2c62-1f68-4216-926f-ec6385fdaabd
```

`NationalCurrentInitialPublisher`는 전체 임시 적재가 끝났으나 구 구조 publication이 실패했던 실행을 새 현재 테이블에 직접 넣는다. 대상 업종의 현재 테이블이 비어 있어야 시작할 수 있다. 원천 실행·기준일·해시를 유지하고 CSV를 다시 읽지 않는다. 최초 데이터는 변경 이력에 복제하지 않으며 `current_version_id` 갱신도 없다.

1만 행마다 임시 범위 건수, INSERT 반영 건수, 체크포인트·누적 삽입 건수를 한 트랜잭션으로 저장한다. SQL 20초, 잠금 3초, 트랜잭션 30초, 실행당 5분 제한이다. 마지막에 커밋된 삽입 건수와 체크포인트가 원천 전체 건수에 도달했는지 확인한 후 실행을 `COMPLETED`로 변경한다. 재개 때 물리 테이블 전체를 COUNT하지 않는다. 정상 중단·실패 시 같은 명령으로 완료 범위 다음부터 재개한다. 완료 후 같은 명령을 반복해도 중복 삽입하지 않는다.

전체 물리 건수·이번 신규 기본키 범위 건수·첫/중간/마지막 3개 표본의 모든 원천 필드·기존 샘플 보존은 완료 후 `scripts/verify-current-publication.ps1 -RunId <UUID>`로 검증한다. 이 검증 스크립트의 신규 범위 계산은 **구 구조 이전 후 최초 1개 업종 추가**에 한정한다. 다른 업종을 추가하면 범위가 달라지므로 그대로 재사용하지 않는다. SQL은 20초 제한이다. 적재 중에는 외부에서 현재/임시 테이블을 수동 수정하지 않는다.

중간 완료 범위는 물리 테이블 `national_permit_current`에 남지만, `national_permit_published`와 `national_permit_current_event`에서는 전체 실행이 완료되기 전까지 제외한다. API 연결 시 이 뷰를 사용해야 한다. 검증·재개를 위해 원래 임시 데이터도 유지한다.

## 일반음식점 새 구조 반영 결과

- 원천 실행 `798a2c62-1f68-4216-926f-ec6385fdaabd`, 기준일 2026-11-04, 2,309,440건 반영 완료. 원래 SHA-256을 보존했다.
- publication 시작 11:26:16, 완료 11:37:21(KST): 11분 5초. 5분 예산 중단, 전체 COUNT로 재개 검사하던 코드 수정, 검증 및 재개 대기 시간을 포함한다. 동일 조건의 기존 방식 대비 배수 측정은 아니다.
- 처음에는 재개 전 업종 전체 COUNT가 20초 제한에 걸렸다. 재개·완료 시에는 INSERT 반영 건수와 체크포인트의 트랜잭션 일치로 검사하도록 수정했다.
- 최종 실제 현재 테이블 4,083,243건, 이전 이후 신규 기본키 범위 2,309,440건 확인. 대상 15업종 4,079,799건과 별도 목재수입유통업 3,444건의 합과 일치한다. 과거 이력은 0건이다.
- 첫/중간/마지막 3개 행은 이름·주소·날짜·상태·좌표·원문 JSON·품질 이슈·해시 등 모든 원천 필드 및 실행·기준일 정보가 임시 데이터와 일치한다.
- 업종별 GROUP BY를 포함한 통합 검증은 60초/20초 제한에 걸려 중단했다. 이를 재반복하지 않고 기본키 COUNT와 지점 표본으로 좁힌 최종 검증은 약 7초에 완료했다. **업종별 전체 집계 성능은 아직 해결하지 않았다.** 기존 14개 업종별 재집계 결과로 보고하지 않는다.
- 최종 잠금 없음. 기존 두 샘플의 내용 지문과 Docker 4개의 시작 시각·재시작 횟수는 유지됐다.
- DB 11,883,550,387바이트(약 11.1GiB), 서버 가용 디스크 22GB. 구 테이블과 임시 데이터는 삭제하지 않았다.
- 전체 H2 테스트 59개 통과, 성능 실험 1개 제외. 별도 PostgreSQL 신규 적재/재개 테스트 2개 통과.

최종 검증: [current-publication-general_restaurants-verification.json](data-samples/national/current-publication-general_restaurants-verification.json).
