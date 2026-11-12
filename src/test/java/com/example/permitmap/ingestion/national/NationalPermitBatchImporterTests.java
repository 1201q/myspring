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
  final LocalDate snapshot = LocalDate.of(2025, 6, 1);
  final NationalCategory pharmacy =
      NationalCategory.read(
          Path.of("docs/data-samples/national/category-catalog.json"), "pharmacies");
  @Autowired NationalPermitBatchImporter importer;
  @Autowired JdbcTemplate jdbc;
  @Autowired NationalCurrentMigration currentMigration;
  @Autowired NationalCurrentInitialPublisher currentPublisher;
  @Autowired NationalLocationBackfill locationBackfill;
  @Autowired com.example.permitmap.map.MapQueryService mapQueryService;
  @TempDir Path directory;

  static boolean disposableDatabaseUrl(String url) {
    return url != null
        && (url.startsWith("jdbc:h2:mem:")
            || url.matches("jdbc:postgresql://127\\.0\\.0\\.1:15432/permit_map_verify_[a-z0-9_]+"));
  }

  @BeforeEach
  void clean() {
    var url =
        jdbc.execute(
            (org.springframework.jdbc.core.ConnectionCallback<String>)
                connection -> connection.getMetaData().getURL());
    if (!disposableDatabaseUrl(url))
      throw new IllegalStateException("Destructive test setup refuses a live database");
    if (url.startsWith("jdbc:postgresql:")
        && !jdbc.queryForObject("SELECT current_database()", String.class)
            .matches("permit_map_verify_[a-z0-9_]+"))
      throw new IllegalStateException("Actual PostgreSQL database is not disposable");
    jdbc.update("UPDATE permit_import_lock SET owner_run=NULL");
    if (url.startsWith("jdbc:postgresql:")) {
      if (Boolean.TRUE.equals(
          jdbc.queryForObject(
              "SELECT to_regclass('public.permit_category_crs') IS NOT NULL", Boolean.class)))
        jdbc.update("DELETE FROM permit_category_crs WHERE category_id='first_load'");
      if (Boolean.TRUE.equals(
          jdbc.queryForObject(
              "SELECT to_regclass('public.national_permit_location') IS NOT NULL", Boolean.class)))
        jdbc.update("DELETE FROM national_permit_location");
      if (Boolean.TRUE.equals(
          jdbc.queryForObject(
              "SELECT to_regclass('public.permit_location_backfill') IS NOT NULL", Boolean.class)))
        jdbc.update("DELETE FROM permit_location_backfill");
    }
    jdbc.update("DELETE FROM permit_current_publication");
    jdbc.update("DELETE FROM national_permit_history");
    jdbc.update("DELETE FROM national_permit_current");
    jdbc.update(
        "UPDATE national_current_migration SET status='PENDING',current_checkpoint=0,history_checkpoint=0");
    if (url.startsWith("jdbc:postgresql:")) {
      // All tables are explicitly listed and the disposable DB was verified above.
      jdbc.execute(
          "TRUNCATE permit_current_publication,permit_event,national_permit,national_permit_version,permit_import_stage,permit_import_run,permit_category RESTART IDENTITY");
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

  @Test
  @org.junit.jupiter.api.condition.EnabledIfSystemProperty(
      named = "spring.datasource.driver-class-name",
      matches = "org.postgresql.Driver")
  void catalog_coordinates_resolve_unknown_crs_without_rewriting_original_information() {
    currentMigration.migrate(1);
    String run = stagedFirstLoad();
    currentPublisher.publish(run, 1);
    jdbc.update(
        "UPDATE national_permit_current SET source_x=189505.11152445,source_y=443415.972626677 WHERE management_number='A'");
    String original =
        jdbc.queryForObject(
            "SELECT row_to_json(p)::text FROM national_permit_current p WHERE management_number='A'",
            String.class);
    locationBackfill.runCatalog(1);
    assertEquals(0, count("national_permit_location"));
    jdbc.update(
        "INSERT INTO permit_category_crs(category_id,source_crs,evidence_url,document_text_sha256,catalog_title,verified_at) VALUES('first_load',5174,'https://www.data.go.kr/data/15154822/openapi.do',?,'fixture',CURRENT_TIMESTAMP)",
        "a".repeat(64));
    jdbc.update("DELETE FROM permit_location_backfill WHERE conversion_key='catalog-5174-v1'");
    locationBackfill.runCatalog(1);
    locationBackfill.runCatalog(1);
    assertEquals(1, count("national_permit_location"));
    assertEquals(1, count("national_permit_map_point"));
    assertEquals(
        original,
        jdbc.queryForObject(
            "SELECT row_to_json(p)::text FROM national_permit_current p WHERE management_number='A'",
            String.class));
    assertNull(
        jdbc.queryForObject(
            "SELECT source_crs FROM national_permit_current WHERE management_number='A'",
            Integer.class));
    assertEquals(
        1, mapQueryService.find("126.88,37.49,126.89,37.50", null, null, 10).items().size());
    jdbc.update("DELETE FROM permit_category_crs WHERE category_id='first_load'");
    assertEquals(0, count("national_permit_map_point"));
    assertEquals(
        0, mapQueryService.find("126.88,37.49,126.89,37.50", null, null, 10).items().size());
  }

  @Test
  @org.junit.jupiter.api.condition.EnabledIfSystemProperty(
      named = "spring.datasource.driver-class-name",
      matches = "org.postgresql.Driver")
  void location_backfill_maps_only_supported_valid_coordinates_and_hides_stale_locations() {
    currentMigration.migrate(1);
    String run = stagedFirstLoad();
    currentPublisher.publish(run, 1);
    jdbc.update(
        "UPDATE national_permit_current SET source_crs=5174,source_x=189505.11152445,source_y=443415.972626677 WHERE management_number='A'");
    jdbc.update(
        "UPDATE national_permit_current SET source_crs=5174,source_x=200000,source_y=9000000 WHERE management_number='B'");
    locationBackfill.run(1);
    locationBackfill.run(1);
    assertEquals(1, count("national_permit_location"));
    assertEquals(1, count("national_permit_map_point"));
    assertEquals(
        126.88211455336857,
        jdbc.queryForObject("SELECT longitude FROM national_permit_map_point", Double.class),
        1e-7);
    assertEquals(
        1L,
        jdbc.queryForObject(
            "SELECT count(*) FROM national_permit_map_point WHERE ST_Intersects(geom,ST_MakeEnvelope(126.88,37.49,126.89,37.50,4326))",
            Long.class));
    assertEquals(
        1, mapQueryService.find("126.88,37.49,126.89,37.50", null, null, 1).items().size());
    assertEquals(0, mapQueryService.find("129,35,129.1,35.1", null, null, 1).items().size());
    assertEquals(
        0,
        mapQueryService
            .find("126.88,37.49,126.89,37.50", null, java.time.LocalDate.of(2019, 1, 1), 1)
            .items()
            .size());
    assertEquals(
        1,
        mapQueryService
            .find("126.88,37.49,126.89,37.50", null, java.time.LocalDate.of(2021, 1, 1), 1)
            .items()
            .size());
    jdbc.update(
        "UPDATE national_permit_current SET source_y=443415.972626677,source_x=189505.11152445 WHERE management_number='B'");
    jdbc.update("DELETE FROM permit_location_backfill");
    locationBackfill.run(1);
    assertTrue(mapQueryService.find("126.88,37.49,126.89,37.50", null, null, 1).truncated());
    assertEquals(
        1,
        mapQueryService
            .find("126.88,37.49,126.89,37.50", null, java.time.LocalDate.of(2024, 2, 1), 10)
            .items()
            .size());
    jdbc.update(
        "UPDATE national_permit_current SET content_hash=? WHERE management_number='A'",
        "c".repeat(64));
    assertEquals(1, count("national_permit_map_point"));
    assertEquals(
        1, mapQueryService.find("126.88,37.49,126.89,37.50", null, null, 10).items().size());
  }

  @Test
  void current_initial_publisher_resumes_failed_batch_without_exposing_partial_category() {
    currentMigration.migrate(1);
    String run = stagedFirstLoad();
    jdbc.execute(
        "ALTER TABLE national_permit_current ADD CONSTRAINT test_current_later CHECK(management_number<>'B')");
    try {
      assertThrows(RuntimeException.class, () -> currentPublisher.publish(run, 1));
      assertEquals(1, count("national_permit_current"));
      assertEquals(0, count("national_permit_published"));
      assertEquals(0, count("national_permit_current_event"));
      assertEquals(
          1L,
          jdbc.queryForObject(
              "SELECT published_rows FROM permit_current_publication WHERE run_id=?",
              Long.class,
              run));
      assertNull(
          jdbc.queryForObject("SELECT owner_run FROM permit_import_lock WHERE id=1", String.class));
    } finally {
      jdbc.execute("ALTER TABLE national_permit_current DROP CONSTRAINT test_current_later");
    }
    var result = currentPublisher.publish(run, 1);
    assertEquals(2, result.rows());
    assertEquals(2, count("national_permit_published"));
    assertEquals(3, count("national_permit_current_event"));
    assertEquals(0, count("national_permit_history"));
    assertEquals(
        "2024-02-01",
        jdbc.queryForObject(
            "SELECT closed_on FROM national_permit_current WHERE management_number='B'",
            String.class));
    assertEquals(
        "식당 B",
        jdbc.queryForObject(
            "SELECT name FROM national_permit_current WHERE management_number='B'", String.class));
    assertEquals(2, currentPublisher.publish(run, 1).rows());
    assertEquals(2, count("national_permit_current"));
    assertEquals(2, count("permit_import_stage"));
  }

  @Test
  void current_initial_publisher_rejects_incomplete_source_and_busy_lock() {
    currentMigration.migrate(1);
    String run = stagedFirstLoad();
    jdbc.update("UPDATE permit_import_lock SET owner_run=? WHERE id=1", run);
    assertThrows(IllegalStateException.class, () -> currentPublisher.publish(run, 1));
    jdbc.update("UPDATE permit_import_lock SET owner_run=NULL WHERE id=1");
    jdbc.update("DELETE FROM permit_import_stage WHERE run_id=? AND row_no=2", run);
    assertThrows(IllegalStateException.class, () -> currentPublisher.publish(run, 1));
    assertEquals(0, count("national_permit_current"));
    assertEquals(0, count("permit_current_publication"));
  }

  private String stagedFirstLoad() {
    String run = java.util.UUID.randomUUID().toString();
    jdbc.update(
        "INSERT INTO permit_category(service_id,name,close_date_supported) VALUES('first_load','식당',TRUE)");
    jdbc.update(
        "INSERT INTO permit_import_run(id,category_id,source_sha256,contract_hash,source_file,source_as_of,started_at,status,processed_rows) VALUES(?,'first_load',?,?,'fixture.csv',DATE '2025-06-01',CURRENT_TIMESTAMP,'FAILED',2)",
        run,
        "a".repeat(64),
        "b".repeat(64));
    for (int i = 1; i <= 2; i++)
      jdbc.update(
          "INSERT INTO permit_import_stage(run_id,row_no,municipality_code,management_number,name,permitted_on,closed_on,raw_json,issues_json,content_hash) VALUES(?,?,'3000000',?,?,DATE '2020-01-01',?,'{}','[]',?)",
          run,
          i,
          i == 1 ? "A" : "B",
          i == 1 ? "식당 A" : "식당 B",
          i == 1 ? null : java.sql.Date.valueOf("2024-02-01"),
          Integer.toString(i).repeat(64));
    return run;
  }

  @Test
  void migration_preserves_current_history_events_and_can_be_repeated() throws Exception {
    importer.importCsv(
        pharmacy,
        csv(pharmacy, List.of(row("A", "3000000", "2020-01-01", "2024-01-01"))),
        snapshot,
        null,
        1);
    importer.importCsv(
        pharmacy,
        csv(pharmacy, List.of(row("A", "3000000", "2020-01-01", "2024-02-01"))),
        snapshot,
        null,
        1);
    currentMigration.migrate(1);
    currentMigration.migrate(1);
    assertEquals(1, count("national_permit_current"));
    assertEquals(1, count("national_permit_history"));
    assertEquals(2, count("national_permit_version"));
    assertEquals(
        "2024-02-01",
        jdbc.queryForObject("SELECT closed_on FROM national_permit_current", String.class));
    assertEquals(
        "2024-01-01",
        jdbc.queryForObject("SELECT closed_on FROM national_permit_history", String.class));
    assertEquals(2, count("national_permit_current_event"));
    assertThrows(
        IllegalStateException.class,
        () ->
            importer.importCsv(
                pharmacy,
                csv(pharmacy, List.of(row("B", "3000000", "2020-01-01", ""))),
                snapshot,
                null,
                1));
  }

  @Test
  void composite_identity_and_repeated_file_are_idempotent() throws Exception {
    var file =
        csv(
            pharmacy,
            List.of(
                row("A", "3000000", "2020-01-01", "2024-01-01"),
                row("A", "3010000", "2020-01-01", "")));
    var first = importer.importCsv(pharmacy, file, snapshot, null, 1);
    assertEquals(
        2L,
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM national_permit WHERE last_seen_run_id=?",
            Long.class,
            first.runId()));
    var again = importer.importCsv(pharmacy, file, snapshot, null, 1);
    assertEquals(
        2L,
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM national_permit WHERE last_seen_run_id=?",
            Long.class,
            again.runId()));
    assertEquals(2, first.inserted());
    assertEquals(2, again.unchanged());
    assertEquals(2, count("national_permit"));
    assertEquals(2, count("national_permit_version"));
    assertEquals(3, count("permit_event"));
    assertEquals(0, count("permit_import_stage"));
  }

  @Test
  void corrected_dates_and_reverted_content_preserve_history() throws Exception {
    importer.importCsv(
        pharmacy,
        csv(pharmacy, List.of(row("A", "3000000", "2020-01-01", "2024-01-01"))),
        snapshot,
        null,
        2);
    long id = jdbc.queryForObject("SELECT id FROM national_permit", Long.class);
    var correction =
        importer.importCsv(
            pharmacy,
            csv(pharmacy, List.of(row("A", "3000000", "2020-01-01", "2024-02-01"))),
            snapshot,
            null,
            2);
    assertEquals(1, correction.updated());
    assertEquals(
        "2024-02-01",
        jdbc.queryForObject(
            "SELECT event_date FROM permit_event e JOIN national_permit p ON p.current_version_id=e.version_id WHERE e.event_type='CLOSE'",
            String.class));
    importer.importCsv(
        pharmacy,
        csv(pharmacy, List.of(row("A", "3000000", "2020-01-01", "2024-01-01"))),
        snapshot,
        null,
        2);
    assertEquals(id, jdbc.queryForObject("SELECT id FROM national_permit", Long.class));
    assertEquals(3, count("national_permit_version"));
    assertEquals(6, count("permit_event"));
  }

  @Test
  void publication_failure_rolls_back_live_data_and_same_run_can_resume() throws Exception {
    importer.importCsv(
        pharmacy,
        csv(pharmacy, List.of(row("existing", "3000000", "2020-01-01", ""))),
        snapshot,
        null,
        1);
    var blocked = row("new-1", "3000000", "2020-01-01", "");
    blocked.put("BPLC_NM", "BLOCK");
    var input = csv(pharmacy, List.of(blocked, row("new-2", "3000000", "2020-01-01", "")));
    jdbc.execute(
        "ALTER TABLE national_permit_version ADD CONSTRAINT test_publish_failure CHECK(name <> 'BLOCK')");
    try {
      assertThrows(
          IllegalStateException.class,
          () -> importer.importCsv(pharmacy, input, snapshot, null, 1));
      assertEquals(1, count("national_permit"));
      assertEquals(1, count("national_permit_version"));
      assertEquals(2, count("permit_import_stage"));
    } finally {
      jdbc.execute("ALTER TABLE national_permit_version DROP CONSTRAINT test_publish_failure");
    }
    var run =
        jdbc.queryForObject("SELECT id FROM permit_import_run WHERE status='FAILED'", String.class);
    assertEquals(
        2L,
        jdbc.queryForObject(
            "SELECT processed_rows FROM permit_import_run WHERE id=?", Long.class, run));
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
    assertThrows(
        IllegalStateException.class, () -> importer.importCsv(pharmacy, input, snapshot, null, 1));
    assertEquals(0, count("national_permit"));
    assertEquals(1, count("permit_import_stage"));
    assertEquals(
        "FAILED", jdbc.queryForObject("SELECT status FROM permit_import_run", String.class));
  }

  @Test
  void missing_close_field_and_unverified_crs_are_preserved_without_invented_close()
      throws Exception {
    var wood =
        NationalCategory.read(
            Path.of("docs/data-samples/national/category-catalog.json"),
            "lumber_import_distribution");
    importer.importCsv(
        wood, csv(wood, List.of(row("W", "3000000", "2020-01-01", ""))), snapshot, null, 2);
    assertEquals(1, count("permit_event"));
    assertNull(
        jdbc.queryForObject("SELECT source_crs FROM national_permit_version", Integer.class));
    assertTrue(
        jdbc.queryForObject("SELECT issues_json FROM national_permit_version", String.class)
            .contains("CLOSE_DATE_NOT_PROVIDED"));
  }

  @Test
  void invalid_future_and_suspicious_dates_are_raw_only() throws Exception {
    var bad = row("bad", "3000000", "20230229", "2099-01-01");
    var old = row("old", "3000000", "1900-01-01", "");
    importer.importCsv(pharmacy, csv(pharmacy, List.of(bad, old)), snapshot, null, 2);
    assertEquals(2, count("national_permit"));
    assertEquals(0, count("permit_event"));
    assertTrue(
        jdbc.queryForList("SELECT raw_json FROM national_permit_version", String.class).stream()
            .anyMatch(s -> s.contains("20230229")));
  }

  @Test
  void old_snapshot_and_corrupted_file_are_rejected() throws Exception {
    var input = csv(pharmacy, List.of(row("A", "3000000", "2020-01-01", "")));
    importer.importCsv(pharmacy, input, snapshot, null, 2);
    assertThrows(
        IllegalArgumentException.class,
        () -> importer.importCsv(pharmacy, input, snapshot.minusDays(1), null, 2));
    Files.writeString(input, "corrupt");
    assertThrows(
        IllegalArgumentException.class,
        () -> importer.importCsv(pharmacy, input, snapshot, null, 2));
    assertEquals(1, count("national_permit"));
    assertNull(jdbc.queryForObject("SELECT owner_run FROM permit_import_lock", String.class));
  }

  @Test
  void quoted_multiline_cp949_name_is_read_as_one_record() throws Exception {
    var row = row("quote", "3000000", "2020-01-01", "");
    row.put("BPLC_NM", "한글,\n약국");
    importer.importCsv(pharmacy, csv(pharmacy, List.of(row)), snapshot, null, 2);
    assertEquals(
        "한글,\n약국", jdbc.queryForObject("SELECT name FROM national_permit_version", String.class));
    assertEquals(1, count("national_permit"));
  }

  @Test
  void failed_old_run_cannot_overwrite_a_later_completed_snapshot() throws Exception {
    var duplicate = row("duplicate", "3000000", "2020-01-01", "");
    var old = csv(pharmacy, List.of(duplicate, duplicate));
    assertThrows(
        IllegalStateException.class, () -> importer.importCsv(pharmacy, old, snapshot, null, 1));
    var failed =
        jdbc.queryForObject("SELECT id FROM permit_import_run WHERE status='FAILED'", String.class);
    importer.importCsv(
        pharmacy,
        csv(pharmacy, List.of(row("new", "3000000", "2020-01-01", ""))),
        snapshot.plusDays(1),
        null,
        1);
    assertThrows(
        IllegalArgumentException.class,
        () -> importer.importCsv(pharmacy, old, snapshot, failed, 1));
    assertEquals(
        "new", jdbc.queryForObject("SELECT management_number FROM national_permit", String.class));
    assertNull(jdbc.queryForObject("SELECT owner_run FROM permit_import_lock", String.class));
  }

  long count(String table) {
    return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Long.class);
  }

  @Test
  void failure_in_second_publication_batch_rolls_back_first_batch_and_preserves_stage()
      throws Exception {
    var records = new java.util.ArrayList<Map<String, String>>();
    for (int i = 0; i < 5001; i++) records.add(row("boundary-" + i, "3000000", "2020-01-01", ""));
    records.get(5000).put("BPLC_NM", "BLOCK_LATER");
    var input = csv(pharmacy, records);
    jdbc.execute(
        "ALTER TABLE national_permit_version ADD CONSTRAINT test_later_batch CHECK(name <> 'BLOCK_LATER')");
    try {
      assertThrows(
          IllegalStateException.class,
          () -> importer.importCsv(pharmacy, input, snapshot, null, 5000));
      assertEquals(0, count("national_permit"));
      assertEquals(0, count("national_permit_version"));
      assertEquals(0, count("permit_event"));
      assertEquals(5001, count("permit_import_stage"));
    } finally {
      jdbc.execute("ALTER TABLE national_permit_version DROP CONSTRAINT test_later_batch");
    }
    var run =
        jdbc.queryForObject("SELECT id FROM permit_import_run WHERE status='FAILED'", String.class);
    assertEquals(5001, importer.importCsv(pharmacy, input, snapshot, run, 5000).inserted());
    assertEquals(5001, importer.importCsv(pharmacy, input, snapshot, null, 5000).unchanged());
    assertEquals(0, count("permit_import_stage"));
  }

  @Test
  @org.junit.jupiter.api.condition.EnabledIfSystemProperty(
      named = "national.import.performance",
      matches = "true")
  @org.junit.jupiter.api.Timeout(180)
  void postgres_bounded_import_and_repeat_at_measured_scale() throws Exception {
    assertTrue(
        jdbc.queryForObject("SELECT current_database()", String.class)
            .startsWith("permit_map_verify_"));
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
    assertEquals(
        (long) size,
        jdbc.queryForObject(
            "SELECT COUNT(*) FROM national_permit WHERE last_seen_run_id=?",
            Long.class,
            repeat.runId()));
    System.out.println(
        "NATIONAL_PERFORMANCE rows=" + size + " first_ms=" + firstMs + " repeat_ms=" + repeatMs);
  }

  HashMap<String, String> row(String id, String org, String opened, String closed) {
    return new HashMap<>(
        Map.of(
            "MNG_NO",
            id,
            "OPN_ATMY_GRP_CD",
            org,
            "BPLC_NM",
            "약국",
            "LCPMT_YMD",
            opened,
            "CLSBIZ_YMD",
            closed,
            "SALS_STTS_CD",
            "01",
            "SALS_STTS_NM",
            "영업/정상",
            "CRD_INFO_X",
            "200000",
            "CRD_INFO_Y",
            "450000"));
  }

  Path csv(NationalCategory category, List<Map<String, String>> rows) throws IOException {
    var input = directory.resolve(java.util.UUID.randomUUID() + ".csv");
    var keys =
        NationalRowNormalizer.FIELDS.stream().filter(category.fields()::containsKey).toList();
    try (var writer = Files.newBufferedWriter(input, Charset.forName("MS949"));
        var printer = CSVFormat.DEFAULT.print(writer)) {
      printer.printRecord(keys.stream().map(category.fields()::get).toList());
      for (var row : rows)
        printer.printRecord(keys.stream().map(k -> row.getOrDefault(k, "")).toList());
    }
    var meta =
        Map.of(
            "url",
            "https://file.localdata.go.kr/file/download/" + category.id() + "/info",
            "bytes",
            Files.size(input),
            "sha256",
            NationalPermitBatchImporter.fingerprint(input));
    Files.writeString(
        input.resolveSibling(input.getFileName().toString().replace(".csv", ".download.json")),
        JsonMapper.builder().build().writeValueAsString(meta));
    return input;
  }
}
