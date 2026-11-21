param([Parameter(Mandatory)][string]$CsvPath)

$ErrorActionPreference = 'Stop'
$regions = @{
  '서울특별시' = 'seoul'; '부산광역시' = 'busan'; '대구광역시' = 'daegu'
  '인천광역시' = 'incheon'; '대전광역시' = 'daejeon'; '울산광역시' = 'ulsan'
  '세종특별자치시' = 'sejong'; '경기도' = 'gyeonggi'; '강원특별자치도' = 'gangwon'
  '충청북도' = 'chungbuk'; '충청남도' = 'chungnam'; '전라북도' = 'jeonbuk'
  '전북특별자치도' = 'jeonbuk'; '전남광주통합특별시' = 'jeonnamgwangju'
  '전라남도' = 'jeonnamgwangju'; '광주광역시' = 'jeonnamgwangju'
  '경상북도' = 'gyeongbuk'; '경상남도' = 'gyeongnam'; '제주특별자치도' = 'jeju'
}
$culture = [Globalization.CultureInfo]::InvariantCulture
$rows = Import-Csv -LiteralPath $CsvPath -Encoding 949
$dates = @($rows.정보수집일 | Sort-Object -Unique)
if ($dates.Count -ne 1 -or $dates[0] -notmatch '^\d{4}-\d{2}-\d{2}$') {
  throw 'Expected a single ISO collection date in the source CSV.'
}
$groups = @{}
foreach ($row in $rows) {
  $province = ($row.도시명.Trim() -split '\s+')[0]
  $region = $regions[$province]
  if (!$region) { throw "Unknown source province: $province" }
  $lng = [double]::Parse($row.경도, $culture)
  $lat = [double]::Parse($row.위도, $culture)
  if (!($lng -ge 124 -and $lng -le 132 -and $lat -ge 32 -and $lat -le 39)) {
    throw "Invalid coordinates for stop $($row.정류장번호)"
  }
  if (!$groups.ContainsKey($region)) {
    $groups[$region] = [Collections.Generic.List[object]]::new()
  }
  $groups[$region].Add(@($lng, $lat, $row.정류장명))
}
if ($groups.Count -ne @($regions.Values | Sort-Object -Unique).Count) {
  throw 'At least one service region is missing.'
}
$output = Join-Path $PSScriptRoot '../frontend/public/data/bus-stops'
New-Item -ItemType Directory -Force -Path $output | Out-Null
foreach ($region in $groups.Keys | Sort-Object) {
  @{ date = $dates[0]; stops = $groups[$region] } | ConvertTo-Json -Depth 5 -Compress |
    Set-Content -LiteralPath (Join-Path $output "$region.json") -Encoding utf8NoBOM
  Write-Output "$region $($groups[$region].Count)"
}
