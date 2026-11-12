package com.example.permitmap.restaurant.dto;

import jakarta.validation.constraints.NotBlank;

public record RestaurantCreateRequest(
    @NotBlank String name, @NotBlank String address, @NotBlank String category) {}
