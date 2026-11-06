package com.example.permitmap.ingestion.national;

import static org.junit.jupiter.api.Assertions.*;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.apache.commons.csv.CSVFormat;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import tools.jackson.databind.json.JsonMapper;

@SpringBootTest
class NationalPermitBatchImporterTests {
    @Autowired
    NationalPermitBatchImporter importer;
    @Autowired
    JdbcTemplate jdbc;
    @TempDir
    Path directory;
    final LocalDate snapshot = LocalDate.of(2025, 6, 1);
    final NationalCategory pharmacy = NationalCategory.read(Path.of("docs/data-samples/national/category-catalog.json"),
            "pharmacies");

    @BeforeEach
    void clean() {
        var url = jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<String>)
                connection -> connection.getMetaData().getURL());
        if (!disposableDatabaseUrl(url)) throw new IllegalStateException("Destructive test setup refuses a live database");
        if (url.startsWith("jdbc:postgresql:") && !jdbc.queryForObject("SELECT current_database()", String.class)
                .matches("permit_map_verify_[a-z0-9_]+"))
            throw new IllegalStateException("Actual PostgreSQL database is not disposable");
        jdbc.update("UPDATE permit_import_lock SET owner_run=NULL");
        if (url.startsWith("jdbc:postgresql:")) {
            // All tables are explicitly listed and the disposable DB was verified above.
            jdbc.execute("TRUNCATE permit_event,national_permit,national_permit_version,permit_import_stage,permit_import_run,permit_category RESTART IDENTITY");
            return;
        }
        jdbc.update("DELETE FROM permit_import_stage");
        jdbc.update("DELETE FROM permit_event");
        jdbc.update("UPDATE national_permit SET current_version_id=NULL");
        jdbc.update("DELETE FROM national_permit_version");
        jdbc.update("DELETE FROM national_permit");
        jdbc.update("DELETE FROM permit_import_run");
        jdbc.update("DELETE FROM permit_category");
    }

    static boolean disposableDatabaseUrl(String url) {
        return url != null && (url.startsWith("jdbc:h2:mem:") ||
                url.matches("jdbc:postgresql://127\\.0\\.0\\.1:15432/permit_map_verify_[a-z0-9_]+"));
    }

    @Test
    void composite_identity_and_repeated_file_are_idempotent() throws Exception {
        var file = csv(pharmacy, List.of(row("A", "3000000", "2020-01-01", "2024-01-01"),
                row("A", "3010000", "2020-01-01", "")));
        var first = importer.importCsv(pharmacy, file, snapshot, null, 1);
        assertEquals(2L, jdbc.queryForObject("SELECT COUNT(*) FROM national_permit WHERE last_seen_run_id=?",
                Long.class, first.runId()));
        var again = importer.importCsv(pharmacy, file, snapshot, null, 1);
        assertEquals(2L, jdbc.queryForObject("SELECT COUNT(*) FROM national_permit WHERE last_seen_run_id=?",
                Long.class, again.runId()));
        assertEquals(2, first.inserted());
        assertEquals(2, again.unchanged());
        assertEquals(2, count("national_permit"));
        assertEquals(2, count("national_permit_version"));
        assertEquals(3, count("permit_event"));
        assertEquals(0, count("permit_import_stage"));
    }

    @Test
    void corrected_dates_and_reverted_content_preserve_history() throws Exception {
        importer.importCsv(pharmacy, csv(pharmacy, List.of(row("A", "3000000", "2020-01-01", "2024-01-01"))), snapshot,
                null, 2);
        long id = jdbc.queryForObject("SELECT id FROM national_permit", Long.class);
        var correction = importer.importCsv(pharmacy,
                csv(pharmacy, List.of(row("A", "3000000", "2020-01-01", "2024-02-01"))), snapshot, null, 2);
        assertEquals(1, correction.updated());
        assertEquals("2024-02-01", jdbc.queryForObject(
                "SELECT event_date FROM permit_event e JOIN national_permit p ON p.current_version_id=e.version_id WHERE e.event_type='CLOSE'",
                String.class));
        importer.importCsv(pharmacy, csv(pharmacy, List.of(row("A", "3000000", "2020-01-01", "2024-01-01"))), snapshot,
                null, 2);
        assertEquals(id, jdbc.queryForObject("SELECT id FROM national_permit", Long.class));
        assertEquals(3, count("national_permit_version"));
        assertEquals(6, count("permit_event"));
    }

    @Test
    void publication_failure_rolls_back_live_data_and_same_run_can_resume() throws Exception {
        importer.importCsv(pharmacy, csv(pharmacy, List.of(row("existing", "3000000", "2020-01-01", ""))), snapshot,
                null, 1);
        var blocked = row("new-1", "3000000", "2020-01-01", "");
        blocked.put("BPLC_NM", "BLOCK");
        var input = csv(pharmacy, List.of(blocked, row("new-2", "3000000", "2020-01-01", "")));
        jdbc.execute("ALTER TABLE national_permit_version ADD CONSTRAINT test_publish_failure CHECK(name <> 'BLOCK')");
        try {
            assertThrows(IllegalStateException.class, () -> importer.importCsv(pharmacy, input, snapshot, null, 1));
            assertEquals(1, count("national_permit"));
            assertEquals(1, count("national_permit_version"));
            assertEquals(2, count("permit_import_stage"));
        } finally {
            jdbc.execute("ALTER TABLE national_permit_version DROP CONSTRAINT test_publish_failure");
        }
        var run = jdbc.queryForObject("SELECT id FROM permit_import_run WHERE status='FAILED'", String.class);
        assertEquals(2L,
                jdbc.queryForObject("SELECT processed_rows FROM permit_import_run WHERE id=?", Long.class, run));
        var result = importer.importCsv(pharmacy, input, snapshot, run, 1);
        assertEquals(run, result.runId());
        assertEquals(2, result.inserted());
        assertEquals(3, count("national_permit"));
        assertEquals(0, count("permit_import_stage"));
    }

    @Test
    void duplicate_identity_in_later_chunk_does_not_publish_partial_dataset() throws Exception {
        var row = row("duplicate", "3000000", "2020-01-01", "");
        var input = csv(pharmacy, List.of(row, row));
        assertThrows(IllegalStateException.class, () -> importer.importCsv(pharmacy, input, snapshot, null, 1));
        assertEquals(0, count("national_permit"));
        assertEquals(1, count("permit_import_stage"));
        assertEquals("FAILED", jdbc.queryForObject("SELECT status FROM permit_import_run", String.class));
    }

    @Test
    void missing_close_field_and_unverified_crs_are_preserved_without_invented_close() throws Exception {
        var wood = NationalCategory.read(Path.of("docs/data-samples/national/category-catalog.json"),
                "lumber_import_distribution");
        importer.importCsv(wood, csv(wood, List.of(row("W", "3000000", "2020-01-01", ""))), snapshot, null, 2);
        assertEquals(1, count("permit_event"));
        assertNull(jdbc.queryForObject("SELECT source_crs FROM national_permit_version", Integer.class));
        assertTrue(jdbc.queryForObject("SELECT issues_json FROM national_permit_version", String.class)
                .contains("CLOSE_DATE_NOT_PROVIDED"));
    }

    @Test
    void invalid_future_and_suspicious_dates_are_raw_only() throws Exception {
        var bad = row("bad", "3000000", "20230229", "2099-01-01");
        var old = row("old", "3000000", "1900-01-01", "");
        importer.importCsv(pharmacy, csv(pharmacy, List.of(bad, old)), snapshot, null, 2);
        assertEquals(2, count("national_permit"));
        assertEquals(0, count("permit_event"));
        assertTrue(jdbc.queryForList("SELECT raw_json FROM national_permit_version", String.class).stream()
                .anyMatch(s -> s.contains("20230229")));
    }

    @Test
    void old_snapshot_and_corrupted_file_are_rejected() throws Exception {
        var input = csv(pharmacy, List.of(row("A", "3000000", "2020-01-01", "")));
        importer.importCsv(pharmacy, input, snapshot, null, 2);
        assertThrows(IllegalArgumentException.class,
                () -> importer.importCsv(pharmacy, input, snapshot.minusDays(1), null, 2));
        Files.writeString(input, "corrupt");
        assertThrows(IllegalArgumentException.class, () -> importer.importCsv(pharmacy, input, snapshot, null, 2));
        assertEquals(1, count("national_permit"));
        assertNull(jdbc.queryForObject("SELECT owner_run FROM permit_import_lock", String.class));
    }

    @Test
    void quoted_multiline_cp949_name_is_read_as_one_record() throws Exception {
        var row = row("quote", "3000000", "2020-01-01", "");
        row.put("BPLC_NM", "한글,\n약국");
        importer.importCsv(pharmacy, csv(pharmacy, List.of(row)), snapshot, null, 2);
        assertEquals("한글,\n약국", jdbc.queryForObject("SELECT name FROM national_permit_version", String.class));
        assertEquals(1, count("national_permit"));
    }

    @Test
    void failed_old_run_cannot_overwrite_a_later_completed_snapshot() throws Exception {
        var duplicate = row("duplicate", "3000000", "2020-01-01", "");
        var old = csv(pharmacy, List.of(duplicate, duplicate));
        assertThrows(IllegalStateException.class, () -> importer.importCsv(pharmacy, old, snapshot, null, 1));
        var failed = jdbc.queryForObject("SELECT id FROM permit_import_run WHERE status='FAILED'", String.class);
        importer.importCsv(pharmacy, csv(pharmacy, List.of(row("new", "3000000", "2020-01-01", ""))),
                snapshot.plusDays(1), null, 1);
        assertThrows(IllegalArgumentException.class, () -> importer.importCsv(pharmacy, old, snapshot, failed, 1));
        assertEquals("new", jdbc.queryForObject("SELECT management_number FROM national_permit", String.class));
        assertNull(jdbc.queryForObject("SELECT owner_run FROM permit_import_lock", String.class));
    }

    long count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
    }

    @Test
    void failure_in_second_publication_batch_rolls_back_first_batch_and_preserves_stage() throws Exception {
        var records = new java.util.ArrayList<Map<String, String>>();
        for (int i = 0; i < 5001; i++) records.add(row("boundary-" + i, "3000000", "2020-01-01", ""));
        records.get(5000).put("BPLC_NM", "BLOCK_LATER");
        var input = csv(pharmacy, records);
        jdbc.execute("ALTER TABLE national_permit_version ADD CONSTRAINT test_later_batch CHECK(name <> 'BLOCK_LATER')");
        try {
            assertThrows(IllegalStateException.class, () -> importer.importCsv(pharmacy, input, snapshot, null, 5000));
            assertEquals(0, count("national_permit"));
            assertEquals(0, count("national_permit_version"));
            assertEquals(0, count("permit_event"));
            assertEquals(5001, count("permit_import_stage"));
        } finally {
            jdbc.execute("ALTER TABLE national_permit_version DROP CONSTRAINT test_later_batch");
        }
        var run = jdbc.queryForObject("SELECT id FROM permit_import_run WHERE status='FAILED'", String.class);
        assertEquals(5001, importer.importCsv(pharmacy, input, snapshot, run, 5000).inserted());
        assertEquals(5001, importer.importCsv(pharmacy, input, snapshot, null, 5000).unchanged());
        assertEquals(0, count("permit_import_stage"));
    }

    @Test
    @org.junit.jupiter.api.condition.EnabledIfSystemProperty(named = "national.import.performance", matches = "true")
    @org.junit.jupiter.api.Timeout(180)
    void postgres_bounded_import_and_repeat_at_measured_scale() throws Exception {
        assertTrue(jdbc.queryForObject("SELECT current_database()", String.class).startsWith("permit_map_verify_"));
        int size = Integer.getInteger("national.import.performance.rows", 100000);
        assertTrue(size > 0 && size <= 100000);
        var records = new java.util.ArrayList<Map<String, String>>();
        String name = "성능검증자료".repeat(40);
        for (int i = 0; i < size; i++) {
            var record = row("perf-" + i, "3000000", "2020-01-01", "2024-01-01");
            record.put("BPLC_NM", name);
            records.add(record);
        }
        var input = csv(pharmacy, records);
        long started = System.nanoTime();
        var first = importer.importCsv(pharmacy, input, snapshot, null, 5000);
        long firstMs = (System.nanoTime() - started) / 1_000_000;
        started = System.nanoTime();
        var repeat = importer.importCsv(pharmacy, input, snapshot, null, 5000);
        long repeatMs = (System.nanoTime() - started) / 1_000_000;
        assertEquals(size, first.inserted());
        assertEquals(0, repeat.inserted());
        assertEquals(0, repeat.updated());
        assertEquals(size, repeat.unchanged());
        assertEquals(size, count("national_permit"));
        assertEquals(size, count("national_permit_version"));
        assertEquals(size * 2L, count("permit_event"));
        assertEquals(0, count("permit_import_stage"));
        assertEquals((long) size, jdbc.queryForObject("SELECT COUNT(*) FROM national_permit WHERE last_seen_run_id=?", Long.class, repeat.runId()));
        System.out.println("NATIONAL_PERFORMANCE rows=" + size + " first_ms=" + firstMs + " repeat_ms=" + repeatMs);
    }

    HashMap<String, String> row(String id, String org, String opened, String closed) {
        return new HashMap<>(Map.of("MNG_NO", id, "OPN_ATMY_GRP_CD", org, "BPLC_NM", "약국", "LCPMT_YMD", opened,
                "CLSBIZ_YMD", closed, "SALS_STTS_CD", "01", "SALS_STTS_NM", "영업/정상", "CRD_INFO_X", "200000",
                "CRD_INFO_Y", "450000"));
    }

    Path csv(NationalCategory category, List<Map<String, String>> rows) throws IOException {
        var input = directory.resolve(java.util.UUID.randomUUID() + ".csv");
        var keys = NationalRowNormalizer.FIELDS.stream().filter(category.fields()::containsKey).toList();
        try (var writer = Files.newBufferedWriter(input, Charset.forName("MS949"));
                var printer = CSVFormat.DEFAULT.print(writer)) {
            printer.printRecord(keys.stream().map(category.fields()::get).toList());
            for (var row : rows)
                printer.printRecord(keys.stream().map(k -> row.getOrDefault(k, "")).toList());
        }
        var meta = Map.of("url", "https://file.localdata.go.kr/file/download/" + category.id() + "/info", "bytes",
                Files.size(input),
                "sha256", NationalPermitBatchImporter.fingerprint(input));
        Files.writeString(input.resolveSibling(input.getFileName().toString().replace(".csv", ".download.json")),
                JsonMapper.builder().build().writeValueAsString(meta));
        return input;
    }
}
