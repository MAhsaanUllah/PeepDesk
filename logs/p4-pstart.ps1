param([switch]$Cdp, [switch]$Second, [string]$UserDataDir = "$env:TEMP\peepdesk-stress-profile")
$exe = "$env:LOCALAPPDATA\Programs\peepdesk\PeepDesk.exe"
$ud = $UserDataDir
$argList = @("--user-data-dir=$ud")
if ($Cdp) { $argList += "--remote-debugging-port=9223" }
if ($Second) { Start-Process $exe -ArgumentList $argList; Write-Output "SECOND_SPAWNED"; exit }
$t0 = Get-Date
$p = Start-Process $exe -ArgumentList $argList -PassThru
for ($i = 0; $i -lt 600; $i++) {
  Start-Sleep -Milliseconds 50
  $p.Refresh()
  if ($p.MainWindowTitle) {
    $ms = [int](((Get-Date) - $t0).TotalMilliseconds)
    Write-Output "READY_MS=$ms PID=$($p.Id) TITLE=$($p.MainWindowTitle)"
    exit
  }
}
Write-Output "TIMEOUT_30S"
