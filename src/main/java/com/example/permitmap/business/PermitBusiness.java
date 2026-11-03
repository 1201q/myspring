package com.example.permitmap.business;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;

import com.example.permitmap.ingestion.RestaurantValidationReport.RowResult;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "permit_businesses", uniqueConstraints = @UniqueConstraint(
    name = "uk_permit_business_source", columnNames = {"source_dataset", "management_number"}))
public class PermitBusiness {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, columnDefinition = "text")
    private String sourceDataset;

    @Column(nullable = false, columnDefinition = "text")
    private String managementNumber;

    @Column(nullable = false, columnDefinition = "text")
    private String municipalityCode;

    @Column(nullable = false, columnDefinition = "text")
    private String name;

    @Column(columnDefinition = "text")
    private String lotAddress;

    @Column(columnDefinition = "text")
    private String roadAddress;

    @Column(columnDefinition = "text")
    private String businessType;

    @Column(nullable = false)
    private LocalDate permittedAt;

    private LocalDate closedAt;

    @Column(columnDefinition = "text")
    private String statusCode;

    @Column(columnDefinition = "text")
    private String detailStatusCode;

    @Column(name = "source_x", precision = 38, scale = 20)
    private BigDecimal sourceX;

    @Column(name = "source_y", precision = 38, scale = 20)
    private BigDecimal sourceY;

    @Column(nullable = false)
    private Integer sourceCrs;

    @Column(nullable = false, columnDefinition = "text")
    private String sourceJson;

    @Column(nullable = false, columnDefinition = "text")
    private String issuesJson;

    @Column(nullable = false)
    private OffsetDateTime lastImportedAt;

    protected PermitBusiness() {}

    public PermitBusiness(String sourceDataset, RowResult row, String sourceJson, String issuesJson) {
        this.sourceDataset = sourceDataset;
        this.managementNumber = row.source().managementNumber().strip();
        refresh(row, sourceJson, issuesJson);
    }

    public boolean hasSameContent(String sourceJson, String issuesJson) {
        return this.sourceJson.equals(sourceJson) && this.issuesJson.equals(issuesJson);
    }

    public void refresh(RowResult row, String sourceJson, String issuesJson) {
        this.municipalityCode = row.source().municipalityCode().strip();
        this.name = row.source().businessName().strip();
        this.lotAddress = row.source().lotAddress();
        this.roadAddress = row.source().roadAddress();
        this.businessType = row.source().businessType();
        this.permittedAt = row.permittedAt();
        this.closedAt = row.closedAt();
        this.statusCode = row.source().statusCode();
        this.detailStatusCode = row.source().detailStatusCode();
        this.sourceX = row.sourceX();
        this.sourceY = row.sourceY();
        this.sourceCrs = 5174;
        this.sourceJson = sourceJson;
        this.issuesJson = issuesJson;
        this.lastImportedAt = OffsetDateTime.now(ZoneOffset.UTC);
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getManagementNumber() { return managementNumber; }
    public LocalDate getClosedAt() { return closedAt; }
    public BigDecimal getSourceX() { return sourceX; }
    public BigDecimal getSourceY() { return sourceY; }
    public Integer getSourceCrs() { return sourceCrs; }
    public String getSourceJson() { return sourceJson; }
    public String getIssuesJson() { return issuesJson; }
}
