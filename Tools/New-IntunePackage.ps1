# ============================================================================
# Configuration Blender - Intune Package Builder
# ============================================================================
# Version: 1.0.0
# Author: Joshua Walderbach
# Description: Automates creation of Intune Win32 app packages from
#              Configuration Blender role configurations.
# ============================================================================

<#
.SYNOPSIS
    Creates an Intune Win32 app package (.intunewin) for a Configuration Blender role.

.DESCRIPTION
    This script automates the packaging process for Configuration Blender roles:
    1. Validates prerequisites (IntuneWinAppUtil.exe, Config.json)
    2. Reads role name and version from Config.json
    3. Prepares Install.ps1 and Detect.ps1 files
    4. Runs IntuneWinAppUtil.exe to create .intunewin package
    5. Displays Intune upload instructions

.PARAMETER Role
    The role to package (e.g., "US_CBL", "US_DVR"). If not specified, shows
    interactive menu of available roles.

.PARAMETER OutputPath
    Directory where .intunewin packages will be saved. Default: "Output"

.PARAMETER WhatIf
    Shows what would happen without actually creating the package.

.EXAMPLE
    .\New-IntunePackage.ps1
    Shows interactive menu of available roles

.EXAMPLE
    .\New-IntunePackage.ps1 -Role "US_CBL"
    Directly packages the US_CBL role

.EXAMPLE
    .\New-IntunePackage.ps1 -Role "US_CBL" -WhatIf
    Shows what would be packaged without creating the package
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $false)]
    [string]$Role,

    [Parameter(Mandatory = $false)]
    [string]$OutputPath = "Output",

    [Parameter(Mandatory = $false)]
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"
$ScriptVersion = "1.0.0"

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

function Write-Header {
    param([string]$Text)
    Write-Host ""
    Write-Host "=========================================" -ForegroundColor Cyan
    Write-Host $Text -ForegroundColor Cyan
    Write-Host "=========================================" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Text)
    Write-Host "✅ $Text" -ForegroundColor Green
}

function Write-Error {
    param([string]$Text)
    Write-Host "❌ $Text" -ForegroundColor Red
}

function Write-Warning {
    param([string]$Text)
    Write-Host "⚠️  $Text" -ForegroundColor Yellow
}

function Write-Info {
    param([string]$Text)
    Write-Host "ℹ️  $Text" -ForegroundColor Blue
}

# ============================================================================
# VALIDATE ENVIRONMENT
# ============================================================================

Write-Header "Configuration Blender Package Builder v$ScriptVersion"

# Ensure we're in the repository root
$RepoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
if (-not (Test-Path (Join-Path $RepoRoot "Configurations"))) {
    # Try PSScriptRoot as repo root
    $RepoRoot = Split-Path $PSScriptRoot -Parent
    if (-not (Test-Path (Join-Path $RepoRoot "Configurations"))) {
        Write-Error "Cannot find Configurations folder. Please run from repository root or Tools folder."
        exit 1
    }
}

Write-Info "Repository: $RepoRoot"

# Validate IntuneWinAppUtil.exe exists
$IntuneWinAppUtil = Join-Path $RepoRoot "Tools\IntuneWinAppUtil.exe"
if (-not (Test-Path $IntuneWinAppUtil)) {
    Write-Error "IntuneWinAppUtil.exe not found at: $IntuneWinAppUtil"
    Write-Host ""
    Write-Host "Download it with this command:" -ForegroundColor Yellow
    Write-Host "Invoke-WebRequest -Uri 'https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool/releases/latest/download/IntuneWinAppUtil.exe' -OutFile '$IntuneWinAppUtil'" -ForegroundColor Cyan
    exit 1
}

Write-Success "Found IntuneWinAppUtil.exe"

# ============================================================================
# SELECT ROLE
# ============================================================================

$ConfigurationsPath = Join-Path $RepoRoot "Configurations"

if ([string]::IsNullOrEmpty($Role)) {
    # Interactive mode - show menu
    Write-Host ""
    Write-Host "Available Roles:" -ForegroundColor Cyan
    Write-Host ""

    $availableRoles = Get-ChildItem -Path $ConfigurationsPath -Directory | Where-Object {
        Test-Path (Join-Path $_.FullName "Config.json")
    }

    if ($availableRoles.Count -eq 0) {
        Write-Error "No roles found with Config.json in $ConfigurationsPath"
        exit 1
    }

    for ($i = 0; $i -lt $availableRoles.Count; $i++) {
        $roleFolder = $availableRoles[$i]
        $configPath = Join-Path $roleFolder.FullName "Config.json"

        try {
            $config = Get-Content $configPath -Raw | ConvertFrom-Json
            Write-Host "  [$($i + 1)] $($roleFolder.Name) - v$($config.version) - $($config.description)"
        } catch {
            Write-Host "  [$($i + 1)] $($roleFolder.Name) - (invalid Config.json)" -ForegroundColor Yellow
        }
    }

    Write-Host ""
    $selection = Read-Host "Select role number (or Q to quit)"

    if ($selection -eq "Q" -or $selection -eq "q") {
        Write-Host "Cancelled." -ForegroundColor Yellow
        exit 0
    }

    $selectedIndex = [int]$selection - 1
    if ($selectedIndex -lt 0 -or $selectedIndex -ge $availableRoles.Count) {
        Write-Error "Invalid selection."
        exit 1
    }

    $Role = $availableRoles[$selectedIndex].Name
}

# ============================================================================
# VALIDATE ROLE CONFIGURATION
# ============================================================================

Write-Header "Validating Role: $Role"

$RolePath = Join-Path $ConfigurationsPath $Role
if (-not (Test-Path $RolePath)) {
    Write-Error "Role folder not found: $RolePath"
    exit 1
}

Write-Success "Found role folder: $RolePath"

# Load and validate Config.json
$ConfigPath = Join-Path $RolePath "Config.json"
if (-not (Test-Path $ConfigPath)) {
    Write-Error "Config.json not found: $ConfigPath"
    exit 1
}

Write-Success "Found Config.json"

try {
    $Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
} catch {
    Write-Error "Invalid JSON in Config.json: $($_.Exception.Message)"
    exit 1
}

# Validate required fields
if ([string]::IsNullOrEmpty($Config.role)) {
    Write-Error "Config.json is missing 'role' field"
    exit 1
}

if ([string]::IsNullOrEmpty($Config.version)) {
    Write-Error "Config.json is missing 'version' field"
    exit 1
}

Write-Success "Validated Config.json: $($Config.role) v$($Config.version)"

# Check if role matches folder name
if ($Config.role -ne $Role) {
    Write-Warning "Config.json role ($($Config.role)) does not match folder name ($Role)"
    Write-Warning "Using role from Config.json: $($Config.role)"
    $Role = $Config.role
}

# Check for Assets folder (warning only)
$AssetsPath = Join-Path $RolePath "Assets"
if (Test-Path $AssetsPath) {
    $assetCount = (Get-ChildItem -Path $AssetsPath -Recurse -File | Where-Object { $_.Name -ne "Thumbs.db" }).Count
    Write-Success "Found Assets folder ($assetCount file(s))"
} else {
    Write-Warning "No Assets folder found (package will contain Config.json only)"
}

# ============================================================================
# PREPARE PACKAGING FILES
# ============================================================================

Write-Header "Preparing Package Files"

$PackagingPath = Join-Path $RepoRoot "Packaging"

# Copy Install.ps1 to role folder
$InstallSource = Join-Path $PackagingPath "Install.ps1"
$InstallDest = Join-Path $RolePath "Install.ps1"

if (-not (Test-Path $InstallSource)) {
    Write-Error "Install.ps1 template not found: $InstallSource"
    exit 1
}

if ($PSCmdlet.ShouldProcess($InstallDest, "Copy Install.ps1")) {
    Copy-Item -Path $InstallSource -Destination $InstallDest -Force
    Write-Success "Copied Install.ps1"
}

# Generate Detect.ps1 with placeholders replaced
$DetectSource = Join-Path $PackagingPath "Detect.ps1"
$DetectDest = Join-Path $RolePath "Detect.ps1"

if (-not (Test-Path $DetectSource)) {
    Write-Error "Detect.ps1 template not found: $DetectSource"
    exit 1
}

if ($PSCmdlet.ShouldProcess($DetectDest, "Generate Detect.ps1")) {
    $detectContent = Get-Content $DetectSource -Raw
    $detectContent = $detectContent -replace '{{ROLE}}', $Config.role
    $detectContent = $detectContent -replace '{{VERSION}}', $Config.version

    Set-Content -Path $DetectDest -Value $detectContent -Encoding UTF8
    Write-Success "Generated Detect.ps1 (Role: $($Config.role), Version: $($Config.version))"
}

# ============================================================================
# CREATE OUTPUT DIRECTORY
# ============================================================================

$OutputDir = Join-Path $RepoRoot $OutputPath
if (-not (Test-Path $OutputDir)) {
    if ($PSCmdlet.ShouldProcess($OutputDir, "Create output directory")) {
        New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
        Write-Success "Created output directory: $OutputDir"
    }
} else {
    Write-Info "Using existing output directory: $OutputDir"
}

# ============================================================================
# RUN INTUNEWINAPPUTIL
# ============================================================================

Write-Header "Creating Intune Package"

$PackageName = "$($Config.role)_v$($Config.version).intunewin"
$OutputFile = Join-Path $OutputDir $PackageName

if ($PSCmdlet.ShouldProcess($OutputFile, "Create Intune package")) {
    Write-Info "Running IntuneWinAppUtil.exe..."
    Write-Info "  Source: $RolePath"
    Write-Info "  Setup File: Install.ps1"
    Write-Info "  Output: $OutputDir"

    # Run IntuneWinAppUtil
    $arguments = @(
        "-c", "`"$RolePath`""
        "-s", "Install.ps1"
        "-o", "`"$OutputDir`""
        "-q"  # Quiet mode
    )

    try {
        $process = Start-Process -FilePath $IntuneWinAppUtil -ArgumentList $arguments -Wait -PassThru -NoNewWindow

        if ($process.ExitCode -ne 0) {
            Write-Error "IntuneWinAppUtil.exe failed with exit code $($process.ExitCode)"
            exit 1
        }

        # IntuneWinAppUtil creates "Install.intunewin" - rename it
        $defaultOutput = Join-Path $OutputDir "Install.intunewin"
        if (Test-Path $defaultOutput) {
            if (Test-Path $OutputFile) {
                Remove-Item $OutputFile -Force
            }
            Move-Item -Path $defaultOutput -Destination $OutputFile -Force
        }

        if (-not (Test-Path $OutputFile)) {
            Write-Error "Package creation failed - output file not found"
            exit 1
        }

        Write-Success "Package created successfully!"

    } catch {
        Write-Error "Failed to run IntuneWinAppUtil.exe: $($_.Exception.Message)"
        exit 1
    }
}

# ============================================================================
# SUCCESS SUMMARY
# ============================================================================

Write-Header "Package Created Successfully!"

Write-Host ""
Write-Host "📦 Package Details:" -ForegroundColor Green
Write-Host "   Role:        $($Config.role)" -ForegroundColor White
Write-Host "   Version:     $($Config.version)" -ForegroundColor White
Write-Host "   Description: $($Config.description)" -ForegroundColor White
Write-Host "   Author:      $($Config.author)" -ForegroundColor White
Write-Host "   Package:     $OutputFile" -ForegroundColor Cyan
Write-Host "   Size:        $([math]::Round((Get-Item $OutputFile).Length / 1KB, 2)) KB" -ForegroundColor White

Write-Host ""
Write-Host "📋 Next Steps - Upload to Intune:" -ForegroundColor Yellow
Write-Host ""
Write-Host "   1. Open Microsoft Intune admin center" -ForegroundColor White
Write-Host "      https://intune.microsoft.com" -ForegroundColor Cyan
Write-Host ""
Write-Host "   2. Navigate to: Apps > Windows > Add" -ForegroundColor White
Write-Host ""
Write-Host "   3. App type: Windows app (Win32)" -ForegroundColor White
Write-Host ""
Write-Host "   4. App package file:" -ForegroundColor White
Write-Host "      $OutputFile" -ForegroundColor Cyan
Write-Host ""
Write-Host "   5. Install command:" -ForegroundColor White
Write-Host "      powershell.exe -ExecutionPolicy Bypass -File Install.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "   6. Uninstall command:" -ForegroundColor White
Write-Host "      cmd.exe /c echo No uninstall" -ForegroundColor Cyan
Write-Host ""
Write-Host "   7. Detection rules: Use a custom detection script" -ForegroundColor White
Write-Host "      Upload: $DetectDest" -ForegroundColor Cyan
Write-Host ""
Write-Host "   8. Requirements:" -ForegroundColor White
Write-Host "      Operating system architecture: 64-bit" -ForegroundColor Cyan
Write-Host "      Minimum operating system: Windows 10 1607" -ForegroundColor Cyan
Write-Host ""
Write-Host "   9. Assign to device group for role: $($Config.role)" -ForegroundColor White
Write-Host ""
Write-Host "🔄 To update this configuration:" -ForegroundColor Yellow
Write-Host "   1. Edit Config.json or Assets" -ForegroundColor White
Write-Host "   2. Bump version in Config.json" -ForegroundColor White
Write-Host "   3. Run this script again" -ForegroundColor White
Write-Host "   4. Upload new package to Intune" -ForegroundColor White
Write-Host "   5. Use Supersedence to replace old version" -ForegroundColor White
Write-Host ""

Write-Success "Done!"
