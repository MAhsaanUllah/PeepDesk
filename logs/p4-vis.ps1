# Reports visibility of the app's top-level windows (title -> visible).
Add-Type -Namespace W -Name U32 -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(System.IntPtr h, System.Text.StringBuilder s, int n);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
'@
$sig = @'
public delegate bool EnumProc(System.IntPtr h, System.IntPtr l);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, System.IntPtr l);
'@
Add-Type -Namespace W -Name E -MemberDefinition $sig

$pids = (Get-CimInstance Win32_Process -Filter "Name='PeepDesk.exe'" |
  Where-Object { $_.CommandLine -notmatch '--type=' }).ProcessId
$lines = New-Object System.Collections.ArrayList
foreach ($t in $pids) {
  [W.E]::EnumWindows({
    param($h, $l)
    $wp = [uint32]0
    [void][W.U32]::GetWindowThreadProcessId($h, [ref]$wp)
    if ([int]$wp -eq $t) {
      $sb = New-Object System.Text.StringBuilder 256
      [void][W.U32]::GetWindowText($h, $sb, 256)
      $title = $sb.ToString()
      if ($title -eq 'PeepDesk Canvas' -or $title -eq 'PeepDesk') {
        [void]$script:lines.Add("$title visible=$([W.U32]::IsWindowVisible($h)) pid=$t")
      }
    }
    return $true
  }, [IntPtr]::Zero) | Out-Null
}
$lines | ForEach-Object { Write-Output $_ }
if ($lines.Count -eq 0) { Write-Output "NO WINDOWS FOUND (pids: $($pids -join ','))" }
