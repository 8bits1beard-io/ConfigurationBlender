# Tools

This folder contains tools for Configuration Blender package creation.

## New-ConfigurationRole.ps1

**Purpose:** Creates the folder structure for a new Configuration Blender role.

**Features:**
- ✅ Validates role name (checks for invalid characters)
- ✅ Creates `Configurations/[ROLE]/` folder
- ✅ Creates `Configurations/[ROLE]/Assets/` folder
- ✅ Opens WebUI configuration builder automatically
- ✅ Displays clear next steps

**Quick Start:**
```powershell
# Create new role and open WebUI
.\Tools\New-ConfigurationRole.ps1 -Role "HO_XYZ"

# Create role without opening WebUI
.\Tools\New-ConfigurationRole.ps1 -Role "HO_XYZ" -SkipWebUI
```

**What It Does:**
1. Validates role name (letters, numbers, underscores, hyphens only)
2. Warns if role doesn't follow convention (XX_YYY format)
3. Checks if role already exists
4. Creates `Configurations/[ROLE]/` folder
5. Creates `Configurations/[ROLE]/Assets/` folder
6. Opens `Builder/ConfigurationBlender.html` in default browser
7. Shows next steps for building the configuration

**Recommended Workflow:**
1. Run this script to create the role structure
2. Use WebUI to build your Config.json
3. Export and save as `Config.json` in the role folder
4. Add asset files to `Assets/` subfolders as needed
5. Package with `New-IntunePackage.ps1`

---

## New-IntunePackage.ps1

**Purpose:** Automates creation of Intune Win32 app packages (.intunewin) for Configuration Blender roles.

**Features:**
- ✅ Interactive mode with role selection menu
- ✅ Automatic role and version detection from Config.json
- ✅ Validates all prerequisites before packaging
- ✅ Generates Detect.ps1 with correct role and version
- ✅ Creates properly named output: `[ROLE]_v[VERSION].intunewin`
- ✅ Displays complete Intune upload instructions

**Quick Start:**
```powershell
# Interactive mode (shows menu of roles)
.\Tools\New-IntunePackage.ps1

# Direct mode (package specific role)
.\Tools\New-IntunePackage.ps1 -Role "US_CBL"

# Preview mode (see what would happen)
.\Tools\New-IntunePackage.ps1 -Role "US_CBL" -WhatIf
```

**What It Does:**
1. Validates IntuneWinAppUtil.exe is downloaded
2. Finds Config.json for the selected role
3. Copies Install.ps1 to role folder
4. Generates Detect.ps1 with role name and version replaced
5. Runs IntuneWinAppUtil.exe to create .intunewin package
6. Outputs to `Output/[ROLE]_v[VERSION].intunewin`
7. Shows complete Intune upload instructions

**Requirements:**
- IntuneWinAppUtil.exe must be downloaded (see below)
- Config.json must exist in role folder
- Config.json must have valid `role` and `version` fields

---

## IntuneWinAppUtil.exe

**Purpose:** Packages configurations into `.intunewin` format for Intune deployment.

**Download:**
1. Go to: https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool
2. Click **Releases** (right sidebar)
3. Download `IntuneWinAppUtil.exe` from the latest release
4. Place it in this `Tools/` folder

**Alternative download:**
```powershell
# Download directly via PowerShell
Invoke-WebRequest -Uri "https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool/releases/latest/download/IntuneWinAppUtil.exe" `
                  -OutFile ".\Tools\IntuneWinAppUtil.exe"
```

**Usage:**
```powershell
# From repository root
.\Tools\IntuneWinAppUtil.exe -c "Configurations\YOUR_ROLE" -s "Install.ps1" -o "Output"
```

**Version:**
- Latest tested: v1.8.5 (as of 2025-11-16)
- Check for updates periodically at the GitHub releases page

---

## Why not commit the binary?

We don't commit `IntuneWinAppUtil.exe` to the repository because:
- ✅ Keeps repo size small
- ✅ Engineers always get the latest version
- ✅ Avoids licensing concerns with redistributing Microsoft tools

Download once per workstation, then you're set!
