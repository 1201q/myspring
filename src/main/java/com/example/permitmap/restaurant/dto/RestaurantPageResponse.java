package com.example.permitmap.restaurant.dto;

import com.example.permitmap.restaurant.Restaurant;

import java.util.List;

public record RestaurantPageResponse(
    List<RestaurantResponse> items,
    int page,
    int size,
    long totalElements,
    int totalPages) {
}