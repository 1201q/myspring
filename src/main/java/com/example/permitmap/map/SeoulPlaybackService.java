package com.example.permitmap.map;

import java.io.*;
import java.nio.*;
import java.nio.file.*;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

@Service
public class SeoulPlaybackService {
  public static final double[] BBOX = {126.7, 37.4, 127.3, 37.75};
  private final JdbcTemplate jdbc;
  private final Path directory;
  private final JsonMapper mapper = JsonMapper.builder().build();
  private final AtomicBoolean building = new AtomicBoolean();
  private volatile Manifest current;
  private volatile long loadedModified;
  private volatile long retryAt;

  public SeoulPlaybackService(
      JdbcTemplate jdbc,
      @Value("${permit.playback.directory:data/playback/seoul}") String directory) {
    this.jdbc = jdbc;
    this.directory = Path.of(directory).toAbsolutePath().normalize();
    reloadPublished();
  }

  static void writeEvent(
      OutputStream output,
      long id,
      float longitude,
      float latitude,
      int month,
      int kind,
      int category)
      throws IOException {
    if (id < 0
        || id > 0xffffffffL
        || month < 0
        || month > Short.MAX_VALUE
        || kind < 0
        || kind > 1
        || category < 0
        || category > 255
        || !Float.isFinite(longitude)
        || !Float.isFinite(latitude))
      throw new IllegalArgumentException("Playback value exceeds binary format");
    output.write(
        ByteBuffer.allocate(16)
            .order(ByteOrder.LITTLE_ENDIAN)
            .putFloat(longitude)
            .putFloat(latitude)
            .putShort((short) month)
            .put((byte) kind)
            .put((byte) category)
            .putInt((int) id)
            .array());
  }

  private void reloadPublished() {
    try {
      Path file = this.directory.resolve("manifest.json");
      if (Files.exists(file) && Files.getLastModifiedTime(file).toMillis() != loadedModified) {
        var stored = mapper.readValue(file.toFile(), Manifest.class);
        if (stored.recordBytes() == 16
            && !stored.categories().isEmpty()
            && Files.size(binaryPath(stored.version())) == stored.count() * 16) {
          current = stored;
          loadedModified = Files.getLastModifiedTime(file).toMillis();
        }
      }
    } catch (Exception error) {
      org.slf4j.LoggerFactory.getLogger(getClass())
          .warn("Playback snapshot needs rebuilding: {}", error.getMessage());
    }
  }

  public Manifest manifest() {
    reloadPublished();
    if (current == null
        && System.currentTimeMillis() >= retryAt
        && building.compareAndSet(false, true)) {
      Thread.startVirtualThread(() -> {
        try {
          refreshOwned();
        } catch (Exception error) {
          retryAt = System.currentTimeMillis() + 30000;
          org.slf4j.LoggerFactory.getLogger(getClass())
              .error("Seoul playback export failed", error);
        } finally {
          building.set(false);
        }
      });
    }
    return current;
  }

  public Manifest refresh() throws IOException {
    if (!building.compareAndSet(false, true))
      throw new IllegalStateException("Playback export already running");
    try {
      return refreshOwned();
    } finally {
      building.set(false);
    }
  }

  public Path binaryPath(String version) {
    if (version == null || !version.matches("[a-f0-9]{16}"))
      throw new IllegalArgumentException("Invalid playback version");
    return directory.resolve("events-" + version + ".bin");
  }

  private Manifest refreshOwned() throws IOException {
    Files.createDirectories(directory);
    var categories = new ArrayList<Category>();
    var codes = new HashMap<String, Integer>();
    for (var c : MapQueryService.CATEGORIES) {
      codes.put(c.id(), categories.size());
      categories.add(new Category(categories.size(), c.id(), c.name()));
    }
    LocalDate now = LocalDate.now(ZoneId.of("Asia/Seoul"));
    LocalDate start = LocalDate.of(1990, 1, 1), end = now.withDayOfMonth(1).plusMonths(1);
    int maxMonth = (now.getYear() - 1990) * 12 + now.getMonthValue() - 1;
    long[] histogram = new long[(maxMonth + 1) * 2 * categories.size()], totals = new long[2];
    Path temporary = Files.createTempFile(directory, "events-", ".tmp");
    MessageDigest digest;
    try {
      digest = MessageDigest.getInstance("SHA-256");
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException(e);
    }
    try {
      try (var output =
          new BufferedOutputStream(
              new DigestOutputStream(Files.newOutputStream(temporary), digest))) {
        jdbc.query(
            connection -> {
              // Cursor streaming uses one connection and does not materialize millions of Java
              // objects.
              connection.setAutoCommit(false);
              var statement =
                  connection.prepareStatement(
                      """
                      WITH candidates AS MATERIALIZED (
                        SELECT t.id,t.category_id,t.permitted_on,t.closed_on,ST_Transform(t.geom,4326) AS geom
                        FROM national_permit_map_tile_point t
                        JOIN national_permit_current p ON p.id=t.id
                        WHERE ST_Intersects(t.geom,ST_Transform(ST_MakeEnvelope(126.7,37.4,127.3,37.75,4326),3857))
                          AND COALESCE(NULLIF(BTRIM(p.road_address),''),p.lot_address) LIKE '서울%'
                      ) SELECT p.id,p.category_id,ST_X(p.geom) AS longitude,ST_Y(p.geom) AS latitude,
                          e.kind,e.event_date FROM candidates p CROSS JOIN LATERAL
                          (VALUES (0,p.permitted_on),(1,p.closed_on)) e(kind,event_date)
                        WHERE e.event_date>=? AND e.event_date<? ORDER BY p.id,e.kind
                      """);
              statement.setObject(1, start);
              statement.setObject(2, end);
              statement.setFetchSize(10000);
              statement.setQueryTimeout(600);
              return statement;
            },
            (ResultSetExtractor<Void>)
                rs -> {
                  while (rs.next()) {
                    Integer category = codes.get(rs.getString("category_id"));
                    if (category == null) continue;
                    var date = rs.getObject("event_date", LocalDate.class);
                    int month = (date.getYear() - 1990) * 12 + date.getMonthValue() - 1,
                        kind = rs.getInt("kind");
                    try {
                      writeEvent(
                          output,
                          rs.getLong("id"),
                          rs.getFloat("longitude"),
                          rs.getFloat("latitude"),
                          month,
                          kind,
                          category);
                    } catch (IOException error) {
                      throw new UncheckedIOException(error);
                    }
                    histogram[(month * 2 + kind) * categories.size() + category]++;
                    totals[kind]++;
                  }
                  return null;
                });
      }
      String sha = HexFormat.of().formatHex(digest.digest()), version = sha.substring(0, 16);
      Path target = binaryPath(version);
      Files.move(temporary, target, StandardCopyOption.REPLACE_EXISTING);
      var manifest =
          new Manifest(
              version,
              "/api/v1/map/playback/seoul/events.bin?v=" + version,
              totals[0] + totals[1],
              0,
              maxMonth,
              maxMonth,
              16,
              1990,
              List.copyOf(categories),
              histogram,
              totals[0],
              totals[1],
              Instant.now().toString(),
              "서울",
              BBOX.clone(),
              "현재 도로명주소 우선, 비어 있으면 지번주소 기준 서울 접두어; 좌표 스냅샷, 과거 주소 복원 아님",
              sha);
      Path pending = Files.createTempFile(directory, "manifest-", ".tmp");
      mapper.writeValue(pending.toFile(), manifest);
      Files.move(
          pending,
          directory.resolve("manifest.json"),
          StandardCopyOption.REPLACE_EXISTING,
          StandardCopyOption.ATOMIC_MOVE);
      current = manifest;
      loadedModified = Files.getLastModifiedTime(directory.resolve("manifest.json")).toMillis();
      return manifest;
    } finally {
      Files.deleteIfExists(temporary);
    }
  }

  public record Category(int code, String id, String name) {}

  public record Manifest(
      String version,
      String binaryUrl,
      long count,
      int minMonth,
      int maxMonth,
      int currentMonth,
      int recordBytes,
      int monthBase,
      List<Category> categories,
      long[] monthlyCounts,
      long opens,
      long closes,
      String generatedAt,
      String region,
      double[] bbox,
      String regionBasis,
      String sha256) {}
}
