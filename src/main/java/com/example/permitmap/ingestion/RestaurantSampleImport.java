package com.example.permitmap.ingestion;

import com.example.permitmap.PermitMapApplication;
import java.nio.file.Path;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;

/** 명시적으로 실행할 때만 적재하며 HTTP 서버를 열지 않는다. */
public class RestaurantSampleImport {

  public static void main(String[] args) throws Exception {
    if (args.length != 1) {
      throw new IllegalArgumentException("Usage: RestaurantSampleImport <sample.json>");
    }

    var application = new SpringApplication(PermitMapApplication.class);
    application.setWebApplicationType(WebApplicationType.NONE);

    try (var context = application.run()) {
      var result = context.getBean(RestaurantSampleImporter.class).importSample(Path.of(args[0]));

      System.out.printf(
          "Rows: %d%nInserted: %d%nUpdated: %d%nUnchanged: %d%n"
              + "Rejected: %d%nAccepted without source coordinates: %d%n",
          result.validation().rows().size(),
          result.inserted(),
          result.updated(),
          result.unchanged(),
          result.validation().rejectedCount(),
          result.validation().acceptedWithoutCoordinatesCount());

      for (var row : result.validation().rows()) {
        for (var issue : row.issues()) {
          System.out.printf(
              "row=%d severity=%s code=%s field=%s%n",
              row.rowNumber(), issue.severity(), issue.code(), issue.field());
        }
      }
    }
  }
}
