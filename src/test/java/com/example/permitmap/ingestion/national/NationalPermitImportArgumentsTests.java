package com.example.permitmap.ingestion.national;

import static org.junit.jupiter.api.Assertions.*;
import java.util.Arrays;
import java.util.Map;
import org.junit.jupiter.api.Test;

class NationalPermitImportArgumentsTests {
    @Test void destructive_test_setup_refuses_live_and_file_databases() {
        assertFalse(NationalPermitBatchImporterTests.disposableDatabaseUrl("jdbc:postgresql://127.0.0.1:15432/permit_map_dev"));
        assertFalse(NationalPermitBatchImporterTests.disposableDatabaseUrl("jdbc:h2:file:./data/national-import-db"));
        assertTrue(NationalPermitBatchImporterTests.disposableDatabaseUrl("jdbc:h2:mem:test"));
        assertTrue(NationalPermitBatchImporterTests.disposableDatabaseUrl("jdbc:postgresql://127.0.0.1:15432/permit_map_verify_unit"));
    }
    @Test void default_stays_local_and_does_not_import_postgres_credentials() {
        var args = Arrays.asList(NationalPermitImport.databaseArguments(Map.of()));
        assertTrue(args.contains("--spring.config.import="));
        assertTrue(args.stream().anyMatch(a -> a.startsWith("--spring.datasource.url=jdbc:h2:file:")));
    }
    @Test void postgres_requires_explicit_allowed_database() {
        assertThrows(IllegalArgumentException.class, () -> NationalPermitImport.databaseArguments(Map.of("target", "postgres")));
        assertThrows(IllegalArgumentException.class, () -> NationalPermitImport.databaseArguments(Map.of("target", "postgres", "database", "postgres")));
        assertThrows(IllegalArgumentException.class, () -> NationalPermitImport.databaseArguments(Map.of("target", "postgres", "database", "permit_map_dev?host=other")));
        var args = Arrays.asList(NationalPermitImport.databaseArguments(Map.of("target", "postgres", "database", "permit_map_verify_unit")));
        assertTrue(args.contains("--spring.datasource.url=jdbc:postgresql://127.0.0.1:15432/permit_map_verify_unit"));
        assertFalse(args.stream().anyMatch(a -> a.startsWith("--spring.datasource.password=")));
    }
}
