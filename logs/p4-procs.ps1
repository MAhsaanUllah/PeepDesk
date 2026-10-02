param([string]$Label = 'snapshot')
# PeepDesk process tree snapshot WITHOUT CDP/DevTools.
$all = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'electron.exe', 'PeepDesk.exe', 'crashpad_handler.exe' })
if ($all.Count -eq 0) { Write-Output ("LABEL=" + $Label + " NO_PROCESSES"); exit }
$byId = @{}
foreach ($p in $all) { $byId[[int]$p.ProcessId] = $p }
$marked = @($all | Where-Object { $_.CommandLine -and $_.CommandLine -match 'nekoboard|PeepDesk' })
# mains: marked processes without --type=, plus the parent of any marked typed child that is itself in $all
$mains = @{}
foreach ($p in $marked) {
  if ($p.CommandLine -notmatch '--type=') { $mains[[int]$p.ProcessId] = $p }
}
foreach ($p in $marked) {
  if ($p.CommandLine -match '--type=' -and $byId.ContainsKey([int]$p.ParentProcessId)) { $mains[[int]$p.ParentProcessId] = $byId[[int]$p.ParentProcessId] }
}
$keep = @{}
foreach ($id in $mains.Keys) { $keep[$id] = $true }
foreach ($p in $all) { if ($mains.ContainsKey([int]$p.ParentProcessId)) { $keep[[int]$p.ProcessId] = $true } }
foreach ($p in $marked) { $keep[[int]$p.ProcessId] = $true }
$rows = @()
foreach ($p in $all) {
  if (-not $keep.ContainsKey([int]$p.ProcessId)) { continue }
  $type = if ($p.Name -eq 'crashpad_handler.exe') { 'crashpad' } elseif ($p.CommandLine -match '--type=([a-z\-_]+)') { $Matches[1] } else { 'main' }
  $gp = Get-Process -Id $p.ProcessId -ErrorAction SilentlyContinue
  if (-not $gp) { continue }
  $rows += [pscustomobject]@{
    Pid = $p.ProcessId; Type = $type
    WS_MB = [math]::Round($gp.WorkingSet64 / 1MB, 1)
    Priv_MB = [math]::Round($gp.PrivateMemorySize64 / 1MB, 1)
    CPU_s = [math]::Round($gp.CPU, 2)
  }
}
Write-Output ("LABEL=" + $Label)
$rows | Format-Table -AutoSize | Out-String -Width 120 | Write-Output
$ws = ($rows | Measure-Object WS_MB -Sum).Sum
$pr = ($rows | Measure-Object Priv_MB -Sum).Sum
$cpu = ($rows | Measure-Object CPU_s -Sum).Sum
Write-Output ("TOTALS count=" + $rows.Count + " WS_MB=" + [math]::Round($ws, 1) + " Priv_MB=" + [math]::Round($pr, 1) + " CPU_s=" + [math]::Round($cpu, 2))
