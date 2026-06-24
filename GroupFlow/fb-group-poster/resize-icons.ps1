# Tạo icon PNG nhỏ cho Chrome (16 / 48 / 128)
$root = $PSScriptRoot
$iconDir = Join-Path $root 'icons'
if (-not (Test-Path $iconDir)) { New-Item -ItemType Directory -Path $iconDir | Out-Null }

Add-Type -AssemblyName System.Drawing

function New-GfIcon([int]$size, [string]$path) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(255, 15, 23, 42))
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 79, 70, 229))
  $margin = [math]::Max(1, [int]($size * 0.12))
  $g.FillEllipse($brush, $margin, $margin, $size - 2 * $margin, $size - 2 * $margin)
  $fontSize = [math]::Max(6, [int]($size * 0.52))
  $font = New-Object System.Drawing.Font ([System.Drawing.FontFamily]::GenericSansSerif), $fontSize, ([System.Drawing.FontStyle]::Bold)
  $sf = New-Object System.Drawing.StringFormat
  $sf.Alignment = [System.Drawing.StringAlignment]::Center
  $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF 0, 0, $size, $size
  $g.DrawString('G', $font, [System.Drawing.Brushes]::White, $rect, $sf)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose(); $brush.Dispose(); $font.Dispose()
  $kb = [math]::Round((Get-Item $path).Length / 1KB, 1)
  Write-Host "Wrote $path (${kb}KB)"
}

New-GfIcon 16 (Join-Path $iconDir 'icon16.png')
New-GfIcon 48 (Join-Path $iconDir 'icon48.png')
New-GfIcon 128 (Join-Path $iconDir 'icon128.png')
