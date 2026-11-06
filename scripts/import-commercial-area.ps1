$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$proof = Get-Content 'docs/data-samples/national/commercial-area-collection-verification.json' -Raw -Encoding UTF8 | ConvertFrom-Json
if ($proof.status -ne 'COMPLETED' -or $proof.category_count -ne 15) { throw 'Incomplete collection proof' }
$logDir = Join-Path (Get-Location) 'data/commercial-import-20261105'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$results = @()
$resultPath = Join-Path $logDir 'results.json'
if (Test-Path -LiteralPath $resultPath) {
    $loaded = Get-Content $resultPath -Raw -Encoding UTF8 | ConvertFrom-Json
    # Windows PowerShell 5 may retain a JSON array as a single pipeline object.
    foreach ($entry in $loaded) { foreach ($item in $entry) { $results += $item } }
}
# Already published unchanged pharmacy file is verified by SQL separately.
$jobs = $proof.categories | Where-Object slug -ne 'pharmacies' | Sort-Object rows
foreach ($job in $jobs) {
    $slug = $job.slug
    if ($slug -in @($results | ForEach-Object slug)) { Write-Output "SKIP_COMPLETED $slug"; continue }
    $inputPath = "data/national-audit/$slug.csv"
    if ((Get-FileHash -LiteralPath $inputPath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $job.sha256) { throw "Hash mismatch: $slug" }
    $snapshot = ([DateTimeOffset]::Parse($job.downloaded_at)).ToOffset([TimeSpan]::FromHours(9)).ToString('yyyy-MM-dd')
    $log = Join-Path $logDir "$slug.log"
    if ((Test-Path -LiteralPath $log) -and (Select-String -LiteralPath $log -Pattern 'BUILD FAILED' -Quiet)) {
        throw "Previous $slug import failed. Inspect its DB run ID and resume explicitly; do not create another full staging run."
    }
    Write-Output "START $slug rows=$($job.rows) snapshot=$snapshot"
    $ErrorActionPreference = 'Continue'
    & .\gradlew.bat importNationalPermits '-Ptarget=postgres' '-Pdatabase=permit_map_dev' "-Pcategory=$slug" "-Pinput=$inputPath" "-Psnapshot=$snapshot" *> $log
    $ErrorActionPreference = 'Stop'
    if ($LASTEXITCODE -ne 0) { throw "Import failed: $slug; see $log" }
    $result = Select-String -LiteralPath $log -Pattern 'NATIONAL_IMPORT ' | Select-Object -Last 1
    if (-not $result) { throw "Missing import result: $slug" }
    $results += [PSCustomObject]@{slug=$slug; rows=$job.rows; snapshot=$snapshot; result=$result.Line.Trim()}
    $results | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $logDir 'results.json') -Encoding UTF8
    Write-Output $result.Line.Trim()
}
Write-Output 'ALL_IMPORTS_COMPLETED'
