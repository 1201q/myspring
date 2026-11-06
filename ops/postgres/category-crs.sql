BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
SET LOCAL ROLE permit_map_app;
-- Catalog evidence resolves an initially unknown CRS without rewriting source
-- records, normalization hashes, audit issues, or historical observations.
CREATE TABLE IF NOT EXISTS permit_category_crs (
    category_id VARCHAR(100) PRIMARY KEY,
    source_crs INTEGER NOT NULL CHECK(source_crs=5174),
    evidence_url TEXT NOT NULL,
    document_text_sha256 VARCHAR(64) NOT NULL,
    catalog_title TEXT NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE OR REPLACE VIEW national_permit_map_point AS
SELECT p.id,p.category_id,p.name,p.lot_address,p.road_address,p.business_type,
       p.permitted_on,p.closed_on,l.geom,ST_X(l.geom) AS longitude,ST_Y(l.geom) AS latitude
FROM national_permit_published p
LEFT JOIN permit_category_crs c ON c.category_id=p.category_id
JOIN national_permit_location l ON l.permit_id=p.id AND l.content_hash=p.content_hash
    AND l.source_crs=COALESCE(p.source_crs,c.source_crs) AND l.source_x=p.source_x AND l.source_y=p.source_y;
COMMIT;
