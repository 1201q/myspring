package com.example.permitmap.map;

import java.nio.file.Files;
import java.time.Duration;
import java.util.Map;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/map/playback/national")
public class NationalPlaybackController {
    private final NationalPlaybackService service;
    public NationalPlaybackController(NationalPlaybackService service) { this.service=service; }
    @GetMapping("/regions")
    public Map<String,Object> regions() { return Map.of("regions",NationalPlaybackService.REGIONS); }
    @GetMapping("/{region}/manifest.json")
    public ResponseEntity<?> manifest(@PathVariable String region) {
        try {
            var manifest=service.manifest(region);
            if(manifest==null) return ResponseEntity.status(503).header("Retry-After","2").cacheControl(CacheControl.noStore())
                .body(Map.of("status","building","message","전국 재생 데이터를 준비 중입니다."));
            return ResponseEntity.ok().cacheControl(CacheControl.noCache()).eTag("\""+manifest.version()+"-"+manifest.generatedAt()+"\"").body(manifest);
        } catch(IllegalArgumentException error) { return ResponseEntity.notFound().build(); }
    }
    @GetMapping(value="/{region}/events.bin",produces=MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<?> events(@PathVariable String region,@RequestParam("v") String version) {
        try {
            var path=service.binaryPath(region,version);
            if(!Files.exists(path)) return ResponseEntity.notFound().build();
            return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .eTag("\""+version+"\"").body(new FileSystemResource(path));
        } catch(IllegalArgumentException error) { return ResponseEntity.badRequest().build(); }
    }
}
