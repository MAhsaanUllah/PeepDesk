# Show/hide the app's top-level windows by title (SW_HIDE=0 / SW_RESTORE=9 / SW_SHOW=5).
param([string]$Title = 'PeepDesk', [int]$Cmd = 0)
Add-Type -Namespace W -Name U32 -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr h, int c);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);
'@
$sig = @'
public delegate bool EnumProc(System.IntPtr h, System.IntPtr l);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, System.IntPtr l);
'@
Add-Type -Namespace W -Name E -MemberDefinition $sig
$pids = (Get-CimInstance Win32_Process -Filter "Name='PeepDesk.exe' OR Name='electron.exe'" |
  Where-Object { $_.CommandLine -notmatch '--type=' -and $_.CommandLine -match 'nekoboard|peepdesk|PeepDesk' }).ProcessId
$found = New-Object System.Collections.ArrayList
[W.E]::EnumWindows({
  param($h, $l)
  $wp = [uint32]0
  [void][W.U32]::GetWindowThreadProcessId($h, [ref]$wp)
  if ($pids -contains [int]$wp) {
    $sb = New-Object System.Text.StringBuilder 256
    [void][W.U32]::GetWindowText($h, $sb, 256)
    if ($sb.ToString() -eq $Title) { [void]$found.Add($h) }
  }
  return $true
}, [IntPtr]::Zero) | Out-Null
foreach ($h in $found) { [void][W.U32]::ShowWindow($h, $Cmd) }
Write-Output "$Title cmd=$Cmd applied to $($found.Count) window(s)"
