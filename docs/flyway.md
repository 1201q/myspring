# Flyway 스키마 변경 관리

## 역할

- Flyway: `src/main/resources/db/migration/`의 SQL을 버전 순서대로 실행합니다.
- JPA: `ddl-auto=validate`로 Entity와 테이블의 매핑을 검증합니다. 테이블을 자동 변경하지 않습니다.
- 테스트: 동일한 V1 SQL로 메모리 H2 DB를 초기화한 후 JPA 검증과 API 테스트를 실행합니다.

현재 V1은 기존 `restaurants` 테이블과 동일합니다. 문자열 길이는 255이고 NULL 허용도 그대로 유지합니다.
새 컬럼이나 제약 조건을 추가하는 작업은 포함하지 않았습니다.

## 빈 DB와 기존 DB의 차이

빈 DB에서는 앱을 시작하면 `V1__create_restaurants.sql`이 실행됩니다.
기존 테이블이 있는 DB에서는 구조가 V1과 같은지 확인한 후 기준 버전 1을 별도로 등록해야 합니다.
baseline은 기존 구조를 확인하거나 V1 SQL을 실행하는 명령이 아니라, 해당 버전까지 적용된 상태로 기록하는 작업입니다.

`coin`의 `permit_map_dev`에는 검증 후 기준 버전 1 등록을 완료했습니다.
이 DB에서는 평소처럼 실행하면 됩니다.

```powershell
.\gradlew.bat bootRun
```

## 이력 확인

PostgreSQL 확장에서 `permit_map_dev`에 연결해 실행합니다.

```sql
SELECT installed_rank, version, description, type, script, success
FROM flyway_schema_history
ORDER BY installed_rank;
```

기존 DB의 V1은 `BASELINE`, 새 DB에서 생성된 V1은 `SQL`로 기록됩니다.

## 이후 변경

이미 적용한 `V1__create_restaurants.sql`을 수정하지 않습니다.
새 변경은 `V2__설명.sql`, `V3__설명.sql`처럼 다음 버전의 파일로 추가합니다.
예를 들어 생성일 컬럼을 도입할 때는 V2 SQL과 Entity 변경을 함께 작성합니다.

기본 설정은 다음과 같습니다.

```properties
spring.jpa.hibernate.ddl-auto=validate
spring.flyway.baseline-on-migrate=false
spring.flyway.clean-disabled=true
```

자동 baseline은 끈 상태로 유지합니다. 다른 기존 DB에 처음 도입할 때만 백업과 구조 확인 후 1회 사용합니다.
구조가 V1과 다르면 먼저 차이를 해결해야 하며, 버전만 강제로 등록하면 안 됩니다.
예를 들어 구조가 확인된 기존 H2 파일 DB에 도입하는 명령은 다음과 같습니다.

```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=h2 --spring.flyway.baseline-on-migrate=true --spring.flyway.baseline-version=1'
```

이후에는 baseline 옵션을 제거합니다. 이번 작업에서는 기존 로컬 H2 파일은 변경하지 않았습니다.

## 이번 검증과 백업

- 서버 백업: `~/.config/permit-map/backups/permit_map_dev-before-flyway-20261103T082443Z.dump`
- PostgreSQL 커스텀 형식(`pg_dump -Fc`)이며 소유자만 접근할 수 있는 디렉터리에 저장했습니다.
- 별도 임시 DB에 실제 복원하고 원본 데이터 지문이 같은지 확인했습니다.
- 복원 DB에 baseline을 적용하고 기존 데이터 조회를 확인했습니다.
- 빈 PostgreSQL DB에서 V1 생성, ID 자동 생성, 등록·삭제를 확인했습니다.
- 기존 DB와 신규 생성 DB의 컬럼 타입, 길이, NULL 허용, ID 생성 방식을 비교했습니다.
- `permit_map_dev`에 baseline 적용 후 기본 실행으로 기존 데이터 조회를 확인했습니다.

기존 Docker 컨테이너는 중지·재시작하지 않았습니다.
