package com.example.permitmap;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

public class RestaurantControllerTests {

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    var service = new RestaurantService();
    var controller = new RestaurantController(service);

    mockMvc = MockMvcBuilders.standaloneSetup(controller).build();
  }

  @Test
  void 음식점_목록을_반환한다() throws Exception {
    mockMvc.perform(get("/api/restaurants"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(3));
  }

  @Test
  void 카테고리로_검색한다() throws Exception {
    mockMvc.perform(get("/api/restaurants")
        .param("category", "한식"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$[0].name").value("봄식당"))
        .andExpect(jsonPath("$.length()").value(1));
  }

  @Test
  void 없는_음식점을_조회하면_404를_반환한다() throws Exception {
    mockMvc.perform(get("/api/restaurants/999"))
        .andExpect(status().isNotFound());
  }

  @Test
  void 음식점을_등록하고_다시_조회한다() throws Exception {
    String requestBody = """
        {
            "name": "겨울식당",
            "address": "서울특별시 성동구",
            "category": "한식"
        }
        """;

    mockMvc.perform(post("/api/restaurants")
        .contentType(MediaType.APPLICATION_JSON)
        .characterEncoding("UTF-8")
        .content(requestBody))
        .andExpect(status().isCreated())
        .andExpect(header().string(
            "Location", "/api/restaurants/4"))
        .andExpect(jsonPath("$.id").value(4))
        .andExpect(jsonPath("$.name").value("겨울식당"));

    mockMvc.perform(get("/api/restaurants/4"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("겨울식당"));
  }

  @Test
  void 이름이_공백이면_등록을_거절한다() throws Exception {
    String requestBody = """
        {
            "name": " ",
            "address": "서울특별시 성동구",
            "category": "한식"
        }
        """;

    mockMvc.perform(post("/api/restaurants")
        .contentType(MediaType.APPLICATION_JSON)
        .characterEncoding("UTF-8")
        .content(requestBody))
        .andExpect(status().isBadRequest());

    mockMvc.perform(get("/api/restaurants"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.length()").value(3));
  }
}
