Get-CimInstance Win32_Process -Filter "Name='PeepDesk.exe'" |
  Where-Object { $_.CommandLine -notmatch '--type=' } |
  Select-Object ProcessId, ParentProcessId |
  Format-Table -AutoSize
