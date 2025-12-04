<#
.SYNOPSIS
    Applies Assigned Access configuration from XML file using MDM Bridge WMI Provider

.DESCRIPTION
    This script reads an Assigned Access XML configuration file and applies it
    to configure a Windows 11 multi-app kiosk. It uses the MDM Bridge WMI Provider
    (MDM_AssignedAccess class) which is the same method used by Intune/MDM solutions.

    The script expects the XML configuration file to be in the same directory
    or in the Assets/XML folder relative to this script.

.PARAMETER ConfigPath
    Path to the Assigned Access XML configuration file.
    Default: Looks for AssignedAccessConfig.xml in ..\XML\ relative to script location.

.NOTES
    - Must be run as SYSTEM (LocalSystem) context
    - Requires Windows 11 22H2 or later for v5 StartPins feature
    - A reboot is recommended after applying the configuration

    Run methods:
    - psexec.exe -i -s powershell.exe -ExecutionPolicy Bypass -File Set-AssignedAccess.ps1
    - SCCM Task Sequence (runs as SYSTEM by default)
    - Intune script deployment with "Run as system" enabled

.EXAMPLE
    # Run with default XML path (Assets/XML/AssignedAccessConfig.xml)
    .\Set-AssignedAccess.ps1

.EXAMPLE
    # Run with custom XML path
    .\Set-AssignedAccess.ps1 -ConfigPath "C:\Config\MyKioskConfig.xml"

.LINK
    https://learn.microsoft.com/en-us/windows/configuration/assigned-access/configuration-file
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$ConfigPath
)

# ============================================================================
# INITIALIZATION
# ============================================================================

$ErrorActionPreference = "Stop"

# Determine config path if not specified
if (-not $ConfigPath) {
    $scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
    $ConfigPath = Join-Path (Split-Path -Parent $scriptDir) "XML\AssignedAccessConfig.xml"
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Set-AssignedAccess" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# VALIDATION
# ============================================================================

# Check if running as SYSTEM
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
Write-Host "Current user: $currentUser"

if ($currentUser -ne "NT AUTHORITY\SYSTEM") {
    Write-Host ""
    Write-Host "WARNING: This script must run as SYSTEM for MDM_AssignedAccess." -ForegroundColor Yellow
    Write-Host "Use one of the following methods:" -ForegroundColor Yellow
    Write-Host "  - psexec.exe -i -s powershell.exe -ExecutionPolicy Bypass -File Set-AssignedAccess.ps1" -ForegroundColor Gray
    Write-Host "  - Run via Intune with 'Run as system' enabled" -ForegroundColor Gray
    Write-Host "  - Run via SCCM Task Sequence" -ForegroundColor Gray
    Write-Host ""
    exit 1
}

# Check if config file exists
Write-Host "Config path: $ConfigPath"

if (-not (Test-Path $ConfigPath)) {
    Write-Host ""
    Write-Host "ERROR: Configuration file not found: $ConfigPath" -ForegroundColor Red
    Write-Host ""
    exit 1
}

# ============================================================================
# READ AND VALIDATE XML
# ============================================================================

Write-Host ""
Write-Host "Reading configuration..." -ForegroundColor Gray

try {
    $xmlContent = Get-Content -Path $ConfigPath -Raw

    # Validate it's proper XML
    $null = [System.Xml.Linq.XDocument]::Parse($xmlContent)
    Write-Host "  XML validation: PASSED" -ForegroundColor Green
} catch {
    Write-Host "  XML validation: FAILED" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ============================================================================
# APPLY CONFIGURATION
# ============================================================================

Write-Host ""
Write-Host "Applying Assigned Access configuration..." -ForegroundColor Gray

try {
    $namespaceName = "root\cimv2\mdm\dmmap"
    $className = "MDM_AssignedAccess"

    # Get the existing MDM_AssignedAccess instance
    $obj = Get-CimInstance -Namespace $namespaceName -ClassName $className -ErrorAction Stop

    if ($null -eq $obj) {
        Write-Host "  ERROR: MDM_AssignedAccess CIM instance not found" -ForegroundColor Red
        Write-Host "  This may indicate kiosk mode is not available on this Windows edition." -ForegroundColor Red
        exit 1
    }

    # HTML-encode and apply the configuration
    $obj.Configuration = [System.Net.WebUtility]::HtmlEncode($xmlContent)
    Set-CimInstance -CimInstance $obj -ErrorAction Stop

    Write-Host "  Configuration applied: SUCCESS" -ForegroundColor Green

} catch {
    Write-Host "  Configuration applied: FAILED" -ForegroundColor Red
    Write-Host "  Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# ============================================================================
# COMPLETION
# ============================================================================

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Assigned Access configuration complete!" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "A reboot is recommended to activate kiosk mode." -ForegroundColor Yellow
Write-Host ""

exit 0
