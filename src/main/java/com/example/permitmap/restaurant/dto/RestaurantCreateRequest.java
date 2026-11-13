package com.example.permitmap.restaurant.dto;

import jakarta.validation.constraints.NotBlank;
import io.swagger.v3.oas.annotations.media.Schema;

public record RestaurantCreateRequest(
    @Schema(description = "음식점 이름", example = "겨울식당") @NotBlank String name,
    @Schema(description = "음식점 주소", example = "서울특별시 성동구") @NotBlank String address,
    @Schema(description = "카테고리", example = "한식") @NotBlank String category) {}
