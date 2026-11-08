package com.example.permitmap.map;

import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/map")
public class MapEventController {
    private final MapEventService service;
    public MapEventController(MapEventService service) { this.service=service; }
    @GetMapping("/events")
    public ResponseEntity<MapEventService.Result> events(@RequestParam("bbox") String bbox,
            @RequestParam(name="category",required=false) String category,
            @RequestParam("from") @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam("to") @DateTimeFormat(iso=DateTimeFormat.ISO.DATE) LocalDate to) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.find(bbox,category,from,to));
    }
    @ExceptionHandler(org.springframework.dao.QueryTimeoutException.class)
    public ResponseEntity<java.util.Map<String,String>> timeout() {
        return ResponseEntity.status(503).body(java.util.Map.of("message","이벤트 조회 시간이 초과됐습니다. 지도를 확대해 주세요."));
    }
}
