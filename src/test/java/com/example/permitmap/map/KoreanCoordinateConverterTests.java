package com.example.permitmap.map;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.example.permitmap.map.KoreanCoordinateConverter.Status;

import tools.jackson.databind.json.JsonMapper;

class KoreanCoordinateConverterTests {

    private final KoreanCoordinateConverter converter = new KoreanCoordinateConverter();

    @Test
    void 독립_PROJ_기준_41개_좌표와_비교한다() {
        var fixture = JsonMapper.builder().build().readValue(
            Path.of("docs/data-samples/coordinate-reference.json").toFile(), Fixture.class);
        assertEquals(41, fixture.points().size());
        for (var point : fixture.points()) {
            var result = converter.convert(new BigDecimal(point.x()), new BigDecimal(point.y()), 5174);
            assertEquals(Status.CONVERTED, result.status(), point.id());
            assertEquals(point.longitude(), result.longitude(), 1e-7, point.id() + " longitude");
            assertEquals(point.latitude(), result.latitude(), 1e-7, point.id() + " latitude");
        }
    }

    @Test
    void 좌표_누락은_임의의_위경도를_만들지_않는다() {
        var result = converter.convert(null, BigDecimal.ONE, 5174);
        assertEquals(Status.MISSING, result.status());
        assertNull(result.longitude());
        assertNull(result.latitude());
    }

    @Test
    void 지원하지_않는_좌표계는_변환하지_않는다() {
        for (var epsg : new Integer[] {4326, 5181, null}) {
            var result = converter.convert(BigDecimal.ONE, BigDecimal.ONE, epsg);
            assertEquals(Status.UNSUPPORTED_CRS, result.status());
            assertNull(result.longitude());
        }
    }

    @Test
    void 축을_뒤집은_좌표와_비정상_범위는_지도에서_제외한다() {
        var reversed = converter.convert(new BigDecimal("443415.972626677"),
            new BigDecimal("189505.11152445"), 5174);
        var zero = converter.convert(BigDecimal.ZERO, BigDecimal.ZERO, 5174);
        var overflow = converter.convert(new BigDecimal("1e1000"), BigDecimal.ONE, 5174);
        for (var result : List.of(reversed, zero, overflow)) {
            assertEquals(Status.OUT_OF_RANGE, result.status());
            assertNull(result.longitude());
            assertNull(result.latitude());
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    record Fixture(List<ReferencePoint> points) {}

    record ReferencePoint(String id, String x, String y, double longitude, double latitude) {}
}
