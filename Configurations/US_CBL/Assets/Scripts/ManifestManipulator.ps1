#Start transcript
Start-Transcript -Path c:\Windows\Packagelogs\Customizations\ManifestManipulator.log

"====================================================="
"Logging Started at $(Get-Date)"

$Date = Get-Date -Format "MM-dd-yyyy-HHmm"
$Manifest = Test-Path "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.VisualElementsManifest.xml"

if ($Manifest) {
    "Manifest present. Renaming."
    Rename-Item -Path "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.VisualElementsManifest.xml" -NewName "msedge.VisualElementsManifest.xml-$($Date)" -Force
} else {
    "Manifest not present."
}

"Logging stopped at $(Get-Date)"
"====================================================="

Stop-Transcript
