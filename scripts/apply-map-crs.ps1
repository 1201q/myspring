param([Parameter(Mandatory=$true)][ValidatePattern('^permit_map_(dev|verify_[a-z0-9_]+)$')][string]$Database)
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$manifest=Get-Content src/main/resources/map-categories.json -Raw -Encoding UTF8 | ConvertFrom-Json
$profile=(Get-Content config/collection-profiles.json -Raw -Encoding UTF8 | ConvertFrom-Json).'commercial-area-v1'.slugs
if($manifest.categories.Count -ne $profile.Count) { throw 'Verified catalog/profile size mismatch' }
$ids=@{}
$inserts=foreach($entry in $manifest.categories) {
    if($entry.id -notin $profile -or $ids.ContainsKey($entry.id) -or $entry.sourceCrs -ne 5174 -or
       $entry.catalogUrl -notmatch '^https://www.data.go.kr/data/\d+/openapi.do$' -or
       $entry.documentTextSha256 -notmatch '^[a-f0-9]{64}$') { throw 'Invalid verified catalog' }
    $ids[$entry.id]=$true
    $title=$entry.catalogTitle.Replace("'","''")
    $timestamp=[DateTimeOffset]::Parse($entry.verifiedAt).ToString('o')
    "INSERT INTO permit_category_crs(category_id,source_crs,evidence_url,document_text_sha256,catalog_title,verified_at) VALUES('$($entry.id)',5174,'$($entry.catalogUrl)','$($entry.documentTextSha256)','$title','$timestamp'::timestamptz) ON CONFLICT(category_id) DO UPDATE SET source_crs=EXCLUDED.source_crs,evidence_url=EXCLUDED.evidence_url,document_text_sha256=EXCLUDED.document_text_sha256,catalog_title=EXCLUDED.catalog_title,verified_at=EXCLUDED.verified_at;"
}
$prefix=@'
set -euo pipefail
docker exec -i permit-map-postgres psql -U postgres -d __DATABASE__ -At -v ON_ERROR_STOP=1 <<'SQL'
'@
$schema=Get-Content ops/postgres/category-crs.sql -Raw -Encoding UTF8
$script=$prefix.Replace('__DATABASE__',$Database)+"`n"+$schema+"`nBEGIN;`nSET LOCAL ROLE permit_map_app;`n"+($inserts -join "`n")+"`nCOMMIT;`nSQL`n"
$script | ssh -o BatchMode=yes -o ConnectTimeout=5 coin "tr -d '\r' | bash -s"
if($LASTEXITCODE -ne 0) {throw 'Catalog CRS setup failed'}
