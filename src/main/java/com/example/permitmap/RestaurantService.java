package com.example.permitmap;

import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
        .orElseThrow(RestaurantNotFoundException::new);
  }

  @Transactional
  public RestaurantResponse create(RestaurantCreateRequest request) {
    var restaurant = new Restaurant(
        request.name(),
        request.address(),
        request.category());

    return toResponse(restaurantRepository.save(restaurant));
  }

  @Transactional
  public RestaurantResponse update(Long id, RestaurantUpdateRequest request) {
    var restaurant = restaurantRepository.findById(id)
        .orElseThrow(RestaurantNotFoundException::new);

    // save를 호출하지 않음.
    // 트랙잭션 안에서 jpa가 update sql를 자동실행함.
    restaurant.update(request.name(), request.address(), request.category());

    return toResponse(restaurant);
  }

  @Transactional
  public void delete(Long id) {
    var restaurant = restaurantRepository.findById(id)
        .orElseThrow(RestaurantNotFoundException::new);

    restaurantRepository.delete(restaurant);
  }

  private RestaurantResponse toResponse(Restaurant restaurant) {
    return new RestaurantResponse(restaurant.getId(), restaurant.getName(),
        restaurant.getAddress(), restaurant.getCategory());
  }

}
