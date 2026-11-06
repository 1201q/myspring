-- Run after enable-spatial.sql as the application role in the intended database.
-- This compact serving snapshot avoids millions of random reads of raw permit rows.
-- Refresh after publishing imports, rebuilding locations, or changing CRS evidence.
CREATE MATERIALIZED VIEW IF NOT EXISTS national_permit_map_tile_point AS
SELECT id,category_id,permitted_on,closed_on,ST_Transform(geom,3857) AS geom
FROM national_permit_map_point;
CREATE UNIQUE INDEX IF NOT EXISTS ix_map_tile_point_id ON national_permit_map_tile_point(id);
CREATE INDEX IF NOT EXISTS ix_map_tile_point_geom ON national_permit_map_tile_point USING GIST(geom);
CREATE INDEX IF NOT EXISTS ix_map_tile_point_category ON national_permit_map_tile_point(category_id);
ANALYZE national_permit_map_tile_point;

-- Subsequent updates (the old snapshot stays readable during refresh):
-- REFRESH MATERIALIZED VIEW CONCURRENTLY national_permit_map_tile_point;
-- ANALYZE national_permit_map_tile_point;
