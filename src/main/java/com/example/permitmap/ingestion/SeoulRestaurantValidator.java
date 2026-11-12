package com.example.permitmap.ingestion;

import static com.example.permitmap.ingestion.RestaurantValidationReport.Code.*;
import static com.example.permitmap.ingestion.RestaurantValidationReport.Severity.*;

import com.example.permitmap.ingestion.RestaurantValidationReport.Issue;
import com.example.permitmap.ingestion.RestaurantValidationReport.RowResult;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.stereotype.Component;

@Component
public class SeoulRestaurantValidator {

  public RestaurantValidationReport validate(List<SeoulRestaurantRow> rows) {
    Objects.requireNonNull(rows, "rows");
    Map<String, Integer> frequencies = new HashMap<>();
    for (var row : rows) {
      if (row != null && !blank(row.managementNumber())) {
        frequencies.merge(row.managementNumber().strip(), 1, Integer::sum);
      }
    }

    var results = new ArrayList<RowResult>();
    for (int i = 0; i < rows.size(); i++) {
      results.add(validateRow(i + 1, rows.get(i), frequencies));
    }
    return new RestaurantValidationReport(results);
  }

  private RowResult validateRow(
      int number, SeoulRestaurantRow row, Map<String, Integer> frequencies) {
    var issues = new ArrayList<Issue>();
    if (row == null) {
      issues.add(new Issue(ERROR, NULL_ROW, "row"));
      return new RowResult(number, null, null, null, null, null, issues);
    }

    required(row.municipalityCode(), "OPNSFTEAMCODE", issues);
    required(row.managementNumber(), "MGTNO", issues);
    required(row.businessName(), "BPLCNM", issues);
    if (!blank(row.managementNumber()) && frequencies.get(row.managementNumber().strip()) > 1) {
      // 첫 행을 임의로 선택하지 않고 중복된 모든 행을 오류로 남긴다.
      issues.add(new Issue(ERROR, DUPLICATE_MANAGEMENT_NUMBER, "MGTNO"));
    }

    var permittedAt = date(row.permittedAt(), "APVPERMYMD", true, issues);
    var closedAt = date(row.closedAt(), "DCBYMD", false, issues);
    if (permittedAt != null && closedAt != null && closedAt.isBefore(permittedAt)) {
      issues.add(new Issue(ERROR, CLOSED_BEFORE_PERMITTED, "DCBYMD"));
    }

    BigDecimal x = null;
    BigDecimal y = null;
    if (blank(row.x()) || blank(row.y())) {
      issues.add(new Issue(WARNING, MISSING_COORDINATE, "X,Y"));
    } else {
      try {
        x = new BigDecimal(row.x().strip());
        y = new BigDecimal(row.y().strip());
        if (x.signum() == 0 && y.signum() == 0) {
          issues.add(new Issue(WARNING, ZERO_COORDINATE, "X,Y"));
          x = null;
          y = null;
        }
      } catch (NumberFormatException exception) {
        issues.add(new Issue(WARNING, INVALID_COORDINATE, "X,Y"));
        x = null;
        y = null;
      }
    }
    return new RowResult(number, row, permittedAt, closedAt, x, y, issues);
  }

  private LocalDate date(String value, String field, boolean required, List<Issue> issues) {
    if (blank(value)) {
      if (required) {
        issues.add(new Issue(ERROR, REQUIRED_FIELD, field));
      }
      return null;
    }
    try {
      var text = value.strip();
      if (!text.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) {
        throw new DateTimeParseException("Expected yyyy-MM-dd", text, 0);
      }
      return LocalDate.parse(text);
    } catch (DateTimeParseException exception) {
      issues.add(new Issue(ERROR, INVALID_DATE, field));
      return null;
    }
  }

  private void required(String value, String field, List<Issue> issues) {
    if (blank(value)) {
      issues.add(new Issue(ERROR, REQUIRED_FIELD, field));
    }
  }

  private boolean blank(String value) {
    return value == null || value.isBlank();
  }
}
