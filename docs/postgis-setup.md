# PostGIS 준비

기존 `permit-map-postgres`(PostgreSQL 17.11, arm64, Debian bookworm)에 PostGIS 3.7.0 패키지를 추가했다. 기존 패키지 업그레이드·삭제 없이 설치했고 PostgreSQL/컨테이너 재시작을 수행하지 않았다. 다른 chart 서비스도 변경하지 않았다.

## 재현과 활성화

- `ops/postgres/Dockerfile`: 실제 서버의 베이스 이미지 digest와 PostGIS 패키지 버전을 고정한 재현용 Dockerfile. 현재 실행 중인 컨테이너를 교체하거나 이 파일로 빌드한 이미지를 배포하지는 않았다.
- 실행 중인 컨테이너에 추가한 OS 패키지는 그 컨테이너를 **재생성하면 사라진다**. 나중에 재생성할 때는 PostGIS가 포함된 이미지를 준비해야 한다. 기존 PostgreSQL 데이터 볼륨은 유지해야 한다.
- `ops/postgres/enable-spatial.sql`: 패키지 설치 후 `postgres` 관리자 권한으로 해당 DB에 명시적으로 적용한다. SQL에 20초/잠금 3초 제한을 두며 원천 데이터 일괄 변경은 없다.
- H2와 관리자 권한이 없는 앱 실행을 지원하기 위해 이 PostgreSQL 전용 설정을 공통 Flyway 마이그레이션과 분리했다.

## 공간 테이블

`national_permit_location`은 원천 좌표·좌표계·현재 정보 해시, WGS84 점(`geometry(Point,4326)`), 변환 방법을 저장한다. 넓은 원문 JSON 테이블을 좌표 처리 때마다 갱신하지 않도록 분리했다. `ix_national_location_geom`은 GiST 공간 인덱스다.

`national_permit_map_point`는 완료된 인허가 중 현재 원천 좌표와 해시가 위치 데이터와 일치하는 행만 제공한다. 이후 인허가가 수정되면 위치를 다시 확인하기 전까지 해당 마커는 제외된다.

```sql
SELECT id,name,longitude,latitude
FROM national_permit_map_point
WHERE ST_Intersects(geom,ST_MakeEnvelope(126.88,37.49,126.90,37.51,4326))
LIMIT 100;
```

## 아직 수행하지 않은 작업

이 설정 자체에는 좌표 채우기와 지도 API 연결을 포함하지 않는다. 이후 확인된 초기 3종에 나머지 12종의 공식 근거를 연결해 15종의 유효 위치 3,782,478건을 채웠다. 현재 범위와 검증은 [전국 지도 API](national-map-api.md)를 참고한다. 좌표계를 모르는 업종을 임의로 5174라고 간주하거나 좌표 누락을 임의로 보완하지 않는다.

기존 구로구 샘플은 EPSG:5174이며 독립 PROJ 기준값이 있다. 이 기준에서 PostGIS 변환을 검증한다. 전국 지역·업종에 같은 가정을 적용하려면 원천 좌표계와 지역별 표본을 추가로 확인해야 한다.

## 2026-11-06 적용 검증

- 검증 DB에서 독립 기준 41개 좌표의 경도/위도 최대 오차가 각각 약 `1.42e-14`, `7.11e-15`도였다. 허용치 `1e-7`도 이내이며, 구로구 범위 검색은 실제 표본 40개를 반환했다.
- 작은 임시 테이블에서 순차 스캔을 비활성화한 계획으로 GiST 인덱스 사용을 확인하고 테스트 트랜잭션을 롤백했다. 대량 데이터 성능 측정은 아니다.
- 서비스 DB에 PostGIS 3.7.0, 위치 테이블, GiST 인덱스 및 지도 점 뷰를 적용했다. 테이블 소유자는 `permit_map_app`이다.
- 현재 정보 4,083,243건 유지, 위치 테이블 0건. PostgreSQL 17.11 유지. 네 컨테이너의 시작 시각과 재시작 횟수는 설치 전과 같다.
- [좌표 기준 검증](data-samples/postgis-reference-verification.json), [서버 적용 검증](data-samples/postgis-server-verification.json).

공식 자료: [활성화](https://postgis.net/documentation/getting_started/), [Debian 패키지](https://postgis.net/documentation/getting_started/install_ubuntu/), [공간 인덱스](https://postgis.net/documentation/faq/spatial-indexes/).
