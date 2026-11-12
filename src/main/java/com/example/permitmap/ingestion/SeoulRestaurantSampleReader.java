package com.example.permitmap.ingestion;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import org.springframework.stereotype.Component;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.json.JsonMapper;

@Component
public class SeoulRestaurantSampleReader {

  private final JsonMapper mapper =
      JsonMapper.builder().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
  private final SeoulRestaurantValidator validator;

  public SeoulRestaurantSampleReader(SeoulRestaurantValidator validator) {
    this.validator = validator;
  }

  public RestaurantValidationReport read(Path path) throws IOException {
    try (var input = Files.newInputStream(path)) {
      return read(input);
    }
  }

  /** JSON 파서는 읽기 완료 또는 실패 시 입력 스트림을 닫는다. */
  public RestaurantValidationReport read(InputStream input) {
    SeoulRestaurantRow[] rows;
    try {
      rows = mapper.readValue(input, SeoulRestaurantRow[].class);
    } catch (JacksonException exception) {
      throw new IllegalArgumentException("Expected a Seoul restaurant JSON array.", exception);
    }
    if (rows == null) {
      throw new IllegalArgumentException("Expected a JSON array, not null.");
    }
    return validator.validate(Arrays.asList(rows));
  }
}
