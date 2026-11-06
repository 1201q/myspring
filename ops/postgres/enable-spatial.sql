-- PostgreSQL-only, run explicitly as postgres after installing PostGIS packages.
-- Kept outside common Flyway migrations: H2 tests do not implement PostGIS and
-- the application's role must not be given superuser merely to enable it.
BEGIN;
SET LOCAL statement_timeout='20s';
SET LOCAL lock_timeout='3s';
CREATE EXTENSION IF NOT EXISTS postgis;
SET LOCAL ROLE permit_map_app;

-- Keep spatial backfills separate from wide raw permit rows.
CREATE TABLE IF NOT EXISTS national_permit_location (
    permit_id BIGINT PRIMARY KEY REFERENCES national_permit_current(id),
    content_hash VARCHAR(64) NOT NULL,
    source_crs INTEGER NOT NULL,
    source_x NUMERIC(38,20) NOT NULL,
    source_y NUMERIC(38,20) NOT NULL,
    geom geometry(Point,4326) NOT NULL,
    conversion_method TEXT NOT NULL,
    converted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(NOT ST_IsEmpty(geom)),
    CHECK(ST_X(geom) BETWEEN -180 AND 180 AND ST_Y(geom) BETWEEN -90 AND 90)
);
CREATE INDEX IF NOT EXISTS ix_national_location_geom
    ON national_permit_location USING GIST(geom);

CREATE TABLE IF NOT EXISTS permit_category_crs (
    category_id VARCHAR(100) PRIMARY KEY,
    source_crs INTEGER NOT NULL CHECK(source_crs=5174),
    evidence_url TEXT NOT NULL,
    document_text_sha256 VARCHAR(64) NOT NULL,
    catalog_title TEXT NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Hide incomplete publications and locations derived from outdated source data.
CREATE OR REPLACE VIEW national_permit_map_point AS
SELECT p.id,p.category_id,p.name,p.lot_address,p.road_address,p.business_type,
       p.permitted_on,p.closed_on,l.geom,
       ST_X(l.geom) AS longitude,ST_Y(l.geom) AS latitude
FROM national_permit_published p
LEFT JOIN permit_category_crs c ON c.category_id=p.category_id
JOIN national_permit_location l ON l.permit_id=p.id AND l.content_hash=p.content_hash
    AND l.source_crs=COALESCE(p.source_crs,c.source_crs) AND l.source_x=p.source_x AND l.source_y=p.source_y;
COMMIT;
