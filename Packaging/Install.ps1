# ============================================================================
# Configuration Blender - Win32 App Installer
# ============================================================================
# Version: 1.0.0
# Author: Joshua Walderbach
# Description: Deploys configuration files and assets to endpoint.
#              Writes version to registry for Intune detection.
# ============================================================================

param(
    [Parameter(Mandatory = $false)]
    [string]$ConfigurationName = ""
)

$InstallerVersion = "1.0.0"
$DestinationBase = "C:\ProgramData\ConfigurationBlender"
$LogPath = "$DestinationBase\Logs"
$RegistryBase = "HKLM:\SOFTWARE\ConfigurationBlender"

# ============================================================================
# INITIALIZATION
# ============================================================================

# Check if running as Administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run as Administrator."
    exit 1
}

# Get script directory (where the package was extracted)
$ScriptRoot = $PSScriptRoot
if ([string]::IsNullOrEmpty($ScriptRoot)) {
    $ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
}

# Auto-detect configuration name if not provided
if ([string]::IsNullOrEmpty($ConfigurationName)) {
    # Look for Config.json in script root or Configurations subfolder
    $possibleConfigs = @(
        (Join-Path $ScriptRoot "Config.json"),
        (Get-ChildItem -Path $ScriptRoot -Filter "Config.json" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1)
    )

    foreach ($configFile in $possibleConfigs) {
        if ($configFile -and (Test-Path $configFile)) {
            $config = Get-Content $configFile -Raw | ConvertFrom-Json
            $ConfigurationName = $config.role
            $ConfigSourcePath = Split-Path $configFile -Parent
            break
        }
    }

    if ([string]::IsNullOrEmpty($ConfigurationName)) {
        Write-Error "Could not auto-detect configuration. Please provide -ConfigurationName parameter."
        exit 1
    }
} else {
    $ConfigSourcePath = Join-Path $ScriptRoot "Configurations\$ConfigurationName"
    if (-not (Test-Path $ConfigSourcePath)) {
        $ConfigSourcePath = $ScriptRoot
    }
}

# ============================================================================
# SETUP LOGGING
# ============================================================================

# Ensure directories exist
if (-not (Test-Path $DestinationBase)) {
    New-Item -ItemType Directory -Path $DestinationBase -Force | Out-Null
}

if (-not (Test-Path $LogPath)) {
    New-Item -ItemType Directory -Path $LogPath -Force | Out-Null
}

$Timestamp = Get-Date -Format "yyyy-MM-dd_HHmmss"
$LogFile = Join-Path $LogPath "${ConfigurationName}_Install_$Timestamp.log"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    $entry = "[$Level] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - $Message"
    Add-Content -Path $LogFile -Value $entry
    Write-Host $entry
}

Write-Log "Configuration Blender Installer v$InstallerVersion"
Write-Log "Installing configuration: $ConfigurationName"
Write-Log "Source path: $ConfigSourcePath"
Write-Log "Destination: $DestinationBase"

# ============================================================================
# LOAD AND VALIDATE CONFIGURATION
# ============================================================================

$ConfigFile = Join-Path $ConfigSourcePath "Config.json"
if (-not (Test-Path $ConfigFile)) {
    Write-Log "Configuration file not found: $ConfigFile" "ERROR"
    exit 1
}

try {
    $Config = Get-Content $ConfigFile -Raw | ConvertFrom-Json
    Write-Log "Loaded configuration: $($Config.role) v$($Config.version)"
} catch {
    Write-Log "Failed to parse configuration: $($_.Exception.Message)" "ERROR"
    exit 1
}

# ============================================================================
# COPY CONFIGURATION FILE
# ============================================================================

Write-Log "Copying configuration file..."
try {
    Copy-Item -Path $ConfigFile -Destination (Join-Path $DestinationBase "Config.json") -Force
    Write-Log "Copied Config.json"
} catch {
    Write-Log "Failed to copy Config.json: $($_.Exception.Message)" "ERROR"
    exit 1
}

# ============================================================================
# COPY ASSETS
# ============================================================================

$AssetsSource = Join-Path $ConfigSourcePath "Assets"
$AssetsDestination = Join-Path $DestinationBase "Assets"

if (Test-Path $AssetsSource) {
    Write-Log "Copying assets..."

    # Ensure assets destination exists
    if (-not (Test-Path $AssetsDestination)) {
        New-Item -ItemType Directory -Path $AssetsDestination -Force | Out-Null
    }

    # Copy all asset subdirectories
    $assetFolders = Get-ChildItem -Path $AssetsSource -Directory -ErrorAction SilentlyContinue

    foreach ($folder in $assetFolders) {
        $destFolder = Join-Path $AssetsDestination $folder.Name

        if (-not (Test-Path $destFolder)) {
            New-Item -ItemType Directory -Path $destFolder -Force | Out-Null
        }

        $files = Get-ChildItem -Path $folder.FullName -File -ErrorAction SilentlyContinue
        $copiedCount = 0

        foreach ($file in $files) {
            # Skip Thumbs.db
            if ($file.Name -eq "Thumbs.db") { continue }

            try {
                Copy-Item -Path $file.FullName -Destination $destFolder -Force
                $copiedCount++
            } catch {
                Write-Log "Failed to copy $($file.Name): $($_.Exception.Message)" "WARNING"
            }
        }

        Write-Log "Copied $copiedCount file(s) to Assets\$($folder.Name)"
    }

    # Copy any loose files in Assets folder
    $looseFiles = Get-ChildItem -Path $AssetsSource -File -ErrorAction SilentlyContinue
    foreach ($file in $looseFiles) {
        if ($file.Name -eq "Thumbs.db") { continue }
        try {
            Copy-Item -Path $file.FullName -Destination $AssetsDestination -Force
            Write-Log "Copied $($file.Name) to Assets\"
        } catch {
            Write-Log "Failed to copy $($file.Name): $($_.Exception.Message)" "WARNING"
        }
    }
} else {
    Write-Log "No Assets folder found in source" "WARNING"
}

# ============================================================================
# WRITE VERSION TO REGISTRY
# ============================================================================

Write-Log "Writing version information to registry..."

try {
    # Create base registry path if needed
    if (-not (Test-Path $RegistryBase)) {
        New-Item -Path $RegistryBase -Force | Out-Null
    }

    # Create role-specific path
    $RoleRegPath = Join-Path $RegistryBase $Config.role
    if (-not (Test-Path $RoleRegPath)) {
        New-Item -Path $RoleRegPath -Force | Out-Null
    }

    # Write version info
    Set-ItemProperty -Path $RoleRegPath -Name "InstalledVersion" -Value $Config.version -Type String -Force
    Set-ItemProperty -Path $RoleRegPath -Name "InstalledDate" -Value (Get-Date -Format "yyyy-MM-ddTHH:mm:ss") -Type String -Force
    Set-ItemProperty -Path $RoleRegPath -Name "ConfigurationPath" -Value (Join-Path $DestinationBase "Config.json") -Type String -Force
    Set-ItemProperty -Path $RoleRegPath -Name "InstallerVersion" -Value $InstallerVersion -Type String -Force

    Write-Log "Registry updated: $RoleRegPath"
    Write-Log "  InstalledVersion = $($Config.version)"
} catch {
    Write-Log "Failed to write registry: $($_.Exception.Message)" "ERROR"
    exit 1
}

# ============================================================================
# INSTALLATION SUMMARY
# ============================================================================

Write-Log "==========================================="
Write-Log "INSTALLATION COMPLETE"
Write-Log "==========================================="
Write-Log "Configuration: $($Config.role)"
Write-Log "Version: $($Config.version)"
Write-Log "Author: $($Config.author)"
Write-Log "Destination: $DestinationBase"
Write-Log "Registry: $RoleRegPath"
Write-Log "Log file: $LogFile"
Write-Log "==========================================="

Write-Output "SUCCESS: Installed $($Config.role) v$($Config.version)"
exit 0
