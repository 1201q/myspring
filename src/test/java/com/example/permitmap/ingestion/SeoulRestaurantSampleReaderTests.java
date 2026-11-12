package com.example.permitmap.ingestion;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;

class SeoulRestaurantSampleReaderTests {

  private final SeoulRestaurantSampleReader reader =
      new SeoulRestaurantSampleReader(new SeoulRestaurantValidator());

  @Test
  void 공식_샘플_50건을_검증하고_좌표_누락을_별도로_집계한다() throws IOException {
    var report = reader.read(Path.of("docs/data-samples/guro-restaurants.sample.json"));

    assertEquals(50, report.rows().size());
    assertEquals(50, report.acceptedCount());
    assertEquals(0, report.rejectedCount());
    assertEquals(40, report.acceptedWithCoordinatesCount());
    assertEquals(10, report.acceptedWithoutCoordinatesCount());
    assertEquals("3160000-101-2014-00038", report.rows().getFirst().source().managementNumber());
  }

  @Test
  void 잘못된_JSON과_배열이_아닌_입력은_파일_단위로_거절한다() {
    for (var json : new String[] {"[", "{}", "null", "[] {}"}) {
      assertThrows(IllegalArgumentException.class, () -> reader.read(input(json)), json);
    }
  }

  @Test
  void 응답에_추가_필드가_있어도_서비스_필드만_읽는다() {
    var json =
        """
        [{"OPNSFTEAMCODE":"3160000","MGTNO":"id-1",
          "BPLCNM":"식당","APVPERMYMD":"2024-01-01",
          "X":"187383","Y":"444494","UNUSED_FIELD":"ignored"}]
        """;
    assertEquals(1, reader.read(input(json)).acceptedCount());
  }

  private ByteArrayInputStream input(String json) {
    return new ByteArrayInputStream(json.getBytes(StandardCharsets.UTF_8));
  }
}
