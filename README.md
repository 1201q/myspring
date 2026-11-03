# 인허가 지도 — Spring Boot 학습 프로젝트

지역별 사업장 정보를 조회하는 서비스를 만들며 Spring Boot를 학습합니다.
현재는 Spring Boot 기본 프로젝트 생성까지 진행했습니다.

## 개발 환경

- Java 21
- Spring Boot 4.1.2
- Gradle Wrapper 9.8.2 (별도 Gradle 설치 불필요)
- Spring Web MVC, Validation, Spring Boot Test

DB와 프론트엔드는 이후 학습 단계에서 추가합니다.

## 실행 (Windows PowerShell)

프로젝트 폴더에서 다음 명령을 실행합니다.

```powershell
.\gradlew.bat bootRun
```

첫 실행에는 인터넷 연결이 필요하며 Gradle과 라이브러리를 내려받습니다.
로그에 `Started PermitMapApplication`이 나오면 실행된 상태입니다.
기본 주소는 `http://localhost:8080`입니다.
아직 Controller가 없으므로 브라우저에서 이 주소에 접근하면 404 오류 화면이 나옵니다.
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

기본 테스트는 Spring 애플리케이션이 정상적으로 초기화되는지 확인합니다.

## 주요 파일

| 파일                                                                 | 역할                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------- |
| `build.gradle`                                                       | Java 버전, 의존성, 빌드 설정                         |
| `gradlew.bat`                                                        | 프로젝트에 지정된 Gradle을 실행하는 Windows 스크립트 |
| `src/main/java/com/example/permitmap/PermitMapApplication.java`      | 애플리케이션 시작점                                  |
| `src/main/resources/application.properties`                          | 애플리케이션 설정                                    |
| `src/test/java/com/example/permitmap/PermitMapApplicationTests.java` | 기본 기동 테스트                                     |

다음 학습 단계는 샘플 데이터로 음식점 목록·상세 API를 만드는 것입니다.
실제 데이터 도입 전에는 [기획서](nationwide-permit-map-mvp.md)의 원천 데이터 검증을 진행합니다.
