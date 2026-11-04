# 전국 인허가 PostgreSQL 검증 및 서버 반영

작업일: 2026-11-04 (KST)

## 구성

Java 적재기는 로컬에서 실행하고, 기존 SSH 터널 `127.0.0.1:15432`를 통해 서버 PostgreSQL에 저장한다.
CSV를 서버로 복사하거나 서버에 Java를 설치하지 않는다. 기존 Docker 컨테이너의 재시작·설정 변경도 필요하지 않다.
기본 적재 대상은 여전히 로컬 H2다. PostgreSQL은 명시적인 대상/DB 이름이 있어야 선택된다.

```powershell
.\gradlew.bat importNationalPermits `
  '-Ptarget=postgres' `
  '-Pdatabase=permit_map_dev' `
  '-Pcategory=pharmacies' `
  '-Pinput=data/national-audit/pharmacies.csv' `
  '-Psnapshot=2026-11-04'
```

위 명령은 DB를 변경한다. 해당 원본과 기준일에 맞춰 사용한다. 이미 같은 파일이 반영됐다면 변경 없는 인허가는 버전을 추가하지 않는다.
`target`을 생략하면 기존 로컬 H2를 사용한다. PostgreSQL 대상은 `permit_map_dev` 또는 `permit_map_verify_...` 형식의 명시적 이름으로 제한한다.
DB 비밀번호는 기존 `.env.postgres`에서 읽으며 명령행 인자에 넣지 않는다. SSH 터널은 먼저 연결돼 있어야 한다.

## 검증 순서

1. 기존 컨테이너의 시작 시각·재시작 횟수와 DB의 테이블/마이그레이션/기존 데이터 지문을 기록했다.
2. 별도 `permit_map_verify_20261104_national` DB를 만들고 PostgreSQL 17.11에서 통합 테스트를 수행했다.
3. 실사용 DB를 custom-format 백업으로 저장하고 별도 복원 DB에서 실제 복원했다. 기존 음식점 1건과 샘플 50건의 JSON 지문이 일치했다.
4. 전국 약국·목재수입유통업 전체 파일을 검증 DB에서 반영해 H2와 동일한 건수를 확인했다.
5. 실사용 DB에 V3 마이그레이션과 두 업종을 반영하고, 같은 약국 파일의 재실행 결과를 확인했다.
6. 기존 테이블 지문, 컨테이너 상태, 실제 건수/이벤트/버전/임시 적재 행을 다시 비교했다. 검증/복원용 DB 3개는 제거했고, 상세 결과는 [서버 검증 기록](data-samples/national/postgres-import-verification.json)에 남겼다.

최종 SQL 검증 결과:

| 항목 | 결과 |
| --- | ---: |
| 약국 | 70,770건 |
| 목재수입유통업 | 3,444건 |
| 인허가 및 현재 관측 버전 | 각각 74,214건 |
| OPEN / CLOSE 사건 | 74,146 / 38,916건 |
| 완료 후 임시 행 | 0건 |
| 약국 동일 파일 재실행 | 신규 0 / 변경 0 / 동일 70,770건 |
| 전체 H2 회귀 테스트 | 55개 통과 |
| PostgreSQL 통합 테스트 | 9개 통과 |

기존 `restaurants` 1건, `permit_businesses` 50건의 지문이 작업 전후 동일했다. 기존 컨테이너 4개의 시작 시각·재시작 횟수도 동일했고 모두 실행 중이었다. nginx HTTP 응답은 301이었다.

전체 파일 검증에서 오래 걸리는 상관 서브쿼리와 빈 테이블 통계에 의한 실행 계획 문제를 발견했다.
검증 DB의 해당 SQL만 취소했으며 인허가 공개 테이블은 0건으로 롤백되고 임시 행 70,770건은 유지됐다.
현재 버전/최종 관측 갱신을 `MERGE` 조인으로 바꾸고, PostgreSQL에서는 대량 반영 중 새로 늘어난 테이블의 통계를 `ANALYZE`로 갱신한다.
수정 후 같은 실행 ID로 재개해 검증 전체 파일을 완료했다. 정규화 규칙은 바뀌지 않아 체크포인트의 계약 해시를 유지했다.

관련 공식 문서: [PostgreSQL MERGE](https://www.postgresql.org/docs/17/sql-merge.html), [대량 적재 후 통계 갱신](https://www.postgresql.org/docs/17/populate.html#POPULATE-ANALYZE), [H2 MERGE USING](https://h2database.com/html/commands.html#merge_using).

## 결과 조회

VS Code PostgreSQL 확장에서 `permit_map_dev` DB를 선택하고 실행한다.

```sql
SELECT category_id, COUNT(*) AS permits
FROM national_permit
GROUP BY category_id
ORDER BY category_id;

SELECT category_id, status, processed_rows,
       inserted_count, updated_count, unchanged_count
FROM permit_import_run
ORDER BY started_at;

-- 날짜 정정 전의 오래된 사건을 중복 합산하지 않도록 현재 버전만 조회
SELECT e.event_type, COUNT(*)
FROM permit_event e
JOIN national_permit p ON p.id = e.permit_id AND p.current_version_id = e.version_id
GROUP BY e.event_type;
```

새 인허가 데이터는 `national_permit`, 상세 관측 내용은 `national_permit_version`, 사건은 `permit_event`에 있다.
기존 `permit_businesses` 50건은 학습용 지도 샘플이므로 새 데이터와 섞거나 삭제하지 않았다.
현재 지도/API도 아직 기존 50건을 사용한다. 서버 적재 완료와 지도 연결은 별도 단계다.
좌표계가 확인되지 않은 업종의 `source_crs`는 NULL이며 전국 위경도 변환과 PostGIS 공간 인덱스는 후속 작업이다.

## 백업

서버 파일:

```text
/home/ubuntu/.config/permit-map/backups/permit_map_dev-before-national-20261104T103411Z.dump
SHA-256: c39d06d5c32955d7286ebff41935a8d8f459566a89516e030bc1839dafc6d5da
```

비공개 파일 권한으로 저장했고 실제 복원으로 확인했다. 복원 검증용 DB는 실사용 DB와 분리했다.
이 백업은 전국 인허가 적재 전의 기존 테이블을 보존한 것이다. 현재 서비스 DB 위에 덮어 복원하면 이후 변경을 잃을 수 있으므로 복구는 별도 작업으로 진행한다.

## PostgreSQL 통합 테스트

먼저 새 검증 전용 DB를 만들고 앱 계정을 소유자로 지정한다. 예시 DB 이름은 `permit_map_verify_manual`이다.

```powershell
.\gradlew.bat testNationalPostgres '-Pdatabase=permit_map_verify_manual'
```

이 테스트는 검증 DB의 전국 인허가 테이블을 정리한다. 실사용 DB를 지정하지 않는다.
Gradle 작업은 `permit_map_verify_...` 이름만 허용하며, 테스트 클래스도 JDBC URL과 실제 `current_database()`를 확인한 뒤에만 정리를 수행한다.
`permit_map_dev` 및 파일 H2 DB는 테스트 정리 대상에서 거절한다.
비밀번호는 환경변수로 테스트 JVM에 전달하고 출력하지 않는다. 기본 `test` 작업은 기존 메모리 H2를 계속 사용한다.

통합 테스트는 복합 식별자, 중복 재실행, 날짜 정정/내용 되돌림, 실패 롤백/재개, 뒤 청크 중복 실패, 폐업일 미제공, 잘못된 날짜, 과거 스냅샷 거절, CP949 다중행 값을 확인한다.
전체 테스트/빌드와 서버 검증 건수는 위 JSON 기록을 따른다. PostgreSQL 17.11에서 확인한 결과이며 모든 버전/모든 업종의 성능을 보장하지 않는다.
