package com.example.permitmap.business;

import java.time.LocalDate;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface PermitBusinessRepository extends JpaRepository<PermitBusiness, Long> {
  Optional<PermitBusiness> findBySourceDatasetAndManagementNumber(
      String sourceDataset, String managementNumber);

  @Query(
      """
      SELECT b FROM PermitBusiness b
      WHERE b.permittedAt <= :date
        AND (b.closedAt IS NULL OR b.closedAt > :date)
      """)
  Page<PermitBusiness> findActiveAt(@Param("date") LocalDate date, Pageable pageable);
}
