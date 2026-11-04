package com.example.permitmap.ingestion.national;

import java.nio.file.Path;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;
import org.springframework.boot.SpringApplication;
import com.example.permitmap.PermitMapApplication;

/**
 * Local H2 by default; PostgreSQL requires an explicit target and database name.
 */
public class NationalPermitImport {
    public static void main(String[] args) throws Exception {
        var values = new HashMap<String, String>();
        for (var arg : args) {
            var pair = arg.replaceFirst("^--", "").split("=", 2);
            if (pair.length != 2)
                throw new IllegalArgumentException("Use --key=value");
            values.put(pair[0], pair[1]);
        }
        for (var required : new String[] { "category", "input", "snapshot" })
            if (!values.containsKey(required))
                throw new IllegalArgumentException("Required: --category, --input, --snapshot");
        var category = NationalCategory.read(Path.of("docs/data-samples/national/category-catalog.json"),
                values.get("category"));
        var app = new SpringApplication(PermitMapApplication.class);
        try (var context = app.run(databaseArguments(values))) {
            var result = context.getBean(NationalPermitBatchImporter.class).importCsv(category,
                    Path.of(values.get("input")),
                    LocalDate.parse(values.get("snapshot")), values.get("resume"), 500);
            System.out.println("NATIONAL_IMPORT " + result);
        }
    }

    static String[] databaseArguments(Map<String, String> values) {
        var target = values.getOrDefault("target", "local");
        if (target.equals("local")) return new String[] {"--spring.profiles.active=import-local", "--spring.main.web-application-type=none",
                "--spring.config.import=",
                "--spring.datasource.url=jdbc:h2:file:./data/national-import-db;DB_CLOSE_ON_EXIT=FALSE",
                "--spring.datasource.driver-class-name=org.h2.Driver", "--spring.datasource.username=sa",
                "--spring.datasource.password=",
                "--spring.jpa.show-sql=false"};
        if (!target.equals("postgres")) throw new IllegalArgumentException("target must be local or postgres");
        var database = values.getOrDefault("database", "");
        if (!database.equals("permit_map_dev") && !database.matches("permit_map_verify_[a-z0-9_]+"))
            throw new IllegalArgumentException("Explicit database must be permit_map_dev or permit_map_verify_...");
        return new String[] {"--spring.profiles.active=postgres", "--spring.main.web-application-type=none",
                "--spring.config.import=optional:file:./.env.postgres[.properties]",
                "--spring.datasource.url=jdbc:postgresql://127.0.0.1:15432/" + database,
                "--spring.datasource.driver-class-name=org.postgresql.Driver",
                "--spring.datasource.hikari.maximum-pool-size=3", "--spring.datasource.hikari.minimum-idle=1",
                "--spring.jpa.show-sql=false"};
    }
}
