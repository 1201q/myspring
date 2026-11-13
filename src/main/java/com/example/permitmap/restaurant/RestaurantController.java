package com.example.permitmap.restaurant;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.media.Content;

import com.example.permitmap.restaurant.dto.RestaurantCreateRequest;
import com.example.permitmap.restaurant.dto.RestaurantPageResponse;
import com.example.permitmap.restaurant.dto.RestaurantResponse;
import com.example.permitmap.restaurant.dto.RestaurantUpdateRequest;
import jakarta.validation.Valid;
import java.net.URI;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "학습용 음식점", description = "별도 restaurants 테이블의 CRUD 예제. 전국 지도 원천 자료와 연결되지 않습니다.")
@RestController
@RequestMapping("/api/restaurants")
public class RestaurantController {

  private final RestaurantService restaurantService;

  public RestaurantController(RestaurantService restaurantService) {
    this.restaurantService = restaurantService;
  }

  @Operation(summary = "음식점 목록 및 카테고리 검색", description = "카테고리 생략 시 전체 목록. 페이지는 0부터, 기본 크기는 10, 기본 정렬은 id입니다.")
  @GetMapping
  public RestaurantPageResponse getRestaurants(
      @Parameter(description = "검색할 카테고리", example = "한식") @RequestParam(name = "category", required = false) String category,
      @org.springdoc.core.annotations.ParameterObject
      @PageableDefault(size = 10, sort = "id") Pageable pageable) {

    return restaurantService.findAll(category, pageable);
  }

  @Operation(summary = "음식점 등록", description = "이름, 주소, 카테고리는 공백일 수 없습니다. 성공 시 생성된 음식점과 Location 헤더를 반환합니다.")
  @ApiResponse(responseCode = "201", description = "등록 완료")
  @ApiResponse(responseCode = "400", description = "필수 입력값 누락 또는 공백", content = @Content)
  @PostMapping
  public ResponseEntity<RestaurantResponse> createRestaurant(
      @Valid @RequestBody RestaurantCreateRequest request) {
    var restaurant = restaurantService.create(request);

    return ResponseEntity.created(URI.create("/api/restaurants/" + restaurant.id()))
        .body(restaurant);
  }

  @Operation(summary = "음식점 수정", description = "이름, 주소, 카테고리를 모두 전달해 실제 DB 데이터를 수정합니다.")
  @ApiResponse(responseCode = "400", description = "필수 입력값 누락 또는 공백", content = @Content)
  @ApiResponse(responseCode = "404", description = "음식점 없음", content = @Content)
  @PutMapping("/{id}")
  public RestaurantResponse updateRestaurant(
      @Parameter(description = "학습용 음식점 ID", example = "1") @PathVariable("id") Long id, @Valid @RequestBody RestaurantUpdateRequest request) {
    return restaurantService.update(id, request);
  }

  @Operation(summary = "음식점 상세 조회", description = "목록 또는 등록 응답에서 받은 ID로 조회합니다.")
  @ApiResponse(responseCode = "404", description = "음식점 없음", content = @Content)
  @GetMapping("/{id}")
  public RestaurantResponse getRestaurant(@Parameter(description = "학습용 음식점 ID", example = "1") @PathVariable("id") Long id) {
    return restaurantService.findById(id);
  }

  @Operation(summary = "음식점 삭제", description = "DB의 음식점을 실제로 삭제합니다. 성공 시 응답 본문이 없습니다.")
  @ApiResponse(responseCode = "204", description = "삭제 완료", content = @Content)
  @ApiResponse(responseCode = "404", description = "음식점 없음", content = @Content)
  @DeleteMapping("/{id}")
  public ResponseEntity<Void> deleteRestaurant(@Parameter(description = "학습용 음식점 ID", example = "1") @PathVariable("id") Long id) {
    restaurantService.delete(id);

    return ResponseEntity.noContent().build();
  }
}
