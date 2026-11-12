package com.example.permitmap.restaurant.exception;

public class RestaurantNotFoundException extends RuntimeException {
  @java.io.Serial private static final long serialVersionUID = 1L;

  public RestaurantNotFoundException() {
    // RuntimeException 생성자 호출
    super("음식점을 찾을 수 없습니다.");
  }
}
