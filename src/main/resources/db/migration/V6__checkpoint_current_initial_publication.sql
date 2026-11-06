CREATE TABLE permit_current_publication (
    run_id VARCHAR(36) PRIMARY KEY REFERENCES permit_import_run(id),
    source_rows BIGINT NOT NULL CHECK(source_rows>0),
    published_rows BIGINT NOT NULL DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    CHECK(published_rows>=0 AND published_rows<=source_rows)
);
-- Initial publication commits in ranges; expose only a completed source run.
CREATE VIEW national_permit_published AS
SELECT p.* FROM national_permit_current p
JOIN permit_import_run r ON r.id=p.run_id AND r.status='COMPLETED';
DROP VIEW national_permit_current_event;
CREATE VIEW national_permit_current_event AS
SELECT id AS permit_id,category_id,'OPEN' AS event_type,permitted_on AS event_date,
       'SOURCE_PERMIT_DATE' AS date_basis FROM national_permit_published WHERE permitted_on IS NOT NULL
UNION ALL
SELECT id,category_id,'CLOSE',closed_on,'SOURCE_CLOSE_DATE'
FROM national_permit_published WHERE closed_on IS NOT NULL;
