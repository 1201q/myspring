package com.example.permitmap.map;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.media.Content;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@Tag(name = "지도 조회", description = "전국 DB 공간 조회. 현재 FE는 업종 목록과 사업장 상세 조회를 사용합니다.")
@RestController
@RequestMapping("/api/v1/map")
public class MapController {
  private final MapQueryService service;

  public MapController(MapQueryService service) {
    this.service = service;
  }

  @Operation(summary = "지도 영역 사업장 목록 조회", description = "DB의 WGS84 영역 조회. truncated=true이면 일부 결과이므로 영역을 줄이세요.")
  @ApiResponse(responseCode = "400", description = "잘못된 bbox, 업종 또는 limit", content = @Content)
  @ApiResponse(responseCode = "503", description = "조회 시간 초과. 영역을 줄여 재시도", content = @Content)
  @GetMapping("/businesses")
  public MapQueryService.Result businesses(
      @Parameter(description = "WGS84 조회 영역: 서쪽 경도,남쪽 위도,동쪽 경도,북쪽 위도. 각 폭은 1도 이하", example = "126.9,37.5,127.0,37.6") @RequestParam("bbox") String bbox,
      @Parameter(description = "업종 목록 API의 id. 생략하면 지원 업종 전체", example = "general_restaurants") @RequestParam(name = "category", required = false) String category,
      @Parameter(description = "상태 추정 기준일. 허가일 당일 포함, 폐업일 당일 제외. 생략하면 날짜 필터 없음", example = "2020-06-01") @RequestParam(name = "date", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate date,
      @Parameter(description = "최대 반환 건수: 1~500", example = "100") @RequestParam(name = "limit", defaultValue = "500") int limit) {
    return service.find(bbox, category, date, limit);
  }

  @Operation(summary = "지도 벡터 타일 조회", description = "PostGIS에서 MVT 바이너리를 생성합니다. z가 15 미만이면 집계, 15 이상이면 개별 지점입니다. 현재 FE 재생에서는 사용하지 않습니다.")
  @ApiResponse(responseCode = "400", description = "잘못된 타일 좌표 또는 업종", content = @Content)
  @ApiResponse(responseCode = "503", description = "DB 조회 시간 초과", content = @Content)
  @GetMapping(value = "/tiles/{z}/{x}/{y}.pbf", produces = "application/vnd.mapbox-vector-tile")
  public ResponseEntity<byte[]> tile(
      @Parameter(description = "확대 단계: 6~16", example = "15") @PathVariable("z") int z,
      @Parameter(description = "XYZ 타일 X: 0 이상 2^z 미만", example = "27942") @PathVariable("x") int x,
      @Parameter(description = "XYZ 타일 Y: 0 이상 2^z 미만", example = "12663") @PathVariable("y") int y,
      @Parameter(description = "업종 목록 API의 id. 생략하면 지원 업종 전체", example = "general_restaurants") @RequestParam(name = "category", required = false) String category,
      @Parameter(description = "상태 추정 기준일. 허가일 당일 포함, 폐업일 당일 제외. 생략하면 날짜 필터 없음", example = "2020-06-01") @RequestParam(name = "date", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate date) {
    return ResponseEntity.ok()
        .cacheControl(org.springframework.http.CacheControl.maxAge(java.time.Duration.ofMinutes(5)))
        .body(service.tile(z, x, y, category, date));
  }

  @Operation(summary = "전국 지도 사업장 상세 조회", description = "재생 데이터의 ID로 DB 상세 정보를 조회합니다. 샘플 API의 ID와 혼용하지 마세요.")
  @ApiResponse(responseCode = "404", description = "지도에서 조회 가능한 사업장 없음", content = @Content)
  @GetMapping("/businesses/{id}")
  public MapQueryService.Item detail(@Parameter(description = "재생 데이터 또는 영역 조회 결과에서 받은 사업장 ID", example = "1") @PathVariable("id") long id) {
    return service.detail(id);
  }

  @Operation(summary = "지도 지원 업종 목록 조회", description = "id와 표시 이름을 반환합니다. category 요청값에는 표시 이름 대신 id를 사용하세요.")
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
