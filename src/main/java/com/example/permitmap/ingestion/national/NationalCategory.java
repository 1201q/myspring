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
            if (!entry.path("slug").asString().equals(id))
                continue;
            if (!entry.path("record_kind").asString().equals("PERMIT") ||
                    !entry.path("schema_check").asString().equals("OK"))
                throw new IllegalArgumentException("Select a verified permit category");
            var fields = new LinkedHashMap<String, String>();
            for (var field : entry.path("fields"))
                fields.put(field.path("name").asString(), field.path("label").asString());
            Integer crs = entry.path("declared_crs").asString("").equals("EPSG:5174") ? 5174 : null;
            return new NationalCategory(id, entry.path("name").asString(), entry.path("source_group").asString(),
                    entry.path("capabilities").path("close_date").asBoolean(), crs, Map.copyOf(fields),
                    entry.path("csv_audit").path("sha256").asString(null));
        }
        throw new IllegalArgumentException("Unknown category: " + id);
    }
}
