package com.example.permitmap;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

//  JpaRepository<Restaurant, Long>  Restaurant 타입 관리하고, id 타입은 Long입니다.
public interface RestaurantRepository extends JpaRepository<Restaurant, Long> {
  List<Restaurant> findByCategory(String category);
}