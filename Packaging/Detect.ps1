# ============================================================================
# Configuration Blender - Win32 App Detection Script
# ============================================================================
# Author: Joshua Walderbach
# Description: Checks if the correct version of configuration is installed.
#              Used by Intune to determine if Win32 app needs to be installed.
# ============================================================================

# CONFIGURE THESE VALUES FOR YOUR DEPLOYMENT
# Note: These values are automatically replaced by New-IntunePackage.ps1
$ConfigurationName = "{{ROLE}}"
$ExpectedVersion = "{{VERSION}}"

# Registry path where version is stored
$RegistryPath = "HKLM:\SOFTWARE\ConfigurationBlender\$ConfigurationName"
$ConfigPath = "C:\ProgramData\ConfigurationBlender\Config.json"

# ============================================================================
# DETECTION LOGIC
# ============================================================================

# Check 1: Registry version matches
$registryCheck = $false
if (Test-Path $RegistryPath) {
    try {
        $installedVersion = Get-ItemProperty -Path $RegistryPath -Name "InstalledVersion" -ErrorAction SilentlyContinue
        if ($installedVersion -and $installedVersion.InstalledVersion -eq $ExpectedVersion) {
            $registryCheck = $true
        }
    } catch {
        $registryCheck = $false
    }
}

# Check 2: Config.json exists and matches version
$configCheck = $false
if (Test-Path $ConfigPath) {
    try {
        $config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
        if ($config.version -eq $ExpectedVersion -and $config.role -eq $ConfigurationName) {
            $configCheck = $true
        }
    } catch {
        $configCheck = $false
    }
}

# ============================================================================
# RESULT
# ============================================================================

if ($registryCheck -and $configCheck) {
    Write-Output "Installed: $ConfigurationName v$ExpectedVersion"
    exit 0
} else {
    if (-not $registryCheck) {
        Write-Output "Registry version mismatch or missing"
    }
    if (-not $configCheck) {
        Write-Output "Config.json missing or version mismatch"
    }
    exit 1
}
