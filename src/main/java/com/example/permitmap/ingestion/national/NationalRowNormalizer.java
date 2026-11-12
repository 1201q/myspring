package com.example.permitmap.ingestion.national;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import tools.jackson.databind.json.JsonMapper;

final class NationalRowNormalizer {
  static final List<String> FIELDS =
      List.of(
          "OPN_ATMY_GRP_CD",
          "MNG_NO",
          "BPLC_NM",
          "LCPMT_YMD",
          "CLSBIZ_YMD",
          "SALS_STTS_CD",
          "SALS_STTS_NM",
          "DTL_SALS_STTS_CD",
          "DTL_SALS_STTS_NM",
          "ROAD_NM_ADDR",
          "LOTNO_ADDR",
          "BZSTAT_SE_NM",
          "CRD_INFO_X",
          "CRD_INFO_Y",
          "LAST_MDFCN_PNT",
          "DAT_UPDT_PNT",
          "DAT_UPDT_SE");
  private static final JsonMapper JSON = JsonMapper.builder().build();

  static Object[] normalize(
      NationalCategory category,
      Map<String, String> input,
      LocalDate asOf,
      String run,
      long number) {
    var raw = new TreeMap<String, String>();
    for (var key : FIELDS)
      if (category.fields().containsKey(key))
        raw.put(key, input.get(category.fields().get(key)).strip());
    var org = raw.getOrDefault("OPN_ATMY_GRP_CD", "");
    var management = raw.getOrDefault("MNG_NO", "");
    if (org.isBlank() || management.isBlank())
      throw new IllegalArgumentException("Missing identity at record " + number);
    var issues = new ArrayList<String>();
    var permitted = date(raw.get("LCPMT_YMD"), "PERMITTED", asOf, issues);
    var closed =
        category.closeDateSupported() ? date(raw.get("CLSBIZ_YMD"), "CLOSED", asOf, issues) : null;
    if (!category.closeDateSupported()) issues.add("CLOSE_DATE_NOT_PROVIDED");
    if (closed != null && permitted != null && closed.isBefore(permitted)) {
      issues.add("CLOSED_BEFORE_PERMITTED");
      closed = null;
    }
    if ("폐업".equals(raw.get("SALS_STTS_NM")) && closed == null) issues.add("CLOSED_DATE_UNKNOWN");
    BigDecimal x = null, y = null;
    try {
      x = new BigDecimal(raw.getOrDefault("CRD_INFO_X", ""));
      y = new BigDecimal(raw.getOrDefault("CRD_INFO_Y", ""));
      if (x.precision() - x.scale() > 18
          || y.precision() - y.scale() > 18
          || (x.signum() == 0 && y.signum() == 0)) throw new NumberFormatException();
      x = x.setScale(20, java.math.RoundingMode.HALF_UP);
      y = y.setScale(20, java.math.RoundingMode.HALF_UP);
    } catch (NumberFormatException exception) {
      x = null;
      y = null;
      issues.add("COORDINATE_MISSING_OR_INVALID");
    }
    if (category.declaredCrs() == null) issues.add("CRS_UNVERIFIED");
    var name = raw.getOrDefault("BPLC_NM", "");
    if (name.isBlank()) issues.add("NAME_MISSING");
    var rawJson = JSON.writeValueAsString(raw);
    var issuesJson = JSON.writeValueAsString(issues);
    var hash =
        sha256(
            (rawJson
                    + "|"
                    + permitted
                    + "|"
                    + closed
                    + "|"
                    + category.declaredCrs()
                    + "|"
                    + issuesJson)
                .getBytes(StandardCharsets.UTF_8));
    return new Object[] {
      run,
      number,
      org,
      management,
      name,
      raw.get("LOTNO_ADDR"),
      raw.get("ROAD_NM_ADDR"),
      raw.get("BZSTAT_SE_NM"),
      permitted,
      closed,
      raw.get("SALS_STTS_CD"),
      raw.get("SALS_STTS_NM"),
      raw.get("DTL_SALS_STTS_CD"),
      raw.get("DTL_SALS_STTS_NM"),
      x,
      y,
      category.declaredCrs(),
      rawJson,
      issuesJson,
      hash
    };
  }

  private static LocalDate date(String raw, String field, LocalDate asOf, List<String> issues) {
    if (raw == null || raw.isBlank()) {
      issues.add(field + "_MISSING");
      return null;
    }
    try {
      String text =
          raw.matches("[0-9]{8}")
              ? raw.substring(0, 4) + "-" + raw.substring(4, 6) + "-" + raw.substring(6)
              : raw;
      if (!text.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException();
      var date = LocalDate.parse(text);
      if (date.isAfter(asOf)) {
        issues.add(field + "_FUTURE");
        return null;
      }
      if (date.getYear() < 1950) {
        issues.add(field + "_BEFORE_1950_REVIEW");
        return null;
      }
      return date;
    } catch (IllegalArgumentException | java.time.DateTimeException exception) {
      issues.add(field + "_INVALID");
      return null;
    }
  }

  static String sha256(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (java.security.NoSuchAlgorithmException exception) {
      throw new IllegalStateException(exception);
    }
  }
}
