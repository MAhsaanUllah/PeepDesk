function CpuTotal {
  (powershell -NoProfile -ExecutionPolicy Bypass -File logs/fr-cpusample.ps1 | Select-String 'CPU_TOTAL') -replace 'CPU_TOTAL',''
}
$exe = "$env:LOCALAPPDATA\Programs\peepdesk\PeepDesk.exe" -replace '\\','/'
$ud = "$env:TEMP\peepdesk-cpu-profile" -replace '\\','/'
node -e "const {spawn}=require('child_process');const p=spawn(process.argv[1],['--user-data-dir='+process.argv[2]],{detached:true,stdio:'ignore'});p.unref();console.log('launched',p.pid)" "$exe" "$ud"
Start-Sleep -Seconds 12
$a = CpuTotal; Start-Sleep -Seconds 30; $b = CpuTotal
"VISIBLE  t0=$a t1=$b"
powershell -NoProfile -ExecutionPolicy Bypass -File logs/fr-toggle.ps1 -Title 'PeepDesk Canvas' -Cmd 0 | Out-Null
powershell -NoProfile -ExecutionPolicy Bypass -File logs/fr-toggle.ps1 -Title 'PeepDesk' -Cmd 0 | Out-Null
Start-Sleep -Seconds 5
$c = CpuTotal; Start-Sleep -Seconds 30; $d = CpuTotal
"HIDDEN    t0=$c t1=$d"
powershell -NoProfile -ExecutionPolicy Bypass -File logs/fr-toggle.ps1 -Title 'PeepDesk Canvas' -Cmd 9 | Out-Null
powershell -NoProfile -ExecutionPolicy Bypass -File logs/fr-toggle.ps1 -Title 'PeepDesk' -Cmd 9 | Out-Null
Start-Sleep -Seconds 5
$e = CpuTotal; Start-Sleep -Seconds 30; $f = CpuTotal
"RESTORED  t0=$e t1=$f"
