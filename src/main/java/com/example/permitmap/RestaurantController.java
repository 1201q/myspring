package com.example.permitmap;

import java.net.URI;
import java.util.List;

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
