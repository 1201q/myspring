package com.example.permitmap.business;

import com.example.permitmap.business.dto.BusinessPageResponse;
import com.example.permitmap.business.dto.BusinessResponse;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/businesses")
public class BusinessController {

  private final BusinessService service;

  public BusinessController(BusinessService service) {
    this.service = service;
  }

  @GetMapping
  public BusinessPageResponse getBusinesses(
      @RequestParam(name = "date", required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
          LocalDate date,
      @RequestParam(name = "page", defaultValue = "0") int page,
      @RequestParam(name = "size", defaultValue = "20") int size) {
    return service.findAll(date, page, size);
  }

  @GetMapping("/{id}")
  public BusinessResponse getBusiness(@PathVariable("id") Long id) {
    return service.findById(id);
  }
}
