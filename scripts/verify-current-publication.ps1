param(
    [Parameter(Mandatory = $true)][Guid]$RunId
)
$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$remote = @'
set -euo pipefail
docker inspect --format '{{.Name}} {{.State.StartedAt}} {{.RestartCount}}' chart-api chart-nginx chart-redis permit-map-postgres
docker exec -i permit-map-postgres psql -U postgres -d permit_map_dev -At -v ON_ERROR_STOP=1 <<'SQL'
-- One explicit final physical count, separate from resumable publication.
SET statement_timeout='20s';
SELECT json_build_object(
 'verified_at',CURRENT_TIMESTAMP,
 'run',(SELECT row_to_json(t) FROM (SELECT id,category_id,status,processed_rows,inserted_count,updated_count,unchanged_count,source_sha256,source_as_of FROM permit_import_run WHERE id='__RUN__') t),
 'publication',(SELECT row_to_json(t) FROM permit_current_publication t WHERE run_id='__RUN__'),
 'publication_seconds',(SELECT extract(epoch FROM completed_at-started_at) FROM permit_current_publication WHERE run_id='__RUN__'),
 'actual_current_rows',(SELECT count(id) FROM national_permit_current),
 'actual_post_migration_rows',(SELECT count(id) FROM national_permit_current WHERE id>(SELECT current_checkpoint FROM national_current_migration WHERE id=1)),
 'history_rows',(SELECT count(*) FROM national_permit_history),
 'stage_first_row',(SELECT min(row_no) FROM permit_import_stage WHERE run_id='__RUN__'),
 'stage_last_row',(SELECT max(row_no) FROM permit_import_stage WHERE run_id='__RUN__'),
 'samples',(SELECT json_build_object('matched',count(*),'all_fields_equal',bool_and(
   ROW(s.name,s.lot_address,s.road_address,s.business_type,s.permitted_on,s.closed_on,s.raw_status_code,s.raw_status_name,s.raw_detail_status_code,s.raw_detail_status_name,s.source_x,s.source_y,s.source_crs,s.raw_json,s.issues_json,s.content_hash)
   IS NOT DISTINCT FROM
   ROW(c.name,c.lot_address,c.road_address,c.business_type,c.permitted_on,c.closed_on,c.raw_status_code,c.raw_status_name,c.raw_detail_status_code,c.raw_detail_status_name,c.source_x,c.source_y,c.source_crs,c.raw_json,c.issues_json,c.content_hash)
   AND c.run_id=r.id AND c.created_run_id=r.id AND c.last_seen_run_id=r.id AND c.source_as_of=r.source_as_of))
 FROM permit_import_run r
 CROSS JOIN LATERAL (VALUES (1::bigint),(r.processed_rows/2),(r.processed_rows)) sample(row_no)
 JOIN LATERAL (SELECT * FROM permit_import_stage staged WHERE staged.run_id=r.id AND staged.row_no=sample.row_no OFFSET 0) s ON TRUE
 JOIN LATERAL (SELECT * FROM national_permit_current p WHERE p.category_id=r.category_id AND p.municipality_code=s.municipality_code AND p.management_number=s.management_number OFFSET 0) c ON TRUE
 WHERE r.id='__RUN__'),
 'held_lock',(SELECT owner_run FROM permit_import_lock WHERE id=1),
 'restaurants_hash',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM restaurants t),
 'sample_hash',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY id),'')) FROM permit_businesses t),
 'database_bytes',pg_database_size(current_database()));
SQL
df -h /
'@
$remote = $remote.Replace('__RUN__', $RunId.ToString())
$raw = ($remote + "`n") | ssh -o BatchMode=yes -o ConnectTimeout=5 coin "tr -d '\r' | bash -s"
if ($LASTEXITCODE -ne 0) { throw 'Remote verification failed' }
$raw
$result = $raw | Where-Object { $_.StartsWith('{') } | ConvertFrom-Json
if (!$result -or $result.run.status -ne 'COMPLETED' -or $result.held_lock -or
    !$result.publication.completed_at -or
    $result.run.inserted_count -ne $result.run.processed_rows -or
    $result.run.updated_count -ne 0 -or $result.run.unchanged_count -ne 0 -or
    $result.publication.source_rows -ne $result.run.processed_rows -or
    $result.run.processed_rows -ne $result.publication.published_rows -or
    $result.stage_first_row -ne 1 -or $result.stage_last_row -ne $result.run.processed_rows -or
    $result.actual_post_migration_rows -ne $result.run.processed_rows -or
    $result.samples.matched -ne 3 -or !$result.samples.all_fields_equal) { throw 'Publication verification mismatch' }
if ($result.restaurants_hash -ne '091c254163263716134789b6e6e7dd07' -or $result.sample_hash -ne 'b5749818db951081976a5caf17c75b5a') { throw 'Legacy sample changed' }
$baseline = Get-Content docs/data-samples/national/current-migration-verification.json -Raw -Encoding UTF8 | ConvertFrom-Json
$baselineRows = ($baseline.categories.PSObject.Properties.Value | Measure-Object -Sum).Sum
if ($result.actual_current_rows -ne $baselineRows + $result.run.processed_rows) { throw 'Physical total differs from migrated baseline plus inserted rows' }
$source = Get-Content docs/data-samples/national/commercial-area-collection-verification.json -Raw -Encoding UTF8 | ConvertFrom-Json
$categorySource = $source.categories | Where-Object slug -eq $result.run.category_id
if ($categorySource.sha256 -ne $result.run.source_sha256 -or $categorySource.rows -ne $result.run.processed_rows) { throw 'Source fingerprint/count mismatch' }
$result | Add-Member -NotePropertyName category_recount -NotePropertyValue 'Not repeated: grouped count exceeded time limit; verified primary-key total and post-migration range instead.'
$result | ConvertTo-Json -Depth 8 | Set-Content "docs/data-samples/national/current-publication-$($result.run.category_id)-verification.json" -Encoding UTF8
Write-Output 'VERIFIED_CURRENT_PUBLICATION'
