package com.example.permitmap.restaurant.dto;

import java.util.List;

public record RestaurantPageResponse(
    List<RestaurantResponse> items, int page, int size, long totalElements, int totalPages) {}
