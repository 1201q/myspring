package com.example.permitmap.map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.nio.*;
import java.nio.channels.FileChannel;
import java.nio.file.*;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class NationalPlaybackTests {
  @TempDir Path directory;

  @Test
  void filesystem_export_lock_prevents_another_export_from_querying_database() throws Exception {
    var jdbc = mock(JdbcTemplate.class);
    var service = new NationalPlaybackService(jdbc, directory.toString());
    try (var owner =
            FileChannel.open(
                directory.resolve(".export.lock"),
                StandardOpenOption.CREATE,
                StandardOpenOption.WRITE);
        var ignored = owner.lock()) {
      assertThrows(NationalPlaybackService.ExportAlreadyRunningException.class, service::refresh);
      verifyNoInteractions(jdbc);
    }
    // A stale lock file is harmless after the owner releases the OS lock.
    assertTrue(Files.exists(directory.resolve(".export.lock")));
    assertEquals(16, service.refresh().size());
    verify(jdbc, times(1))
        .query(any(PreparedStatementCreator.class), any(ResultSetExtractor.class));
  }

  @Test
  void assigns_current_and_former_province_names_without_substring_collisions() {
    assertEquals("gangwon", NationalPlaybackService.classifyAddress(" 강원특별자치도 춘천시", null));
    assertEquals("gangwon", NationalPlaybackService.classifyAddress("강원도 강릉시", null));
    assertEquals("jeonbuk", NationalPlaybackService.classifyAddress("전북특별자치도 전주시", null));
    assertEquals("jeonbuk", NationalPlaybackService.classifyAddress("전라북도 전주시", null));
    assertEquals("sejong", NationalPlaybackService.classifyAddress("세종특별자치시 한누리대로", null));
    assertEquals("sejong", NationalPlaybackService.classifyAddress("세종시 한누리대로", null));
    assertEquals("gyeongbuk", NationalPlaybackService.classifyAddress("경북 포항시", null));
    assertEquals(
        "jeonnamgwangju", NationalPlaybackService.classifyAddress("전남광주통합특별시 서구 내방로 111", null));
    assertEquals(
        "jeonnamgwangju", NationalPlaybackService.classifyAddress("전남광주통합특별시 강진군 탐진로 5", null));
    assertEquals("jeonnamgwangju", NationalPlaybackService.classifyAddress("광주광역시 서구", null));
    assertEquals("jeonnamgwangju", NationalPlaybackService.classifyAddress("전라남도 강진군", null));
    assertEquals("gyeonggi", NationalPlaybackService.classifyAddress("경기도 광주시", null));
    assertEquals("seoul", NationalPlaybackService.classifyAddress(" \t", "서울특별시 구로구"));
    assertEquals("busan", NationalPlaybackService.classifyAddress("부산광역시 중구", "서울특별시 중구"));
    assertNull(NationalPlaybackService.classifyAddress("서울로123", "서울특별시 중구"));
    assertNull(NationalPlaybackService.classifyAddress(null, null));
    assertFalse(
        NationalPlaybackService.inside(
            Double.NaN, 37, NationalPlaybackService.requireRegion("seoul").bbox()));
    assertThrows(
        IllegalArgumentException.class, () -> NationalPlaybackService.requireRegion("../seoul"));
    assertEquals(
        16,
        NationalPlaybackService.REGIONS.stream()
            .map(NationalPlaybackService.Region::id)
            .distinct()
            .count());
  }

  @Test
  void partitions_one_cursor_into_matching_histograms_and_persists_exclusion_audit()
      throws Exception {
    var jdbc = mock(JdbcTemplate.class);
    var rs = mock(ResultSet.class);
    when(rs.next()).thenReturn(true, true, true, true, true, true, true, true, false);
    when(rs.getLong("id")).thenReturn(1L, 2L, 3L, 4L, 5L);
    when(rs.getString("road_address"))
        .thenReturn(
            "서울특별시 구로구",
            "부산광역시 중구",
            "강원도 춘천시",
            "해외 주소",
            "서울특별시 중구",
            "서울특별시 중구",
            "전남광주통합특별시 서구",
            "전라남도 강진군");
    when(rs.getString("category_id"))
        .thenReturn(
            "general_restaurants",
            "general_restaurants",
            "general_restaurants",
            "unsupported",
            "general_restaurants",
            "general_restaurants");
    when(rs.getDouble("longitude")).thenReturn(127d, 129.05, 127.7, 140d, 127d, 126.85, 126.77);
    when(rs.getDouble("latitude")).thenReturn(37.5, 35.1, 37.9, 37.5, 37.5, 35.15, 34.65);
    when(rs.getObject("permitted_on", LocalDate.class)).thenReturn(LocalDate.of(2000, 1, 1));
    when(rs.getObject("closed_on", LocalDate.class)).thenReturn(LocalDate.of(2000, 2, 1));
    doAnswer(
            call -> {
              ((ResultSetExtractor<?>) call.getArgument(1)).extractData(rs);
              return null;
            })
        .when(jdbc)
        .query(any(PreparedStatementCreator.class), any(ResultSetExtractor.class));
    var service = new NationalPlaybackService(jdbc, directory.toString());
    var manifests = service.refresh();
    assertEquals(16, manifests.size());
    assertEquals(10, manifests.stream().mapToLong(NationalPlaybackService.Manifest::count).sum());
    var summary = manifests.getFirst().exportSummary();
    assertEquals(new NationalPlaybackService.ExportSummary(16, 2, 2, 2, 10), summary);
    for (var manifest : manifests) {
      assertEquals(summary, manifest.exportSummary());
      assertEquals(manifest.count(), Arrays.stream(manifest.monthlyCounts()).sum());
      if (Set.of("seoul", "busan", "gangwon").contains(manifest.regionId())) {
        assertEquals(2, manifest.count());
        assertEquals(1, manifest.opens());
        assertEquals(1, manifest.closes());
        int stride = manifest.categories().size();
        assertEquals(1, manifest.monthlyCounts()[120 * 2 * stride]);
        assertEquals(1, manifest.monthlyCounts()[(121 * 2 + 1) * stride]);
        var bytes =
            ByteBuffer.wrap(
                    Files.readAllBytes(service.binaryPath(manifest.regionId(), manifest.version())))
                .order(ByteOrder.LITTLE_ENDIAN);
        assertEquals(32, bytes.remaining());
        bytes.position(8);
        assertEquals(120, bytes.getShort());
        assertEquals(0, bytes.get());
        assertEquals(0, bytes.get());
        bytes.position(24);
        assertEquals(121, bytes.getShort());
        assertEquals(1, bytes.get());
      } else if (manifest.regionId().equals("jeonnamgwangju")) {
        assertEquals(4, manifest.count());
        assertEquals(2, manifest.opens());
        assertEquals(2, manifest.closes());
        int stride = manifest.categories().size();
        assertEquals(2, manifest.monthlyCounts()[120 * 2 * stride]);
        assertEquals(2, manifest.monthlyCounts()[(121 * 2 + 1) * stride]);
      } else assertEquals(0, manifest.count());
    }
    verify(jdbc, times(1))
        .query(any(PreparedStatementCreator.class), any(ResultSetExtractor.class));
    var noDatabase = mock(JdbcTemplate.class);
    var reopened = new NationalPlaybackService(noDatabase, directory.toString());
    for (var manifest : manifests)
      assertEquals(manifest.version(), reopened.manifest(manifest.regionId()).version());
    verifyNoInteractions(noDatabase);
    assertThrows(
        IllegalArgumentException.class, () -> service.binaryPath("seoul", "../manifest.json"));
  }

  @Test
  void catalog_needs_no_database_and_missing_snapshot_returns_retryable_response()
      throws Exception {
    var service = mock(NationalPlaybackService.class);
    var mvc = MockMvcBuilders.standaloneSetup(new NationalPlaybackController(service)).build();
    mvc.perform(get("/api/v1/map/playback/national/regions"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.regions.length()").value(16))
        .andExpect(jsonPath("$.regions[0].id").value("seoul"));
    verifyNoInteractions(service);
    mvc.perform(get("/api/v1/map/playback/national/seoul/manifest.json"))
        .andExpect(status().isServiceUnavailable())
        .andExpect(header().string("Retry-After", "2"));
    when(service.manifest("unknown")).thenThrow(new IllegalArgumentException());
    mvc.perform(get("/api/v1/map/playback/national/unknown/manifest.json"))
        .andExpect(status().isNotFound());
  }
}
