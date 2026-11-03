# 인허가 지도 — Spring Boot 학습 프로젝트

지역별 사업장 정보를 조회하는 서비스를 만들며 Spring Boot를 학습합니다.
음식점 목록·카테고리 검색·상세 조회·등록 API를 구현했습니다.

## 개발 환경

- Java 21
- Spring Boot 4.1.2
- Gradle Wrapper 9.8.2 (별도 Gradle 설치 불필요)
- Spring Web MVC, Validation, Spring Boot Test

Spring Data JPA와 Oracle Cloud `coin`의 PostgreSQL을 기본으로 사용합니다.
자동 테스트는 별도 메모리 H2 DB를 사용합니다. 프론트엔드는 이후 추가합니다.
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
로컬 학습에서는 `ddl-auto=update`를 사용하고, 배포 전에는 Flyway로 전환합니다.

H2 파일 DB를 명시적으로 사용하려면 다음처럼 실행합니다.

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
└── hello/                      # 첫 API 학습 예제
```

테스트는 `src/test/java/com/example/permitmap/restaurant/`에 같은 기능 기준으로 배치합니다.
`PermitMapApplication`은 루트 패키지에 두어 하위 패키지의 컴포넌트와 Entity, Repository를 탐색하게 합니다.
새 기능이 생기면 `restaurant` 옆에 기능별 패키지를 추가합니다.

`docs/`에는 기획 문서, `data/`에는 로컬 DB, `build/`에는 빌드 산출물이 있습니다.
`data/`와 `build/`는 Git에서 제외합니다.

실제 데이터 도입 전에는 [기획서](docs/nationwide-permit-map-mvp.md)의 원천 데이터 검증을 진행합니다.
