# Desinstalar-Stickies.ps1 - quita el add-in StickyNotes de PowerPoint
$ErrorActionPreference = 'Stop'
$addinName = 'StickyNotes'
$destPath  = Join-Path $env:APPDATA 'Microsoft\AddIns\StickyNotes.ppam'

if (Get-Process -Name POWERPNT -ErrorAction SilentlyContinue) {
    Write-Host 'Cierra PowerPoint y vuelve a correr el desinstalador.' -ForegroundColor Yellow
    exit 1
}
$app = New-Object -ComObject PowerPoint.Application
try {
    foreach ($ai in @($app.AddIns)) {
        if ($ai.Name -eq $addinName) {
            try { $ai.Loaded = 0 } catch {}
            $app.AddIns.Remove($addinName)
        }
    }
} finally {
    try { $app.Quit() } catch {}
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
}
Remove-Item $destPath -Force -ErrorAction SilentlyContinue
Write-Host 'StickyNotes desinstalado.' -ForegroundColor Green
