package com.example.permitmap.ingestion.national;

import java.io.IOException;
import java.io.InputStreamReader;
import java.io.PushbackReader;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.DigestInputStream;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.DuplicateHeaderMode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

@Service
public class NationalPermitBatchImporter {
    private static final String COLUMNS = "name,lot_address,road_address,business_type,permitted_on,closed_on," +
            "raw_status_code,raw_status_name,raw_detail_status_code,raw_detail_status_name," +
            "source_x,source_y,source_crs,raw_json,issues_json,content_hash";
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public NationalPermitBatchImporter(JdbcTemplate jdbc, PlatformTransactionManager manager) {
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(manager);
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    }

    public record Result(String runId, long rows, long inserted, long updated, long unchanged) {
    }

    public Result importCsv(NationalCategory category, Path input, LocalDate snapshot, String resume, int chunkSize)
            throws IOException {
        if (chunkSize < 1 || chunkSize > 5000)
            throw new IllegalArgumentException("Chunk size must be 1..5000");
        if (snapshot.isAfter(LocalDate.now(ZoneOffset.ofHours(9))))
            throw new IllegalArgumentException("Snapshot cannot be in the future");
        var sha = fingerprint(input);
        var contract = NationalRowNormalizer
                .sha256(("normalizer-v1|" + new java.util.TreeMap<>(category.fields()) + "|" +
                        category.declaredCrs() + "|" + category.closeDateSupported()).getBytes(StandardCharsets.UTF_8));
        var metadata = JsonMapper.builder().build().readTree(input
                .resolveSibling(input.getFileName().toString().replaceFirst("\\.csv$", ".download.json")).toFile());
        var expectedSha = metadata.path("sha256").asText("");
        if (expectedSha.isEmpty())
            expectedSha = category.auditedCsvSha256();
        if (!metadata.path("url").asText()
                .equals("https://file.localdata.go.kr/file/download/" + category.id() + "/info") ||
                metadata.path("bytes").asLong() != Files.size(input) ||
                !sha.equals(expectedSha))
            throw new IllegalArgumentException("CSV provenance mismatch");
        String run = resume == null ? UUID.randomUUID().toString() : resume;
        // Acquisition and run creation are one transaction; no orphaned lock on setup
        // failure.
        long checkpoint = Objects.requireNonNull(tx.execute(status -> {
            if (jdbc.update(
                    "UPDATE permit_import_lock SET owner_run=? WHERE id=1 AND (owner_run IS NULL OR owner_run=?)", run,
                    run) != 1)
                throw new IllegalStateException("Another import owns the lock; resume that run first");
            var newer = jdbc.queryForObject(
                    "SELECT COUNT(*) FROM permit_import_run WHERE category_id=? AND status='COMPLETED' AND source_as_of>?",
                    Long.class, category.id(), snapshot);
            if (newer != null && newer > 0)
                throw new IllegalArgumentException("A newer snapshot has already been published");
            if (resume != null) {
                var old = jdbc.queryForMap("SELECT * FROM permit_import_run WHERE id=?", run);
                if (!old.get("CATEGORY_ID").equals(category.id()) || !old.get("SOURCE_SHA256").equals(sha)
                        || !old.get("CONTRACT_HASH").equals(contract) ||
                        !old.get("SOURCE_AS_OF").toString().equals(snapshot.toString())
                        || old.get("STATUS").equals("COMPLETED"))
                    throw new IllegalArgumentException(
                            "Resume requires same category, bytes and snapshot, and an incomplete run");
                var superseded = jdbc.queryForObject(
                        "SELECT COUNT(*) FROM permit_import_run WHERE category_id=? AND status='COMPLETED' " +
                                "AND started_at>(SELECT started_at FROM permit_import_run WHERE id=?)",
                        Long.class, category.id(), run);
                if (superseded != null && superseded > 0)
                    throw new IllegalArgumentException("A later import superseded this incomplete run");
                jdbc.update(
                        "UPDATE permit_import_run SET status='STAGING', error_summary=NULL,finished_at=NULL WHERE id=?",
                        run);
                return ((Number) old.get("PROCESSED_ROWS")).longValue();
            }
            if (jdbc.update(
                    "UPDATE permit_category SET name=?,source_group=?,close_date_supported=? WHERE service_id=?",
                    category.name(), category.group(), category.closeDateSupported(), category.id()) == 0)
                jdbc.update(
                        "INSERT INTO permit_category(service_id,name,source_group,close_date_supported) VALUES(?,?,?,?)",
                        category.id(), category.name(), category.group(), category.closeDateSupported());
            jdbc.update(
                    "INSERT INTO permit_import_run(id,category_id,source_sha256,contract_hash,source_file,source_as_of,started_at,status) VALUES(?,?,?,?,?,?,?,'STAGING')",
                    run, category.id(), sha, contract, input.toAbsolutePath().toString(), snapshot,
                    OffsetDateTime.now(ZoneOffset.UTC));
            return 0L;
        }));
        try {
            stage(category, input, snapshot, run, checkpoint, chunkSize);
            if (!fingerprint(input).equals(sha))
                throw new IllegalStateException("Source file changed during import");
            jdbc.update("UPDATE permit_import_run SET status='PUBLISHING' WHERE id=?", run);
            return Objects.requireNonNull(tx.execute(status -> publish(category, run, snapshot)));
        } catch (IOException | RuntimeException exception) {
            tx.executeWithoutResult(status -> jdbc.update(
                    "UPDATE permit_import_run SET status='FAILED',finished_at=?,error_summary=? WHERE id=?",
                    OffsetDateTime.now(ZoneOffset.UTC),
                    exception.getClass().getSimpleName() + ": " + exception.getMessage(), run));
            throw new IllegalStateException(
                    "Import failed; run=" + run + ". Live national data unchanged. Resume with same file.", exception);
        } finally {
            jdbc.update("UPDATE permit_import_lock SET owner_run=NULL WHERE id=1 AND owner_run=?", run);
        }
    }

    private void stage(NationalCategory category, Path input, LocalDate snapshot, String run, long checkpoint,
            int chunkSize) throws IOException {
        Charset charset;
        try (var stream = Files.newInputStream(input)) {
            var header = stream.readNBytes(8192);
            // Decode only the first complete line, not a possibly split multibyte tail.
            int end = 0;
            while (end < header.length && header[end] != '\n')
                end++;
            try {
                StandardCharsets.UTF_8.newDecoder().decode(java.nio.ByteBuffer.wrap(header, 0, end));
                charset = StandardCharsets.UTF_8;
            } catch (java.nio.charset.CharacterCodingException exception) {
                charset = Charset.forName("MS949");
            }
        }
        var decoder = charset.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT);
        try (var reader = new PushbackReader(new InputStreamReader(Files.newInputStream(input), decoder), 1)) {
            int first = reader.read();
            if (first != 0xfeff && first != -1)
                reader.unread(first);
            var format = CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true).setIgnoreEmptyLines(false)
                    .setDuplicateHeaderMode(DuplicateHeaderMode.DISALLOW).get();
            try (var parser = format.parse(reader)) {
                for (var field : NationalRowNormalizer.FIELDS) {
                    var label = category.fields().get(field);
                    if (label != null && !parser.getHeaderMap().containsKey(label))
                        throw new IllegalArgumentException("CSV missing declared header: " + label);
                }
                var batch = new ArrayList<Object[]>(chunkSize);
                long count = 0;
                for (var row : parser) {
                    count = row.getRecordNumber();
                    if (count <= checkpoint)
                        continue;
                    if (!row.isConsistent())
                        throw new IllegalArgumentException("Ragged CSV record: " + count);
                    batch.add(NationalRowNormalizer.normalize(category, row.toMap(), snapshot, run, count));
                    if (batch.size() == chunkSize) {
                        saveChunk(run, count, batch);
                        batch.clear();
                    }
                }
                if (!batch.isEmpty())
                    saveChunk(run, count, batch);
                if (count == 0 || count < checkpoint)
                    throw new IllegalArgumentException("Empty CSV or invalid checkpoint");
            }
        }
    }

    private void saveChunk(String run, long checkpoint, ArrayList<Object[]> batch) {
        tx.executeWithoutResult(status -> {
            jdbc.batchUpdate(
                    "INSERT INTO permit_import_stage(run_id,row_no,municipality_code,management_number," + COLUMNS +
                            ") VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    batch);
            jdbc.update("UPDATE permit_import_run SET processed_rows=? WHERE id=?", checkpoint, run);
        });
    }

    private Result publish(NationalCategory category, String run, LocalDate snapshot) {
        long rows = jdbc.queryForObject("SELECT processed_rows FROM permit_import_run WHERE id=?", Long.class, run);
        long staged = jdbc.queryForObject("SELECT COUNT(*) FROM permit_import_stage WHERE run_id=?", Long.class, run);
        if (staged != rows)
            throw new IllegalStateException("Staged row count does not match checkpoint");
        jdbc.update(
                "INSERT INTO national_permit(category_id,municipality_code,management_number,created_run_id,last_seen_run_id) "
                        +
                        "SELECT ?,s.municipality_code,s.management_number,?,? FROM permit_import_stage s WHERE s.run_id=? AND NOT EXISTS "
                        +
                        "(SELECT 1 FROM national_permit p WHERE p.category_id=? AND p.municipality_code=s.municipality_code AND p.management_number=s.management_number)",
                category.id(), run, run, run, category.id());
        long inserted = jdbc.queryForObject("SELECT COUNT(*) FROM national_permit WHERE created_run_id=?", Long.class,
                run);
        var selectColumns = java.util.Arrays.stream(COLUMNS.split(",")).map(column -> "s." + column)
                .collect(java.util.stream.Collectors.joining(","));
        jdbc.update("INSERT INTO national_permit_version(permit_id,run_id,observed_at,source_as_of," + COLUMNS + ") " +
                "SELECT p.id,?,CURRENT_TIMESTAMP,?," + selectColumns
                + " FROM permit_import_stage s JOIN national_permit p " +
                "ON p.category_id=? AND p.municipality_code=s.municipality_code AND p.management_number=s.management_number "
                +
                "LEFT JOIN national_permit_version v ON v.id=p.current_version_id WHERE s.run_id=? AND (v.id IS NULL OR v.content_hash<>s.content_hash)",
                run, snapshot, category.id(), run);
        long changed = jdbc.queryForObject("SELECT COUNT(*) FROM national_permit_version WHERE run_id=?", Long.class,
                run);
        jdbc.update(
                "UPDATE national_permit SET current_version_id=(SELECT MAX(v.id) FROM national_permit_version v WHERE v.permit_id=national_permit.id AND v.run_id=?) "
                        +
                        "WHERE EXISTS(SELECT 1 FROM national_permit_version v WHERE v.permit_id=national_permit.id AND v.run_id=?)",
                run, run);
        jdbc.update("UPDATE national_permit SET last_seen_run_id=? WHERE category_id=? AND EXISTS " +
                "(SELECT 1 FROM permit_import_stage s WHERE s.run_id=? AND s.municipality_code=national_permit.municipality_code AND s.management_number=national_permit.management_number)",
                run, category.id(), run);
        for (var event : Map.of("OPEN", "permitted_on", "CLOSE", "closed_on").entrySet())
            jdbc.update("INSERT INTO permit_event(permit_id,version_id,event_type,event_date,date_basis) " +
                    "SELECT permit_id,id,?," + event.getValue() + ",? FROM national_permit_version WHERE run_id=? AND "
                    + event.getValue() + " IS NOT NULL",
                    event.getKey(), event.getKey().equals("OPEN") ? "SOURCE_PERMIT_DATE" : "SOURCE_CLOSE_DATE", run);
        jdbc.update(
                "UPDATE permit_import_run SET status='COMPLETED',finished_at=?,inserted_count=?,updated_count=?,unchanged_count=? WHERE id=?",
                OffsetDateTime.now(ZoneOffset.UTC), inserted, changed - inserted, rows - changed, run);
        jdbc.update("DELETE FROM permit_import_stage WHERE run_id=?", run);
        return new Result(run, rows, inserted, changed - inserted, rows - changed);
    }

    static String fingerprint(Path input) throws IOException {
        try {
            var digest = MessageDigest.getInstance("SHA-256");
            try (var stream = new DigestInputStream(Files.newInputStream(input), digest)) {
                stream.transferTo(java.io.OutputStream.nullOutputStream());
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
