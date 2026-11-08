package com.example.permitmap.map;

import com.example.permitmap.PermitMapApplication;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.WebApplicationType;

public class NationalPlaybackExport {
    public static void main(String[] args) throws Exception {
        var application=new SpringApplication(PermitMapApplication.class);
        application.setWebApplicationType(WebApplicationType.NONE);
        try(var context=application.run(args)) {
            var manifests=context.getBean(NationalPlaybackService.class).refresh();
            for(var manifest:manifests) System.out.println(manifest.regionId()+": "+manifest.count()+" events, version "+manifest.version());
            System.out.println("National playback exported: "+manifests.getFirst().exportSummary());
        }
    }
}
