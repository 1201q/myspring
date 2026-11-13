package com.example.permitmap.business.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.time.LocalDate;
import java.util.List;

public record BusinessPageResponse(
    List<BusinessResponse> items,
    @Schema(description = "현재 페이지 번호. 0부터 시작") int page,
    @Schema(description = "요청한 페이지 크기. 실제 항목 수와 다를 수 있음") int size,
    @Schema(description = "조건에 맞는 전체 사업장 수") long totalElements,
    @Schema(description = "전체 페이지 수") int totalPages,
    LocalDate date,
    @Schema(description = "SOURCE_SNAPSHOT: 날짜 조건 없음. DATE_INFERRED: 허가일·폐업일로 추정") String statusBasis) {}
