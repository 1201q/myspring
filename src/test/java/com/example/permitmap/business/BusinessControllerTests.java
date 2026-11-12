package com.example.permitmap.business;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.example.permitmap.ingestion.SeoulRestaurantRow;
import com.example.permitmap.ingestion.SeoulRestaurantValidator;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.context.WebApplicationContext;

@SpringBootTest
@Transactional
class BusinessControllerTests {

  @Autowired private WebApplicationContext context;

  @Autowired private PermitBusinessRepository repository;

  private MockMvc mockMvc;
  private Long closedId;
  private Long activeId;

  @BeforeEach
  void setUp() {
    mockMvc = MockMvcBuilders.webAppContextSetup(context).build();
    closedId = save("closed", "과거식당", "2020-01-01", "2021-01-01", "187383").getId();
    activeId = save("active", "영업식당", "2021-01-01", "", "").getId();
    save("future", "이후식당", "2022-01-01", "", "187384");
  }

  @Test
  void 적재_사업장을_ID_순으로_페이지_조회한다() throws Exception {
    mockMvc
        .perform(get("/api/v1/businesses").param("size", "2"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(2))
        .andExpect(jsonPath("$.items[0].id").value(closedId))
        .andExpect(jsonPath("$.items[0].coordinateStatus").value("CONVERTED"))
        .andExpect(jsonPath("$.items[1].coordinateStatus").value("MISSING"))
        .andExpect(jsonPath("$.totalElements").value(3))
        .andExpect(jsonPath("$.totalPages").value(2))
        .andExpect(jsonPath("$.statusBasis").value("SOURCE_SNAPSHOT"));

    mockMvc
        .perform(get("/api/v1/businesses").param("page", "1").param("size", "2"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items.length()").value(1))
        .andExpect(jsonPath("$.items[0].name").value("이후식당"));
  }

  @Test
  void 인허가일_당일부터_포함하고_폐업일_당일부터_제외한다() throws Exception {
    mockMvc
        .perform(get("/api/v1/businesses").param("date", "2019-12-31"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(0));

    mockMvc
        .perform(get("/api/v1/businesses").param("date", "2020-01-01"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(closedId))
        .andExpect(jsonPath("$.totalElements").value(1))
        .andExpect(jsonPath("$.statusBasis").value("DATE_INFERRED"))
        .andExpect(jsonPath("$.date").value("2020-01-01"))
        .andExpect(jsonPath("$.items[0].rawStatusCode").value("03"));

    mockMvc
        .perform(get("/api/v1/businesses").param("date", "2020-12-31"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(closedId));

    mockMvc
        .perform(get("/api/v1/businesses").param("date", "2021-01-01"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(1))
        .andExpect(jsonPath("$.items[0].id").value(activeId));
  }

  @Test
  void 상세에_출처와_좌표계를_포함하고_원문_JSON은_노출하지_않는다() throws Exception {
    mockMvc
        .perform(get("/api/v1/businesses/{id}", closedId))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("과거식당"))
        .andExpect(jsonPath("$.permittedAt").value("2020-01-01"))
        .andExpect(jsonPath("$.closedAt").value("2021-01-01"))
        .andExpect(jsonPath("$.coordinates.epsg").value(5174))
        .andExpect(jsonPath("$.coordinates.x").value(187383))
        .andExpect(jsonPath("$.longitude").isNumber())
        .andExpect(jsonPath("$.latitude").isNumber())
        .andExpect(jsonPath("$.coordinateStatus").value("CONVERTED"))
        .andExpect(jsonPath("$.sourceDataset").value("seoul:OA-18668"))
        .andExpect(
            jsonPath("$.sourceUrl")
                .value("https://data.seoul.go.kr/dataList/OA-18668/S/1/datasetView.do"))
        .andExpect(jsonPath("$.lastImportedAt").isNotEmpty())
        .andExpect(jsonPath("$.sourceJson").doesNotExist())
        .andExpect(jsonPath("$.issuesJson").doesNotExist());
  }

  @Test
  void 좌표가_없어도_상세_조회할_수_있다() throws Exception {
    mockMvc
        .perform(get("/api/v1/businesses/{id}", activeId))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.name").value("영업식당"))
        .andExpect(jsonPath("$.coordinates").isEmpty())
        .andExpect(jsonPath("$.longitude").isEmpty())
        .andExpect(jsonPath("$.latitude").isEmpty())
        .andExpect(jsonPath("$.coordinateStatus").value("MISSING"));
  }

  @Test
  void 없는_ID는_공통_404_응답을_반환한다() throws Exception {
    mockMvc
        .perform(get("/api/v1/businesses/-1"))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.code").value("BUSINESS_NOT_FOUND"));
  }

  @Test
  void 페이지_범위와_형식이_잘못되면_400을_반환한다() throws Exception {
    for (var query :
        new String[] {"page=-1", "size=0", "size=101", "page=abc", "size=999999999999"}) {
      mockMvc
          .perform(get("/api/v1/businesses?" + query))
          .andExpect(status().isBadRequest())
          .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
    }
  }

  @Test
  void 잘못된_날짜나_ID는_400을_반환한다() throws Exception {
    mockMvc
        .perform(get("/api/v1/businesses").param("date", "2023-02-29"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
    mockMvc
        .perform(get("/api/v1/businesses/abc"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.code").value("INVALID_QUERY"));
  }

  private PermitBusiness save(String id, String name, String permitted, String closed, String x) {
    var source =
        new SeoulRestaurantRow(
            "3160000",
            id,
            name,
            permitted,
            closed,
            closed.isEmpty() ? "01" : "03",
            null,
            null,
            null,
            "서울 구로구",
            null,
            "한식",
            x,
            "444494",
            null,
            null,
            null);
    var row = new SeoulRestaurantValidator().validate(List.of(source)).rows().getFirst();
    return repository.saveAndFlush(new PermitBusiness("seoul:OA-18668", row, "{}", "[]"));
  }
}
