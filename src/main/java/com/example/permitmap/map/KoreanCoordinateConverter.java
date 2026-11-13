package com.example.permitmap.map;

import java.math.BigDecimal;
import org.locationtech.proj4j.CRSFactory;
import org.locationtech.proj4j.CoordinateTransform;
import org.locationtech.proj4j.CoordinateTransformFactory;
import org.locationtech.proj4j.Proj4jException;
import org.locationtech.proj4j.ProjCoordinate;
import org.springframework.stereotype.Component;

@Component
public class KoreanCoordinateConverter {

  // EPSG:5174 투영 + EPSG:5191 Molodensky-Badekas의 등가 position-vector 변환.
  // 보정 원점은 0이 아니므로 EPSG:5191의 이동량을 towgs84에 그대로 넣으면 안 된다.
  // 유도식과 독립 PROJ 기준값은 docs/coordinate-conversion.md 참고.
  private static final String SOURCE_DEFINITION =
      "+proj=tmerc +lat_0=38 +lon_0=127.002890277778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel"
          + " +towgs84=-114.61998513899744,475.96296987030655,675.0183286857791,1.162,-2.347,-1.592,6.342"
          + " +units=m +no_defs";

  private final CoordinateTransform transform;

  public KoreanCoordinateConverter() {
    var factory = new CRSFactory();
    var source = factory.createFromParameters("EPSG:5174-with-EPSG:5191", SOURCE_DEFINITION);
    var target = factory.createFromParameters("EPSG:4326", "+proj=longlat +datum=WGS84 +no_defs");
    transform = new CoordinateTransformFactory().createTransform(source, target);
  }

  public Conversion convert(BigDecimal x, BigDecimal y, Integer sourceEpsg) {
    if (x == null || y == null) {
      return unavailable(Status.MISSING);
    }
    if (!Integer.valueOf(5174).equals(sourceEpsg)) {
      return unavailable(Status.UNSUPPORTED_CRS);
    }
    double sourceX = x.doubleValue();
    double sourceY = y.doubleValue();
    if (!Double.isFinite(sourceX)
        || !Double.isFinite(sourceY)
        || Math.abs(sourceX) > 10_000_000
        || Math.abs(sourceY) > 10_000_000) {
      return unavailable(Status.OUT_OF_RANGE);
    }
    var result = new ProjCoordinate();
    try {
      // 변환 객체의 내부 상태를 동시 요청이 공유하지 않도록 보호한다.
      synchronized (transform) {
        transform.transform(new ProjCoordinate(sourceX, sourceY), result);
      }
    } catch (Proj4jException exception) {
      return unavailable(Status.TRANSFORMATION_FAILED);
    }
    // EPSG:5174 적용 범위 검사이며 주소 일치나 측량 정확도를 보장하지 않는다.
    if (!Double.isFinite(result.x)
        || !Double.isFinite(result.y)
        || result.x < 126
        || result.x > 128
        || result.y < 33.96
        || result.y > 38.33) {
      return unavailable(Status.OUT_OF_RANGE);
    }
    return new Conversion(result.x, result.y, Status.CONVERTED);
  }

  private Conversion unavailable(Status status) {
    return new Conversion(null, null, status);
  }

  public enum Status {
    CONVERTED,
    MISSING,
    UNSUPPORTED_CRS,
    OUT_OF_RANGE,
    TRANSFORMATION_FAILED
  }

  public record Conversion(Double longitude, Double latitude, Status status) {}
}
