package com.example.permitmap.ingestion;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Propagation;

import com.example.permitmap.business.PermitBusiness;
import com.example.permitmap.business.PermitBusinessRepository;

import jakarta.persistence.EntityManager;

@SpringBootTest
@Transactional
class RestaurantSampleImporterTests {

    @Autowired
    private RestaurantSampleImporter importer;

    @Autowired
    private PermitBusinessRepository repository;

    @Autowired
    private SeoulRestaurantSampleReader reader;

    @Autowired
    private EntityManager entityManager;

    @TempDir
    Path directory;

    @Test
    void 실제_샘플을_두번_넣어도_50건만_저장된다() throws IOException {
        var path = Path.of("docs/data-samples/guro-restaurants.sample.json");
        var first = importer.importSample(path);
        entityManager.clear();
        var second = importer.importSample(path);
        entityManager.clear();

        assertEquals(50, first.inserted());
        assertEquals(0, first.updated());
        assertEquals(0, first.validation().rejectedCount());
        assertEquals(10, first.validation().acceptedWithoutCoordinatesCount());
        assertEquals(0, second.inserted());
        assertEquals(0, second.updated());
        assertEquals(50, second.unchanged());
        assertEquals(50, repository.count());
    }

    @Test
    void 같은_관리번호의_수정은_기존_ID를_유지하며_DB에_반영한다() throws IOException {
        var path = input(row("3160000", "same-id", "첫식당", "2024-01-01", "", "187383"));
        importer.importSample(path);
        var originalId = find("same-id").getId();

        path = input(row("3160000", "same-id", "새식당", "2024-01-01", "2024-05-01", "187383"));
        var result = importer.importSample(path);
        entityManager.clear();
        var saved = find("same-id");

        assertEquals(0, result.inserted());
        assertEquals(1, result.updated());
        assertEquals(1, repository.count());
        assertEquals(originalId, saved.getId());
        assertEquals("새식당", saved.getName());
        assertEquals(LocalDate.of(2024, 5, 1), saved.getClosedAt());
        assertEquals(5174, saved.getSourceCrs());
        assertTrue(saved.getSourceJson().contains("2024-05-01"));
    }

    @Test
    void 오류행은_제외하고_좌표없는_정상행은_경고와_함께_저장한다() throws IOException {
        var path = input(
                row("3160000", "bad-date", "오류식당", "2024-02-30", "", "187383"),
                row("3160000", "no-coordinates", "정상식당", "2024-01-01", "", ""));
        var result = importer.importSample(path);
        entityManager.clear();
        var saved = find("no-coordinates");

        assertEquals(1, result.inserted());
        assertEquals(1, result.validation().rejectedCount());
        assertEquals(1, result.validation().acceptedWithoutCoordinatesCount());
        assertEquals(1, repository.count());
        assertNull(saved.getSourceX());
        assertNull(saved.getSourceY());
        assertTrue(saved.getIssuesJson().contains("MISSING_COORDINATE"));
    }

    @Test
    void 다른_지역을_구로구_데이터로_기록하지_않는다() throws IOException {
        var path = input(
                row("3160000", "guro", "구로식당", "2024-01-01", "", "187383"),
                row("3000000", "other", "다른식당", "2024-01-01", "", "187383"));
        assertThrows(IllegalArgumentException.class, () -> importer.importSample(path));
        assertEquals(0, repository.count());
    }

    @Test
    void DB_유일제약으로_동일_원천과_관리번호의_중복을_차단한다() throws IOException {
        var path = input(row("3160000", "unique-id", "식당", "2024-01-01", "", "187383"));
        importer.importSample(path);
        var validation = reader.read(path).rows().getFirst();
        var saved = find("unique-id");
        var duplicate = new PermitBusiness(RestaurantSampleImporter.SOURCE_DATASET,
                validation, saved.getSourceJson(), saved.getIssuesJson());

        assertThrows(DataIntegrityViolationException.class, () -> repository.saveAndFlush(duplicate));
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void DB_저장에_실패하면_앞서_저장한_행도_롤백한다() throws IOException {
        var before = repository.count();
        var path = input(
            row("3160000", "rollback-first", "정상식당", "2024-01-01", "", "187383"),
            row("3160000", "rollback-overflow", "범위초과식당", "2024-01-01", "", "123456789012345678901")
        );
        assertThrows(DataIntegrityViolationException.class, () -> importer.importSample(path));
        assertEquals(before, repository.count());
        assertTrue(repository.findBySourceDatasetAndManagementNumber(
            RestaurantSampleImporter.SOURCE_DATASET, "rollback-first").isEmpty());
    }

    private PermitBusiness find(String managementNumber) {
        return repository.findBySourceDatasetAndManagementNumber(
                RestaurantSampleImporter.SOURCE_DATASET, managementNumber).orElseThrow();
    }

    private Path input(String... rows) throws IOException {
        var path = directory.resolve("sample.json");
        Files.writeString(path, "[" + String.join(",", rows) + "]");
        return path;
    }

    private String row(String municipality, String id, String name, String permitted, String closed, String x) {
        return """
                {"OPNSFTEAMCODE":"%s","MGTNO":"%s","BPLCNM":"%s",
                 "APVPERMYMD":"%s","DCBYMD":"%s","X":"%s","Y":"444494"}
                """.formatted(municipality, id, name, permitted, closed, x);
    }
}
