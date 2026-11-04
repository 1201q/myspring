package com.example.permitmap.ingestion.national;

import java.nio.file.Path;
import java.time.LocalDate;
import java.util.HashMap;
import org.springframework.boot.SpringApplication;
import com.example.permitmap.PermitMapApplication;

/**
 * This first CLI is deliberately local-only; it never selects the default
 * PostgreSQL profile.
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
        try (var context = app.run("--spring.profiles.active=import-local", "--spring.main.web-application-type=none",
                "--spring.config.import=",
                "--spring.datasource.url=jdbc:h2:file:./data/national-import-db;DB_CLOSE_ON_EXIT=FALSE",
                "--spring.datasource.driver-class-name=org.h2.Driver", "--spring.datasource.username=sa",
                "--spring.datasource.password=",
                "--spring.jpa.show-sql=false")) {
            var result = context.getBean(NationalPermitBatchImporter.class).importCsv(category,
                    Path.of(values.get("input")),
                    LocalDate.parse(values.get("snapshot")), values.get("resume"), 500);
            System.out.println("NATIONAL_IMPORT " + result);
        }
    }
}
