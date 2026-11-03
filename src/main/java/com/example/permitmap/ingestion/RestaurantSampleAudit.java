package com.example.permitmap.ingestion;

import java.nio.file.Path;

/** Spring/DB를 기동하지 않는 로컬 샘플 검증 명령. */
public class RestaurantSampleAudit {

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            throw new IllegalArgumentException("Usage: RestaurantSampleAudit <sample.json>");
        }
        var reader = new SeoulRestaurantSampleReader(new SeoulRestaurantValidator());
        var report = reader.read(Path.of(args[0]));
        System.out.printf("Rows: %d%nAccepted: %d%nRejected: %d%n"
                + "Accepted with source coordinates (EPSG:5174): %d%n"
                + "Accepted without source coordinates: %d%n",
            report.rows().size(), report.acceptedCount(), report.rejectedCount(),
            report.acceptedWithCoordinatesCount(), report.acceptedWithoutCoordinatesCount());
        for (var row : report.rows()) {
            for (var issue : row.issues()) {
                System.out.printf("row=%d severity=%s code=%s field=%s%n",
                    row.rowNumber(), issue.severity(), issue.code(), issue.field());
            }
        }
        if (report.rejectedCount() > 0) {
            throw new IllegalStateException("Sample contains rejected rows; see issue codes above.");
        }
    }
}
