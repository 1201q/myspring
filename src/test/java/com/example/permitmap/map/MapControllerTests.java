package com.example.permitmap.map;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

class MapControllerTests {
    @Test
    void validates_tile_coordinates_and_categories_before_database_access() throws Exception {
        var jdbc=mock(JdbcTemplate.class);
        var mvc=MockMvcBuilders.standaloneSetup(new MapController(new MapQueryService(jdbc))).build();
        for(String path:List.of("5/0/0","17/0/0","6/-1/0","6/64/0","6/0/64"))
            mvc.perform(get("/api/v1/map/tiles/"+path+".pbf")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/map/tiles/13/6985/3170.pbf").param("category","unknown"))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(jdbc);
    }

    @Test
    void returns_binary_tiles_with_cache_headers_and_independent_detail() throws Exception {
        var service=mock(MapQueryService.class);
        byte[] tile={26,0};
        var date=LocalDate.of(2024,1,1);
        when(service.tile(13,6985,3170,"pharmacies",date)).thenReturn(tile);
        var mvc=MockMvcBuilders.standaloneSetup(new MapController(service)).build();
        mvc.perform(get("/api/v1/map/tiles/13/6985/3170.pbf").param("category","pharmacies").param("date","2024-01-01"))
            .andExpect(status().isOk()).andExpect(content().contentType("application/vnd.mapbox-vector-tile"))
            .andExpect(header().string("Cache-Control","max-age=300")).andExpect(content().bytes(tile));
        when(service.detail(10)).thenReturn(new MapQueryService.Item(10,"pharmacies","봄약국",null,null,null,date,null,126.88,37.49,"CONVERTED",null));
        mvc.perform(get("/api/v1/map/businesses/10")).andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(10)).andExpect(jsonPath("$.name").value("봄약국"));
    }

    @Test
    void rejects_world_requests_non_finite_coordinates_and_unverified_categories_before_database_access() throws Exception {
        var jdbc=mock(JdbcTemplate.class);
        var service=new MapQueryService(jdbc);
        var mvc=MockMvcBuilders.standaloneSetup(new MapController(service)).build();
        for(String bbox:List.of("-180,-90,180,90","NaN,37,127,38","127,37,126,38","126,37,127","126,37,127,Infinity"))
            mvc.perform(get("/api/v1/map/businesses").param("bbox",bbox)).andExpect(status().isBadRequest());
        assertThrows(ResponseStatusException.class,() -> service.find("126.8,37.4,127,37.6","lumber_import_distribution",null,500));
        assertThrows(ResponseStatusException.class,() -> service.find("126.8,37.4,127,37.6",null,null,501));
        verifyNoInteractions(jdbc);
        mvc.perform(get("/api/v1/map/categories")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(15));
    }

    @Test
    void returns_bounded_points_and_a_truncation_flag_without_total_count() throws Exception {
        var service=mock(MapQueryService.class);
        var date=LocalDate.of(2024,1,1);
        var item=new MapQueryService.Item(10,"general_restaurants","봄식당","한식","서울",null,date,null,126.88,37.49,"CONVERTED",null);
        when(service.find("126.8,37.4,127,37.6","general_restaurants",date,1)).thenReturn(new MapQueryService.Result(List.of(item),1,true,date,"LATEST_KNOWN_SOURCE"));
        MockMvcBuilders.standaloneSetup(new MapController(service)).build()
            .perform(get("/api/v1/map/businesses").param("bbox","126.8,37.4,127,37.6").param("category","general_restaurants").param("date","2024-01-01").param("limit","1"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].name").value("봄식당"))
            .andExpect(jsonPath("$.items[0].longitude").value(126.88)).andExpect(jsonPath("$.truncated").value(true))
            .andExpect(jsonPath("$.totalElements").doesNotExist());
    }
}
