$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$categories = @(
    @('general_restaurants','일반음식점','15154916'), @('rest_cafes','휴게음식점','15154921'),
    @('bakeries','제과점영업','15155252'), @('beauty_salons','미용업','15154918'),
    @('barber_shops','이용업','15154922'), @('laundries','세탁업','15154927'),
    @('public_baths','목욕장업','15155091'), @('hospitals','병원','15154458'),
    @('clinics','의원','15154874'), @('pharmacies','약국','15154822'),
    @('optical_shops','안경업','15154899'), @('karaoke_rooms','노래연습장업','15155135'),
    @('fitness_centers','체력단련장업','15155077'), @('billiard_halls','당구장업','15155011'),
    @('lodgings','숙박업','15155124')
)
$cache = Join-Path (Get-Location) 'data/crs-evidence'
[IO.Directory]::CreateDirectory($cache) | Out-Null
$utf8 = New-Object Text.UTF8Encoding $false
$verified = foreach ($entry in $categories) {
    $url = "https://www.data.go.kr/data/$($entry[2])/openapi.do"
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
    $body = [string]$response.Content
    $title = [Net.WebUtility]::HtmlDecode([regex]::Match($body,'<title>(.*?)</title>').Groups[1].Value)
    if (!$title.Contains($entry[1] + ' 조회서비스')) { throw "Catalog identity mismatch: $($entry[0])" }
    $meta = [regex]::Match($body,'<meta name="description"[^>]*content="([^"]*)"',[Text.RegularExpressions.RegexOptions]::Singleline)
    $description = [Net.WebUtility]::HtmlDecode($meta.Groups[1].Value)
    $crs = @([regex]::Matches($description,'EPSG:\s*(\d+)') | ForEach-Object { [int]$_.Groups[1].Value } | Select-Object -Unique)
    if ($crs.Count -ne 1 -or $crs[0] -ne 5174) { throw "CRS declaration requires review: $($entry[0])" }
    $path = Join-Path $cache ($entry[0] + '.html')
    [IO.File]::WriteAllText($path,$body,$utf8)
    [pscustomobject]@{ id=$entry[0];name=$entry[1];sourceCrs=$crs[0];catalogUrl=$url;catalogTitle=$title;
        documentTextSha256=(Get-FileHash $path -Algorithm SHA256).Hash.ToLowerInvariant();
        declaration='EPSG:5174';verifiedAt=(Get-Date).ToUniversalTime().ToString('o') }
}
$manifest = [pscustomobject]@{ categories=@($verified) }
$json = ($manifest | ConvertTo-Json -Depth 5) + "`n"
[IO.File]::WriteAllText((Join-Path (Get-Location) 'src/main/resources/map-categories.json'),$json,$utf8)
[IO.File]::WriteAllText((Join-Path (Get-Location) 'docs/data-samples/national/map-crs-evidence.json'),$json,$utf8)
$verified | Select-Object id,name,sourceCrs | Format-Table
