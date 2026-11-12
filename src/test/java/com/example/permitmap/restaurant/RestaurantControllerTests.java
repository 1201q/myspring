package com.example.permitmap.restaurant;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest
@Transactional
public class RestaurantControllerTests {

  @Autowired private WebApplicationContext context;

  @Autowired private RestaurantRepository restaurantRepository;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    restaurantRepository.save(new Restaurant("봄식당", "서울특별시 중구", "한식"));
    restaurantRepository.save(new Restaurant("여름식당", "서울특별시 종로구", "일식"));
    restaurantRepository.save(new Restaurant("가을식당", "서울특별시 마포구", "중식"));
    mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
  }

  @Test
  void 음식점_목록을_반환한다() throws Exception {
    mockMvc
        .perform(get("/api/restaurants"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(3));
  }

  @Test
  void 카테고리로_검색한다() throws Exception {
    mockMvc
        .perform(get("/api/restaurants").param("category", "한식"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].name").value("봄식당"))
        .andExpect(jsonPath("$.items.length()").value(1));
  }

  @Test
  void 없는_음식점을_조회하면_404를_반환한다() throws Exception {
    mockMvc
        .perform(get("/api/restaurants/-1"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("RESTAURANT_NOT_FOUND"))
        .andExpect(jsonPath("$.message").value("음식점을 찾을 수 없습니다."));
  }

  @Test
  void 음식점을_등록하고_다시_조회한다() throws Exception {
    String requestBody =
        """
        {
            "name": "겨울식당",
            "address": "서울특별시 성동구",
            "category": "한식"
        }
        """;

    var result =
        mockMvc
            .perform(
                post("/api/restaurants")
                    .contentType(MediaType.APPLICATION_JSON)
                    .characterEncoding("UTF-8")
                    .content(requestBody))
            .andExpect(status().isCreated())
            .andExpect(header().exists("Location"))
            .andExpect(jsonPath("$.id").isNumber())
            .andExpect(jsonPath("$.name").value("겨울식당"))
            .andReturn();

    mockMvc
        .perform(get(result.getResponse().getHeader("Location")))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("겨울식당"));
  }

  @Test
  void 이름이_공백이면_등록을_거절한다() throws Exception {
    String requestBody =
        """
        {
            "name": " ",
            "address": "서울특별시 성동구",
            "category": "한식"
        }
        """;

    mockMvc
        .perform(
            post("/api/restaurants")
                .contentType(MediaType.APPLICATION_JSON)
                .characterEncoding("UTF-8")
                .content(requestBody))
        .andExpect(status().isBadRequest());

    mockMvc
        .perform(get("/api/restaurants"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(3));
  }
}
