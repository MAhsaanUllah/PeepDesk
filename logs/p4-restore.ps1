# Un-maximize the installed app's canvas window (Windows shell had restored it maximized).
param([int]$TargetPid = 0)
Add-Type -Namespace W -Name U32 -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsZoomed(System.IntPtr h);
'@
$sig = @'
public delegate bool EnumProc(System.IntPtr h, System.IntPtr l);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, System.IntPtr l);
'@
Add-Type -Namespace W -Name E -MemberDefinition $sig

$targets = if ($TargetPid -gt 0) { @($TargetPid) } else {
  (Get-CimInstance Win32_Process -Filter "Name='PeepDesk.exe'" |
    Where-Object { $_.CommandLine -notmatch '--type=' }).ProcessId
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
      if ($sb.ToString() -eq 'PeepDesk Canvas') { [void]$found.Add($h) }
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
  foreach ($h in $found) {
    $z = [W.U32]::IsZoomed($h)
    Write-Output "canvas hwnd=$h zoomed=$z"
    if ($z) { [void][W.U32]::PostMessage($h, 0x112, 0xF120, [IntPtr]::Zero); Write-Output "SC_RESTORE sent" }
  }
  if ($found.Count -eq 0) { Write-Output "no canvas window for pid $t" }
}
Start-Sleep -Seconds 2
