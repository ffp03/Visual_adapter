param([string[]]$Sites, [string]$Label = 'resumed')
Add-Type -AssemblyName System.Drawing
$corpus = (Resolve-Path "$PSScriptRoot/../../../workspace/revision/corpus").Path
foreach ($site in $Sites) {
  $sheet = [Drawing.Bitmap]::new(1920,1220)
  $g = [Drawing.Graphics]::FromImage($sheet)
  $g.Clear([Drawing.Color]::White)
  $font = [Drawing.Font]::new('Arial',12)
  $col=0
  foreach ($page in (Get-ChildItem -LiteralPath "$corpus/dev/$site" -Directory | Where-Object Name -Like "$site-p*" | Sort-Object Name)) {
    $im = [Drawing.Image]::FromFile((Join-Path $page.FullName 'screenshot.png'))
    $g.DrawString("$($page.Name) $($im.Width)x$($im.Height)",$font,[Drawing.Brushes]::Black,$col*384+5,5)
    $row=0
    foreach ($y in @(0,[Math]::Max(0,[int]($im.Height/3)-500),[Math]::Max(0,$im.Height-1100))) {
      $h=[Math]::Min(1250,$im.Height-$y)
      $dh=[Math]::Min(395,[int]($h*384/$im.Width))
      $dest=[Drawing.Rectangle]::new($col*384,$row*400+25,384,$dh)
      $src=[Drawing.Rectangle]::new(0,$y,$im.Width,$h)
      $g.DrawImage($im,$dest,$src,[Drawing.GraphicsUnit]::Pixel)
      $row++
    }
    $im.Dispose()
    $col++
  }
  $sheet.Save("$corpus/archive/wp-a3-$Label-screenshots-$site.jpg",[Drawing.Imaging.ImageFormat]::Jpeg)
  $g.Dispose(); $font.Dispose(); $sheet.Dispose()
}
