package com.example.permitmap.map;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.media.Content;

import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "영역별 이벤트", description = "DB 이벤트 직접 조회. 현재 FE에서는 사용하지 않는 별도 경로입니다.")
@RestController
@RequestMapping("/api/v1/map")
public class MapEventController {
  private final MapEventService service;

  public MapEventController(MapEventService service) {
    this.service = service;
  }

  @Operation(summary = "영역·기간별 인허가 및 폐업 이벤트 조회", description = "기간은 [from,to), 최대 366 x 50일입니다. 100,000건 초과 시 목록은 비우고 truncated=true를 반환합니다. 영역 또는 기간을 줄여 재조회하세요.")
  @ApiResponse(responseCode = "400", description = "기간, 영역 또는 업종 오류", content = @Content)
  @ApiResponse(responseCode = "429", description = "동시 조회 한도 초과. 잠시 후 재시도", content = @Content)
  @ApiResponse(responseCode = "503", description = "DB 조회 시간 초과", content = @Content)
  @GetMapping("/events")
  public ResponseEntity<MapEventService.Result> events(
      @Parameter(description = "WGS84 조회 영역: 서쪽 경도,남쪽 위도,동쪽 경도,북쪽 위도. 각 폭은 1도 이하", example = "126.9,37.5,127.0,37.6") @RequestParam("bbox") String bbox,
      @Parameter(description = "업종 목록 API의 id. 생략하면 지원 업종 전체", example = "general_restaurants") @RequestParam(name = "category", required = false) String category,
      @Parameter(description = "시작일: 포함", example = "2020-01-01") @RequestParam("from") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
      @Parameter(description = "종료일: 미포함. 시작일보다 뒤여야 함", example = "2021-01-01") @RequestParam("to") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(service.find(bbox, category, from, to));
  }

  @ExceptionHandler(org.springframework.dao.QueryTimeoutException.class)
  public ResponseEntity<java.util.Map<String, String>> timeout() {
    return ResponseEntity.status(503)
        .body(java.util.Map.of("message", "이벤트 조회 시간이 초과됐습니다. 지도를 확대해 주세요."));
  }
}
