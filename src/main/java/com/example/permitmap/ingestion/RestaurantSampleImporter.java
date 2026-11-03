package com.example.permitmap.ingestion;

import java.io.IOException;
import java.nio.file.Path;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.example.permitmap.business.PermitBusiness;
import com.example.permitmap.business.PermitBusinessRepository;

import tools.jackson.databind.json.JsonMapper;

@Service
public class RestaurantSampleImporter {

    public static final String SOURCE_DATASET = "seoul:OA-18668";
    private final SeoulRestaurantSampleReader reader;
    private final PermitBusinessRepository repository;
    private final JsonMapper mapper = JsonMapper.builder().build();

    public RestaurantSampleImporter(SeoulRestaurantSampleReader reader, PermitBusinessRepository repository) {
        this.reader = reader;
        this.repository = repository;
    }

    @Transactional
    public ImportResult importSample(Path path) throws IOException {
        var report = reader.read(path);
        // 다른 지역 데이터를 구로구 출처로 잘못 저장하지 않는다.
        if (report.rows().stream().filter(row -> row.accepted())
                .anyMatch(row -> !"3160000".equals(row.source().municipalityCode().strip()))) {
            throw new IllegalArgumentException("This importer only accepts Seoul Guro-gu (3160000).");
        }

        int inserted = 0;
        int updated = 0;
        int unchanged = 0;

        for (var row : report.rows()) {
            if (!row.accepted()) {
                continue;
            }

            var sourceJson = mapper.writeValueAsString(row.source());
            var issuesJson = mapper.writeValueAsString(row.issues());
            var existing = repository.findBySourceDatasetAndManagementNumber(
                    SOURCE_DATASET, row.source().managementNumber().strip());

            if (existing.isEmpty()) {
                repository.save(new PermitBusiness(SOURCE_DATASET, row, sourceJson, issuesJson));
                inserted++;
            } else if (existing.get().hasSameContent(sourceJson, issuesJson)) {
                unchanged++;
            } else {
                existing.get().refresh(row, sourceJson, issuesJson);
                updated++;
            }
        }

        repository.flush();
        return new ImportResult(inserted, updated, unchanged, report);
    }

    public record ImportResult(int inserted, int updated, int unchanged,
            RestaurantValidationReport validation) {
    }
}
