package com.example.permitmap.ingestion.national;

import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;
import tools.jackson.databind.json.JsonMapper;

public record NationalCategory(String id, String name, String group, boolean closeDateSupported,
        Integer declaredCrs, Map<String, String> fields, String auditedCsvSha256) {
    public static NationalCategory read(Path catalog, String id) {
        if (!id.matches("[a-z0-9_]+"))
            throw new IllegalArgumentException("Invalid service ID");
        var root = JsonMapper.builder().build().readTree(catalog.toFile());
        for (var entry : root.path("services")) {
            if (!entry.path("slug").asText().equals(id))
                continue;
            if (!entry.path("record_kind").asText().equals("PERMIT") ||
                    !entry.path("schema_check").asText().equals("OK"))
                throw new IllegalArgumentException("Select a verified permit category");
            var fields = new LinkedHashMap<String, String>();
            for (var field : entry.path("fields"))
                fields.put(field.path("name").asText(), field.path("label").asText());
            Integer crs = entry.path("declared_crs").asText("").equals("EPSG:5174") ? 5174 : null;
            return new NationalCategory(id, entry.path("name").asText(), entry.path("source_group").asText(),
                    entry.path("capabilities").path("close_date").asBoolean(), crs, Map.copyOf(fields),
                    entry.path("csv_audit").path("sha256").asText(null));
        }
        throw new IllegalArgumentException("Unknown category: " + id);
    }
}
