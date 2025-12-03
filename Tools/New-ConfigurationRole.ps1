# ============================================================================
# Configuration Blender - New Configuration Role Creator
# ============================================================================
# Version: 1.0.0
# Author: Joshua Walderbach
# Description: Creates folder structure for a new Configuration Blender role
# ============================================================================

<#
.SYNOPSIS
    Creates the folder structure for a new Configuration Blender role.

.DESCRIPTION
    This script automates the initial setup for a new role configuration:
    1. Validates the role name
    2. Creates Configurations/[ROLE]/ folder
    3. Creates Configurations/[ROLE]/Assets/ folder
    4. Opens the WebUI configuration builder
    5. Displays next steps

.PARAMETER Role
    The role name (e.g., "US_CBL", "HO_XYZ"). Should use uppercase and underscores.

.PARAMETER SkipWebUI
    If specified, does not open the WebUI automatically.

.EXAMPLE
    .\New-ConfigurationRole.ps1 -Role "HO_XYZ"
    Creates folder structure and opens WebUI

.EXAMPLE
    .\New-ConfigurationRole.ps1 -Role "HO_XYZ" -SkipWebUI
    Creates folder structure without opening WebUI
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Role,

    [Parameter(Mandatory = $false)]
    [switch]$SkipWebUI
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

Write-Header "Configuration Blender Role Creator v$ScriptVersion"

# Ensure we're in the repository root
$RepoRoot = Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $RepoRoot "Configurations"))) {
    Write-Error "Cannot find Configurations folder. Please run from repository root or Tools folder."
    exit 1
}

Write-Info "Repository: $RepoRoot"

# ============================================================================
# VALIDATE ROLE NAME
# ============================================================================

Write-Header "Validating Role Name: $Role"

# Check for invalid characters
if ($Role -match '[^A-Za-z0-9_-]') {
    Write-Error "Role name contains invalid characters."
    Write-Host ""
    Write-Host "Role names should only contain:" -ForegroundColor Yellow
    Write-Host "  - Letters (A-Z, a-z)" -ForegroundColor White
    Write-Host "  - Numbers (0-9)" -ForegroundColor White
    Write-Host "  - Underscores (_)" -ForegroundColor White
    Write-Host "  - Hyphens (-)" -ForegroundColor White
    Write-Host ""
    Write-Host "Examples of valid role names:" -ForegroundColor Yellow
    Write-Host "  - US_CBL" -ForegroundColor Green
    Write-Host "  - HO_XYZ" -ForegroundColor Green
    Write-Host "  - Kiosk-BreakRoom" -ForegroundColor Green
    exit 1
}

# Warn if role name doesn't follow convention
if ($Role -cnotmatch '^[A-Z]{2,}_[A-Z]{2,}$') {
    Write-Warning "Role name doesn't follow recommended convention (XX_YYY format in uppercase)"
    Write-Host "  Recommended: US_CBL, HO_XYZ, etc." -ForegroundColor Yellow
    Write-Host "  You entered: $Role" -ForegroundColor Yellow
    Write-Host ""
    $continue = Read-Host "Continue anyway? (Y/N)"
    if ($continue -ne "Y" -and $continue -ne "y") {
        Write-Host "Cancelled." -ForegroundColor Yellow
        exit 0
    }
}

Write-Success "Role name is valid"

# ============================================================================
# CHECK IF ROLE ALREADY EXISTS
# ============================================================================

$RolePath = Join-Path $RepoRoot "Configurations\$Role"

if (Test-Path $RolePath) {
    Write-Error "Role '$Role' already exists at: $RolePath"
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  1. Choose a different role name" -ForegroundColor White
    Write-Host "  2. Delete existing role folder and re-run this script" -ForegroundColor White
    Write-Host "  3. Edit existing configuration in WebUI (use Import JSON)" -ForegroundColor White
    exit 1
}

# ============================================================================
# CREATE FOLDER STRUCTURE
# ============================================================================

Write-Header "Creating Folder Structure"

try {
    # Create role folder
    New-Item -ItemType Directory -Path $RolePath -Force | Out-Null
    Write-Success "Created: $RolePath"

    # Create Assets folder
    $AssetsPath = Join-Path $RolePath "Assets"
    New-Item -ItemType Directory -Path $AssetsPath -Force | Out-Null
    Write-Success "Created: $AssetsPath"

    Write-Host ""
    Write-Info "Folder structure created successfully!"

} catch {
    Write-Error "Failed to create folder structure: $($_.Exception.Message)"
    exit 1
}

# ============================================================================
# OPEN WEBUI
# ============================================================================

if (-not $SkipWebUI) {
    Write-Header "Opening Configuration Builder"

    $WebUIPath = Join-Path $RepoRoot "WebUI\ConfigurationBuilder.html"

    if (Test-Path $WebUIPath) {
        try {
            Start-Process $WebUIPath
            Write-Success "Opened WebUI in default browser"
        } catch {
            Write-Warning "Could not open WebUI automatically: $($_.Exception.Message)"
            Write-Info "Manually open: $WebUIPath"
        }
    } else {
        Write-Warning "WebUI not found at: $WebUIPath"
    }
}

# ============================================================================
# DISPLAY NEXT STEPS
# ============================================================================

Write-Header "Next Steps"

Write-Host ""
Write-Host "📋 Your role structure is ready!" -ForegroundColor Green
Write-Host ""
Write-Host "Step 1: Build your configuration in the WebUI" -ForegroundColor Cyan
if ($SkipWebUI) {
    Write-Host "   Open: $RepoRoot\WebUI\ConfigurationBuilder.html" -ForegroundColor White
}
Write-Host "   - Set Role: $Role" -ForegroundColor White
Write-Host "   - Set Version: 1.0.0" -ForegroundColor White
Write-Host "   - Add your checks" -ForegroundColor White
Write-Host "   - Export JSON" -ForegroundColor White
Write-Host ""
Write-Host "Step 2: Save Config.json" -ForegroundColor Cyan
Write-Host "   Save exported JSON as: $RolePath\Config.json" -ForegroundColor White
Write-Host "   ⚠️  Must be named exactly 'Config.json' (capital C)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Step 3: Add assets (if needed)" -ForegroundColor Cyan
Write-Host "   Create subfolders in $AssetsPath as needed:" -ForegroundColor White
Write-Host "   - Icons\          (for application icons)" -ForegroundColor Gray
Write-Host "   - Scripts\        (for PowerShell scripts)" -ForegroundColor Gray
Write-Host "   - Drivers\        (for device driver .inf files)" -ForegroundColor Gray
Write-Host "   - AccountPictures\ (for user account pictures)" -ForegroundColor Gray
Write-Host "   - Wallpapers\     (for desktop backgrounds)" -ForegroundColor Gray
Write-Host ""
Write-Host "Step 4: Test locally (optional)" -ForegroundColor Cyan
Write-Host "   See GUIDE_Creating_Your_First_Configuration.md (Part 3)" -ForegroundColor White
Write-Host ""
Write-Host "Step 5: Package for Intune" -ForegroundColor Cyan
Write-Host "   .\Tools\New-IntunePackage.ps1 -Role ""$Role""" -ForegroundColor White
Write-Host ""

Write-Success "Happy configuring!"
Write-Host ""
