# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Configuration Blender** is an enterprise configuration management tool for Windows workstations deployed via Microsoft Intune. Named in honor of June Blender, it allows engineers to define desired system states through a visual interface and enforces compliance through Intune Proactive Remediation.

**Developer:** Joshua Walderbach, Systems & Infrastructure Engineer III, Windows Engineering OS

## Architecture

Configuration Blender follows a three-stage deployment pipeline:

1. **Builder** (`Builder/ConfigurationBlender.html`) - Browser-based visual editor that generates Config.json files
2. **Win32 App** (`Packaging/Install.ps1`, `Packaging/Detect.ps1`) - Deploys Config.json and Assets to endpoints via Intune
3. **Proactive Remediation** (`ProactiveRemediation/Detect.ps1`, `ProactiveRemediation/Remediate.ps1`) - Detects configuration drift and automatically remediates

### Critical Architectural Principle: Role-Agnostic Proactive Remediation

The ProactiveRemediation scripts (`ProactiveRemediation/Detect.ps1` and `ProactiveRemediation/Remediate.ps1`) are **role-agnostic**. They work for ALL roles (US_CBL, US_DVR, etc.) by reading whatever `Config.json` is deployed to the device at `C:\ProgramData\ConfigurationBlender\Config.json`.

- Each device gets ONE Win32 app package based on Intune group assignment
- The Win32 app deploys role-specific Config.json and Assets
- The SAME Proactive Remediation policy runs on all devices, regardless of role
- Registry tracking is role-specific: `HKLM:\SOFTWARE\ConfigurationBlender\[ROLE]\`

**Consequence:** Only ONE configuration can be active per device. Multiple roles cannot coexist in production.

### Critical Architectural Principle: SYSTEM Execution Context

**IMPORTANT:** Both the Win32 App installer and Proactive Remediation scripts run as **NT AUTHORITY\SYSTEM** in production (Intune's default context). This has significant implications for check design:

#### What This Means:

1. **Registry Access:**
   - `HKLM:\` (Local Machine) - ✅ Full access
   - `HKCU:\` (Current User) - ⚠️ **SYSTEM's** registry hive, NOT the logged-in user's

2. **File Paths:**
   - `C:\Windows\`, `C:\Program Files\` - ✅ Full access
   - `C:\Users\Public\` - ✅ Accessible
   - `C:\Users\[Username]\` - ⚠️ Accessible but may have permission issues
   - `$env:USERPROFILE` - ⚠️ Resolves to `C:\Windows\System32\config\systemprofile\` (SYSTEM's profile)
   - `$env:TEMP` - ⚠️ Resolves to `C:\Windows\Temp` (not user temp)

3. **User Context Operations:**
   - Shortcuts in `C:\Users\Public\Desktop\` - ✅ Work for all users
   - Shortcuts in `C:\Users\[Username]\Desktop\` - ⚠️ Requires explicit username
   - User-specific scheduled tasks - ⚠️ Need explicit principal/user
   - Interactive UI operations - ❌ SYSTEM has no interactive desktop

4. **Environment Variables (SYSTEM context):**
   ```powershell
   $env:USERNAME        # Returns "SYSTEM" (not the logged-in user)
   $env:USERPROFILE     # Returns "C:\Windows\System32\config\systemprofile"
   $env:APPDATA         # Returns "C:\Windows\System32\config\systemprofile\AppData\Roaming"
   $env:TEMP            # Returns "C:\Windows\Temp"
   ```

#### Best Practices:

- ✅ **DO:** Use `C:\Users\Public\` for items that should apply to all users
- ✅ **DO:** Use `HKLM:\` for system-wide registry settings
- ✅ **DO:** Explicitly specify usernames when targeting specific user profiles
- ❌ **DON'T:** Use `HKCU:\` expecting it to affect logged-in users (it affects SYSTEM's hive)
- ❌ **DON'T:** Use `$env:USERPROFILE` expecting it to be a user's profile folder
- ❌ **DON'T:** Create shortcuts in user desktops without specifying the username

#### Example Issues:

**❌ This will NOT work as intended:**
```json
{
  "type": "RegistryValue",
  "properties": {
    "path": "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced",
    "name": "TaskbarAl",
    "value": 0
  }
}
```
**Why:** This modifies SYSTEM's registry, not the logged-in user's. When the user logs in, their Start Menu position won't be affected.

**✅ Use HKLM for system-wide settings instead:**
```json
{
  "type": "RegistryValue",
  "properties": {
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer",
    "name": "DisableNotificationCenter",
    "value": 1,
    "type": "DWord"
  }
}
```
**Why:** HKLM registry values are accessible to SYSTEM and apply system-wide.

#### Testing in SYSTEM Context:

When testing locally, use PsExec to run as SYSTEM:
```powershell
# Download PsExec from https://docs.microsoft.com/en-us/sysinternals/downloads/psexec
psexec -i -s powershell.exe -ExecutionPolicy Bypass -File "C:\ProgramData\ConfigurationBlender\ProactiveRemediation\Detect.ps1"
```

This reveals the same environment variables and permissions that Intune will use in production.

## Configuration Structure

Each role configuration lives in `Configurations/[ROLE]/`:
```
Configurations/
└── US_CBL/
    ├── Config.json              # JSON definition of desired state
    └── Assets/                  # Files deployed to endpoints
        ├── Icons/               # Application icons (.ico)
        ├── AccountPictures/     # User account pictures
        └── Scripts/             # PowerShell scripts to deploy
```

### Config.json Schema

The Config.json file defines:
- **Metadata:** `version`, `role`, `description`, `author`, `lastModified`
- **Checks array:** List of compliance checks, each with:
  - `id` - Unique identifier (kebab-case)
  - `name` - Human-readable name
  - `type` - Check type (see supported types below)
  - `enabled` - Boolean toggle
  - `properties` - Type-specific configuration

### Supported Check Types

Each check type requires a corresponding `Test-[CheckType]` function in `ProactiveRemediation/Detect.ps1` and `Repair-[CheckType]` function in `ProactiveRemediation/Remediate.ps1`.

| Type | Purpose | Key Properties | Example Use Case |
|------|---------|----------------|------------------|
| `Application` | Ensure app is/isn't installed | `applicationName`, `ensureInstalled`, `searchPaths`, `installCommand`/`uninstallPaths` | Install Git or remove Chrome |
| `FolderEmpty` | Ensure folder has no contents | `paths`, `includeAllUserProfiles` | Desktop cleanup |
| `ShortcutsAllowList` | Only allowed shortcuts exist | `path`, `allowedShortcuts` | Kiosk desktop control |
| `FolderExists` | Ensure folder exists (optionally with files) | `path`, `minimumFileCount`, `sourceAssetPath` | User account pictures |
| `FilesExist` | Deploy files to destination | `mode` (MultipleFiles/SingleFile), `destinationPath`, `files`, `sourceAssetPath` | Deploy icons or scripts |
| `ShortcutExists` | Create/verify shortcut | `path`, `targetPath`, `arguments`, `iconLocation`, `description` | Company portal with Edge |
| `AssignedAccess` | Configure kiosk mode (⚠️ requires SYSTEM) | `profileId`, `displayName`, `allowedApps`, `startPins` | Single-app kiosk |
| `RegistryValue` | Set registry value | `path`, `name`, `value`, `type` | Win11 Start Menu left align |
| `ScheduledTaskExists` | Create scheduled task | `taskName`, `execute`, `arguments`, `trigger`, `principal` | Daily 3 AM restart for updates |
| `ServiceRunning` | Ensure Windows service is running | `serviceName`, `startupType`, `ensureRunning` | Keep Print Spooler running |
| `PrinterInstalled` | Ensure printer is configured correctly | `printerName`, `driverName`, `printerIP`, `portName`, `portType` (TCP/LPR), `lprQueue` (for LPR), `setAsDefault` | Deploy network printers with drift detection |
| `DriverInstalled` | Ensure device driver is installed | `driverName`, `driverClass`, `sourceAssetPath`, `minimumVersion` (optional) | Install/update display or network drivers |
| `WindowsFeature` | Enable/disable Windows optional features | `featureName`, `state` | Enable Hyper-V or disable Telemetry |
| `FirewallRule` | Manage Windows Firewall rules | `ruleName`, `displayName`, `direction`, `action`, `protocol`, `remoteAddress`, `remotePort`, `localPort`, `program`, `enabled` | Block telemetry or allow RDP |
| `CertificateInstalled` | Ensure certificate is installed with expiration validation | `storeLocation`, `storeName`, `thumbprint`, `subject`, `issuer`, `minimumDaysValid`, `sourceAssetPath`, `pfxPassword` | Deploy enterprise root CA or validate SSL certificates |
| `NetworkAdapterConfiguration` | Configure network adapter with static IP and settings | `adapterName`, `adapterDescription`, `macAddress`, `staticIPAddress`, `subnetPrefixLength`, `defaultGateway`, `dnsServers`, `networkCategory`, `interfaceMetric`, `ensureEnabled` | Configure private network adapter with static IP |

## File Paths Reference

### Production Paths (on managed endpoints)
- **Base:** `C:\ProgramData\ConfigurationBlender\`
- **Config:** `C:\ProgramData\ConfigurationBlender\Config.json`
- **Assets:** `C:\ProgramData\ConfigurationBlender\Assets\`
- **Logs:** `C:\ProgramData\ConfigurationBlender\Logs\`
- **Registry:** `HKLM:\SOFTWARE\ConfigurationBlender\[ROLE]\`

### Development Paths (in this repository)
- **Configurations:** `Configurations/[ROLE]/Config.json`
- **ProactiveRemediation Scripts:** `ProactiveRemediation/Detect.ps1`, `ProactiveRemediation/Remediate.ps1`
- **Packaging Scripts:** `Packaging/Install.ps1`, `Packaging/Detect.ps1`
- **Builder:** `Builder/ConfigurationBlender.html`

## Common Development Tasks

### Testing a Configuration Locally

To test a configuration before packaging and deploying to Intune:

1. **Set up test environment:**
   ```powershell
   # Create the deployment directory structure
   New-Item -ItemType Directory -Path "C:\ProgramData\ConfigurationBlender" -Force
   New-Item -ItemType Directory -Path "C:\ProgramData\ConfigurationBlender\Logs" -Force

   # Copy the Config.json and Assets
   Copy-Item -Path "Configurations\US_CBL\Config.json" -Destination "C:\ProgramData\ConfigurationBlender\" -Force
   Copy-Item -Path "Configurations\US_CBL\Assets" -Destination "C:\ProgramData\ConfigurationBlender\" -Recurse -Force

   # Copy ProactiveRemediation scripts
   Copy-Item -Path "ProactiveRemediation\Detect.ps1" -Destination "C:\ProgramData\ConfigurationBlender\ProactiveRemediation\" -Force
   Copy-Item -Path "ProactiveRemediation\Remediate.ps1" -Destination "C:\ProgramData\ConfigurationBlender\ProactiveRemediation\" -Force
   ```

2. **Run detection:**
   ```powershell
   cd "C:\ProgramData\ConfigurationBlender"
   & ".\ProactiveRemediation\Detect.ps1"
   ```

3. **Run remediation if needed:**
   ```powershell
   & ".\ProactiveRemediation\Remediate.ps1"
   ```

4. **View logs:**
   ```powershell
   # List recent logs
   Get-ChildItem ".\Logs" | Sort-Object LastWriteTime -Descending | Select-Object -First 5

   # View latest detection log
   Get-Content (Get-ChildItem ".\Logs\Detection_*.json" | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName | ConvertFrom-Json | ConvertTo-Json -Depth 10
   ```

**Important Notes:**
- Since all roles use the same path in production, you can only test one role at a time on a device. Manually swap Config.json and Assets to test different roles.
- **The `AssignedAccess` check requires SYSTEM privileges.** When testing locally as your user account, this check will be skipped with a warning message. To test it properly:
  ```powershell
  # Download PsExec from https://docs.microsoft.com/en-us/sysinternals/downloads/psexec
  # Run detection as SYSTEM
  psexec -i -s powershell.exe -ExecutionPolicy Bypass -File "C:\ProgramData\ConfigurationBlender\ProactiveRemediation\Detect.ps1"

  # Run remediation as SYSTEM
  psexec -i -s powershell.exe -ExecutionPolicy Bypass -File "C:\ProgramData\ConfigurationBlender\ProactiveRemediation\Remediate.ps1"
  ```
  In production, Intune automatically runs both scripts as SYSTEM, so this is only a concern for local testing.

### Creating a New Configuration

**Automated Method (Recommended):**

1. **Create folder structure and open WebUI:**
   ```powershell
   .\Tools\New-ConfigurationRole.ps1 -Role "US_MPC"
   ```
   This script:
   - Validates role name
   - Creates `Configurations/US_MPC/` folder
   - Creates `Configurations/US_MPC/Assets/` folder
   - Opens `Builder/ConfigurationBlender.html` in default browser
   - Displays next steps

2. **Build Config.json in WebUI:**
   - Set Role, Version, Author, Description
   - Add checks using the visual interface
   - Export JSON and save to `Configurations/US_MPC/Config.json`

3. **Add assets** to `Configurations/US_MPC/Assets/` subfolders as needed (Icons/, Scripts/, Drivers/, etc.)

**Manual Method:**

1. **Create folder structure:**
   ```powershell
   New-Item -ItemType Directory -Path "Configurations\US_MPC\Assets" -Force
   ```

2. **Open Builder manually:**
   - Open `Builder/ConfigurationBlender.html` in browser
   - Build and export Config.json

3. **Add assets** to `Configurations/US_MPC/Assets/` subfolders

### Packaging for Intune

**Automated Method (Recommended):**

```powershell
# Interactive mode - shows menu of available roles
.\Tools\New-IntunePackage.ps1

# Direct mode - package specific role
.\Tools\New-IntunePackage.ps1 -Role "US_CBL"

# Preview mode - see what would happen
.\Tools\New-IntunePackage.ps1 -Role "US_CBL" -WhatIf
```

This script:
- Validates IntuneWinAppUtil.exe is downloaded
- Reads role and version from Config.json automatically
- Copies Install.ps1 to role folder
- Generates Detect.ps1 with {{ROLE}} and {{VERSION}} placeholders replaced
- Runs IntuneWinAppUtil.exe to create .intunewin package
- Names output as `[ROLE]_v[VERSION].intunewin`
- Displays complete Intune upload instructions

**Manual Method:**

```powershell
# Download IntuneWinAppUtil.exe from Microsoft first
# Copy Install.ps1 to role folder
Copy-Item "Packaging\Install.ps1" "Configurations\US_CBL\" -Force

# Manually edit Packaging/Detect.ps1 to set role and version
# Then package the configuration
.\Tools\IntuneWinAppUtil.exe -c "Configurations\US_CBL" -s "Install.ps1" -o "Output"
```

**Intune Win32 App Settings:**
- Install command: `powershell.exe -ExecutionPolicy Bypass -File Install.ps1`
- Uninstall command: `cmd.exe /c echo No uninstall`
- Detection: Custom script using `Packaging/Detect.ps1`

### Adding New Check Types

When adding a new check type (e.g., `ServiceRunning`):

1. **Add form UI in Builder:** Update `getPropertiesFormForType()` in `Builder/ConfigurationBlender.html`
2. **Add detection logic:** Create `Test-ServiceRunning` function in `ProactiveRemediation/Detect.ps1`
3. **Add remediation logic:** Create `Repair-ServiceRunning` function in `ProactiveRemediation/Remediate.ps1`
4. **Update switch statements:** Add case for `ServiceRunning` in both ProactiveRemediation scripts
5. **Test thoroughly** using manual testing workflow

## Logging and Debugging

All operations log to: `C:\ProgramData\ConfigurationBlender\Logs\`

**Log Types:**
- `[ROLE]_Install_[timestamp].log` - Win32 app installation (text format)
- `Detection_[timestamp].json` - Compliance check results (JSON)
- `Remediation_[timestamp].json` - Remediation actions taken (JSON)

**Detection Console Output:**
```
=========================================
NON-COMPLIANT
=========================================
Config: US_CBL v1.0.0
Total Checks: 22
Passed: 21
Failed: 1

Failed Checks:
-----------------------------------------
  - Assigned Access Kiosk Mode: CHECK SKIPPED - Must run as SYSTEM user...

Detailed Results:
-----------------------------------------
[PASS] Google Chrome Not Installed
[PASS] Desktop Folders Cleared
[FAIL] Assigned Access Kiosk Mode
       CHECK SKIPPED - Must run as SYSTEM user to verify Assigned Access...
...
=========================================
```

**Detection Log File Structure (JSON):**
```json
{
  "Timestamp": "2025-11-16T14:30:00",
  "EngineVersion": "1.0.0",
  "ConfigVersion": "1.0.0",
  "Role": "US_CBL",
  "Compliant": false,
  "Checks": [
    {
      "Id": "chrome-not-installed",
      "Name": "Google Chrome Not Installed",
      "Type": "Application",
      "Passed": true,
      "Issue": null
    },
    {
      "Id": "assigned-access-configured",
      "Name": "Assigned Access Kiosk Mode",
      "Type": "AssignedAccess",
      "Passed": false,
      "Issue": "CHECK SKIPPED - Must run as SYSTEM user..."
    }
  ],
  "Issues": ["Assigned Access Kiosk Mode: CHECK SKIPPED - Must run as SYSTEM user..."]
}
```

## Version Management

**CRITICAL PRINCIPLE:** Configuration changes (Config.json or Assets) require repackaging and redeployment. Changes do NOT take effect until the Win32 app deploys the new files to devices.

### Updating a Configuration

**Complete workflow:**

1. **Edit Config.json** (manually or via WebUI)
   - Add/remove/modify checks
   - Change properties

2. **Edit Assets** (if needed)
   - Add/remove/modify files in Assets folder

3. **Bump version number**
   - Change `version` field in Config.json: `1.0.0` → `1.1.0`
   - Follow semantic versioning:
     - Major: Breaking changes (1.0.0 → 2.0.0)
     - Minor: New features/checks (1.0.0 → 1.1.0)
     - Patch: Bug fixes (1.0.0 → 1.0.1)

4. **Update detection script**
   - Edit `Packaging/Detect.ps1`
   - Change `$ExpectedVersion = "1.0.0"` to `$ExpectedVersion = "1.1.0"`

5. **Repackage Win32 app**
   ```powershell
   IntuneWinAppUtil.exe -c "Configurations\[ROLE]" -s "Install.ps1" -o "Output"
   ```

6. **Upload to Intune**
   - Create a **new** Win32 app (do not edit existing)
   - Upload new `.intunewin` package
   - Configure install/detection same as before
   - In **Supersedence** tab, select previous version
   - Assign to same device group

7. **Stop old version** (choose one):
   - **Option A:** Let supersedence handle it automatically (recommended)
   - **Option B:** Manually remove assignments from old Win32 app
   - **Option C:** Delete old Win32 app after all devices updated

**Why This Process?**

The Proactive Remediation reads `C:\ProgramData\ConfigurationBlender\Config.json` from the device. Editing Config.json in your repository does NOT affect deployed devices until the Win32 app copies the new version to each device.

**Common Mistakes:**

❌ Editing Config.json locally and expecting devices to pick it up
❌ Not bumping the version number
❌ Not updating `Packaging/Detect.ps1` (old version shows as still installed)
❌ Editing the existing Win32 app instead of creating new one
❌ Forgetting to stop/supersede old version (devices may reinstall old config)

### Registry Tracking

Configuration Blender tracks deployment state in the registry:

- `HKLM:\SOFTWARE\ConfigurationBlender\[ROLE]\InstalledVersion` - Current config version on device
- `HKLM:\SOFTWARE\ConfigurationBlender\[ROLE]\InstalledDate` - When Win32 app deployed
- `HKLM:\SOFTWARE\ConfigurationBlender\[ROLE]\LastRemediationTime` - Last PR execution timestamp
- `HKLM:\SOFTWARE\ConfigurationBlender\[ROLE]\ConfigurationPath` - Path to Config.json

The `Packaging/Detect.ps1` script checks `InstalledVersion` against `$ExpectedVersion` to determine if the Win32 app needs to run.

## Key Implementation Details

### Asset Path Resolution

In Config.json, asset references use `sourceAssetPath` property (e.g., `"Icons"` - relative to the Assets folder, do NOT include "Assets\\" prefix). During remediation:

1. `Packaging/Install.ps1` copies assets to `C:\ProgramData\ConfigurationBlender\Assets\`
2. `ProactiveRemediation/Remediate.ps1` resolves paths: `Join-Path $AssetBasePath $Properties.sourceAssetPath`
3. Files are copied from `C:\ProgramData\ConfigurationBlender\Assets\[sourceAssetPath]\` to their final destination

### FilesExist Check Modes

The `FilesExist` check supports two modes for different deployment scenarios:

**MultipleFiles Mode (default):**
Deploy multiple files from an asset folder to a destination folder.
```json
{
  "type": "FilesExist",
  "properties": {
    "mode": "MultipleFiles",
    "destinationPath": "C:\\Walmart Applications\\Desktop Icons",
    "files": ["icon1.ico", "icon2.ico", "icon3.ico"],
    "sourceAssetPath": "Icons"
  }
}
```

**SingleFile Mode:**
Deploy a single file to an exact destination path (e.g., scripts, config files).
```json
{
  "type": "FilesExist",
  "properties": {
    "mode": "SingleFile",
    "destinationPath": "C:\\Scripts\\MyScript.ps1",
    "sourceAssetPath": "Scripts\\MyScript.ps1"
  }
}
```

**Note:** The old `FileContent` check type has been merged into `FilesExist` with `mode: "SingleFile"`. Existing configs using `FileContent` will continue to work for backward compatibility.

### FolderExists Check

The `FolderExists` check ensures a folder exists and optionally contains a minimum number of files:

**Folder exists only:**
```json
{
  "type": "FolderExists",
  "properties": {
    "path": "C:\\ProgramData\\MyApp",
    "minimumFileCount": 0
  }
}
```

**Folder with minimum files:**
```json
{
  "type": "FolderExists",
  "properties": {
    "path": "C:\\ProgramData\\Microsoft\\User Account Pictures",
    "minimumFileCount": 1,
    "sourceAssetPath": "AccountPictures"
  }
}
```

**Note:** The old `FolderHasFiles` check type has been renamed to `FolderExists`. Existing configs using `FolderHasFiles` will continue to work for backward compatibility.

### Driver Version Enforcement

The `DriverInstalled` check type supports automatic driver version enforcement:

**Configuration:**
```json
{
  "type": "DriverInstalled",
  "properties": {
    "driverName": "Intel Graphics Driver",
    "sourceAssetPath": "Drivers\\igfx_win11.inf",
    "minimumVersion": "30.0.101.1960",
    "driverClass": "Display"
  }
}
```

**Behavior:**
- **Driver missing:** Installs driver from `sourceAssetPath` using `pnputil /add-driver /install`
- **Driver exists, version too old:** Removes old driver with `pnputil /delete-driver /uninstall /force`, then installs new version
- **Driver exists, version correct:** Passes, no action taken
- **No `minimumVersion` specified:** Only checks if driver exists (backward compatible)

**Version Comparison:**
- Uses PowerShell's `[version]` type for comparison
- Supports formats: `"3.0"`, `"30.0.101.1960"`, `"1.2.3.4"`
- Handles version parsing errors gracefully (assumes update needed if comparison fails)

**Driver Files:**
- Place `.inf` files in `Configurations/[ROLE]/Assets/Drivers/`
- Can organize with subfolders: `Assets/Drivers/Printers/`, `Assets/Drivers/Graphics/`
- Each check references its own specific `.inf` file via `sourceAssetPath`

### Printer Configuration Validation

The `PrinterInstalled` check type enforces comprehensive printer configuration to prevent configuration drift. It validates **all** printer properties and automatically remediates misconfigurations.

**Configuration:**
```json
{
  "type": "PrinterInstalled",
  "properties": {
    "printerName": "Zebra Label Printer",
    "driverName": "ZDesigner ZT230-203dpi ZPL",
    "printerIP": "10.0.50.15",
    "portName": "IP_10.0.50.15",
    "portType": "TCP",
    "lprQueue": "print",
    "setAsDefault": false
  }
}
```

**Validation Checks:**

The detection engine validates:
1. **Printer exists** - Printer with specified name is installed
2. **Driver match** - Printer uses the exact driver specified in `driverName`
3. **Port assignment** - Printer is assigned to the exact port in `portName`
4. **Port type** - Port is configured as TCP or LPR as specified in `portType`
5. **IP/hostname** - Port points to the correct address in `printerIP`
6. **LPR queue** - (LPR only) Port uses the correct queue name in `lprQueue`

If **ANY** property doesn't match, the check fails with a detailed error message.

**Remediation Behavior:**

When the printer exists but has incorrect configuration:
1. **Stop Print Spooler** - Gracefully stops service (10s timeout), force-kills if hung
2. **Clear print jobs** - Deletes all `.spl` and `.shd` files from `C:\Windows\System32\spool\PRINTERS\`
3. **Remove printer** - Deletes the misconfigured printer object
4. **Remove/recreate port** - If port configuration is wrong (IP, type, or LPR queue), removes and recreates port
5. **Create printer** - Adds printer with correct driver and port assignment
6. **Start Print Spooler** - Restarts the spooler service
7. **Set default** - (Optional) Sets as default printer if `setAsDefault: true`

**Port Types:**
- **TCP** (default) - Standard TCP/IP port using raw printing (port 9100)
  - Uses `Add-PrinterPort -PrinterHostAddress`
  - Best for most network printers
- **LPR** - Line Printer Remote protocol
  - Uses `Add-PrinterPort -LprHostAddress -LprQueue`
  - Requires `lprQueue` property
  - Used for Unix/Linux print servers

**Example Configurations:**

*TCP Printer:*
```json
{
  "printerName": "HP LaserJet 4050",
  "driverName": "HP LaserJet 4050 Series PCL6",
  "printerIP": "10.0.10.50",
  "portName": "IP_10.0.10.50",
  "portType": "TCP"
}
```

*LPR Printer:*
```json
{
  "printerName": "Unix Print Server",
  "driverName": "Generic Text Only",
  "printerIP": "192.168.1.100",
  "portName": "LPR_192.168.1.100",
  "portType": "LPR",
  "lprQueue": "lp0"
}
```

**Important Notes:**
- Printer drivers must be pre-installed on the system (use `DriverInstalled` check to deploy drivers first)
- The remediation process requires stopping the Print Spooler, so active print jobs will be lost
- `portType` defaults to "TCP" if not specified (backward compatible)
- `lprQueue` is required when `portType` is "LPR"

### Assigned Access Kiosk Configuration

The `AssignedAccess` check type generates Windows 10/11 kiosk XML configuration using the WMI/CIM `MDM_AssignedAccess` class. The XML format is specific and includes:
- Profile ID (GUID)
- Allowed applications (full paths)
- Start menu pins (shortcut paths)
- File Explorer namespace restrictions
- Taskbar visibility

**Important:** The `AssignedAccess` check requires SYSTEM privileges to access the `MDM_AssignedAccess` WMI class in the `root\cimv2\mdm\dmmap` namespace. When running locally as a regular user (even with admin rights), the check will be skipped with a clear message. In production, Intune Proactive Remediation always runs as SYSTEM, so this is handled automatically.

### Path Expansion in FolderEmpty

The `FolderEmpty` check supports environment variable expansion:
```json
"paths": ["$env:PUBLIC\\Desktop", "$env:USERPROFILE\\Desktop"]
```

PowerShell's `$ExecutionContext.InvokeCommand.ExpandString()` resolves these at runtime.

### Certificate Installation and Validation

The `CertificateInstalled` check type ensures certificates are properly installed and monitors expiration dates.

**Configuration:**
```json
{
  "type": "CertificateInstalled",
  "properties": {
    "storeLocation": "LocalMachine",
    "storeName": "Root",
    "thumbprint": "1A2B3C4D5E6F7890...",
    "minimumDaysValid": 30,
    "sourceAssetPath": "Certificates\\EnterpriseRootCA.cer"
  }
}
```

**Store Locations:**
- `LocalMachine` - System-wide certificates (default)
- `CurrentUser` - User-specific certificates

**Store Names:**
- `My` - Personal certificates
- `Root` - Trusted Root Certification Authorities
- `CA` - Intermediate Certification Authorities
- `TrustedPublisher` - Trusted Publishers
- `TrustedPeople` - Trusted People

**Certificate Identification:**
- `thumbprint` - Preferred method, exact SHA1 hash match
- `subject` - Alternative, partial match on certificate subject (e.g., `CN=MyCert` or `*.example.com`)

**Expiration Monitoring:**
- `minimumDaysValid` - Check fails if certificate expires within this many days
- Useful for proactive certificate renewal alerts

**Remediation:**
- Supports `.cer`, `.crt` (public key only) and `.pfx`, `.p12` (with private key)
- PFX files require `pfxPassword` property
- **Security Warning:** PFX passwords are stored in plain text in Config.json

### Network Adapter Configuration

The `NetworkAdapterConfiguration` check type configures network adapters with static IP addresses and settings. This is particularly useful for dual-NIC scenarios where one adapter needs static configuration to prevent DNS resolution issues.

**Configuration:**
```json
{
  "type": "NetworkAdapterConfiguration",
  "properties": {
    "adapterName": "Ethernet 2",
    "staticIPAddress": "192.168.100.50",
    "subnetPrefixLength": 24,
    "defaultGateway": "192.168.100.1",
    "dnsServers": ["10.0.0.10", "10.0.0.11"],
    "networkCategory": "Private",
    "interfaceMetric": 10,
    "ensureEnabled": true
  }
}
```

**Adapter Identification (choose one):**
- `adapterName` - Exact name as shown in Network Connections (e.g., "Ethernet 2")
- `adapterDescription` - Partial match on hardware description (e.g., "Intel(R) I211")
- `macAddress` - Physical address (supports formats: `00:1A:2B:3C:4D:5E` or `00-1A-2B-3C-4D-5E`)

**IP Configuration:**
- `staticIPAddress` - IPv4 address (disables DHCP)
- `subnetPrefixLength` - CIDR notation (24 = 255.255.255.0)
- `defaultGateway` - Default gateway IP
- `dnsServers` - Array of DNS server IPs

**Network Profile:**
- `networkCategory` - `Private` (enables discovery) or `Public` (more secure)
- `interfaceMetric` - Lower values = higher priority for routing decisions

**Use Case: Dual-NIC with Public/Private Networks:**
```json
{
  "id": "private-network-static-ip",
  "name": "Configure Private Network Adapter",
  "type": "NetworkAdapterConfiguration",
  "enabled": true,
  "properties": {
    "adapterDescription": "Realtek PCIe GBE",
    "staticIPAddress": "10.10.10.50",
    "subnetPrefixLength": 24,
    "dnsServers": ["10.10.10.1"],
    "networkCategory": "Private",
    "interfaceMetric": 5,
    "ensureEnabled": true
  }
}
```

This configuration ensures the private network adapter:
1. Uses a static IP instead of DHCP
2. Has lower metric (higher priority) for internal DNS resolution
3. Is marked as Private for network discovery
4. Remains enabled

## Security Considerations

- All scripts run as SYSTEM when deployed via Intune (required for `AssignedAccess` check and system-level changes)
- Never store credentials in Config.json
- Logs may contain system paths - protect log directory
- Win32 packages should be code-signed per organizational policy
- Local testing with PsExec required for full compliance verification (especially `AssignedAccess` check)

## Troubleshooting Guide

**Win32 app not detecting as installed:**
- Check `HKLM:\SOFTWARE\ConfigurationBlender\[ROLE]\InstalledVersion`
- Verify version in registry matches `$ExpectedVersion` in `Packaging/Detect.ps1`
- Ensure Config.json exists at `C:\ProgramData\ConfigurationBlender\Config.json`

**Proactive Remediation failing:**
- Check logs in `C:\ProgramData\ConfigurationBlender\Logs\`
- Verify Win32 app deployed successfully first (PR requires Config.json)
- Run ProactiveRemediation scripts manually as admin for detailed error output
- Check that Assets folder exists and contains required files

**AssignedAccess check showing as failed during local testing:**
- This is expected when running as a regular user account
- The check requires SYSTEM privileges to access `MDM_AssignedAccess` WMI class
- Error message will state: "CHECK SKIPPED - Must run as SYSTEM user..."
- Use PsExec to run as SYSTEM for accurate results (see Testing section above)
- In production, Intune runs as SYSTEM automatically

**Specific check failing:**
- Review detection/remediation logs for specific error messages
- Verify asset files exist if check references `sourceAssetPath`
- For registry checks, ensure paths use correct format (`HKLM:\` prefix)
- For shortcuts, verify target executable paths are correct
- Detection script provides detailed output showing which checks passed/failed with specific error messages
