param([switch]$TotalOnly)
$out = powershell -NoProfile -ExecutionPolicy Bypass -File logs/p4-procs.ps1 -Label x
$cpu = 0.0
foreach ($line in $out -split "`r?`n") {
  $m = $line.Trim() -match '^(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)$'
  if ($m) { $cpu += [double]$matches[5] }
}
Write-Output ("CPU_TOTAL {0:N2}" -f $cpu)
