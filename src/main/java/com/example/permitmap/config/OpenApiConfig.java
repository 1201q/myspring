package com.example.permitmap.config;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OpenApiConfig {

  @Bean
  public OpenAPI permitMapOpenApi() {
    return new OpenAPI().info(new Info()
        .title("인허가 지도 API")
        .version("v1")
        .description("""
            ## 현재 지도 화면에서 사용하는 API
            1. `지도 조회`의 업종 목록을 조회합니다.
            2. `전국 시간 재생`의 지역 목록에서 지역 ID를 선택합니다.
            3. 해당 지역의 manifest를 조회하고, 응답의 `binaryUrl`로 재생 파일을 다운로드합니다.
            4. 기간과 업종 필터링은 내려받은 데이터로 브라우저에서 수행합니다.
            5. 사업장을 선택하면 `지도 조회`의 상세 API로 DB 정보를 조회합니다.

            재생 데이터는 DB에서 추출한 바이너리 파일이며 JSON 사업장 목록이 아닙니다.
            manifest가 503을 반환하면 `Retry-After` 초 뒤 다시 요청하세요.
            DB 변경 내용은 재생 파일을 다시 발행해야 지도 재생에 반영됩니다.
            지하철과 행정경계는 프런트엔드의 정적 파일로 제공하므로 이 API 목록에 포함되지 않습니다.

            ## API 구분
            - `지도 조회`: 전국 지도용 DB 조회. 범위 조회와 벡터 타일도 제공합니다.
            - `전국 시간 재생`: 현재 화면의 지역별 재생 데이터 제공.
            - `서울 시간 재생`, `영역별 이벤트`: 별도 조회 경로로 현재 화면에서는 사용하지 않습니다.
            - `샘플 인허가`: permit_businesses의 샘플 자료 조회. 전국 지도 자료와 별개입니다.
            - `학습용 음식점`: 별도 음식점 CRUD 예제입니다.

            ## 사용 기준
            날짜는 `yyyy-MM-dd`, 경도·위도는 WGS84 기준입니다. 페이지 번호는 0부터 시작합니다.
            허가·폐업 날짜로 추정한 상태는 실제 과거 영업 사실을 보증하지 않습니다.
            `Try it out`은 실행 중인 서버로 실제 요청을 보냅니다.
            음식점 등록·수정·삭제는 연결된 DB를 변경합니다.
            """));
  }
}
