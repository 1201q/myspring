package com.example.permitmap.business;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.media.Content;

import com.example.permitmap.business.dto.BusinessPageResponse;
import com.example.permitmap.business.dto.BusinessResponse;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "샘플 인허가", description = "permit_businesses에 적재한 샘플 조회. 현재 전국 지도 데이터와 별개입니다.")
@RestController
@RequestMapping("/api/v1/businesses")
public class BusinessController {

  private final BusinessService service;

  public BusinessController(BusinessService service) {
    this.service = service;
  }

  @Operation(summary = "샘플 인허가 목록 조회", description = "날짜 생략 시 원천 스냅샷, 지정 시 허가일·폐업일 기준 상태 추정 결과를 반환합니다.")
  @ApiResponse(responseCode = "400", description = "잘못된 날짜 또는 페이지 조건", content = @Content)
  @GetMapping
  public BusinessPageResponse getBusinesses(
      @Parameter(description = "상태 추정 기준일. 허가일 당일 포함, 폐업일 당일 제외. 생략하면 날짜 필터 없음", example = "2020-06-01") @RequestParam(name = "date", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate date,
      @Parameter(description = "페이지 번호: 0부터 시작", example = "0") @RequestParam(name = "page", defaultValue = "0") int page,
      @Parameter(description = "페이지 크기: 1~100", example = "20") @RequestParam(name = "size", defaultValue = "20") int size) {
    return service.findAll(date, page, size);
  }

  @Operation(summary = "샘플 인허가 상세 조회", description = "샘플 ID로 조회합니다. 원천 좌표와 WGS84 변환 결과를 함께 제공합니다.")
  @ApiResponse(responseCode = "404", description = "해당 샘플 사업장 없음", content = @Content)
  @GetMapping("/{id}")
  public BusinessResponse getBusiness(@Parameter(description = "샘플 목록의 사업장 ID", example = "1") @PathVariable("id") Long id) {
    return service.findById(id);
  }
}
