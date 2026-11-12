package com.example.permitmap.ingestion.national;

import com.example.permitmap.PermitMapApplication;
import java.time.Duration;
import java.util.Arrays;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.boot.SpringApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Resumable, additive copy. Legacy data remains intact until a separate cutover. */
@Service
public class NationalCurrentMigration {
  private static final String OWNER = "current-structure-migration";
  private static final String DETAILS =
      "run_id,observed_at,source_as_of,name,lot_address,road_address,business_type,permitted_on,closed_on,raw_status_code,raw_status_name,raw_detail_status_code,raw_detail_status_name,source_x,source_y,source_crs,raw_json,issues_json,content_hash";
  private static final String IDENTITY =
      "id,category_id,municipality_code,management_number,created_run_id,last_seen_run_id";
  private final JdbcTemplate jdbc;
  private final TransactionTemplate tx;

  public NationalCurrentMigration(JdbcTemplate jdbc, PlatformTransactionManager manager) {
    this.jdbc = jdbc;
    this.tx = new TransactionTemplate(manager);
    tx.setTimeout(30);
  }

  private static String prefixed(String columns, String alias) {
    return Arrays.stream(columns.split(","))
        .map(c -> alias + "." + c)
        .collect(Collectors.joining(","));
  }

  public static void main(String[] args) {
    if (args.length != 1 || !args[0].matches("permit_map_(dev|verify_[a-z0-9_]+)"))
      throw new IllegalArgumentException("Explicit database required");
    var app = new SpringApplication(PermitMapApplication.class);
    try (var context =
        app.run(
            NationalPermitImport.databaseArguments(
                Map.of("target", "postgres", "database", args[0])))) {
      context.getBean(NationalCurrentMigration.class).migrate(10000);
    }
  }

  public void migrate(int batchSize) {
    if (batchSize < 1 || batchSize > 10000)
      throw new IllegalArgumentException("Batch size: 1..10000");
    if (jdbc.update(
            "UPDATE permit_import_lock SET owner_run=? WHERE id=1 AND owner_run IS NULL", OWNER)
        != 1) throw new IllegalStateException("An import is active");
    long deadline = System.nanoTime() + Duration.ofMinutes(5).toNanos();
    try {
      // New-structure imports may have added records after the one-time legacy copy.
      if ("COMPLETED"
          .equals(
              jdbc.queryForObject(
                  "SELECT status FROM national_current_migration WHERE id=1", String.class)))
        return;
      // PENDING -> RUNNING permanently fences the legacy importer, including after interruption.
      jdbc.update(
          "UPDATE national_current_migration SET status='RUNNING' WHERE id=1 AND status<>'COMPLETED'");
      copy(false, batchSize, deadline);
      long permits = jdbc.queryForObject("SELECT COUNT(*) FROM national_permit", Long.class);
      long versions =
          jdbc.queryForObject("SELECT COUNT(*) FROM national_permit_version", Long.class);
      if (permits == versions) {
        // Each current link was checked above; equal counts prove there are no past snapshots.
        jdbc.update(
            "UPDATE national_current_migration SET history_checkpoint=(SELECT COALESCE(MAX(id),0) FROM national_permit_version) WHERE id=1");
      } else {
        copy(true, batchSize, deadline);
      }
      tx.executeWithoutResult(status -> {
        configure();
        long source = jdbc.queryForObject("SELECT COUNT(*) FROM national_permit", Long.class);
        long target =
            jdbc.queryForObject("SELECT COUNT(*) FROM national_permit_current", Long.class);
        if (source != target) throw new IllegalStateException("Current count mismatch");
        jdbc.update("UPDATE national_current_migration SET status='COMPLETED' WHERE id=1");
        System.out.println(
            "CURRENT_MIGRATION_COMPLETED rows="
                + target
                + " history="
                + jdbc.queryForObject("SELECT COUNT(*) FROM national_permit_history", Long.class));
      });
    } finally {
      jdbc.update("UPDATE permit_import_lock SET owner_run=NULL WHERE id=1 AND owner_run=?", OWNER);
    }
  }

  private void copy(boolean history, int batch, long deadline) {
    String checkpoint = history ? "history_checkpoint" : "current_checkpoint";
    String source = history ? "national_permit_version" : "national_permit";
    String target = history ? "national_permit_history" : "national_permit_current";
    long maximum = jdbc.queryForObject("SELECT COALESCE(MAX(id),0) FROM " + source, Long.class);
    long lower =
        jdbc.queryForObject(
            "SELECT " + checkpoint + " FROM national_current_migration WHERE id=1", Long.class);
    while (lower < maximum) {
      if (System.nanoTime() > deadline)
        throw new IllegalStateException("Five-minute budget reached; rerun to resume");
      long from = lower, upper = Math.min(maximum, lower + batch);
      tx.executeWithoutResult(status -> {
        configure();
        String columns = history ? "id,permit_id," + DETAILS : IDENTITY + "," + DETAILS;
        String selection =
            history
                ? "v.id,v.permit_id," + prefixed(DETAILS, "v")
                : prefixed(IDENTITY, "p") + "," + prefixed(DETAILS, "v");
        String join =
            " FROM national_permit p JOIN national_permit_version v ON "
                + (history ? "v.permit_id=p.id" : "v.id=p.current_version_id");
        String range =
            history
                ? " WHERE v.id>? AND v.id<=? AND v.id<>p.current_version_id"
                : " WHERE p.id>? AND p.id<=?";
        if (!history
            && jdbc.queryForObject(
                    "SELECT COUNT(*) FROM national_permit p LEFT JOIN national_permit_version v ON v.id=p.current_version_id WHERE p.id>? AND p.id<=? AND (v.id IS NULL OR v.permit_id<>p.id)",
                    Long.class,
                    from,
                    upper)
                != 0) throw new IllegalStateException("Invalid legacy current version");
        jdbc.update(
            "INSERT INTO " + target + "(" + columns + ") SELECT " + selection + join + range,
            from,
            upper);
        // Compare every copied field, not just counts or hashes. EXCEPT treats nulls equally.
        long differences =
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM (SELECT "
                    + selection
                    + join
                    + range
                    + " EXCEPT SELECT "
                    + columns
                    + " FROM "
                    + target
                    + " WHERE id>? AND id<=?) mismatch",
                Long.class,
                from,
                upper,
                from,
                upper);
        if (differences != 0) throw new IllegalStateException("Copied content mismatch");
        jdbc.update("UPDATE national_current_migration SET " + checkpoint + "=? WHERE id=1", upper);
      });
      lower = upper;
      if (lower % 100000 == 0 || lower == maximum)
        System.out.println(
            "CURRENT_MIGRATION phase="
                + (history ? "HISTORY" : "CURRENT")
                + " processed="
                + lower
                + "/"
                + maximum);
    }
    // Explicitly supplied legacy IDs must not collide with future generated IDs.
    long next = jdbc.queryForObject("SELECT COALESCE(MAX(id),0)+1 FROM " + target, Long.class);
    jdbc.execute("ALTER TABLE " + target + " ALTER COLUMN id RESTART WITH " + next);
  }

  private void configure() {
    if (Boolean.TRUE.equals(
        jdbc.execute(
            (org.springframework.jdbc.core.ConnectionCallback<Boolean>)
                c -> c.getMetaData().getDatabaseProductName().equals("PostgreSQL")))) {
      jdbc.execute("SET LOCAL statement_timeout='20s'");
      jdbc.execute("SET LOCAL lock_timeout='3s'");
    }
  }
}
