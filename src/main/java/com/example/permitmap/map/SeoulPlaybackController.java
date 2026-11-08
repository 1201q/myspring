package com.example.permitmap.map;

import java.nio.file.Files;
import java.time.Duration;
import java.util.Map;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/map/playback/seoul")
public class SeoulPlaybackController {
    private final SeoulPlaybackService service;
    public SeoulPlaybackController(SeoulPlaybackService service) { this.service=service; }
    @GetMapping("/manifest.json")
    public ResponseEntity<?> manifest() {
        var manifest=service.manifest();
        if(manifest==null) return ResponseEntity.status(503).header("Retry-After","2").cacheControl(CacheControl.noStore())
            .body(Map.of("status","building","message","서울 전체 재생 데이터를 준비 중입니다."));
        // Metadata can change (e.g. a new empty calendar month) without changing binary bytes.
        return ResponseEntity.ok().cacheControl(CacheControl.noCache()).eTag("\""+manifest.version()+"-"+manifest.generatedAt()+"\"").body(manifest);
    }
    @GetMapping(value="/events.bin",produces=MediaType.APPLICATION_OCTET_STREAM_VALUE)
    public ResponseEntity<?> events(@RequestParam("v") String version) {
        try {
            var path=service.binaryPath(version);
            if(!Files.exists(path)) return ResponseEntity.notFound().build();
            return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .eTag("\""+version+"\"").body(new FileSystemResource(path));
        } catch(IllegalArgumentException error) { return ResponseEntity.badRequest().build(); }
    }
}
