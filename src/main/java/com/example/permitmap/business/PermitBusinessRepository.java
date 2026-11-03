package com.example.permitmap.business;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PermitBusinessRepository extends JpaRepository<PermitBusiness, Long> {
    Optional<PermitBusiness> findBySourceDatasetAndManagementNumber(
        String sourceDataset, String managementNumber);
}
