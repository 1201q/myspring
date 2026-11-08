# 인허가 지도 — Spring Boot 학습 프로젝트

지역별 사업장 정보를 조회하는 서비스를 만들며 Spring Boot를 학습합니다.
음식점 목록·카테고리 검색·상세 조회·등록 API를 구현했습니다.

## 개발 환경

- Java 21
- Spring Boot 4.1.2
- Gradle Wrapper 9.8.2 (별도 Gradle 설치 불필요)
- Spring Web MVC, Validation, Spring Boot Test

Spring Data JPA와 Oracle Cloud `coin`의 PostgreSQL을 기본으로 사용합니다.
자동 테스트는 별도 메모리 H2 DB를 사용합니다. `frontend`에는 Vite + React 지도 화면이 있습니다.
SSH 터널과 실행 방법은 [원격 PostgreSQL 안내](docs/remote-postgresql.md)를 참고하세요.

## 실행 (Windows PowerShell)

먼저 별도 로컬 터미널에서 SSH 터널을 실행하고 유지합니다.

```powershell
ssh -N -o ExitOnForwardFailure=yes -o ServerAliveInterval=30 -L 127.0.0.1:15432:127.0.0.1:5432 coin
```

이미 15432 포트에 터널이 실행 중이면 추가로 실행하지 않습니다.
프로젝트 루트의 `.env.postgres`에 DB 접속 정보를 준비한 후 다른 터미널에서 실행합니다.
이 파일은 Git에서 제외되며 `.env.example`에 필요한 항목이 있습니다.

```powershell
.\gradlew.bat bootRun
```

첫 실행에는 인터넷 연결이 필요하며 Gradle과 라이브러리를 내려받습니다.
기본 `postgres` 프로필은 `.env.postgres`를 읽으며 환경변수로도 접속 정보를 지정할 수 있습니다.
로그에 `Started PermitMapApplication`이 나오면 실행된 상태입니다.
기본 주소는 `http://localhost:8080`입니다.
루트 주소에는 API가 없어 404 오류 화면이 나옵니다.
`http://localhost:8080/api/restaurants`에서 음식점 목록을 확인할 수 있습니다.
종료하려면 실행 중인 터미널에서 `Ctrl+C`를 누릅니다.

8080 포트를 사용 중이면 다음처럼 다른 포트로 실행할 수 있습니다.

```powershell
.\gradlew.bat bootRun --args='--server.port=8081'
```

## 테스트와 빌드

```powershell
.\gradlew.bat test
.\gradlew.bat bootJar
java -jar .\build\libs\permit-map-0.0.1-SNAPSHOT.jar
```

테스트는 별도 메모리 H2 DB를 사용하므로 원격 PostgreSQL과 로컬 파일 DB를 변경하지 않습니다.
Service와 Controller 테스트는 매번 샘플 3건을 저장하고, 테스트 종료 시 롤백합니다.

## DB 저장과 API

- 기본 DB: `coin` 서버의 `permit_map_dev` (SSH 터널 경유)
- 기존 H2 DB는 `data/permit-map.mv.db`에 유지되며 PostgreSQL과는 별개입니다.
- 처음 실행한 DB의 목록은 비어 있습니다. POST로 등록한 데이터는 서버 재시작 후에도 유지됩니다.
- `GET /api/restaurants`: 전체 목록
- `GET /api/restaurants?category=한식`: 카테고리 검색
- `GET /api/restaurants/{id}`: 상세 조회 (없으면 404)
- `POST /api/restaurants`: 등록 (성공 시 201과 Location 헤더, 잘못된 입력은 400)

등록 예시 (서버 실행 후 다른 PowerShell 터미널):

```powershell
$body = @{ name = '겨울식당'; address = '서울특별시 성동구'; category = '한식' } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri 'http://localhost:8080/api/restaurants' -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
```

반환된 ID로 상세 조회하세요. ID는 DB가 생성하며 연속 번호를 보장하지 않습니다.
Flyway가 SQL 파일로 스키마를 관리하고 JPA는 `ddl-auto=validate`로 매핑을 검증합니다.
기존 DB baseline과 변경 파일 작성 방법은 [Flyway 안내](docs/flyway.md)를 참고하세요.

H2 파일 DB를 명시적으로 사용하려면 다음처럼 실행합니다.

기존 H2 파일에 테이블이 있고 Flyway 이력이 없다면 위 Flyway 안내에 따라 먼저 구조 확인과 baseline이 필요합니다.

```powershell
.\gradlew.bat bootRun --args='--spring.profiles.active=h2'
```

## 주요 파일

| 파일                                                                 | 역할                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------- |
| `build.gradle`                                                       | Java 버전, 의존성, 빌드 설정                         |
| `gradlew.bat`                                                        | 프로젝트에 지정된 Gradle을 실행하는 Windows 스크립트 |
| `src/main/java/com/example/permitmap/PermitMapApplication.java`      | 애플리케이션 시작점                                  |
| `src/main/resources/application.properties`                          | 애플리케이션 설정                                    |
| `src/test/java/com/example/permitmap/PermitMapApplicationTests.java` | 기본 기동 테스트                                     |

## 패키지 구조

```text
src/main/java/com/example/permitmap/
├── PermitMapApplication.java
├── restaurant/                 # 음식점 기능
│   ├── RestaurantController.java
│   ├── RestaurantService.java
│   ├── RestaurantRepository.java
│   ├── Restaurant.java
│   ├── dto/                    # 등록·수정 요청, 상세·페이지 응답
│   └── exception/              # 음식점 관련 예외
├── common/error/               # 공통 에러 응답과 예외 처리
├── ingestion/                  # 원천 샘플 DTO, 파싱과 검증
├── business/                   # 원천 인허가 사업장 저장
└── hello/                      # 첫 API 학습 예제
```

테스트는 `src/test/java/com/example/permitmap/restaurant/`에 같은 기능 기준으로 배치합니다.
`PermitMapApplication`은 루트 패키지에 두어 하위 패키지의 컴포넌트와 Entity, Repository를 탐색하게 합니다.
새 기능이 생기면 `restaurant` 옆에 기능별 패키지를 추가합니다.

`docs/`에는 기획 문서, `data/`에는 로컬 DB, `build/`에는 빌드 산출물이 있습니다.
`data/`와 `build/`는 Git에서 제외합니다.

실제 데이터 도입 전에는 [기획서](docs/nationwide-permit-map-mvp.md)의 원천 데이터 검증을 진행합니다.
일반음식점의 1차 조사와 구로구 실제 샘플은 [원천 데이터 검증 문서](docs/data-source-audit.md)에 정리했습니다.

샘플 파일을 DB 연결 없이 검증하려면 다음 명령을 실행합니다.

```powershell
.\gradlew.bat auditRestaurantSample
```

구조와 오류·경고 기준은 [샘플 검증 안내](docs/sample-validation.md)에 정리했습니다.

검증한 샘플을 PostgreSQL의 별도 `permit_businesses` 테이블에 적재하려면 SSH 터널을 켜고 실행합니다.

```powershell
.\gradlew.bat importRestaurantSample
```

반복 적재와 오류 처리 기준은 [샘플 적재 안내](docs/sample-import.md)에 정리했습니다.

적재한 인허가 자료는 다음 API로 조회합니다. 기존 학습용 음식점 API와 별개입니다.

```text
GET /api/v1/businesses?page=0&size=20
GET /api/v1/businesses?date=2020-01-01
GET /api/v1/businesses/{id}
```

날짜 기반 추정 상태와 EPSG:5174 원천 좌표의 의미는 [인허가 조회 API 안내](docs/business-api.md)를 참고하세요.
API는 지도용 WGS84 longitude/latitude도 제공합니다. 변환 기준과 한계는 [좌표 변환 안내](docs/coordinate-conversion.md)에 정리했습니다.

전국 데이터의 초기 3종 CSV 확보·품질 검사 기록은 [전국 데이터 원천 검증](docs/national-data-source-audit.md)에 있습니다. 이후 대상 15업종 4,079,799건을 서버의 현재 정보 테이블에 반영했습니다. 별도 목재수입유통업까지 합하면 4,083,243건입니다. 전체 원본은 Git에서 제외되는 `data/national-audit/`에 보관합니다.

공식 현재 메뉴의 **인허가 195종과 기타/보조 정보 13종**은 [전체 업종 카탈로그](docs/national-category-catalog.md)에 정리했습니다. 카탈로그 생성은 메타데이터 조회이며 전체 업종 CSV를 다운로드하거나 DB에 적재하는 작업은 아닙니다.

카탈로그에서 업종명/서비스 ID를 선택하는 [공통 수집기](docs/national-permit-collector.md)가 있습니다. 예: `python scripts/collect-national-permits.py --category 약국 --download`. 기존 CSV는 재사용하고 실행 기록·품질 보고서를 생성합니다. 현재 서비스 대상은 [상권 분석 15업종](docs/commercial-area-collection-scope.md)입니다.

초기 [공통 DB·청크 적재](docs/national-permit-db-import.md) 이후 [현재 정보와 변경 이력 분리](docs/current-permit-migration.md) 구조로 이전했습니다. 지도는 PostGIS 공간 인덱스와 [전국 지도 전용 API](docs/national-map-api.md)를 사용합니다. 대상 15개 업종의 유효 위치 3,782,478건을 제공합니다. 업종별 공식 좌표계 근거는 별도 메타데이터로 보관하며 원본 인허가를 다시 적재하지 않습니다. 정기 갱신 경로는 후속 작업입니다.

## 지도 화면 실행

`frontend`에 Vite + React + TypeScript + MapLibre 기반 지도가 있습니다.
Spring Boot와 DB 터널을 실행한 상태에서 별도 터미널로 실행합니다.

```powershell
cd frontend
npm ci
npm run dev
```

http://127.0.0.1:5173 에서 지도를 확대·이동하고 업종·날짜를 선택합니다. 기본 지도는 PBF 타일을 사용하며 화면 범위의 사이드바 목록은 최대 500건입니다. 지도 기능에는 [PostGIS 설정](docs/postgis-setup.md)이 필요합니다.

하단 **지역 재생**에서 지역을 선택하면 해당 지역의 인허가·폐업 신고를 월별 또는 누적으로 재생합니다. 선택한 지역의 바이너리만 받아 GPU 필터로 표시하며, 지역 전체 집계와 업종 순위를 함께 제공합니다. 수집 후 `.\scripts\export-national-playback.ps1`로 재생 파일을 발행합니다. API·데이터 범위·검증 방법은 [전국 시간 재생 안내](docs/national-playback-implementation.md)를 참고하세요.
구체적인 연결 구조와 확인 절차는 [프런트엔드 안내](frontend/README.md)를 참고하세요.
