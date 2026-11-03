package com.example.permitmap.restaurant.dto;

import com.example.permitmap.restaurant.Restaurant;

import jakarta.validation.constraints.NotBlank;

public record RestaurantUpdateRequest(
    @NotBlank String name,
    @NotBlank String address,
    @NotBlank String category) {
}