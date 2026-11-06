package com.example.permitmap.ingestion.national;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.Arrays;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.boot.SpringApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import com.example.permitmap.PermitMapApplication;

/** Publish a fully staged, previously failed first import without rereading its CSV. */
@Service
public class NationalCurrentInitialPublisher {
    private static final String FIELDS = "name,lot_address,road_address,business_type,permitted_on,closed_on,raw_status_code,raw_status_name,raw_detail_status_code,raw_detail_status_name,source_x,source_y,source_crs,raw_json,issues_json,content_hash";
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public NationalCurrentInitialPublisher(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        tx = new TransactionTemplate(manager);
        tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        tx.setTimeout(30);
    }

    public record Result(String runId, long rows, long elapsedMs, long totalWallMs) {}

    public Result publish(String run, int batchSize) {
        UUID.fromString(run);
        if (batchSize < 1 || batchSize > 10000) throw new IllegalArgumentException("Batch size must be 1..10000");
        // Do not accept the same owner: two clients resuming one run must not race.
        if (jdbc.update("UPDATE permit_import_lock SET owner_run=? WHERE id=1 AND owner_run IS NULL",run) != 1)
            throw new IllegalStateException("Another import owns the lock");
        long started = System.nanoTime();
        boolean initialized = false;
        try {
            tx.executeWithoutResult(status -> initialize(run));
            initialized = true;
            long rows = jdbc.queryForObject("SELECT source_rows FROM permit_current_publication WHERE run_id=?",Long.class,run);
            long lower = jdbc.queryForObject("SELECT published_rows FROM permit_current_publication WHERE run_id=?",Long.class,run);
            String selection = Arrays.stream(FIELDS.split(",")).map(c -> "s." + c).collect(Collectors.joining(","));
            while (lower < rows) {
                if (System.nanoTime()-started > Duration.ofMinutes(5).toNanos())
                    throw new IllegalStateException("Five-minute budget reached; resume the same run");
                long from = lower, upper = Math.min(rows,lower+batchSize);
                tx.executeWithoutResult(status -> {
                    configure();
                    long count = jdbc.queryForObject("SELECT COUNT(*) FROM permit_import_stage WHERE run_id=? AND row_no>? AND row_no<=?",Long.class,run,from,upper);
                    if (count != upper-from) throw new IllegalStateException("Incomplete staged range");
                    int inserted = jdbc.update("INSERT INTO national_permit_current(category_id,municipality_code,management_number,created_run_id,last_seen_run_id,run_id,observed_at,source_as_of," + FIELDS + ") " +
                            "SELECT r.category_id,s.municipality_code,s.management_number,r.id,r.id,r.id,CURRENT_TIMESTAMP,r.source_as_of," + selection +
                            " FROM permit_import_stage s JOIN permit_import_run r ON r.id=s.run_id WHERE s.run_id=? AND s.row_no>? AND s.row_no<=?",run,from,upper);
                    if (inserted != count) throw new IllegalStateException("Inserted count mismatch");
                    if (jdbc.update("UPDATE permit_current_publication SET published_rows=? WHERE run_id=? AND published_rows=?",upper,run,from) != 1)
                        throw new IllegalStateException("Publication checkpoint changed");
                    jdbc.update("UPDATE permit_import_run SET inserted_count=? WHERE id=?",upper,run);
                });
                lower = upper;
                if (lower % 100000 == 0 || lower == rows)
                    System.out.println("CURRENT_INITIAL_PUBLISH run=" + run + " processed=" + lower + "/" + rows + " elapsed_ms=" + elapsed(started));
            }
            tx.executeWithoutResult(status -> {
                configure();
                // Every INSERT count and its checkpoint commit atomically. Do not rescan millions
                // of wide rows on resume/finalization; physical totals are verified separately.
                if (jdbc.queryForObject("SELECT p.published_rows FROM permit_current_publication p JOIN permit_import_run r ON r.id=p.run_id WHERE p.run_id=? AND p.published_rows=r.inserted_count",Long.class,run) != rows)
                    throw new IllegalStateException("Final committed count mismatch");
                jdbc.update("UPDATE permit_current_publication SET completed_at=COALESCE(completed_at,CURRENT_TIMESTAMP) WHERE run_id=?",run);
                jdbc.update("UPDATE permit_import_run SET status='COMPLETED',finished_at=COALESCE(finished_at,CURRENT_TIMESTAMP),inserted_count=?,updated_count=0,unchanged_count=0,error_summary=NULL WHERE id=?",rows,run);
            });
            var begin = jdbc.queryForObject("SELECT started_at FROM permit_current_publication WHERE run_id=?",OffsetDateTime.class,run);
            var end = jdbc.queryForObject("SELECT completed_at FROM permit_current_publication WHERE run_id=?",OffsetDateTime.class,run);
            var result = new Result(run,rows,elapsed(started),Duration.between(begin,end).toMillis());
            System.out.println("CURRENT_INITIAL_PUBLISH_COMPLETED " + result);
            return result;
        } catch (RuntimeException error) {
            if (initialized) jdbc.update("UPDATE permit_import_run SET status='FAILED',finished_at=CURRENT_TIMESTAMP,error_summary=? WHERE id=?",
                    error.getClass().getSimpleName() + ": " + error.getMessage(),run);
            throw error;
        } finally {
            jdbc.update("UPDATE permit_import_lock SET owner_run=NULL WHERE id=1 AND owner_run=?",run);
        }
    }

    private void initialize(String run) {
        configure();
        if (!"COMPLETED".equals(jdbc.queryForObject("SELECT status FROM national_current_migration WHERE id=1",String.class)))
            throw new IllegalStateException("Current-table migration must be completed first");
        String category = jdbc.queryForObject("SELECT category_id FROM permit_import_run WHERE id=?",String.class,run);
        long rows = jdbc.queryForObject("SELECT processed_rows FROM permit_import_run WHERE id=?",Long.class,run);
        if (rows <= 0) throw new IllegalStateException("No staged rows");
        if (jdbc.queryForObject("SELECT COUNT(*) FROM permit_import_run WHERE category_id=? AND id<>? AND (status='COMPLETED' OR status='PUBLISHING')",Long.class,category,run) != 0)
            throw new IllegalStateException("First-load publisher refuses an existing or competing category publication");
        long progress = jdbc.queryForObject("SELECT COUNT(*) FROM permit_current_publication WHERE run_id=?",Long.class,run);
        if (progress == 0) {
            if (!"FAILED".equals(jdbc.queryForObject("SELECT status FROM permit_import_run WHERE id=?",String.class,run)))
                throw new IllegalStateException("Only a fully staged failed first import may be recovered");
            if (!jdbc.queryForList("SELECT id FROM national_permit_current WHERE category_id=? FETCH FIRST 1 ROW ONLY",category).isEmpty())
                throw new IllegalStateException("Category is not empty");
            if (jdbc.queryForObject("SELECT COUNT(*) FROM permit_import_stage WHERE run_id=?",Long.class,run) != rows ||
                jdbc.queryForObject("SELECT MIN(row_no) FROM permit_import_stage WHERE run_id=?",Long.class,run) != 1 ||
                jdbc.queryForObject("SELECT MAX(row_no) FROM permit_import_stage WHERE run_id=?",Long.class,run) != rows)
                throw new IllegalStateException("Staging is not complete");
            jdbc.update("INSERT INTO permit_current_publication(run_id,source_rows,started_at) VALUES(?,?,CURRENT_TIMESTAMP)",run,rows);
        } else {
            if (jdbc.queryForObject("SELECT source_rows FROM permit_current_publication WHERE run_id=?",Long.class,run) != rows)
                throw new IllegalStateException("Source checkpoint changed");
            if (jdbc.queryForObject("SELECT inserted_count FROM permit_import_run WHERE id=?",Long.class,run).longValue() !=
                jdbc.queryForObject("SELECT published_rows FROM permit_current_publication WHERE run_id=?",Long.class,run).longValue())
                throw new IllegalStateException("Committed insert count no longer matches checkpoint");
        }
        // A completed call is repeatable; leave it visible and keep its finish timestamp.
        jdbc.update("UPDATE permit_import_run SET status='PUBLISHING',finished_at=NULL,error_summary=NULL,updated_count=0,unchanged_count=0 WHERE id=? AND status<>'COMPLETED'",run);
    }

    private void configure() {
        if (Boolean.TRUE.equals(jdbc.execute((org.springframework.jdbc.core.ConnectionCallback<Boolean>) c -> c.getMetaData().getDatabaseProductName().equals("PostgreSQL")))) {
            jdbc.execute("SET LOCAL statement_timeout='20s'");
            jdbc.execute("SET LOCAL lock_timeout='3s'");
        }
    }

    private static long elapsed(long started) { return (System.nanoTime()-started)/1_000_000; }

    public static void main(String[] args) {
        if (args.length != 2 || !args[0].matches("permit_map_(dev|verify_[a-z0-9_]+)"))
            throw new IllegalArgumentException("Explicit database and run UUID required");
        UUID.fromString(args[1]);
        var app = new SpringApplication(PermitMapApplication.class);
        try (var context = app.run(NationalPermitImport.databaseArguments(Map.of("target","postgres","database",args[0])))) {
            context.getBean(NationalCurrentInitialPublisher.class).publish(args[1],10000);
        }
    }
}
