package com.example.permitmap.restaurant;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

//  JpaRepository<Restaurant, Long>  Restaurant 타입 관리하고, id 타입은 Long입니다.
public interface RestaurantRepository extends JpaRepository<Restaurant, Long> {
  // Pageable은 페이지 번호, 크기,정렬 조건. Page는 조회 결과와 전체 건수를 담습니다.
  Page<Restaurant> findByCategory(
      String category,
      Pageable pageable);

}