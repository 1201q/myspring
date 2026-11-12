package com.example.permitmap.map;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/map")
public class MapController {
  private final MapQueryService service;

  public MapController(MapQueryService service) {
    this.service = service;
  }

  @GetMapping("/businesses")
  public MapQueryService.Result businesses(
      @RequestParam("bbox") String bbox,
      @RequestParam(name = "category", required = false) String category,
      @RequestParam(name = "date", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate date,
      @RequestParam(name = "limit", defaultValue = "500") int limit) {
    return service.find(bbox, category, date, limit);
  }

  @GetMapping(value = "/tiles/{z}/{x}/{y}.pbf", produces = "application/vnd.mapbox-vector-tile")
  public ResponseEntity<byte[]> tile(
      @PathVariable("z") int z,
      @PathVariable("x") int x,
      @PathVariable("y") int y,
      @RequestParam(name = "category", required = false) String category,
      @RequestParam(name = "date", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate date) {
    return ResponseEntity.ok()
        .cacheControl(org.springframework.http.CacheControl.maxAge(java.time.Duration.ofMinutes(5)))
        .body(service.tile(z, x, y, category, date));
  }

  @GetMapping("/businesses/{id}")
  public MapQueryService.Item detail(@PathVariable("id") long id) {
    return service.detail(id);
  }

  @GetMapping("/categories")
  public List<MapQueryService.Category> categories() {
    return MapQueryService.CATEGORIES;
  }

  @ExceptionHandler(QueryTimeoutException.class)
  public ResponseEntity<Map<String, String>> timeout() {
    return ResponseEntity.status(503)
        .body(Map.of("code", "MAP_QUERY_TIMEOUT", "message", "조회 시간이 초과됐습니다. 지도를 더 확대해 주세요."));
  }
}
