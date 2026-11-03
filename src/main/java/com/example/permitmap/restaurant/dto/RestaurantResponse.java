package com.example.permitmap.restaurant.dto;

import com.example.permitmap.restaurant.Restaurant;

public record RestaurantResponse(
        Long id, String name, String address, String category) {

}