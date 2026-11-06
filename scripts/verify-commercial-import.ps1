$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$script = @'
set -euo pipefail
docker inspect --format '{{.Name}} {{.State.StartedAt}} {{.RestartCount}}' chart-api chart-nginx chart-redis permit-map-postgres > "$HOME/.config/permit-map/after-commercial-20261105.txt"
cmp "$HOME/.config/permit-map/before-commercial-20261105.txt" "$HOME/.config/permit-map/after-commercial-20261105.txt"
docker exec -i permit-map-postgres psql -U postgres -d permit_map_dev -At -v ON_ERROR_STOP=1 <<'SQL'
SELECT json_build_object(
 'verified_at',CURRENT_TIMESTAMP,
 'counts',(SELECT json_object_agg(category_id,n) FROM (SELECT category_id,count(*) n FROM national_permit GROUP BY category_id) t),
 'latest_runs',(SELECT json_agg(t) FROM (SELECT DISTINCT ON(category_id) category_id,id,source_sha256,status,processed_rows,inserted_count,updated_count,unchanged_count,source_as_of FROM permit_import_run WHERE status='COMPLETED' ORDER BY category_id,started_at DESC) t),
 'versions',(SELECT count(*) FROM national_permit_version),
 'missing_current_version',(SELECT count(*) FROM national_permit WHERE current_version_id IS NULL),
 'invalid_current_version',(SELECT count(*) FROM national_permit p JOIN national_permit_version v ON v.id=p.current_version_id WHERE v.permit_id<>p.id),
 'current_events',(SELECT json_object_agg(event_type,n) FROM (SELECT e.event_type,count(*) n FROM permit_event e JOIN national_permit p ON p.id=e.permit_id AND p.current_version_id=e.version_id GROUP BY e.event_type) t),
 'stage_rows',(SELECT count(*) FROM permit_import_stage),
 'held_locks',(SELECT count(*) FROM permit_import_lock WHERE owner_run IS NOT NULL),
 'restaurants_hash',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM restaurants t),
 'sample_hash',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM permit_businesses t),
 'database_bytes',pg_database_size(current_database()),
 'container_start_restart_unchanged',true);
SQL
'@
$raw = ($script + "`n") | ssh -o BatchMode=yes coin "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { throw 'Remote verification failed' }
$result = $raw | ConvertFrom-Json
$source = Get-Content docs/data-samples/national/commercial-area-collection-verification.json -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($category in $source.categories) {
    if ($result.counts.($category.slug) -ne $category.rows) { throw "Row count mismatch: $($category.slug)" }
    $run = $result.latest_runs | Where-Object category_id -eq $category.slug
    if ($run.source_sha256 -ne $category.sha256 -or $run.processed_rows -ne $category.rows) { throw "Source/run mismatch: $($category.slug)" }
}
if ($result.counts.lumber_import_distribution -ne 3444 -or $result.missing_current_version -ne 0 -or $result.invalid_current_version -ne 0 -or $result.stage_rows -ne 0 -or $result.held_locks -ne 0) { throw 'DB invariant mismatch' }
if ($result.restaurants_hash -ne '091c254163263716134789b6e6e7dd07' -or $result.sample_hash -ne 'b5749818db951081976a5caf17c75b5a') { throw 'Legacy data fingerprint mismatch' }
$result | ConvertTo-Json -Depth 8 | Set-Content docs/data-samples/national/commercial-area-postgres-verification.json -Encoding UTF8
Write-Output 'VERIFIED_ALL_15_CATEGORIES'
$result | Select-Object versions,current_events,database_bytes | Format-List
