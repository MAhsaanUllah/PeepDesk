# Kill only OUR electron tree (main identified by children tagged nekoboard/PeepDesk), never other apps.
$all = @(Get-CimInstance Win32_Process | Where-Object { $_.Name -in 'electron.exe', 'PeepDesk.exe' })
$mains = @()
foreach ($p in $all) {
  if ($p.CommandLine -match '--type=') { continue }
  $children = @($all | Where-Object { $_.ParentProcessId -eq $p.ProcessId })
  $mine = ($p.CommandLine -match 'nekoboard|PeepDesk') -or ($children | Where-Object { $_.CommandLine -match 'nekoboard|PeepDesk' }).Count -gt 0
  if ($mine) { $mains += $p }
}
foreach ($m in $mains) {
  Write-Output ("KILL main " + $m.ProcessId)
  Stop-Process -Id $m.ProcessId -Force -ErrorAction SilentlyContinue
}
Start-Sleep -Seconds 2
$left = @(Get-CimInstance Win32_Process | Where-Object { ($_.Name -in 'electron.exe', 'PeepDesk.exe') -and $_.CommandLine -match 'nekoboard|PeepDesk' })
Write-Output ("remaining_tagged=" + $left.Count)
