param([string]$Action = 'launch')
$wd = (Resolve-Path "$PSScriptRoot\..").Path
$exe = Join-Path $wd 'node_modules\electron\dist\electron.exe'
if ($Action -eq 'toggle') {
  # second instance -> existing instance toggles canvas; this process exits on its own
  Start-Process -FilePath $exe -ArgumentList '.' -WorkingDirectory $wd | Out-Null
  Write-Output "TOGGLE_ISSUED"
  exit
}
$t0 = Get-Date
$p = Start-Process -FilePath $exe -ArgumentList '.' -WorkingDirectory $wd -PassThru
$readyMs = -1
$deadline = $t0.AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  $w = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
  if (-not $w) { break }
  if ($w.MainWindowTitle -ne '') { $readyMs = [int]((Get-Date) - $t0).TotalMilliseconds; break }
  Start-Sleep -Milliseconds 100
}
$w = Get-Process -Id $p.Id -ErrorAction SilentlyContinue
Write-Output ("MAIN_PID=" + $p.Id + " READY_MS=" + $readyMs + " TITLE=" + $(if ($w) { $w.MainWindowTitle } else { 'EXITED' }))
