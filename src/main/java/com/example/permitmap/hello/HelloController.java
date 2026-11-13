package com.example.permitmap.hello;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "연결 확인", description = "Spring HTTP 응답 학습 예제.")
@RestController
public class HelloController {

  @Operation(summary = "Hello 응답 확인", description = "Hello, World! 문자열을 반환합니다. DB 연결 상태를 검사하지는 않습니다.")
  @GetMapping("/api/hello")
  public String hello() {
    return "Hello, World!";
  }
}
