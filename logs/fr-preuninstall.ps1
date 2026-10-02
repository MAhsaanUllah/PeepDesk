$s="$env:APPDATA\PeepDesk\peepdesk-state.json"
"h: " + (Get-FileHash $s -Algorithm MD5).Hash
"sz: " + (Get-Item $s).Length
$m="$env:APPDATA\PeepDesk\media"
"media files: " + (Get-ChildItem $m -ErrorAction SilentlyContinue | Measure-Object).Count
