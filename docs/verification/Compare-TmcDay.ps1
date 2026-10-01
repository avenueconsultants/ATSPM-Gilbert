param(
    [datetime]$Day = '2026-09-24',
    [string]$Location = '1',
    [int[]]$CameraDeviceIds = @(1),
    [int[]]$StoredDeviceIds = @(2),
    [string]$BaseUrl = 'http://localhost:3080',
    [switch]$CombineThruRight,
    [string]$OutputDirectory = (Join-Path $PSScriptRoot ('tmc-' + $Day.ToString('yyyy-MM-dd')))
)
$ErrorActionPreference = 'Stop'
# Read-only integration check. Start/end are site-local times interpreted by ReportApi.
# Backfill the selected day before running; this script never changes configuration or data.
$start = $Day.Date
$end = $start.AddDays(1)
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$choices = @(
    @{ Name='Indiana'; Source='atspm'; Ids=@() },
    @{ Name='Stored'; Source='devices'; Ids=$StoredDeviceIds },
    @{ Name='Camera'; Source='devices'; Ids=$CameraDeviceIds }
)
$reports = @{}
$counts = @{}
$groups = [Collections.Generic.HashSet[string]]::new()
foreach ($choice in $choices) {
    $body = @{
        source=$choice.Source; deviceIds=@($choice.Ids); locationIdentifier=$Location
        start=$start.ToString('yyyy-MM-ddTHH:mm:ss'); end=$end.ToString('yyyy-MM-ddTHH:mm:ss')
        binSize=15; combineThruRight=[bool]$CombineThruRight
    } | ConvertTo-Json
    $r = Invoke-RestMethod "$BaseUrl/report/api/v1/TurningMovementCounts/getReportData" -Method Post -ContentType 'application/json' -Body $body -TimeoutSec 90
    $r | ConvertTo-Json -Depth 60 | Set-Content (Join-Path $OutputDirectory "$($choice.Name).json")
    if (@($r.warnings).Count) { throw "$($choice.Name) warnings: $($r.warnings -join '; ')" }
    if (@($r.charts).Count -eq 0) { throw "$($choice.Name) returned no charts; cannot validate an empty day." }
    $reports[$choice.Name] = $r
    $map = @{}
    foreach ($chart in $r.charts) {
        $group = "$($chart.direction)|$($chart.laneType)"
        [void]$groups.Add($group)
        foreach ($bin in $chart.totalVolumes) {
            $time = ([datetime]$bin.timestamp).ToString('yyyy-MM-ddTHH:mm:ss')
            $key = "$group|$($chart.movementType)|$time"
            $map[$key] = [int]$map[$key] + [int]$bin.value
        }
    }
    $counts[$choice.Name] = $map
}
$rows = foreach ($group in ($groups | Sort-Object)) {
    foreach ($movement in @('Thru','Left','Right')) {
        for ($time=$start; $time -lt $end; $time=$time.AddMinutes(15)) {
            $key = "$group|$movement|$($time.ToString('yyyy-MM-ddTHH:mm:ss'))"
            $a=[int]$counts.Indiana[$key]; $b=[int]$counts.Stored[$key]; $c=[int]$counts.Camera[$key]
            [pscustomobject]@{Direction=$group.Split('|')[0]; LaneType=$group.Split('|')[1]; Movement=$movement; LocalBinStart=$time.ToString('yyyy-MM-ddTHH:mm:ss'); Indiana=$a; Stored=$b; Camera=$c; Match=($a -eq $b -and $b -eq $c)}
        }
    }
}
$rows | Export-Csv (Join-Path $OutputDirectory 'quarter-hour-comparison.csv') -NoTypeInformation
$mismatches = @($rows | Where-Object { -not $_.Match })
$totals = foreach ($choice in $choices) {
    $reportTotal = ($reports[$choice.Name].charts | Measure-Object totalVolume -Sum).Sum
    $binTotal = ($rows | Measure-Object $choice.Name -Sum).Sum
    if ($binTotal -ne $reportTotal) { throw "$($choice.Name): bin total $binTotal differs from chart total $reportTotal" }
    [pscustomobject]@{Source=$choice.Name;Vehicles=$binTotal}
}
$peak = $reports.Indiana | Select-Object peakHour,peakHourFactor | ConvertTo-Json -Depth 8 -Compress
$peakMatches = @('Stored','Camera' | Where-Object { ($reports[$_] | Select-Object peakHour,peakHourFactor | ConvertTo-Json -Depth 8 -Compress) -ne $peak }).Count -eq 0
$summary = [pscustomobject]@{
    Day=$start.ToString('yyyy-MM-dd'); Location=$Location; BinMinutes=15; Intervals=96
    DirectionMovementCells=$rows.Count; Mismatches=$mismatches.Count; Totals=$totals
    PeakMetricsMatch=$peakMatches; PeakHour=$reports.Indiana.peakHour; PeakHourFactor=$reports.Indiana.peakHourFactor
    Passed=($mismatches.Count -eq 0 -and $peakMatches)
}
$summary | ConvertTo-Json -Depth 10 | Set-Content (Join-Path $OutputDirectory 'summary.json')
$summary | ConvertTo-Json -Depth 10
if (-not $summary.Passed) { throw 'Three-way day comparison failed; inspect quarter-hour-comparison.csv.' }
