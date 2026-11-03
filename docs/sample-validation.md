# 일반음식점 샘플 읽기와 검증

## 실행

프로젝트 루트에서 실행합니다. SSH 터널이나 DB 연결은 필요하지 않습니다.

```powershell
.\gradlew.bat auditRestaurantSample
```

이 명령은 Spring 서버를 시작하지 않고 저장된 서울 구로구 샘플 JSON만 읽습니다.
외부 API 호출이나 DB 저장을 하지 않습니다.

현재 실제 샘플의 예상 결과는 다음과 같습니다.

```text
Rows: 50
Accepted: 50
Rejected: 0
Accepted with source coordinates (EPSG:5174): 40
Accepted without source coordinates: 10
```

이후 좌표 누락 10건의 행 번호, 경고 코드, 필드명이 출력됩니다.
행 번호는 JSON 배열의 첫 항목을 1번으로 센 값이며, 관리번호나 DB ID와 다릅니다.
오류 행이 있으면 집계와 문제 코드를 출력한 뒤 명령이 실패합니다. 경고만 있으면 성공합니다.

## 코드 흐름

```text
RestaurantSampleAudit (명령 실행)
  -> SeoulRestaurantSampleReader (JSON 파싱)
  -> SeoulRestaurantRow (서울 원천 DTO)
  -> SeoulRestaurantValidator (정규화와 검증)
  -> RestaurantValidationReport (행별 결과와 집계)
```

`SeoulRestaurantRow`는 서울 Sheet의 대문자 필드명을 `@JsonProperty`로 Java 이름에 연결합니다.
`String`으로 받아 빈 문자열과 상태코드의 앞자리 0을 유지합니다.
알 수 없는 추가 필드는 무시하며 DTO에 담지 않습니다.
이 DTO는 전국 API의 다른 필드명을 처리하는 공통 DTO가 아닙니다.

검증 결과는 원천 DTO를 그대로 참조하면서 날짜는 `LocalDate`, 좌표는 `BigDecimal`로 별도 보관합니다.
입력값을 정규화할 때 앞뒤 공백을 제거하되 원천 DTO 문자열은 수정하지 않습니다.

## 오류와 경고

| 구분 | 조건 | 결과 |
| --- | --- | --- |
| ERROR | null 행 | `NULL_ROW` |
| ERROR | 자치단체코드, 관리번호, 사업장명, 인허가일 누락 | `REQUIRED_FIELD` |
| ERROR | `yyyy-MM-dd`가 아니거나 존재하지 않는 날짜 | `INVALID_DATE` |
| ERROR | 폐업일이 인허가일보다 빠름 | `CLOSED_BEFORE_PERMITTED` |
| ERROR | 동일 입력 배열 안에서 관리번호 중복 | `DUPLICATE_MANAGEMENT_NUMBER` |
| WARNING | X 또는 Y 누락 | `MISSING_COORDINATE` |
| WARNING | 좌표가 숫자가 아님 | `INVALID_COORDINATE` |
| WARNING | 좌표가 `(0,0)` | `ZERO_COORDINATE` |

오류가 있는 행은 접수 가능 건수에서 제외하지만 나머지 행도 계속 검사합니다.
중복된 관리번호는 앞뒤 공백을 제거해 비교하고, 첫 행을 임의로 선택하지 않고 해당 그룹의 모든 행에 오류를 남깁니다.
이것은 파일 내부 중복 검출입니다. DB upsert나 여러 파일 사이의 중복 처리는 아직 구현하지 않았습니다.

폐업일은 선택값입니다. 빈 폐업일을 날짜 오류로 처리하지 않습니다.
좌표 경고만 있는 사업장은 접수 가능으로 분류하되 정규화 좌표는 둘 다 null로 남깁니다.
따라서 `Accepted`와 `Accepted without source coordinates`는 서로 배타적인 건수가 아니라 포함 관계입니다.
`Rejected` 행은 위 좌표 가능/불가 두 집계에 포함하지 않습니다.

## 검증 한계

`Accepted`는 이번에 정한 필수값과 날짜 검증을 통과했다는 뜻입니다. 아직 저장되었다는 뜻이 아닙니다.
숫자로 읽을 수 있는 좌표라고 해서 한국 내 위치나 주소와의 일치가 보장되지는 않습니다.
sourceX/Y는 EPSG:5174이며 위경도 변환과 지도상 위치 검증은 다음 작업입니다.
영업 상태코드의 의미, 주소의 실제 존재, 갱신 시점의 파싱은 이번 검증 대상에 포함하지 않았습니다.

문법이 깨진 JSON, 배열이 아닌 루트, 배열 뒤에 추가 JSON이 붙은 입력은 파일 전체를 거절합니다.
정상 배열 내부의 필드 오류와 구분합니다.

## 테스트

```powershell
.\gradlew.bat test
```

실제 공개 샘플을 읽는 테스트와 별도로 날짜 오류, 필수값 누락, 중복, 좌표 누락·숫자 오류·0 좌표,
null 행, 잘못된 JSON, 추가 필드를 검증합니다.
실제 샘플을 오류 테스트를 위해 변조하지 않습니다.

원천과 샘플 선택 기준은 [데이터 조사](data-source-audit.md)를 참고하세요.
