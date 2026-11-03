# 인허가 사업장 조회 API

`permit_businesses`에 적재한 원천 데이터를 조회합니다. 기존 `/api/restaurants`와 별개입니다.
현재 개발 DB에는 구로구 일반음식점 샘플 50건이 있습니다.

SSH 터널을 유지하고 로컬 서버를 실행합니다.

```powershell
.\gradlew.bat bootRun
```

## 목록과 페이지

```http
GET /api/v1/businesses?page=0&size=5
```

- page는 0부터 시작하며 기본값은 0입니다.
- size 기본값은 20이고 1부터 100까지 허용합니다. 범위를 벗어나면 400입니다.
- 내부 ID 오름차순으로 정렬합니다. 정렬 변경 기능은 제공하지 않습니다.
- 응답은 `items`, `page`, `size`, `totalElements`, `totalPages`, `date`, `statusBasis`입니다.
- 범위를 넘긴 페이지는 빈 items와 전체 건수를 반환합니다.
- 날짜가 없으면 영업·폐업을 포함한 저장 스냅샷 전체이며 `statusBasis=SOURCE_SNAPSHOT`입니다.

현재 50건에 size=5를 요청하면 totalElements=50, totalPages=10입니다.
조회 결과는 전국 또는 구로구 전체 데이터가 아니라 적재한 샘플 범위입니다.

## 기준 날짜의 영업 추정

```http
GET /api/v1/businesses?date=2020-01-01&page=0&size=20
```

조건은 다음과 같습니다.

```text
인허가일 <= 기준일 AND (폐업일 없음 OR 폐업일 > 기준일)
```

인허가일 당일은 포함하고 폐업일 당일은 제외합니다.
date는 ISO 날짜 형식(`yyyy-MM-dd`)이며 존재하지 않는 날짜는 400입니다.
결과의 `date`는 요청 기준일, `statusBasis`는 `DATE_INFERRED`입니다.

이 조건은 날짜 기반 추정이며 정확한 과거 행정 상태를 복원하는 기능이 아닙니다.
휴업·취소 등의 이력이나 원천 갱신일 이후 상태를 보장하지 않습니다.
응답의 rawStatusCode는 수집된 원천 코드이므로 기준 날짜의 추정 상태와 다를 수 있습니다.
전국 API의 `/history`를 호출하는 기능이 아닙니다.
현재 샘플에서는 2020-01-01 조건에 16건이 해당합니다.

## 상세

```http
GET /api/v1/businesses/{id}
```

목록의 items에서 반환된 내부 id를 사용합니다. 관리번호가 아닙니다.

응답 항목:

| 항목 | 의미 |
| --- | --- |
| id, managementNumber | 내부 ID, 원천 관리번호 |
| name, municipalityCode, businessType | 상호, 자치단체코드, 일반음식점 내 세부 업태 |
| lotAddress, roadAddress | 지번/도로명주소. 누락은 원천 상태에 따라 빈 문자열 또는 null 가능 |
| permittedAt, closedAt | 인허가일, 폐업일 |
| rawStatusCode, rawDetailStatusCode | 원천 상태코드. 앞자리 0 보존 |
| coordinates | 원천 좌표 x/y/epsg. 좌표 없으면 null |
| longitude, latitude | WGS84 경도/위도. 변환 불가이면 둘 다 null |
| coordinateStatus | CONVERTED / MISSING / UNSUPPORTED_CRS / OUT_OF_RANGE / TRANSFORMATION_FAILED |
| sourceDataset, sourceUrl | 원천 구분 및 공식 데이터셋 링크 |
| lastImportedAt | 마지막 저장 시각. 원천 자료 갱신 시각이나 영업 확인 시각이 아님 |

coordinates의 epsg는 현재 5174입니다. x/y를 지도용 경도·위도로 취급하면 안 됩니다.
지도에는 longitude/latitude를 사용합니다. [변환 방식과 독립 검증](coordinate-conversion.md)을 참고하세요.
좌표 없는 사업장도 목록과 상세에 포함됩니다. 누락 10건은 현재 샘플의 특성입니다.
원문 source_json과 내부 issues_json은 API에 노출하지 않습니다.

## 오류

| 요청 | HTTP | code |
| --- | --- | --- |
| 없는 사업장 ID | 404 | BUSINESS_NOT_FOUND |
| 음수 page, size 범위 초과 | 400 | INVALID_QUERY |
| 숫자가 아닌 ID/page/size, 잘못된 날짜 | 400 | INVALID_QUERY |

```json
{
  "code": "BUSINESS_NOT_FOUND",
  "message": "인허가 사업장을 찾을 수 없습니다."
}
```

## 검증

Controller 통합 테스트는 페이지네이션, 날짜 경계, 원천 코드 보존, 좌표계와 출처,
좌표 없는 상세, 원문 비노출, 400/404를 확인합니다.
원격 PostgreSQL에서도 실제 50건, 페이지 크기 5, 기준 날짜 결과 16건, 좌표 누락 10건을 확인했습니다.
DB 스키마 변경이나 원격 데이터 수정은 없습니다.
