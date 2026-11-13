package com.example.permitmap;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest
class OpenApiTests {

  @Autowired private WebApplicationContext context;

  private MockMvc mockMvc;

  @BeforeEach
  void setUp() {
    mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
  }

  @Test
  void api문서에_지도와_음식점_API가_포함된다() throws Exception {
    mockMvc.perform(get("/v3/api-docs"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.openapi").exists())
        .andExpect(jsonPath("$.paths['/api/v1/map/categories'].get").exists())
        .andExpect(jsonPath("$.paths['/api/v1/map/businesses/{id}'].get").exists())
        .andExpect(jsonPath("$.paths['/api/v1/map/playback/national/regions'].get").exists())
        .andExpect(jsonPath("$.paths['/api/restaurants'].post").exists());
  }

  @Test
  void swagger화면과_명세설정을_제공한다() throws Exception {
    mockMvc.perform(get("/swagger-ui/index.html"))
        .andExpect(status().isOk())
        .andExpect(content().string(org.hamcrest.Matchers.containsString("Swagger UI")));
    mockMvc.perform(get("/v3/api-docs/swagger-config"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.url").value("/v3/api-docs"));
  }
}
