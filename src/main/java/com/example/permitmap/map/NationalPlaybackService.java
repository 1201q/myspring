package com.example.permitmap.map;

import java.io.*;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.file.*;
import java.security.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

/** Publishes all provinces from one streaming snapshot; playback requests only serve files. */
@Service
public class NationalPlaybackService {
  public static final List<Region> REGIONS =
      List.of(
          region("seoul", "서울", 126.7, 37.4, 127.3, 37.75),
          region("busan", "부산", 128.7, 34.8, 129.4, 35.45),
          region("daegu", "대구", 128.3, 35.55, 129.0, 36.5),
          region("incheon", "인천", 124.5, 36.8, 126.95, 38.2),
          region("jeonnamgwangju", "전남광주", 124.8, 33.7, 127.95, 35.6),
          region("daejeon", "대전", 127.2, 36.15, 127.65, 36.55),
          region("ulsan", "울산", 128.9, 35.25, 129.65, 35.8),
          region("sejong", "세종", 127.0, 36.35, 127.45, 36.8),
          region("gyeonggi", "경기", 126.3, 36.85, 127.9, 38.35),
          region("gangwon", "강원", 126.9, 36.95, 129.5, 38.7),
          region("chungbuk", "충북", 127.15, 36.0, 128.7, 37.35),
          region("chungnam", "충남", 125.45, 35.9, 127.7, 37.15),
          region("jeonbuk", "전북", 125.9, 35.2, 127.95, 36.2),
          region("gyeongbuk", "경북", 127.65, 35.5, 132.1, 37.6),
          region("gyeongnam", "경남", 127.4, 34.4, 129.4, 36.0),
          region("jeju", "제주", 126.05, 33.0, 127.05, 34.1));
  private static final Map<String, String> ADDRESS_REGIONS =
      Map.ofEntries(
          Map.entry("서울특별시", "seoul"),
          Map.entry("서울시", "seoul"),
          Map.entry("서울", "seoul"),
          Map.entry("부산광역시", "busan"),
          Map.entry("부산직할시", "busan"),
          Map.entry("부산시", "busan"),
          Map.entry("부산", "busan"),
          Map.entry("대구광역시", "daegu"),
          Map.entry("대구직할시", "daegu"),
          Map.entry("대구시", "daegu"),
          Map.entry("대구", "daegu"),
          Map.entry("인천광역시", "incheon"),
          Map.entry("인천직할시", "incheon"),
          Map.entry("인천시", "incheon"),
          Map.entry("인천", "incheon"),
          Map.entry("전남광주통합특별시", "jeonnamgwangju"),
          Map.entry("광주광역시", "jeonnamgwangju"),
          Map.entry("광주직할시", "jeonnamgwangju"),
          Map.entry("광주시", "jeonnamgwangju"),
          Map.entry("광주", "jeonnamgwangju"),
          Map.entry("대전광역시", "daejeon"),
          Map.entry("대전직할시", "daejeon"),
          Map.entry("대전시", "daejeon"),
          Map.entry("대전", "daejeon"),
          Map.entry("울산광역시", "ulsan"),
          Map.entry("울산시", "ulsan"),
          Map.entry("울산", "ulsan"),
          Map.entry("세종특별자치시", "sejong"),
          Map.entry("세종시", "sejong"),
          Map.entry("세종", "sejong"),
          Map.entry("경기도", "gyeonggi"),
          Map.entry("경기", "gyeonggi"),
          Map.entry("강원특별자치도", "gangwon"),
          Map.entry("강원도", "gangwon"),
          Map.entry("강원", "gangwon"),
          Map.entry("충청북도", "chungbuk"),
          Map.entry("충북", "chungbuk"),
          Map.entry("충청남도", "chungnam"),
          Map.entry("충남", "chungnam"),
          Map.entry("전북특별자치도", "jeonbuk"),
          Map.entry("전라북도", "jeonbuk"),
          Map.entry("전북", "jeonbuk"),
          Map.entry("전라남도", "jeonnamgwangju"),
          Map.entry("전남", "jeonnamgwangju"),
          Map.entry("경상북도", "gyeongbuk"),
          Map.entry("경북", "gyeongbuk"),
          Map.entry("경상남도", "gyeongnam"),
          Map.entry("경남", "gyeongnam"),
          Map.entry("제주특별자치도", "jeju"),
          Map.entry("제주도", "jeju"),
          Map.entry("제주", "jeju"));
  private final JdbcTemplate jdbc;
  private final Path directory;
  private final JsonMapper mapper = JsonMapper.builder().build();
  private final AtomicBoolean building = new AtomicBoolean();
  private final Map<String, Manifest> current = new ConcurrentHashMap<>();
  private final Map<String, Long> modified = new ConcurrentHashMap<>();
  private volatile long retryAt;

  public NationalPlaybackService(
      JdbcTemplate jdbc,
      @Value("${permit.playback.national-directory:data/playback/national}") String directory) {
    this.jdbc = jdbc;
    this.directory = Path.of(directory).toAbsolutePath().normalize();
    for (var region : REGIONS) reload(region.id());
  }

  private static Region region(String id, String name, double w, double s, double e, double n) {
    return new Region(id, name, new double[] {w, s, e, n});
  }

  public static Region requireRegion(String id) {
    return REGIONS.stream()
        .filter(r -> r.id().equals(id))
        .findFirst()
        .orElseThrow(() -> new IllegalArgumentException("Unknown playback region"));
  }

  static String classifyAddress(String road, String lot) {
    String address = road == null || road.isBlank() ? lot : road;
    if (address == null || address.isBlank()) return null;
    String first = address.strip().split("\\s+", 2)[0];
    return ADDRESS_REGIONS.get(first);
  }

  static boolean inside(double longitude, double latitude, double[] box) {
    return Double.isFinite(longitude)
        && Double.isFinite(latitude)
        && longitude >= box[0]
        && longitude <= box[2]
        && latitude >= box[1]
        && latitude <= box[3];
  }

  private Path regionDirectory(String id) {
    requireRegion(id);
    return directory.resolve(id);
  }

  public Path binaryPath(String id, String version) {
    if (version == null || !version.matches("[a-f0-9]{16}"))
      throw new IllegalArgumentException("Invalid playback version");
    return regionDirectory(id).resolve("events-" + version + ".bin");
  }

  private void reload(String id) {
    try {
      Path file = regionDirectory(id).resolve("manifest.json");
      if (Files.exists(file)
          && Files.getLastModifiedTime(file).toMillis() != modified.getOrDefault(id, 0L)) {
        var value = mapper.readValue(file.toFile(), Manifest.class);
        if (id.equals(value.regionId())
            && value.recordBytes() == 16
            && !value.categories().isEmpty()
            && Files.size(binaryPath(id, value.version())) == value.count() * 16) {
          current.put(id, value);
          modified.put(id, Files.getLastModifiedTime(file).toMillis());
        }
      }
    } catch (Exception error) {
      org.slf4j.LoggerFactory.getLogger(getClass())
          .warn("Regional playback snapshot needs rebuilding: {} {}", id, error.getMessage());
    }
  }

  public Manifest manifest(String id) {
    requireRegion(id);
    reload(id);
    if (!current.containsKey(id)
        && System.currentTimeMillis() >= retryAt
        && building.compareAndSet(false, true)) {
      Thread.startVirtualThread(() -> {
        try {
          refreshOwned();
        } catch (ExportAlreadyRunningException busy) {
          retryAt = System.currentTimeMillis() + 2000;
        } catch (Exception error) {
          retryAt = System.currentTimeMillis() + 30000;
          org.slf4j.LoggerFactory.getLogger(getClass())
              .error("National playback export failed", error);
        } finally {
          building.set(false);
        }
      });
    }
    return current.get(id);
  }

  public List<Manifest> refresh() throws IOException {
    if (!building.compareAndSet(false, true))
      throw new IllegalStateException("Playback export already running");
    try {
      return refreshOwned();
    } finally {
      building.set(false);
    }
  }

  private List<Manifest> refreshOwned() throws IOException {
    Files.createDirectories(directory);
    // The CLI and HTTP server have separate JVMs. Keep this file in place: its OS lock,
    // not file existence, indicates ownership and releases automatically on process exit.
    try (var channel =
        FileChannel.open(
            directory.resolve(".export.lock"),
            StandardOpenOption.CREATE,
            StandardOpenOption.WRITE)) {
      FileLock lock;
      try {
        lock = channel.tryLock();
      } catch (OverlappingFileLockException busy) {
        throw new ExportAlreadyRunningException();
      }
      if (lock == null) throw new ExportAlreadyRunningException();
      try (lock) {
        return refreshLocked();
      }
    }
  }

  private List<Manifest> refreshLocked() throws IOException {
    var categories = new ArrayList<SeoulPlaybackService.Category>();
    var codes = new HashMap<String, Integer>();
    for (var category : MapQueryService.CATEGORIES) {
      codes.put(category.id(), categories.size());
      categories.add(
          new SeoulPlaybackService.Category(categories.size(), category.id(), category.name()));
    }
    LocalDate now = LocalDate.now(ZoneId.of("Asia/Seoul")),
        start = LocalDate.of(1990, 1, 1),
        end = now.withDayOfMonth(1).plusMonths(1);
    int maxMonth = (now.getYear() - 1990) * 12 + now.getMonthValue() - 1;
    var partitions = new LinkedHashMap<String, Partition>();
    long[] audit = new long[5];
    try {
      for (var region : REGIONS)
        partitions.put(
            region.id(),
            new Partition(
                region, regionDirectory(region.id()), (maxMonth + 1) * 2 * categories.size()));
      jdbc.query(
          connection -> {
            connection.setAutoCommit(false);
            var statement =
                connection.prepareStatement(
                    """
                    SELECT t.id,t.category_id,t.permitted_on,t.closed_on,p.road_address,p.lot_address,
                        ST_X(ST_Transform(t.geom,4326)) AS longitude,ST_Y(ST_Transform(t.geom,4326)) AS latitude
                    FROM national_permit_map_tile_point t JOIN national_permit_current p ON p.id=t.id
                    WHERE (t.permitted_on>=? AND t.permitted_on<?) OR (t.closed_on>=? AND t.closed_on<?)
                    ORDER BY t.id
                    """);
            statement.setObject(1, start);
            statement.setObject(2, end);
            statement.setObject(3, start);
            statement.setObject(4, end);
            statement.setFetchSize(10000);
            statement.setQueryTimeout(1800);
            return statement;
          },
          (ResultSetExtractor<Void>)
              rs -> {
                while (rs.next()) {
                  LocalDate[] dates = {
                    rs.getObject("permitted_on", LocalDate.class),
                    rs.getObject("closed_on", LocalDate.class)
                  };
                  int eligible = 0;
                  for (var date : dates)
                    if (date != null && !date.isBefore(start) && date.isBefore(end)) eligible++;
                  audit[0] += eligible;
                  String id =
                      classifyAddress(rs.getString("road_address"), rs.getString("lot_address"));
                  if (id == null) {
                    audit[1] += eligible;
                    continue;
                  }
                  var partition = partitions.get(id);
                  double longitude = rs.getDouble("longitude"), latitude = rs.getDouble("latitude");
                  if (!inside(longitude, latitude, partition.region.bbox())) {
                    audit[2] += eligible;
                    continue;
                  }
                  Integer category = codes.get(rs.getString("category_id"));
                  if (category == null) {
                    audit[3] += eligible;
                    continue;
                  }
                  for (int kind = 0; kind < 2; kind++) {
                    LocalDate date = dates[kind];
                    if (date == null || date.isBefore(start) || !date.isBefore(end)) continue;
                    int month = (date.getYear() - 1990) * 12 + date.getMonthValue() - 1;
                    try {
                      SeoulPlaybackService.writeEvent(
                          partition.output,
                          rs.getLong("id"),
                          (float) longitude,
                          (float) latitude,
                          month,
                          kind,
                          category);
                    } catch (IOException error) {
                      throw new UncheckedIOException(error);
                    }
                    partition.histogram[(month * 2 + kind) * categories.size() + category]++;
                    partition.totals[kind]++;
                    audit[4]++;
                  }
                }
                return null;
              });
      for (var partition : partitions.values()) partition.close();
      String generatedAt = Instant.now().toString();
      var summary = new ExportSummary(audit[0], audit[1], audit[2], audit[3], audit[4]);
      var result = new ArrayList<Manifest>();
      // Finish all streams before publishing any manifest; each manifest/binary pair is atomic.
      for (var partition : partitions.values()) {
        String sha = HexFormat.of().formatHex(partition.digest.digest()),
            version = sha.substring(0, 16),
            id = partition.region.id();
        Path binary = binaryPath(id, version);
        if (Files.exists(binary)) Files.delete(partition.temporary);
        else Files.move(partition.temporary, binary, StandardCopyOption.ATOMIC_MOVE);
        var manifest =
            new Manifest(
                version,
                "/api/v1/map/playback/national/" + id + "/events.bin?v=" + version,
                partition.totals[0] + partition.totals[1],
                0,
                maxMonth,
                maxMonth,
                16,
                1990,
                List.copyOf(categories),
                partition.histogram,
                partition.totals[0],
                partition.totals[1],
                generatedAt,
                partition.region.name(),
                partition.region.bbox().clone(),
                "현재 도로명주소 우선, 비어 있으면 지번주소의 시도명 기준; 광주·전남 및 전남광주통합특별시는 현재 통합 범위로 합산; 좌표 범위 검사; 과거 주소 복원 아님",
                sha,
                id,
                summary);
        Path pending = Files.createTempFile(regionDirectory(id), "manifest-", ".tmp");
        try {
          mapper.writeValue(pending.toFile(), manifest);
          Files.move(
              pending,
              regionDirectory(id).resolve("manifest.json"),
              StandardCopyOption.REPLACE_EXISTING,
              StandardCopyOption.ATOMIC_MOVE);
        } finally {
          Files.deleteIfExists(pending);
        }
        current.put(id, manifest);
        modified.put(
            id, Files.getLastModifiedTime(regionDirectory(id).resolve("manifest.json")).toMillis());
        result.add(manifest);
      }
      return List.copyOf(result);
    } finally {
      for (var partition : partitions.values()) {
        try {
          partition.close();
        } finally {
          Files.deleteIfExists(partition.temporary);
        }
      }
    }
  }

  public record Region(String id, String name, double[] bbox) {}

  public record ExportSummary(
      long scannedEvents,
      long unknownAddressEvents,
      long invalidCoordinateEvents,
      long unknownCategoryEvents,
      long publishedEvents) {}

  @io.swagger.v3.oas.annotations.media.Schema(name = "NationalPlaybackManifest", description = "재생 파일 메타데이터. binaryUrl로 파일을 내려받은 후 FE에서 필터링합니다.")
  public record Manifest(
      String version,
      String binaryUrl,
      long count,
      int minMonth,
      int maxMonth,
      int currentMonth,
      int recordBytes,
      int monthBase,
      List<SeoulPlaybackService.Category> categories,
      long[] monthlyCounts,
      long opens,
      long closes,
      String generatedAt,
      String region,
      double[] bbox,
      String regionBasis,
      String sha256,
      String regionId,
      ExportSummary exportSummary) {}

  public static class ExportAlreadyRunningException extends IllegalStateException {
    ExportAlreadyRunningException() {
      super(
          "National playback export is already running in another process; wait for publication or retry later.");
    }
  }

  private static final class Partition implements AutoCloseable {
    final Region region;
    final Path temporary;
    final MessageDigest digest;
    final OutputStream output;
    final long[] histogram;
    final long[] totals = new long[2];

    Partition(Region region, Path directory, int histogramSize) throws IOException {
      this.region = region;
      Files.createDirectories(directory);
      temporary = Files.createTempFile(directory, "events-", ".tmp");
      try {
        digest = MessageDigest.getInstance("SHA-256");
      } catch (NoSuchAlgorithmException error) {
        throw new IllegalStateException(error);
      }
      output =
          new BufferedOutputStream(
              new DigestOutputStream(Files.newOutputStream(temporary), digest));
      histogram = new long[histogramSize];
    }

    public void close() throws IOException {
      output.close();
    }
  }
}
