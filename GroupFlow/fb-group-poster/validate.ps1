# Run before Load unpacked: .\validate.ps1
$root = $PSScriptRoot
$bad = @()

Get-ChildItem $root -Recurse -Force | Where-Object { $_.Name -match '^_' } | ForEach-Object {
  $bad += "Reserved name _: $($_.FullName)"
}
Get-ChildItem $root -Recurse -File -Filter '*.zip' -ErrorAction SilentlyContinue | ForEach-Object {
  $bad += "Zip inside extension: $($_.FullName)"
}
if (Test-Path (Join-Path $root '2.3.2_0')) {
  $bad += 'Folder 2.3.2_0 belongs in GroupFlow/ref-group-posting/'
}

try {
  Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json | Out-Null
} catch {
  $bad += "Invalid manifest.json: $_"
}

$required = @('manifest.json', 'background.js', 'modules/swBundle.js', 'icons/icon16.png', 'icons/icon48.png', 'icons/icon128.png')
foreach ($rel in $required) {
  $p = Join-Path $root $rel
  if (-not (Test-Path $p)) { $bad += "Missing $rel"; continue }
  if ($rel -like 'icons/*') {
    $kb = [math]::Round((Get-Item $p).Length / 1KB, 1)
    if ($kb -gt 200) { $bad += "$rel too large (${kb}KB) - run resize-icons.ps1" }
  }
}

if (-not (Test-Path (Join-Path $root 'modules/swBundle.js'))) {
  $bad += 'Missing modules/swBundle.js - run: node build-sw-bundle.js'
}

if ($bad.Count) {
  Write-Host 'FAIL - do not load extension:' -ForegroundColor Red
  $bad | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

$ver = (Get-Content (Join-Path $root 'manifest.json') | ConvertFrom-Json).version
Write-Host "OK - GroupFlow ready to load (v$ver)" -ForegroundColor Green
exit 0
