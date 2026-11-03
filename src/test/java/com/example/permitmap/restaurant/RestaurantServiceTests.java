package com.example.permitmap.restaurant;

import com.example.permitmap.restaurant.dto.RestaurantCreateRequest;
import com.example.permitmap.restaurant.dto.RestaurantUpdateRequest;
import com.example.permitmap.restaurant.exception.RestaurantNotFoundException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.annotation.Transactional;
import jakarta.persistence.EntityManager;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

@SpringBootTest
@Transactional
public class RestaurantServiceTests {

  @Autowired
  private RestaurantService restaurantService;

  @Autowired
  private RestaurantRepository restaurantRepository;

  @Autowired
  private EntityManager entityManager;

  private Long summerRestaurantId;

  @BeforeEach
  void setUp() {
    restaurantRepository.save(new Restaurant("봄식당", "서울특별시 중구", "한식"));
    summerRestaurantId = restaurantRepository.save(
        new Restaurant("여름식당", "서울특별시 종로구", "일식")).getId();
    restaurantRepository.save(new Restaurant("가을식당", "서울특별시 마포구", "중식"));
  }

  @Test
  void 카테고리가_없으면_전체_음식점을_반환한다() {
    var result = restaurantService
        .findAll(null, PageRequest.of(0, 10))
        .items();

    assertEquals(3, result.size());
  }

  @Test
  void 한식으로_검색하면_한식_음식점만_반환한다() {
    var result = restaurantService
        .findAll("한식", PageRequest.of(0, 10))
        .items();

    assertEquals(1, result.size());
    assertEquals("봄식당", result.getFirst().name());
    assertEquals("한식", result.getFirst().category());
  }

  @Test
  void 일치하는_카테고리가_없으면_빈_목록을_반환한다() {
    var result = restaurantService
        .findAll("양식", PageRequest.of(0, 10))
        .items();

    assertTrue(result.isEmpty());
  }

  @Test
  void ID로_음식점을_조회한다() {
    var result = restaurantService.findById(summerRestaurantId);

    assertEquals("여름식당", result.name());
  }

  @Test
  void 없는_ID를_조회하면_404_예외가_발생한다() {
    var exception = assertThrows(RestaurantNotFoundException.class, () -> restaurantService.findById(-1L));

    assertEquals("음식점을 찾을 수 없습니다.", exception.getMessage());
  }

  @Test
  void 등록한_음식점을_DB에서_다시_조회한다() {
    var saved = restaurantService.create(
        new RestaurantCreateRequest("겨울식당", "서울특별시 성동구", "한식"));

    entityManager.flush();
    entityManager.clear();

    var result = restaurantService.findById(saved.id());
    assertEquals(saved.id(), result.id());
    assertEquals("겨울식당", result.name());
    assertEquals(4, restaurantRepository.count());
  }

  @Test
  void 삭제한_음식점은_조회할_수_없다() {
    var saved = restaurantService.create(
        new RestaurantCreateRequest(
            "삭제할식당", "서울특별시 중구", "한식"));

    restaurantService.delete(saved.id());

    // DB에 삭제 SQL을 반영하고, JPA가 관리하던 객체를 비웁니다.
    entityManager.flush();
    entityManager.clear();

    var exception = assertThrows(RestaurantNotFoundException.class, () -> restaurantService.findById(saved.id()));

    assertEquals("음식점을 찾을 수 없습니다.", exception.getMessage());
  }

  @Test
  void 음식점을_두_개씩_나누어_조회한다() {
    var sort = Sort.by("id").ascending();

    var firstPage = restaurantService.findAll(
        null, PageRequest.of(0, 2, sort));

    var secondPage = restaurantService.findAll(
        null, PageRequest.of(1, 2, sort));

    assertEquals(2, firstPage.items().size());
    assertEquals(0, firstPage.page());
    assertEquals(2, firstPage.size());
    assertEquals(3L, firstPage.totalElements());
    assertEquals(2, firstPage.totalPages());

    assertEquals("봄식당", firstPage.items().get(0).name());
    assertEquals("여름식당", firstPage.items().get(1).name());

    assertEquals(1, secondPage.items().size());
    assertEquals(1, secondPage.page());
    assertEquals("가을식당", secondPage.items().getFirst().name());
  }

  @Test
  void 마지막_페이지를_넘으면_빈_목록을_반환한다() {
    var result = restaurantService.findAll(
        null, PageRequest.of(10, 2, Sort.by("id")));

    assertTrue(result.items().isEmpty());
    assertEquals(3L, result.totalElements());
    assertEquals(2, result.totalPages());
  }

  @Test
  void 수정한_음식점_정보가_DB에_반영된다() {
    var request = new RestaurantUpdateRequest(
        "새여름식당",
        "서울특별시 강남구",
        "한식");

    restaurantService.update(summerRestaurantId, request);

    // 변경 사항을 DB에 반영합니다.
    entityManager.flush();

    // JPA가 메모리에서 관리하던 객체를 비웁니다.
    entityManager.clear();

    var result = restaurantService.findById(summerRestaurantId);

    assertEquals(summerRestaurantId, result.id());
    assertEquals("새여름식당", result.name());
    assertEquals("서울특별시 강남구", result.address());
    assertEquals("한식", result.category());

    // 수정 과정에서 새 음식점이 추가되지 않았는지도 확인합니다.
    assertEquals(3L, restaurantRepository.count());
  }
}
