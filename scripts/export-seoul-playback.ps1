$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$keys=@('DB_URL','DB_USERNAME','DB_PASSWORD')
$previous=@{}
foreach($key in $keys) { $previous[$key]=[Environment]::GetEnvironmentVariable($key,'Process') }
Push-Location $root
try {
    foreach($line in Get-Content -LiteralPath (Join-Path $root '.env.postgres')) {
        if($line -match '^\s*(#|$)') { continue }
        $parts=$line.Split('=',2)
        if($parts.Count -ne 2 -or $parts[0] -notin $keys) { throw 'Unexpected database configuration entry' }
        [Environment]::SetEnvironmentVariable($parts[0],$parts[1],'Process')
    }
    & .\gradlew.bat exportSeoulPlayback
    if($LASTEXITCODE -ne 0) { throw 'Seoul playback export failed' }
} finally {
    foreach($key in $keys) { [Environment]::SetEnvironmentVariable($key,$previous[$key],'Process') }
    Pop-Location
}
