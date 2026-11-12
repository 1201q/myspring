package com.example.permitmap.map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

class MapEventTests {
  @Test
  void limits_concurrent_event_queries_and_releases_connections_after_failure() throws Exception {
    var jdbc = mock(JdbcTemplate.class);
    var entered = new java.util.concurrent.CountDownLatch(2);
    var release = new java.util.concurrent.CountDownLatch(1);
    doAnswer(
            invocation -> {
              entered.countDown();
              assertTrue(release.await(3, java.util.concurrent.TimeUnit.SECONDS));
              throw new org.springframework.dao.QueryTimeoutException("test timeout");
            })
        .when(jdbc)
        .query(
            any(org.springframework.jdbc.core.PreparedStatementCreator.class),
            any(org.springframework.jdbc.core.RowMapper.class));
    var service = new MapEventService(jdbc);
    var from = LocalDate.of(2020, 1, 1);
    try (var executor = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor()) {
      var first =
          executor.submit(() ->
              assertThrows(
                  org.springframework.dao.QueryTimeoutException.class,
                  () -> service.find("126,37,127,38", null, from, from.plusMonths(1))));
      var second =
          executor.submit(() ->
              assertThrows(
                  org.springframework.dao.QueryTimeoutException.class,
                  () -> service.find("126,37,127,38", null, from, from.plusMonths(1))));
      try {
        assertTrue(entered.await(2, java.util.concurrent.TimeUnit.SECONDS));
        var error =
            assertThrows(
                ResponseStatusException.class,
                () -> service.find("126,37,127,38", null, from, from.plusMonths(1)));
        assertEquals(429, error.getStatusCode().value());
      } finally {
        release.countDown();
      }
      first.get();
      second.get();
    }
    // A failed query must return its slot, so the next call reaches JDBC.
    assertThrows(
        org.springframework.dao.QueryTimeoutException.class,
        () -> service.find("126,37,127,38", null, from, from.plusMonths(1)));
    verify(jdbc, times(3))
        .query(
            any(org.springframework.jdbc.core.PreparedStatementCreator.class),
            any(org.springframework.jdbc.core.RowMapper.class));
  }

  @Test
  void invalid_ranges_and_categories_do_not_reach_the_database() {
    var jdbc = mock(JdbcTemplate.class);
    var service = new MapEventService(jdbc);
    var from = LocalDate.of(2026, 10, 1);
    assertThrows(
        ResponseStatusException.class,
        () -> service.find("-180,-90,180,90", null, from, from.plusMonths(1)));
    assertThrows(
        ResponseStatusException.class, () -> service.find("126,37,127,38", null, from, from));
    assertThrows(
        ResponseStatusException.class,
        () -> service.find("126,37,127,38", null, from, from.minusDays(1)));
    assertThrows(
        ResponseStatusException.class,
        () -> service.find("126,37,127,38", null, from, from.plusYears(51)));
    assertThrows(
        ResponseStatusException.class,
        () -> service.find("126,37,127,38", "unknown", from, from.plusMonths(1)));
    verifyNoInteractions(jdbc);
  }

  @Test
  void opening_and_closing_the_same_business_are_independent_events() throws Exception {
    var service = mock(MapEventService.class);
    var from = LocalDate.of(2026, 10, 1);
    var to = from.plusMonths(1);
    when(service.find("126,37,127,38", null, from, to))
        .thenReturn(
            new MapEventService.Result(
                List.of(
                    new MapEventService.Event(1, "OPEN", from, 126.8, 37.5),
                    new MapEventService.Event(1, "CLOSE", to.minusDays(1), 126.8, 37.5)),
                false));
    MockMvcBuilders.standaloneSetup(new MapEventController(service))
        .build()
        .perform(
            get("/api/v1/map/events")
                .param("bbox", "126,37,127,38")
                .param("from", "2026-10-01")
                .param("to", "2026-11-01"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(2))
        .andExpect(jsonPath("$.items[0].kind").value("OPEN"))
        .andExpect(jsonPath("$.items[1].kind").value("CLOSE"));
  }
}
