package com.example.permitmap;

import java.net.URI;
import java.util.List;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import jakarta.validation.Valid;

@RestController
public class RestaurantController {

  private final RestaurantService restaurantService;

  public RestaurantController(RestaurantService restaurantService) {
    this.restaurantService = restaurantService;
  }

  @GetMapping("/api/restaurants")
  public List<RestaurantResponse> getRestaurants(
      @RequestParam(name = "category", required = false) String category) {
    return restaurantService.findAll(category);
  }

  @PostMapping("/api/restaurants")
  public ResponseEntity<RestaurantResponse> createRestaurant(
      @Valid @RequestBody RestaurantCreateRequest request) {
    var restaurant = restaurantService.create(request);

    return ResponseEntity.created(URI.create("/api/restaurants/" + restaurant.id())).body(restaurant);
  }

  @GetMapping("/api/restaurants/{id}")
  public RestaurantResponse getRestaurant(@PathVariable("id") Long id) {
    return restaurantService.findById(id);
  }

}
