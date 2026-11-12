package com.example.permitmap.ingestion;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/** 서울 Sheet 형식 전용 DTO. 빈 문자열을 포함한 원본 값을 유지한다. */
@JsonIgnoreProperties(ignoreUnknown = true)
public record SeoulRestaurantRow(
    @JsonProperty("OPNSFTEAMCODE") String municipalityCode,
    @JsonProperty("MGTNO") String managementNumber,
    @JsonProperty("BPLCNM") String businessName,
    @JsonProperty("APVPERMYMD") String permittedAt,
    @JsonProperty("DCBYMD") String closedAt,
    @JsonProperty("TRDSTATEGBN") String statusCode,
    @JsonProperty("TRDSTATENM") String statusName,
    @JsonProperty("DTLSTATEGBN") String detailStatusCode,
    @JsonProperty("DTLSTATENM") String detailStatusName,
    @JsonProperty("SITEWHLADDR") String lotAddress,
    @JsonProperty("RDNWHLADDR") String roadAddress,
    @JsonProperty("UPTAENM") String businessType,
    @JsonProperty("X") String x,
    @JsonProperty("Y") String y,
    @JsonProperty("LASTMODTS") String lastModifiedAt,
    @JsonProperty("UPDATEGBN") String updateType,
    @JsonProperty("UPDATEDT") String updatedAt) {}
