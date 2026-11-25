# Exercise the SK Forge all-users setup and its Windows registration on the CI runner.
$ErrorActionPreference = 'Stop'
$version = (Get-Content VERSION -Raw).Trim()
$installer = Join-Path (Resolve-Path 'build/release').Path "SK-PlotForge-v$version.exe"
if (-not (Test-Path $installer)) { throw "Setup not found: $installer" }
# Layout: SK Forge\<legal name>\App (the files), Previous, Setup (the uninstaller and install.json) and Staging.
$family = Join-Path $env:ProgramFiles 'SK Forge'
$product = Join-Path $family 'SK PlotForge'
$app = Join-Path $product 'App'
$registry = Join-Path $product 'Setup\install.json'
$uninstallKey = 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\SKForge.plotforge'
$associationKey = 'HKLM:\Software\Classes\.pfg'
$iconKey = 'HKLM:\Software\Classes\SKForge.plotforge.pfg\DefaultIcon'
$shortcut = Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\SK PlotForge.lnk'

function RunSetup($arguments, $expected) {
  $process = Start-Process -FilePath $installer -ArgumentList $arguments -Wait -PassThru
  if ($process.ExitCode -ne $expected) {
    throw "Setup $arguments exited $($process.ExitCode), expected $expected."
  }
}

RunSetup @('/S') 0
if (-not (Test-Path (Join-Path $app 'SK PlotForge.exe'))) { throw 'SK PlotForge was not installed.' }
foreach ($loose in @('installed.json', '.previous', '.staging', '.setup')) { if (Test-Path (Join-Path $family $loose)) { throw "$loose lies loose in the family folder." } }
if ((Get-ItemProperty $uninstallKey).DisplayVersion -ne $version) { throw 'The Settings entry has the wrong version.' }
if ((Get-Item $associationKey).GetValue('') -ne 'SKForge.plotforge.pfg') { throw 'The .pfg association is missing.' }
$documentIcon = (Get-Item $iconKey).GetValue('')
if (-not $documentIcon -or -not $documentIcon.EndsWith('plotforge-document.ico') -or -not (Test-Path $documentIcon)) { throw 'The .pfg document icon is missing.' }
if (-not (Test-Path $shortcut)) { throw 'The Start menu shortcut is missing.' }

$data = Join-Path $env:APPDATA 'PlotForge'
New-Item $data -ItemType Directory -Force | Out-Null
$marker = Join-Path $data 'installer-check.txt'
Set-Content $marker 'Keep user data during a repair and uninstall.'
RunSetup @('/S') 0
if (-not (Test-Path $marker)) { throw 'Repair removed user data.' }

$saved = Get-Content $registry -Raw | ConvertFrom-Json -AsHashtable
$newer = Get-Content $registry -Raw | ConvertFrom-Json -AsHashtable
$newer.apps.plotforge.version = '999.0.0'
$newer | ConvertTo-Json -Depth 10 | Set-Content $registry -Encoding utf8NoBOM
try { RunSetup @('/S') 2 }
finally { $saved | ConvertTo-Json -Depth 10 | Set-Content $registry -Encoding utf8NoBOM }

RunSetup @('/uninstall', '/S') 0
if (Test-Path $app) { throw 'Uninstall left the app files behind.' }
foreach ($left in @('Previous', 'Staging')) { if (Test-Path (Join-Path $product $left)) { throw "Uninstall left $left behind." } }
Start-Sleep -Seconds 6
if (Test-Path $product) { throw 'Uninstall left the app folder behind.' }
if (Test-Path $uninstallKey) { throw 'Uninstall left the Settings entry behind.' }
if (Test-Path $associationKey) { throw 'Uninstall left the .pfg association behind.' }
if (Test-Path $shortcut) { throw 'Uninstall left the Start menu shortcut behind.' }
if (-not (Test-Path $marker)) { throw 'Uninstall removed user data.' }
Write-Host 'SK Forge setup: install, repair, downgrade protection, document icon and uninstall passed.'
