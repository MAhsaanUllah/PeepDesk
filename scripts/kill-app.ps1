$procs = Get-CimInstance Win32_Process -Filter "Name='electron.exe'" |
  Where-Object { $_.CommandLine -like '*nekoboard*' }
foreach ($p in $procs) {
  # Only the launcher/main process (children carry --type=)
  if ($p.CommandLine -notmatch '--type=') { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Seconds 2
(Get-CimInstance Win32_Process -Filter "Name='electron.exe'" | Where-Object { $_.CommandLine -like '*nekoboard*' }).Count
