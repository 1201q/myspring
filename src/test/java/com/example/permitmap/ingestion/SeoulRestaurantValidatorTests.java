package com.example.permitmap.ingestion;

import static com.example.permitmap.ingestion.RestaurantValidationReport.Code.*;
import static org.junit.jupiter.api.Assertions.*;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;

import org.junit.jupiter.api.Test;

class SeoulRestaurantValidatorTests {

    private final SeoulRestaurantValidator validator = new SeoulRestaurantValidator();

    @Test
    void 정상_행의_날짜와_좌표를_변환하고_원문을_보존한다() {
        var source = row("id-1", "테스트식당", "2024-02-29", "", "187383.887301783", "444494.697447518");
        var report = validator.validate(List.of(source));
        var result = report.rows().getFirst();

        assertEquals(1, report.acceptedCount());
        assertEquals(LocalDate.of(2024, 2, 29), result.permittedAt());
        assertNull(result.closedAt());
        assertEquals("187383.887301783", result.sourceX().toPlainString());
        assertSame(source, result.source());
        assertEquals("01", result.source().statusCode());
        assertEquals("", result.source().closedAt());
    }

    @Test
    void 존재하지_않는_날짜와_전국_API_날짜형식을_거절한다() {
        var report = validator.validate(List.of(
                row("id-1", "식당", "2023-02-29", "", "1", "2"),
                row("id-2", "식당", "20240101", "", "1", "2"),
                row("id-3", "식당", "2024-01-01", "2024-02-30", "1", "2")));

        assertEquals(3, report.rejectedCount());
        assertTrue(report.rows().stream().allMatch(result -> has(result, INVALID_DATE)));
    }

    @Test
    void 필수값이_없는_행은_거절하고_나머지_행은_계속_검증한다() {
        var report = validator.validate(List.of(
                row(" ", "", null, "", "1", "2"),
                row("id-2", "정상식당", "2024-01-01", "", "1", "2")));

        assertEquals(1, report.rejectedCount());
        assertEquals(1, report.acceptedCount());
        assertEquals(3, report.rows().getFirst().issues().size());
        assertEquals(2, report.rows().get(1).rowNumber());
    }

    @Test
    void 폐업일이_인허가일보다_빠르면_거절한다() {
        var report = validator.validate(List.of(
                row("id-1", "식당", "2024-03-01", "2024-02-29", "1", "2")));
        assertTrue(has(report.rows().getFirst(), CLOSED_BEFORE_PERMITTED));
        assertEquals(1, report.rejectedCount());
    }

    @Test
    void 관리번호가_중복되면_모든_중복행에_오류를_남긴다() {
        var report = validator.validate(List.of(
                row("same-id", "첫식당", "2024-01-01", "", "1", "2"),
                row(" same-id ", "다른식당", "2024-01-01", "", "1", "2")));
        assertEquals(2, report.rejectedCount());
        assertTrue(report.rows().stream().allMatch(result -> has(result, DUPLICATE_MANAGEMENT_NUMBER)));
    }

    @Test
    void 좌표_누락과_숫자오류는_사업장을_거절하지_않고_좌표만_제외한다() {
        var report = validator.validate(List.of(
                row("id-1", "식당", "2024-01-01", "", "", "2"),
                row("id-2", "식당", "2024-01-01", "", "NaN", "2"),
                row("id-3", "식당", "2024-01-01", "", "0", "0")));

        assertEquals(3, report.acceptedCount());
        assertEquals(3, report.acceptedWithoutCoordinatesCount());
        assertTrue(has(report.rows().get(0), MISSING_COORDINATE));
        assertTrue(has(report.rows().get(1), INVALID_COORDINATE));
        assertTrue(has(report.rows().get(2), ZERO_COORDINATE));
        assertTrue(report.rows().stream().allMatch(result -> result.sourceX() == null && result.sourceY() == null));
    }

    @Test
    void 빈_배열은_빈_결과이며_null_행은_오류로_집계한다() {
        assertEquals(0, validator.validate(List.of()).rows().size());
        var report = validator.validate(Arrays.asList((SeoulRestaurantRow) null));
        assertEquals(1, report.rejectedCount());
        assertTrue(has(report.rows().getFirst(), NULL_ROW));
    }

    private boolean has(RestaurantValidationReport.RowResult row, RestaurantValidationReport.Code code) {
        return row.issues().stream().anyMatch(issue -> issue.code() == code);
    }

    private SeoulRestaurantRow row(String id, String name, String permitted, String closed, String x, String y) {
        return new SeoulRestaurantRow("3160000", id, name, permitted, closed,
                "01", "영업/정상", "01", "영업", "서울 구로구", "", "한식", x, y,
                "2024-01-01 00:00:00", "I", "2024-01-02 00:00:00");
    }
}
