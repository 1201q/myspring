package com.example.permitmap.restaurant.exception;

import com.example.permitmap.restaurant.Restaurant;

public class RestaurantNotFoundException extends RuntimeException {
  public RestaurantNotFoundException() {
    // RuntimeException 생성자 호출
    super("음식점을 찾을 수 없습니다.");
  }
}
