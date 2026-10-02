$s="$env:APPDATA\NekoBoard\nekoboard-state.json"
"h: " + (Get-FileHash $s -Algorithm MD5).Hash
"sz: " + (Get-Item $s).Length
$m="$env:APPDATA\NekoBoard\media"
"media files: " + (Get-ChildItem $m -ErrorAction SilentlyContinue | Measure-Object).Count
