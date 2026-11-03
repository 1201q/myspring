package com.example.permitmap.ingestion;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record RestaurantValidationReport(List<RowResult> rows) {

    public RestaurantValidationReport {
        rows = List.copyOf(rows);
    }

    public long acceptedCount() {
        return rows.stream().filter(RowResult::accepted).count();
    }

    public long rejectedCount() {
        return rows.size() - acceptedCount();
    }

    public long acceptedWithCoordinatesCount() {
        return rows.stream().filter(RowResult::accepted)
            .filter(RowResult::hasCoordinates).count();
    }

    public long acceptedWithoutCoordinatesCount() {
        return acceptedCount() - acceptedWithCoordinatesCount();
    }

    public enum Severity { ERROR, WARNING }

    public enum Code {
        NULL_ROW, REQUIRED_FIELD, INVALID_DATE, CLOSED_BEFORE_PERMITTED,
        DUPLICATE_MANAGEMENT_NUMBER, MISSING_COORDINATE, INVALID_COORDINATE,
        ZERO_COORDINATE
    }

    public record Issue(Severity severity, Code code, String field) {}

    /** sourceX/Y는 EPSG:5174 좌표이며 지도용 경도/위도가 아니다. */
    public record RowResult(
        int rowNumber,
        SeoulRestaurantRow source,
        LocalDate permittedAt,
        LocalDate closedAt,
        BigDecimal sourceX,
        BigDecimal sourceY,
        List<Issue> issues
    ) {
        public RowResult {
            issues = List.copyOf(issues);
        }

        public boolean accepted() {
            return issues.stream().noneMatch(issue -> issue.severity() == Severity.ERROR);
        }

        public boolean hasCoordinates() {
            return sourceX != null && sourceY != null;
        }
    }
}
