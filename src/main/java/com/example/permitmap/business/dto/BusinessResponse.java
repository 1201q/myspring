package com.example.permitmap.business.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;

import com.example.permitmap.business.PermitBusiness;

public record BusinessResponse(
    Long id,
    String managementNumber,
    String name,
    String municipalityCode,
    String businessType,
    String lotAddress,
    String roadAddress,
    LocalDate permittedAt,
    LocalDate closedAt,
    String rawStatusCode,
    String rawDetailStatusCode,
    SourceCoordinates coordinates,
    String sourceDataset,
    String sourceUrl,
    OffsetDateTime lastImportedAt
) {
    public record SourceCoordinates(BigDecimal x, BigDecimal y, Integer epsg) {}

    public static BusinessResponse from(PermitBusiness business) {
        var coordinates = business.getSourceX() != null && business.getSourceY() != null
            ? new SourceCoordinates(business.getSourceX(), business.getSourceY(), business.getSourceCrs())
            : null;
        var sourceUrl = "seoul:OA-18668".equals(business.getSourceDataset())
            ? "https://data.seoul.go.kr/dataList/OA-18668/S/1/datasetView.do" : null;
        return new BusinessResponse(business.getId(), business.getManagementNumber(), business.getName(),
            business.getMunicipalityCode(), business.getBusinessType(), business.getLotAddress(),
            business.getRoadAddress(), business.getPermittedAt(), business.getClosedAt(),
            business.getStatusCode(), business.getDetailStatusCode(), coordinates,
            business.getSourceDataset(), sourceUrl, business.getLastImportedAt());
    }
}
