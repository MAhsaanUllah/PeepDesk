# Injects Alt+Shift+C (the canvas hotkey) with real scancodes so Electron's low-level hook fires.
Add-Type -Namespace W -Name K32 -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, System.UIntPtr extra);
'@
function Tap([byte]$vk, [byte]$scan) {
  [W.K32]::keybd_event($vk, $scan, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 30
  [W.K32]::keybd_event($vk, $scan, 2, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 30
}
function Down([byte]$vk, [byte]$scan) { [W.K32]::keybd_event($vk, $scan, 0, [UIntPtr]::Zero); Start-Sleep -Milliseconds 40 }
function Up([byte]$vk, [byte]$scan) { [W.K32]::keybd_event($vk, $scan, 2, [UIntPtr]::Zero); Start-Sleep -Milliseconds 40 }
Down 0x12 0x38   # Alt
Down 0x10 0x2A   # Shift
Tap  0x43 0x2E   # C
Up   0x10 0x2A
Up   0x12 0x38
Write-Output "hotkey sent"
