package com.example.permitmap;

import jakarta.validation.constraints.NotBlank;

public record RestaurantUpdateRequest(
    @NotBlank String name,
    @NotBlank String address,
    @NotBlank String category) {
}