package com.example.permitmap.business.dto;

import java.time.LocalDate;
import java.util.List;

public record BusinessPageResponse(
        List<BusinessResponse> items,
        int page,
        int size,
        long totalElements,
        int totalPages,
        LocalDate date,
        String statusBasis) {
}
