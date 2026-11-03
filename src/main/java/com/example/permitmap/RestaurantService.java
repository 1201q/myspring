package com.example.permitmap;

import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional(readOnly = true)
public class RestaurantService {
  private final RestaurantRepository restaurantRepository;

  public RestaurantService(RestaurantRepository restaurantRepository) {
    this.restaurantRepository = restaurantRepository;
  }

  public List<RestaurantResponse> findAll(String category) {
    if (category == null || category.isBlank()) {
      return restaurantRepository.findAll().stream().map(this::toResponse).toList();
    }

    return restaurantRepository.findByCategory(category).stream().map(this::toResponse).toList();
  }

  public RestaurantResponse findById(Long id) {
    return restaurantRepository.findById(id).map(this::toResponse)
        .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "음식점을 찾을 수 없습니다."));
  }

  @Transactional
  public RestaurantResponse create(RestaurantCreateRequest request) {
    var restaurant = new Restaurant(
        request.name(),
        request.address(),
        request.category());

    return toResponse(restaurantRepository.save(restaurant));
  }

  private RestaurantResponse toResponse(Restaurant restaurant) {
    return new RestaurantResponse(restaurant.getId(), restaurant.getName(),
        restaurant.getAddress(), restaurant.getCategory());
  }

}
