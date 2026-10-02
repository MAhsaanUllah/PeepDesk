# Graceful quit for PASS3 shutdown-flush check: posts WM_CLOSE to the pet window
# (title exactly 'PeepDesk') of our tagged Electron mains. Pet close -> app.quit -> will-quit -> flushSaveOnQuit.
param([int]$TargetPid = 0)
Add-Type -Namespace W -Name U32 -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);
'@
$sig = @'
public delegate bool EnumProc(System.IntPtr h, System.IntPtr l);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, System.IntPtr l);
'@
Add-Type -Namespace W -Name E -MemberDefinition $sig

$targets = if ($TargetPid -gt 0) { @($TargetPid) } else {
  (Get-CimInstance Win32_Process -Filter "Name='electron.exe' OR Name='PeepDesk.exe'" |
    Where-Object { $_.CommandLine -notmatch '--type=' -and $_.CommandLine -match 'nekoboard|PeepDesk' }).ProcessId
}
foreach ($t in $targets) {
  $found = New-Object System.Collections.ArrayList
  [W.E]::EnumWindows({
    param($h, $l)
    $wp = [uint32]0
    [void][W.U32]::GetWindowThreadProcessId($h, [ref]$wp)
    if ([int]$wp -eq $t) {
      $sb = New-Object System.Text.StringBuilder 256
      [void][W.U32]::GetWindowText($h, $sb, 256)
      if ($sb.ToString() -eq 'PeepDesk') { [void]$found.Add($h) }
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
  foreach ($h in $found) { [void][W.U32]::PostMessage($h, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero); Write-Output "WM_CLOSE pet $h pid $t" }
  if ($found.Count -eq 0) { Write-Output "NO PET WINDOW for pid $t" }
}
Start-Sleep -Seconds 4
$left = (Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'nekoboard|PeepDesk' } | Measure-Object).Count
Write-Output "remaining_tagged=$left"
