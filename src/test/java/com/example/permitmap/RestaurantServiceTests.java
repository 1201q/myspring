package com.example.permitmap;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

public class RestaurantServiceTests {

  private final RestaurantService restaurantService = new RestaurantService();

  @Test
  void 카테고리가_없으면_전체_음식점을_반환한다() {
    var result = restaurantService.findAll(null);

    assertEquals(3, result.size());
  }

  @Test
  void 한식으로_검색하면_한식_음식점만_반환한다() {
    var result = restaurantService.findAll("한식");

    assertEquals(1, result.size());
    assertEquals("봄식당", result.getFirst().name());
    assertEquals("한식", result.getFirst().category());
  }

  @Test
  void 일치하는_카테고리가_없으면_빈_목록을_반환한다() {
    var result = restaurantService.findAll("양식");

    assertTrue(result.isEmpty());
  }

  @Test
  void ID로_음식점을_조회한다() {
    var result = restaurantService.findById(2L);

    assertEquals("여름식당", result.name());
  }

  @Test
  void 없는_ID를_조회하면_404_예외가_발생한다() {
    var exception = assertThrows(ResponseStatusException.class, () -> restaurantService.findById(999L));

    assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
  }
}
