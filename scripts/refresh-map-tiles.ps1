param([Parameter(Mandatory=$true)][ValidatePattern('^permit_map_(dev|verify_[a-z0-9_]+)$')][string]$Database)
$ErrorActionPreference='Stop'
$sql=@'
SET statement_timeout='10min';
SET lock_timeout='3s';
SET ROLE permit_map_app;
REFRESH MATERIALIZED VIEW CONCURRENTLY national_permit_map_tile_point;
ANALYZE national_permit_map_tile_point;
'@
$sql | ssh -o BatchMode=yes -o ConnectTimeout=5 coin "docker exec -i permit-map-postgres psql -U postgres -d $Database -v ON_ERROR_STOP=1"
if($LASTEXITCODE -ne 0) { throw 'Map tile refresh failed. The previous snapshot remains available.' }
