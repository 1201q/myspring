# coin PostgreSQL 개발 환경

## 구성

- 서버 SSH 별명: `coin`
- 독립 컨테이너: `permit-map-postgres` (`postgres:17-bookworm`)
- 데이터 볼륨: `permit-map-pgdata`
- 서버 연결 주소: `127.0.0.1:5432`
- 개발 DB: `permit_map_dev`
- 앱 계정: `permit_map_app` (superuser 권한 없음)
- PostgreSQL 메모리 제한 512 MB, CPU 제한 1개, 최대 연결 30개
- 앱 커넥션 풀 최대 5개

기존 `chart-api`, `chart-nginx`, `chart-redis`와 별도로 실행합니다.
기존 컨테이너, Docker 데몬, 서버의 방화벽 설정을 변경하지 않았습니다.
컨테이너는 호스트의 루프백 주소에만 포트를 게시합니다. OCI에 DB 포트를 추가로 개방하지 않습니다.

## 로컬에서 실행

로컬 PC의 PowerShell 터미널 두 개를 사용합니다. VS Code의 원격 터미널에서 실행하는 명령이 아닙니다.

첫 번째 터미널에서 SSH 터널을 유지합니다.

```powershell
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 127.0.0.1:15432:127.0.0.1:5432 coin
```

출력이 없는 상태가 정상입니다. `Ctrl+C`를 누르면 터널이 닫힙니다.
15432 포트가 이미 사용 중이면 먼저 기존 터널이 있는지 확인하세요.

두 번째 터미널에서 프로젝트 폴더로 이동하고 앱을 실행합니다.

```powershell
cd C:\projects\spring
.\gradlew.bat bootRun
```

기본 프로필은 `postgres`입니다. 프로젝트 루트의 `.env.postgres`를 properties 형식으로 읽습니다.
환경변수 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`로 설정을 덮어쓸 수도 있습니다.
로그에서 기본 프로필 `postgres`와 PostgreSQL 연결을 확인하세요.
로컬 8080 포트에서 기존 앱이 실행 중이면 해당 로컬 앱을 종료한 후 실행합니다.
서버의 기존 Docker 앱과는 별개입니다.

H2는 명시적으로 프로필을 선택할 때 사용합니다.

```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=h2'
```

H2 데이터는 PostgreSQL로 자동 복사되지 않습니다. 두 환경의 DB는 별개입니다.
기존 테스트는 메모리 H2를 사용하며 원격 개발 DB에 접근하지 않습니다.

## 비밀번호

- 로컬 앱 설정: `.env.postgres` (Git에서 제외)
- 서버 앱 비밀번호: `~/.config/permit-map/app-password` (소유자만 읽기·쓰기)
- 서버 관리자 비밀번호: `~/.config/permit-map/admin-password` (소유자만 읽기·쓰기)

비밀번호는 문서나 소스에 넣지 않습니다. 새 PC에서는 `.env.example`을 복사해 `.env.postgres`를 작성합니다.
이 프로젝트는 `spring.config.import`로 `.env.postgres`를 읽도록 설정했습니다.
일반적인 `.env` 파일 전체를 자동 인식하는 기능이 아닙니다.
기존 `scripts/run-postgres.ps1`도 환경변수를 전달하는 방식으로 계속 사용할 수 있습니다.

## 서버에서 상태 확인

SSH 접속 후 다음 읽기 전용 명령으로 확인할 수 있습니다.

```bash
sudo docker ps --filter name=permit-map-postgres
sudo docker exec permit-map-postgres pg_isready -U postgres
sudo docker exec permit-map-postgres psql -U postgres -d permit_map_dev -c '\dt'
```

컨테이너 삭제나 볼륨 정리 명령은 실행하지 마세요. 데이터는 `permit-map-pgdata` 볼륨에 있습니다.
볼륨은 백업이 아니므로 운영 전에는 외부 백업과 복구 검증이 필요합니다.

## 이후 배포

현재는 개발용 DB입니다. 운영용 DB·계정은 별도로 생성해야 합니다.
Spring Boot를 호스트에서 직접 실행한다면 DB 주소는 `127.0.0.1:5432`가 됩니다.
Spring Boot도 컨테이너로 배포한다면 별도의 Docker 네트워크 연결 설계가 필요합니다.
배포 환경의 `DB_URL`, `DB_USERNAME`, `DB_PASSWORD`로 접속 대상을 지정합니다.
배포 전에는 `ddl-auto=update`를 Flyway와 `validate` 방식으로 전환합니다.
현재 PostgreSQL에는 PostGIS를 설치하지 않았습니다. 공간 검색 도입 시 별도로 진행합니다.
