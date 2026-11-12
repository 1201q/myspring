package com.example.permitmap.ingestion.national;

import com.example.permitmap.PermitMapApplication;
import java.time.Duration;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Initial, resumable projection of declared coordinates. Unknown CRSs stay untouched. */
@Service
public class NationalLocationBackfill {
  private static final String KEY = "declared-5174-v1";
  private static final String OWNER = "location-backfill-5174-v1";
  private final JdbcTemplate jdbc;
  private final TransactionTemplate tx;

  public NationalLocationBackfill(JdbcTemplate jdbc, PlatformTransactionManager manager) {
    this.jdbc = jdbc;
    tx = new TransactionTemplate(manager);
    tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    tx.setTimeout(30);
  }

  public static void main(String[] args) {
    if ((args.length != 1 && args.length != 2)
        || !args[0].matches("permit_map_(dev|verify_[a-z0-9_]+)")
        || (args.length == 2 && !args[1].equals("catalog")))
      throw new IllegalArgumentException("Explicit database required");
    var app = new SpringApplication(PermitMapApplication.class);
    try (var context =
        app.run(
            NationalPermitImport.databaseArguments(
                Map.of("target", "postgres", "database", args[0])))) {
      if (args.length == 2) context.getBean(NationalLocationBackfill.class).runCatalog(10000);
      else context.getBean(NationalLocationBackfill.class).run(10000);
    }
  }

  public void run(int batchSize) {
    run(batchSize, false);
  }

  public void runCatalog(int batchSize) {
    run(batchSize, true);
  }

  private void run(int batchSize, boolean catalog) {
    String key = catalog ? "catalog-5174-v1" : KEY;
    String owner = catalog ? "location-catalog-5174-v1" : OWNER;
    if (batchSize < 1 || batchSize > 10000)
      throw new IllegalArgumentException("Batch size must be 1..10000");
    if (jdbc.update(
            "UPDATE permit_import_lock SET owner_run=? WHERE id=1 AND owner_run IS NULL", owner)
        != 1) throw new IllegalStateException("Another import owns the lock");
    long started = System.nanoTime();
    try {
      jdbc.update(
          "INSERT INTO permit_location_backfill(conversion_key,source_limit) SELECT ?,COALESCE(MAX(id),0) FROM national_permit_current ON CONFLICT(conversion_key) DO NOTHING",
          key);
      long maximum =
          jdbc.queryForObject(
              "SELECT source_limit FROM permit_location_backfill WHERE conversion_key=?",
              Long.class,
              key);
      long lower =
          jdbc.queryForObject(
              "SELECT checkpoint FROM permit_location_backfill WHERE conversion_key=?",
              Long.class,
              key);
      String inputSql =
          catalog
              ? "SELECT p.id,p.content_hash,c.source_crs,p.source_x,p.source_y FROM national_permit_current p JOIN permit_import_run r ON r.id=p.run_id AND r.status='COMPLETED' JOIN permit_category_crs c ON c.category_id=p.category_id WHERE p.id>? AND p.id<=? AND p.source_crs IS NULL"
              : "SELECT p.id,p.content_hash,p.source_crs,p.source_x,p.source_y FROM national_permit_current p JOIN permit_import_run r ON r.id=p.run_id AND r.status='COMPLETED' WHERE p.id>? AND p.id<=?";
      while (lower < maximum) {
        if (System.nanoTime() - started > Duration.ofMinutes(5).toNanos())
          throw new IllegalStateException("Five-minute budget reached; resume the same backfill");
        long from = lower, upper = Math.min(maximum, lower + batchSize);
        tx.executeWithoutResult(status -> {
          jdbc.execute("SET LOCAL statement_timeout='20s'");
          jdbc.execute("SET LOCAL lock_timeout='3s'");
          var counts =
              jdbc.queryForMap(
                  """
                  WITH input AS MATERIALIZED (
                    __INPUT__
                  ), projected AS MATERIALIZED (
                    SELECT *,ST_Transform(ST_SetSRID(ST_MakePoint(source_x::float8,source_y::float8),5174),4326) AS geom
                    FROM input WHERE source_crs=5174
                      AND source_x BETWEEN -200000 AND 700000 AND source_y BETWEEN -200000 AND 700000
                  ), valid AS MATERIALIZED (
                    SELECT * FROM projected WHERE ST_X(geom) BETWEEN 124 AND 132 AND ST_Y(geom) BETWEEN 32 AND 39.5
                  ), written AS (
                    INSERT INTO national_permit_location(permit_id,content_hash,source_crs,source_x,source_y,geom,conversion_method)
                    SELECT id,content_hash,source_crs,source_x,source_y,geom,'EPSG:5174->4326;basis:__BASIS__;PostGIS:'||PostGIS_Lib_Version() FROM valid
                    ON CONFLICT(permit_id) DO UPDATE SET content_hash=EXCLUDED.content_hash,source_crs=EXCLUDED.source_crs,
                      source_x=EXCLUDED.source_x,source_y=EXCLUDED.source_y,geom=EXCLUDED.geom,
                      conversion_method=EXCLUDED.conversion_method,converted_at=CURRENT_TIMESTAMP
                    WHERE national_permit_location.content_hash<>EXCLUDED.content_hash
                    RETURNING permit_id
                  )
                  SELECT (SELECT count(*) FROM input) AS scanned,
                    (SELECT count(*) FROM input WHERE source_crs=5174 AND source_x IS NOT NULL AND source_y IS NOT NULL) AS supported,
                    (SELECT count(*) FROM valid) AS mapped,(SELECT count(*) FROM written) AS written
                  """
                      .replace("__INPUT__", inputSql)
                      .replace("__BASIS__", key),
                  from,
                  upper);
          if (jdbc.update(
                  "UPDATE permit_location_backfill SET checkpoint=?,scanned_rows=scanned_rows+?,supported_rows=supported_rows+?,mapped_rows=mapped_rows+?,updated_at=CURRENT_TIMESTAMP WHERE conversion_key=? AND checkpoint=?",
                  upper,
                  counts.get("scanned"),
                  counts.get("supported"),
                  counts.get("mapped"),
                  key,
                  from)
              != 1) throw new IllegalStateException("Backfill checkpoint changed");
        });
        lower = upper;
        if (lower % 100000 == 0 || lower == maximum)
          System.out.println(
              "LOCATION_BACKFILL processed="
                  + lower
                  + "/"
                  + maximum
                  + " elapsed_ms="
                  + (System.nanoTime() - started) / 1_000_000);
      }
      System.out.println(
          "LOCATION_BACKFILL_COMPLETED "
              + jdbc.queryForMap(
                  "SELECT * FROM permit_location_backfill WHERE conversion_key=?", key));
    } finally {
      jdbc.update("UPDATE permit_import_lock SET owner_run=NULL WHERE id=1 AND owner_run=?", owner);
    }
  }
}
