# =============================================================================
# Instalar-Stickies.ps1
# Construye StickyNotes.ppam (macro + boton en la cinta) y lo instala en
# PowerPoint para Windows (Microsoft 365 / 2016 / 2019 / 2021 / 2024).
#
# Que hace, paso a paso:
#   1. Verifica que PowerPoint este cerrado (no toca tu trabajo abierto).
#   2. Habilita TEMPORALMENTE "Confiar en el acceso al modelo de objetos de
#      proyectos de VBA" (necesario para inyectar la macro) y lo deja como
#      estaba al final, pase lo que pase.
#   3. Abre PowerPoint en segundo plano, crea un add-in vacio, le carga el
#      modulo StickyNotes.bas y lo guarda como .ppam.
#   4. Le agrega el grupo "Stickies" a la pestana Inicio (customUI.xml).
#   5. Lo copia a %APPDATA%\Microsoft\AddIns (ubicacion de confianza por
#      defecto de PowerPoint) y lo registra para que cargue siempre.
# =============================================================================
$ErrorActionPreference = 'Stop'
$here      = Split-Path -Parent $MyInvocation.MyCommand.Path
$basPath   = Join-Path $here 'StickyNotes.bas'
$uiPath    = Join-Path $here 'customUI.xml'
$addinName = 'StickyNotes'
$destDir   = Join-Path $env:APPDATA 'Microsoft\AddIns'
$destPath  = Join-Path $destDir ($addinName + '.ppam')
$tmpPath   = Join-Path $env:TEMP ($addinName + '_build.ppam')

function Say($msg, $color = 'Gray') { Write-Host $msg -ForegroundColor $color }

Say ''
Say '=== Instalador de Stickies para PowerPoint ===' 'Cyan'

foreach ($f in @($basPath, $uiPath)) {
    if (-not (Test-Path $f)) { throw "No encuentro $f. Deja este script en la misma carpeta que StickyNotes.bas y customUI.xml." }
}

if (Get-Process -Name POWERPNT -ErrorAction SilentlyContinue) {
    Say 'PowerPoint esta abierto. Guarda tu trabajo, cierralo y vuelve a correr el instalador.' 'Yellow'
    exit 1
}

# --- 1. Acceso temporal al modelo de objetos de VBA -------------------------
$secKey   = 'HKCU:\Software\Microsoft\Office\16.0\PowerPoint\Security'
$policy   = 'HKCU:\Software\Policies\Microsoft\Office\16.0\PowerPoint\Security'
$hadValue = $false
$oldValue = $null

if (Test-Path $policy) {
    $pol = (Get-ItemProperty -Path $policy -ErrorAction SilentlyContinue).AccessVBOM
    if ($pol -eq 0) {
        Say 'Tu empresa bloquea el acceso a VBA por politica (GPO). Usa la instalacion manual del README.' 'Red'
        exit 1
    }
}

if (-not (Test-Path $secKey)) { New-Item -Path $secKey -Force | Out-Null }
$cur = Get-ItemProperty -Path $secKey -Name AccessVBOM -ErrorAction SilentlyContinue
if ($null -ne $cur) { $hadValue = $true; $oldValue = $cur.AccessVBOM }
Set-ItemProperty -Path $secKey -Name AccessVBOM -Value 1 -Type DWord

$app = $null
try {
    # --- 2. Construir el add-in con la macro --------------------------------
    Say 'Abriendo PowerPoint en segundo plano...'
    $app  = New-Object -ComObject PowerPoint.Application
    $pres = $app.Presentations.Add(0)   # 0 = sin ventana

    $code = Get-Content -Path $basPath -Raw
    $code = ($code -split "`r?`n" | Where-Object { $_ -notmatch '^\s*Attribute\s' }) -join "`r`n"

    $comp = $pres.VBProject.VBComponents.Add(1)   # 1 = modulo estandar
    $comp.Name = $addinName
    $comp.CodeModule.AddFromString($code)

    if (Test-Path $tmpPath) { Remove-Item $tmpPath -Force }
    $pres.SaveAs($tmpPath, 30)   # 30 = ppSaveAsOpenXMLAddin (.ppam)
    $pres.Close()
    Say 'Macro cargada y add-in guardado.' 'Green'

    # --- 3. Inyectar el boton en la cinta (customUI) ------------------------
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::Open($tmpPath, 'Update')
    try {
        $relsEntry = $zip.GetEntry('_rels/.rels')
        $reader = New-Object System.IO.StreamReader($relsEntry.Open())
        $rels = $reader.ReadToEnd()
        $reader.Close()

        if ($rels -notmatch 'customUI/customUI.xml') {
            $rel  = '<Relationship Id="rIdStickyUI" Type="http://schemas.microsoft.com/office/2006/relationships/ui/extensibility" Target="customUI/customUI.xml"/>'
            $rels = $rels.Replace('</Relationships>', $rel + '</Relationships>')
            $relsEntry.Delete()
            $newRels = $zip.CreateEntry('_rels/.rels')
            $w = New-Object System.IO.StreamWriter($newRels.Open(), (New-Object System.Text.UTF8Encoding($false)))
            $w.Write($rels)
            $w.Close()
        }

        $old = $zip.GetEntry('customUI/customUI.xml')
        if ($old) { $old.Delete() }
        $uiEntry = $zip.CreateEntry('customUI/customUI.xml')
        $w = New-Object System.IO.StreamWriter($uiEntry.Open(), (New-Object System.Text.UTF8Encoding($false)))
        $w.Write((Get-Content -Path $uiPath -Raw))
        $w.Close()
    } finally {
        $zip.Dispose()
    }
    Say 'Grupo "Stickies" agregado a la pestana Inicio.' 'Green'

    # --- 4. Copiar e instalar -----------------------------------------------
    foreach ($ai in @($app.AddIns)) {
        if ($ai.Name -eq $addinName) {
            try { $ai.Loaded = 0 } catch {}
            try { $app.AddIns.Remove($addinName) } catch {}
        }
    }
    if (-not (Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
    Copy-Item -Path $tmpPath -Destination $destPath -Force
    Remove-Item $tmpPath -Force -ErrorAction SilentlyContinue

    $addin = $app.AddIns.Add($destPath)
    try { $addin.Registered = -1 } catch {}
    try { $addin.AutoLoad   = -1 } catch {}
    try { $addin.Loaded     = -1 } catch {}
    Say "Instalado en: $destPath" 'Green'
}
catch {
    Say ''
    Say ('ERROR: ' + $_.Exception.Message) 'Red'
    Say 'Nada quedo a medias en tus presentaciones. Revisa la seccion "Si falla" del README.' 'Yellow'
    $failed = $true
}
finally {
    if ($app) {
        try { $app.Quit() } catch {}
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($app) | Out-Null
    }
    # Dejar la seguridad de VBA exactamente como estaba
    if ($hadValue) { Set-ItemProperty -Path $secKey -Name AccessVBOM -Value $oldValue -Type DWord }
    else           { Remove-ItemProperty -Path $secKey -Name AccessVBOM -ErrorAction SilentlyContinue }
    Say 'Configuracion de seguridad de VBA restaurada.'
}

if ($failed) { exit 1 }
Say ''
Say 'Listo. Abre PowerPoint: en Inicio, a la derecha, vas a ver el grupo "Stickies".' 'Cyan'
Say 'Tip: clic derecho en "Nuevo sticky" > Agregar a la barra de herramientas de acceso rapido, y quedas con atajo Alt+1 (o el numero que le toque).' 'Cyan'
