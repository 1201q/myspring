package com.example.permitmap.restaurant;

import com.example.permitmap.restaurant.dto.RestaurantCreateRequest;
import com.example.permitmap.restaurant.dto.RestaurantPageResponse;
import com.example.permitmap.restaurant.dto.RestaurantResponse;
import com.example.permitmap.restaurant.dto.RestaurantUpdateRequest;

import java.net.URI;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;

@RestController
public class RestaurantController {

  private final RestaurantService restaurantService;

  public RestaurantController(RestaurantService restaurantService) {
    this.restaurantService = restaurantService;
  }

  @GetMapping("/api/restaurants")
  public RestaurantPageResponse getRestaurants(
      @RequestParam(name = "category", required = false) String category,

      @PageableDefault(size = 10, sort = "id") Pageable pageable

  ) {
    return restaurantService.findAll(category, pageable);
  }

  @PostMapping("/api/restaurants")
  public ResponseEntity<RestaurantResponse> createRestaurant(
      @Valid @RequestBody RestaurantCreateRequest request) {
    var restaurant = restaurantService.create(request);

    return ResponseEntity.created(URI.create("/api/restaurants/" + restaurant.id())).body(restaurant);
  }

  @PutMapping("/api/restaurants/{id}")
  public RestaurantResponse updateRestaurant(
      @PathVariable("id") Long id, @Valid @RequestBody RestaurantUpdateRequest request) {
    return restaurantService.update(id, request);
  }

  @GetMapping("/api/restaurants/{id}")
  public RestaurantResponse getRestaurant(@PathVariable("id") Long id) {
    return restaurantService.findById(id);
  }

  @DeleteMapping("/api/restaurants/{id}")
  public ResponseEntity<Void> deleteRestaurant(
      @PathVariable("id") Long id) {
    restaurantService.delete(id);

    return ResponseEntity.noContent().build();
  }

}
