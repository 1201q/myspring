package com.example.permitmap;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class RestaurantService {
  private final List<RestaurantResponse> restaurants = new CopyOnWriteArrayList<>(List.of(
      new RestaurantResponse(1L, "봄식당", "서울특별시 중구", "한식"),
      new RestaurantResponse(2L, "여름식당", "서울특별시 종로구", "일식"),
      new RestaurantResponse(3L, "가을식당", "서울특별시 마포구", "중식")));

  private final AtomicLong nextId = new AtomicLong(4);

  public List<RestaurantResponse> findAll(String category) {
    if (category == null || category.isBlank()) {
      return List.copyOf(restaurants);
    }

    return restaurants.stream().filter(restaurant -> restaurant.category().equals(category)).toList();
  }

  public RestaurantResponse findById(Long id) {
    return restaurants.stream().filter(restaurant -> restaurant.id().equals(id)).findFirst()
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "음식점을 찾을 수 없습니다."));
  }

  public RestaurantResponse create(RestaurantCreateRequest request) {
    var restaurant = new RestaurantResponse(
        nextId.getAndIncrement(),
        request.name(),
        request.address(),
        request.category());

    restaurants.add(restaurant);

    return restaurant;
  }

}
