# EPSG:5174 원천 좌표의 위경도 변환

## 동작

사업장 목록과 상세 응답에 다음 필드를 추가했습니다.

```json
{
  "coordinates": { "x": 189505.11152445, "y": 443415.972626677, "epsg": 5174 },
  "longitude": 126.88211455336857,
  "latitude": 37.492885896301715,
  "coordinateStatus": "CONVERTED"
}
```

표시된 수치는 독립 PROJ 기준값이며 Java 결과는 마지막 소수 자릿수가 다를 수 있습니다.
기존 coordinates는 원천값입니다. 추가한 longitude/latitude는 WGS84(EPSG:4326)의 경도/위도입니다.
지도나 GeoJSON에 전달하는 순서는 `[longitude, latitude]`입니다.

변환은 조회 시 수행하고 DB에 새 좌표 컬럼을 추가하지 않습니다.
기존 원천 좌표, 원문 JSON, 적재 기록은 변경하지 않습니다. 재적재도 필요하지 않습니다.
현재 샘플에서는 40건이 변환되고 좌표가 없는 10건은 위경도 null을 반환합니다.

## 상태

| coordinateStatus | 의미 |
| --- | --- |
| CONVERTED | 지원하는 원천 좌표를 변환했고 적용 범위 내에 있음 |
| MISSING | 정규화된 원천 X 또는 Y가 없음 |
| UNSUPPORTED_CRS | 5174 외의 좌표계 또는 좌표계 미상 |
| OUT_OF_RANGE | 비정상적으로 큰 입력, 비유한 값 또는 변환 결과가 5174 적용 범위 밖 |
| TRANSFORMATION_FAILED | 라이브러리의 좌표 변환 예외 발생 |

CONVERTED가 아니면 longitude와 latitude는 둘 다 null입니다. 사업장 자체는 조회 결과에서 제거하지 않습니다.
MISSING에는 적재 시 좌표 경고로 정규화 좌표가 제거된 경우도 포함될 수 있습니다.
주소와 좌표의 정확한 일치를 모든 행에서 보장하는 상태값은 아닙니다.

## 변환 정의와 선택 이유

원천 제공기관의 [좌표계 안내](https://data.seoul.go.kr/dataList/OA-18668/S/1/datasetView.do)는 EPSG:5174입니다.
[OGC의 EPSG:5174 정의](https://opengeospatial.github.io/ontology-crs/data/def/crs/EPSG/0/5174/index.html)에 맞춘 투영을 사용합니다.

Proj4J 1.4.3 코어를 사용하며 CRS 파라미터를 명시합니다.
[Proj4J 공식 저장소의 5174 정의](https://github.com/locationtech/proj4j/blob/master/epsg/src/main/resources/proj4/nad/epsg)는 Bessel 타원체 투영만 있고 WGS84로의 기준타원체 이동 파라미터가 없습니다.
이 정의만으로 WGS84라고 표시하면 위치 보정을 누락할 수 있으므로 그대로 사용하지 않았습니다.

기준은 [PROJ의 EPSG 변환 데이터](https://github.com/OSGeo/PROJ/blob/master/data/sql/helmert_transformation.sql)에 있는
`Korean 1985 to WGS 84 (1)`, EPSG:5191입니다.
이는 Molodensky-Badekas coordinate-frame 방식으로 0이 아닌 평가 원점을 사용합니다.
따라서 그 이동량과 회전량을 일반적인 `towgs84` 7개 숫자로 그대로 복사해서는 안 됩니다.

Proj4J가 지원하는 원점 중심 position-vector 변환으로 등가 변환했습니다.

```text
평가 원점 C = (-3159521.31, 4068151.32, 3748113.85)
이동량 T = (-145.907, 505.034, 685.756)
coordinate-frame 회전(초) = (-1.162, 2.347, 1.592)
축척 s = 1 + 6.342e-6

원점 중심 이동량 T' = T + C - s * R_cf * C
position-vector 회전은 coordinate-frame 회전의 부호를 반전

towgs84 = -114.61998513899744,475.96296987030655,675.0183286857791,
          1.162,-2.347,-1.592,6.342
```

이 방식은 소각도 회전 모델을 사용하는 원래 변환의 등가 표현입니다.
수학식과 상수는 코드와 문서에 고정하고, 독립 PROJ 계산 결과로 검증합니다.

원천 데이터의 X는 easting, Y는 northing으로 사용했습니다.
공식 CRS의 축 표기만 보고 값을 바꾸지 않고, 실제 샘플의 주소 대조와 독립 계산으로 순서를 확인했습니다.
목표 좌표는 경도, 위도 순서이며 pyproj 검증에서도 `always_xy=True`를 사용했습니다.

## 범위 검사

EPSG:5174 적용 범위인 경도 126~128, 위도 33.96~38.33을 검사합니다.
변환 전에 입력 절댓값 10,000,000 초과와 double 변환 시 비유한 값도 제외합니다.
이 범위 밖 자료를 임의로 지도에 찍지 않고 OUT_OF_RANGE로 반환합니다.
단순 범위 검사는 모든 축 뒤집힘이나 잘못된 좌표를 탐지하지는 못합니다.
다른 지역에 적합한 다른 CRS를 이 변환기에 강제로 적용하지 않습니다.

## 독립 검증

- 기준 도구: pyproj 3.7.2 / PROJ 9.5.1.
- [기준 좌표 41개](data-samples/coordinate-reference.json): 실제 샘플 40개와 합성 투영 원점 1개.
- 변환 선택: EPSG:5174 -> EPSG:4326, `allow_ballpark=False`.
- Java와 독립 PROJ 결과의 경도/위도 차이를 각각 `1e-7`도 이내로 검사합니다.
- 라이브러리 간 계산 오차 허용치이며 원천 자료의 위치 정확도가 1cm라는 뜻은 아닙니다.
- 누락, 미지원 CRS, 0 좌표, 축 반전 예시, 매우 큰 입력도 테스트합니다.

기준 파일은 Java 구현의 출력으로 생성하지 않았습니다.
재생성 스크립트는 `scripts/generate-coordinate-reference.py`입니다.
별도 Python 환경에서 `pyproj==3.7.2`를 준비한 뒤 실행할 수 있습니다. 앱 실행과 일반 테스트에는 Python이 필요하지 않습니다.
재생성 후 변환 연산명과 기준값 변경을 검토해야 합니다.

## 실제 주소 대조

샘플 `3160000-101-2014-00038`의 원천 도로명주소는 `서울특별시 구로구 구로동로35길 30`의 상가 주소입니다.
X=189505.11152445, Y=443415.972626677을 변환한 지점은 약 `(126.882115, 37.492886)`입니다.
2026-11-03에 공개 OpenStreetMap 역지오코딩 1회로 대조한 결과도 `구로구 구로동로35길 30`으로 확인됐습니다.
동일 건물의 다른 상호가 반환될 수 있으므로 이 대조는 건물 주소 수준이며 현재 영업 여부나 동일 업소를 증명하지 않습니다.

[지도 위치](https://www.openstreetmap.org/?mlat=37.4928858963&mlon=126.8821145534#map=19/37.4928858963/126.8821145534)
- 지도 데이터: [OpenStreetMap contributors, ODbL](https://www.openstreetmap.org/copyright).
이 검증은 개발 시 1회 수행했으며 API 요청마다 외부 지오코딩을 호출하지 않습니다.
