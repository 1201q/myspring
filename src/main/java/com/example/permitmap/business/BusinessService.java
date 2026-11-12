package com.example.permitmap.business;

import com.example.permitmap.business.dto.BusinessPageResponse;
import com.example.permitmap.business.dto.BusinessResponse;
import com.example.permitmap.business.exception.BusinessNotFoundException;
import com.example.permitmap.business.exception.InvalidBusinessQueryException;
import com.example.permitmap.map.KoreanCoordinateConverter;
import java.time.LocalDate;
import org.springframework.data.core.TypedPropertyPath;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class BusinessService {

  private final PermitBusinessRepository repository;
  private final KoreanCoordinateConverter coordinateConverter;

  public BusinessService(
      PermitBusinessRepository repository, KoreanCoordinateConverter coordinateConverter) {
    this.repository = repository;
    this.coordinateConverter = coordinateConverter;
  }

  public BusinessPageResponse findAll(LocalDate date, int page, int size) {
    if (page < 0 || size < 1 || size > 100) {
      throw new InvalidBusinessQueryException();
    }

    var pageable =
        PageRequest.of(
            page, size, Sort.by(TypedPropertyPath.path(PermitBusiness::getId)).ascending());

    // 날짜 조건 없이 조회 / 해당 날짜에 영업중이었을 것으로 추정되는 사업장 조회
    // 허가일이 조회 날짜 이전 or 당일. 폐업일이 없거나 조회 날짜 이후
    var result =
        date == null ? repository.findAll(pageable) : repository.findActiveAt(date, pageable);

    return new BusinessPageResponse(
        result.map(this::toResponse).getContent(),
        result.getNumber(),
        result.getSize(),
        result.getTotalElements(),
        result.getTotalPages(),
        date,
        date == null ? "SOURCE_SNAPSHOT" : "DATE_INFERRED");
  }

  public BusinessResponse findById(Long id) {
    return repository
        .findById(id)
        .map(this::toResponse)
        .orElseThrow(BusinessNotFoundException::new);
  }

  private BusinessResponse toResponse(PermitBusiness business) {
    return BusinessResponse.from(
        business,
        coordinateConverter.convert(
            business.getSourceX(), business.getSourceY(), business.getSourceCrs()));
  }
}
