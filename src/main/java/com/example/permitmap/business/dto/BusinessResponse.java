package com.example.permitmap.business.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import com.example.permitmap.business.PermitBusiness;
import com.example.permitmap.map.KoreanCoordinateConverter.Conversion;
import com.example.permitmap.map.KoreanCoordinateConverter.Status;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

public record BusinessResponse(
    @Schema(description = "샘플 인허가 식별자. 전국 지도 ID와 별개") Long id,
    @Schema(description = "원천 자료의 관리번호") String managementNumber,
    String name,
    String municipalityCode,
    String businessType,
    String lotAddress,
    String roadAddress,
    @Schema(description = "인허가일. 날짜 기반 조회 시 당일부터 포함") LocalDate permittedAt,
    @Schema(description = "폐업일. 날짜 기반 조회 시 당일부터 제외. 미기록이면 null") LocalDate closedAt,
    String rawStatusCode,
    String rawDetailStatusCode,
    @Schema(description = "원천 X/Y 좌표와 EPSG 번호. 경도·위도와 구별") SourceCoordinates coordinates,
    @Schema(description = "변환된 WGS84 경도. 변환 불가 시 null") Double longitude,
    @Schema(description = "변환된 WGS84 위도. 변환 불가 시 null") Double latitude,
    @Schema(description = "원천 좌표의 변환 결과 상태") Status coordinateStatus,
    String sourceDataset,
    String sourceUrl,
    @Schema(description = "시스템에 마지막으로 적재한 시각") OffsetDateTime lastImportedAt) {
  public static BusinessResponse from(PermitBusiness business, Conversion conversion) {
    var coordinates =
        business.getSourceX() != null && business.getSourceY() != null
            ? new SourceCoordinates(
                business.getSourceX(), business.getSourceY(), business.getSourceCrs())
            : null;
    var sourceUrl =
        "seoul:OA-18668".equals(business.getSourceDataset())
            ? "https://data.seoul.go.kr/dataList/OA-18668/S/1/datasetView.do"
            : null;
    return new BusinessResponse(
        business.getId(),
        business.getManagementNumber(),
        business.getName(),
        business.getMunicipalityCode(),
        business.getBusinessType(),
        business.getLotAddress(),
        business.getRoadAddress(),
        business.getPermittedAt(),
        business.getClosedAt(),
        business.getStatusCode(),
        business.getDetailStatusCode(),
        coordinates,
        conversion.longitude(),
        conversion.latitude(),
        conversion.status(),
        business.getSourceDataset(),
        sourceUrl,
        business.getLastImportedAt());
  }

  public record SourceCoordinates(BigDecimal x, BigDecimal y, Integer epsg) {}
}
