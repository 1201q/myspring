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
  void 사용설명과_재생응답_및_입력예시를_문서화한다() throws Exception {
    mockMvc.perform(get("/v3/api-docs"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.info.title").value("인허가 지도 API"))
        .andExpect(jsonPath("$.info.description").value(
            org.hamcrest.Matchers.containsString("binaryUrl")))
        .andExpect(jsonPath("$.paths['/api/v1/map/categories'].get.summary")
            .value("지도 지원 업종 목록 조회"))
        .andExpect(jsonPath("$.paths['/api/v1/map/playback/national/{region}/manifest.json'].get.responses['503']").exists())
        .andExpect(jsonPath("$.paths['/api/v1/map/playback/national/{region}/manifest.json'].get.responses['200'].content['application/json'].schema['$ref']").exists())
        .andExpect(jsonPath("$.components.schemas.NationalPlaybackManifest.properties.regionId").exists())
        .andExpect(jsonPath("$.components.schemas.SeoulPlaybackManifest").exists())
        .andExpect(jsonPath("$.paths['/api/v1/map/playback/national/{region}/events.bin'].get.responses['200'].content['application/octet-stream'].schema.format")
            .value("binary"))
        .andExpect(jsonPath("$.components.schemas.RestaurantCreateRequest.properties.name.example")
            .value("겨울식당"))
        .andExpect(jsonPath("$.paths['/api/restaurants'].get.parameters[?(@.name == 'page')]")
            .isNotEmpty());
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
