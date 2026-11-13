package com.example.permitmap.map;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;

import java.nio.file.Files;
import java.time.Duration;
import java.util.Map;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@Tag(name = "서울 시간 재생", description = "서울 전용 별도 경로. 현재 FE는 전국 시간 재생 API를 사용합니다.")
@RestController
@RequestMapping("/api/v1/map/playback/seoul")
public class SeoulPlaybackController {
  private final SeoulPlaybackService service;

  public SeoulPlaybackController(SeoulPlaybackService service) {
    this.service = service;
  }

  @ApiResponse(responseCode = "200", description = "재생 메타데이터", content = @Content(mediaType = "application/json", schema = @Schema(implementation = SeoulPlaybackService.Manifest.class)))
  @Operation(summary = "재생 데이터 manifest 조회", description = "버전, binaryUrl, 레코드 수, 기간 및 월별 집계를 반환합니다. 준비 중이면 Retry-After: 2와 503을 반환하므로 2초 뒤 재시도하세요.")
  @ApiResponse(responseCode = "503", description = "재생 파일 준비 중", content = @Content)
  @GetMapping("/manifest.json")
  public ResponseEntity<?> manifest() {
    var manifest = service.manifest();
    if (manifest == null)
      return ResponseEntity.status(503)
          .header("Retry-After", "2")
          .cacheControl(CacheControl.noStore())
          .body(Map.of("status", "building", "message", "서울 전체 재생 데이터를 준비 중입니다."));
    // Metadata can change (e.g. a new empty calendar month) without changing binary bytes.
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noCache())
        .eTag("\"" + manifest.version() + "-" + manifest.generatedAt() + "\"")
        .body(manifest);
  }

  @ApiResponse(responseCode = "200", description = "재생 파일", content = @Content(mediaType = "application/octet-stream", schema = @Schema(type = "string", format = "binary")))
  @Operation(summary = "버전별 재생 바이너리 다운로드", description = "manifest의 binaryUrl을 그대로 사용하세요. JSON이 아닌 레코드당 16바이트의 바이너리입니다. 버전별 파일은 365일 캐시할 수 있습니다.")
  @ApiResponse(responseCode = "400", description = "잘못된 버전 형식 또는 지역", content = @Content)
  @ApiResponse(responseCode = "404", description = "해당 버전 파일 없음. manifest 재조회 필요", content = @Content)
  @GetMapping(value = "/events.bin", produces = MediaType.APPLICATION_OCTET_STREAM_VALUE)
  public ResponseEntity<?> events(@Parameter(description = "manifest에서 받은 version. 예시 대신 실제 반환값을 사용하세요", example = "0123456789abcdef") @RequestParam("v") String version) {
    try {
      var path = service.binaryPath(version);
      if (!Files.exists(path)) return ResponseEntity.notFound().build();
      return ResponseEntity.ok()
          .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
          .eTag("\"" + version + "\"")
          .body(new FileSystemResource(path));
    } catch (IllegalArgumentException error) {
      return ResponseEntity.badRequest().build();
    }
  }
}
