package com.example.permitmap.map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.io.ByteArrayOutputStream;
import java.nio.*;
import java.nio.file.*;
import java.sql.ResultSet;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class SeoulPlaybackTests {
  @TempDir Path directory;

  @Test
  void exports_matching_binary_and_histograms_then_reopens_without_database() throws Exception {
    var jdbc = mock(JdbcTemplate.class);
    var rs = mock(ResultSet.class);
    when(rs.next()).thenReturn(true, true, false);
    when(rs.getString("category_id")).thenReturn(MapQueryService.CATEGORIES.getFirst().id());
    when(rs.getLong("id")).thenReturn(4294967295L);
    when(rs.getFloat("longitude")).thenReturn(127.0f);
    when(rs.getFloat("latitude")).thenReturn(37.5f);
    when(rs.getInt("kind")).thenReturn(0, 1);
    when(rs.getObject("event_date", LocalDate.class))
        .thenReturn(LocalDate.of(2000, 1, 1), LocalDate.of(2000, 2, 1));
    doAnswer(
            invocation -> {
              ((ResultSetExtractor<?>) invocation.getArgument(1)).extractData(rs);
              return null;
            })
        .when(jdbc)
        .query(any(PreparedStatementCreator.class), any(ResultSetExtractor.class));
    var service = new SeoulPlaybackService(jdbc, directory.toString());
    var manifest = service.refresh();
    assertEquals(2, manifest.count());
    assertEquals(1, manifest.opens());
    assertEquals(1, manifest.closes());
    int stride = manifest.categories().size();
    assertEquals(1, manifest.monthlyCounts()[(120 * 2) * stride]);
    assertEquals(1, manifest.monthlyCounts()[(121 * 2 + 1) * stride]);
    assertEquals(2, java.util.Arrays.stream(manifest.monthlyCounts()).sum());
    var binary =
        ByteBuffer.wrap(Files.readAllBytes(service.binaryPath(manifest.version())))
            .order(ByteOrder.LITTLE_ENDIAN);
    assertEquals(32, binary.remaining());
    assertEquals(127f, binary.getFloat());
    assertEquals(37.5f, binary.getFloat());
    assertEquals(120, binary.getShort());
    assertEquals(0, binary.get());
    assertEquals(0, binary.get());
    assertEquals(4294967295L, Integer.toUnsignedLong(binary.getInt()));
    var noDatabase = mock(JdbcTemplate.class);
    var reopened = new SeoulPlaybackService(noDatabase, directory.toString());
    assertEquals(manifest.version(), reopened.manifest().version());
    verifyNoInteractions(noDatabase);
  }

  @Test
  void rejects_binary_overflow_instead_of_corrupting_ids_or_months() throws Exception {
    var output = new ByteArrayOutputStream();
    assertThrows(
        IllegalArgumentException.class,
        () -> SeoulPlaybackService.writeEvent(output, 4294967296L, 127, 37, 0, 0, 0));
    assertThrows(
        IllegalArgumentException.class,
        () -> SeoulPlaybackService.writeEvent(output, 1, 127, 37, 32768, 0, 0));
    assertThrows(
        IllegalArgumentException.class,
        () -> SeoulPlaybackService.writeEvent(output, 1, Float.NaN, 37, 0, 0, 0));
    assertEquals(0, output.size());
  }

  @Test
  void first_load_reports_building_and_binary_versions_are_path_safe() throws Exception {
    var service = mock(SeoulPlaybackService.class);
    var mvc = MockMvcBuilders.standaloneSetup(new SeoulPlaybackController(service)).build();
    mvc.perform(get("/api/v1/map/playback/seoul/manifest.json"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(header().string("Retry-After", "2"))
        .andExpect(jsonPath("$.status").value("building"));
    var real = new SeoulPlaybackService(mock(JdbcTemplate.class), directory.toString());
    assertThrows(IllegalArgumentException.class, () -> real.binaryPath("../manifest.json"));
  }
}
