package com.example.permitmap.map;

import com.example.permitmap.PermitMapApplication;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;

public class SeoulPlaybackExport {
  public static void main(String[] args) throws Exception {
    var application = new SpringApplication(PermitMapApplication.class);
    application.setWebApplicationType(WebApplicationType.NONE);
    try (var context = application.run(args)) {
      var manifest = context.getBean(SeoulPlaybackService.class).refresh();
      System.out.println(
          "Seoul playback exported: "
              + manifest.count()
              + " events, version "
              + manifest.version());
    }
  }
}
