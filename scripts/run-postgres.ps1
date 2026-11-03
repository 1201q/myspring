$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env.postgres'

if (-not (Test-Path -LiteralPath $envPath)) {
    throw 'Missing .env.postgres. Copy .env.example and configure the database credentials.'
}

$keys = @('DB_URL', 'DB_USERNAME', 'DB_PASSWORD')
$previous = @{}
foreach ($key in $keys) {
    $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
}

Push-Location $projectRoot
try {
    foreach ($line in Get-Content -LiteralPath $envPath) {
        if ($line -match '^\s*(#|$)') { continue }
        $parts = $line.Split('=', 2)
        if ($parts.Count -ne 2 -or $parts[0] -notin $keys) {
            throw 'Unexpected entry in .env.postgres.'
        }
        [Environment]::SetEnvironmentVariable($parts[0], $parts[1], 'Process')
    }
    if (-not $env:DB_PASSWORD) { throw 'DB_PASSWORD is required.' }
    & .\gradlew.bat bootRun '--args=--spring.profiles.active=postgres'
    if ($LASTEXITCODE -ne 0) { throw "bootRun failed with exit code $LASTEXITCODE" }
} finally {
    foreach ($key in $keys) {
        [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
    }
    Pop-Location
}
