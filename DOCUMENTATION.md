# Configuration Blender - Technical Documentation

> Comprehensive technical documentation for engineers implementing and extending Configuration Blender.

---

## Table of Contents

| Section | Topics |
|---------|--------|
| [Overview](#overview) | Purpose, Architecture, Workflow |
| [Repository Structure](#repository-structure) | File Organization, Key Directories |
| [Configuration Files](#configuration-files) | Config.json Schema, Check Structure |
| [Check Types Reference](#check-types-reference) | All 17 Check Types with Detection/Remediation |
| [Engine Scripts](#engine-scripts) | Detect.ps1, Remediate.ps1, Execution Flow |
| [Deployment Pipeline](#deployment-pipeline) | Packaging, Intune Win32 Apps, Proactive Remediation |
| [Configuration Builder](#configuration-builder) | WebUI Features, Validation |
| [Tools Reference](#tools-reference) | New-IntunePackage.ps1, New-ConfigurationRole.ps1 |
| [Testing](#testing) | Local Testing, SYSTEM Context |
| [Extending](#extending-configuration-blender) | Adding New Check Types |
| [Troubleshooting](#troubleshooting) | Common Issues, Log Analysis |

---

## Overview

### Purpose

Configuration Blender is a configuration-as-code framework for managing Windows endpoint configurations at scale. It enables:

- **Declarative Configuration**: Define desired system state in JSON
- **Automatic Drift Detection**: Scheduled checks identify non-compliant systems
- **Self-Healing**: Automatic remediation restores compliant state
- **Role-Based Management**: Different configurations per device role (kiosk, workstation, etc.)

### Architecture

```
Repository                           Endpoint
+---------------------------+        +---------------------------+
| Configurations/ROLE/      |        | C:\ProgramData\           |
|   Config.json             |  --->  |   ConfigurationBlender\   |
|   Assets/                 |        |     Config.json           |
+---------------------------+        |     Assets\               |
                                     |     Logs\                 |
Tools/New-IntunePackage.ps1          +---------------------------+
           |                                    |
           v                                    v
+---------------------------+        +---------------------------+
| Output/                   |        | Intune Proactive          |
|   ROLE_vX.Y.Z.intunewin   |  --->  |   Remediation             |
+---------------------------+        |     Detect.ps1            |
                                     |     Remediate.ps1         |
                                     +---------------------------+
```

### High-Level Workflow

1. **Create**: Build configuration using WebUI Builder or edit Config.json directly
2. **Package**: Run `New-IntunePackage.ps1` to create `.intunewin` file
3. **Deploy**: Upload Win32 app to Intune, assign to device groups
4. **Enforce**: Proactive Remediation runs detection/remediation on schedule

---

## Repository Structure

```
ConfigurationBlender/
├── Builder/                    # WebUI Configuration Builder
│   ├── ConfigurationBlender.html
│   ├── css/styles.css
│   └── js/
│       ├── app.js              # Main application logic
│       ├── checkTypes.js       # Check type form definitions
│       ├── validation.js       # Configuration validation
│       ├── export.js           # JSON export functionality
│       └── accessibility.js    # A11y features
│
├── Configurations/             # Role configurations (one folder per role)
│   └── US_CBL/                 # Example: US Computer Based Learning
│       ├── Config.json         # Configuration definition
│       └── Assets/             # Supporting files
│           ├── Icons/          # Icon files for shortcuts
│           ├── Scripts/        # PowerShell scripts to deploy
│           ├── Drivers/        # Driver packages (INF files)
│           └── XML/            # XML config files (AssignedAccess, etc.)
│
├── ProactiveRemediation/       # Intune Proactive Remediation scripts
│   ├── Detect.ps1              # Detection engine
│   └── Remediate.ps1           # Remediation engine
│
├── Packaging/                  # Win32 app packaging templates
│   ├── Install.ps1             # Installer (copies files, sets registry)
│   └── Detect.ps1              # Version detection (template with placeholders)
│
├── Tools/                      # Utility scripts
│   ├── New-IntunePackage.ps1   # Creates .intunewin packages
│   ├── New-ConfigurationRole.ps1  # Creates new role folder structure
│   ├── Debug-AssignedAccess.ps1   # Troubleshooting helper
│   └── IntuneWinAppUtil.exe    # Microsoft packaging tool (gitignored)
│
├── Output/                     # Generated packages (gitignored)
├── DOCUMENTATION.md            # This file
└── README.md                   # Executive overview
```

### Endpoint File Locations

When deployed, files are stored at:

| Purpose | Path |
|---------|------|
| Base directory | `C:\ProgramData\ConfigurationBlender\` |
| Configuration | `C:\ProgramData\ConfigurationBlender\Config.json` |
| Assets | `C:\ProgramData\ConfigurationBlender\Assets\` |
| Logs | `C:\ProgramData\ConfigurationBlender\Logs\` |

### Registry Keys

| Key | Purpose |
|-----|---------|
| `HKLM:\SOFTWARE\ConfigurationBlender\[ROLE]\InstalledVersion` | Deployed config version |
| `HKLM:\SOFTWARE\ConfigurationBlender\[ROLE]\InstalledDate` | Deployment timestamp |
| `HKLM:\SOFTWARE\ConfigurationBlender\[ROLE]\LastRemediationTime` | Last remediation run |

---

## Configuration Files

### Config.json Schema

```json
{
  "version": "1.0.0",
  "role": "US_CBL",
  "description": "US Computer Based Learning kiosk configuration",
  "author": "John Smith",
  "lastModified": "2025-12-04",
  "checks": []
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `version` | Yes | Semantic version (X.Y.Z) - bump on each change |
| `role` | Yes | Role identifier, must match folder name |
| `description` | No | Human-readable description |
| `author` | No | Configuration author |
| `lastModified` | No | Last modification date (YYYY-MM-DD) |
| `checks` | Yes | Array of check objects |

### Check Structure

Each check in the `checks` array follows this structure:

```json
{
  "id": "1",
  "name": "Human-readable name",
  "type": "CheckType",
  "enabled": true,
  "properties": {
    // Type-specific properties
  }
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier within this config |
| `name` | Yes | Human-readable name (shown in logs) |
| `type` | Yes | Check type (see Check Types Reference) |
| `enabled` | Yes | Set `false` to skip this check |
| `properties` | Yes | Type-specific configuration properties |

---

## Check Types Reference

Configuration Blender supports 17 check types. Each section below documents the properties, detection logic, and remediation behavior.

### Application

Manages application installation state. Can ensure an application is installed or removed.

**Properties:**
```json
{
  "applicationName": "Google Chrome",
  "ensureInstalled": false,
  "searchPaths": [
    "C:\\Program Files*\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Users\\*\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"
  ],
  "uninstallPaths": [
    "C:\\Program Files*\\Google\\Chrome\\Application\\*\\Installer\\setup.exe"
  ],
  "uninstallArguments": "--uninstall --force-uninstall",
  "installCommand": "winget install Google.Chrome",
  "minimumVersion": "120.0.0.0"
}
```

**Detection:**
1. Search for files matching `searchPaths` using wildcard expansion
2. If `ensureInstalled: true` - FAIL if not found
3. If `ensureInstalled: false` - FAIL if found
4. If `minimumVersion` specified, compare file version

**Remediation:**
- If should be installed: Execute `installCommand`
- If should not be installed: Run uninstaller from `uninstallPaths` with `uninstallArguments`

---

### FilesExist

Deploys files from assets to destination. Supports single file or multiple files mode.

**Properties (MultipleFiles mode):**
```json
{
  "mode": "MultipleFiles",
  "destinationPath": "C:\\Company\\Icons",
  "files": ["app1.ico", "app2.ico", "app3.ico"],
  "sourceAssetPath": "Icons"
}
```

**Properties (SingleFile mode):**
```json
{
  "mode": "SingleFile",
  "destinationPath": "C:\\Scripts\\MyScript.ps1",
  "sourceAssetPath": "Scripts\\MyScript.ps1"
}
```

**Detection:**
1. MultipleFiles: Check if all files in `files` array exist in `destinationPath`
2. SingleFile: Check if file exists at exact `destinationPath`
3. FAIL if any files are missing

**Remediation:**
1. Create destination directory if needed
2. Copy missing files from `Assets\[sourceAssetPath]`

---

### FolderExists

Ensures a folder exists with optional minimum file count.

**Properties:**
```json
{
  "path": "C:\\ProgramData\\Microsoft\\User Account Pictures",
  "minimumFileCount": 1,
  "sourceAssetPath": "AccountPictures"
}
```

**Detection:**
1. Check if folder exists at `path`
2. If `minimumFileCount` > 0, count files in folder
3. FAIL if folder missing or file count below minimum

**Remediation:**
1. Create folder if missing
2. If `sourceAssetPath` specified, copy files from assets

---

### ShortcutProperties

Creates or validates Windows shortcuts (.lnk files).

**Properties:**
```json
{
  "path": "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\MyApp.lnk",
  "targetPath": "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "arguments": "--kiosk https://example.com --edge-kiosk-type=public-browsing",
  "iconLocation": "C:\\Company\\Icons\\myapp.ico",
  "description": "My Application"
}
```

**Detection:**
1. Check if shortcut file exists at `path`
2. Verify `targetPath` matches
3. Verify `arguments` match
4. FAIL if missing or properties mismatch

**Remediation:**
1. Create parent directory if needed
2. Create/update shortcut with WScript.Shell COM object

---

### ShortcutsAllowList

Removes unauthorized shortcuts from a folder. Only shortcuts in the allow list are kept.

**Properties:**
```json
{
  "path": "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
  "allowedShortcuts": [
    "GTA Time Clock.lnk",
    "OneWalmart.lnk",
    "ULearn.lnk"
  ]
}
```

**Detection:**
1. Get all .lnk files in `path`
2. Compare against `allowedShortcuts` array
3. FAIL if any shortcuts not in allow list exist

**Remediation:**
1. Delete all shortcuts not in allow list

---

### RegistryValue

Sets or validates registry values.

**Properties:**
```json
{
  "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer",
  "name": "HideRecommendedSection",
  "value": 1,
  "type": "DWord"
}
```

**Registry Types:** `String`, `DWord`, `QWord`, `Binary`, `MultiString`, `ExpandString`

**Detection:**
1. Check if registry path exists
2. Check if value exists with correct name
3. Compare value against expected
4. FAIL if path missing, value missing, or value mismatch

**Remediation:**
1. Create registry path if needed
2. Set value with specified type

---

### DriverInstalled

Installs device drivers. Special handling for printer drivers.

**Properties:**
```json
{
  "driverName": "Lexmark Universal v2 XL",
  "driverClass": "Printer",
  "sourceAssetPath": "Drivers\\Lexmark_Universal_v2_UD1_XL\\LMUD1p40.inf",
  "minimumVersion": "3.0.7.0"
}
```

**Detection (Printer drivers):**
1. `Get-PrinterDriver -Name [driverName]` - checks print subsystem
2. If `minimumVersion` specified, compare versions using:
   - DriverVersion property
   - MajorVersion.MinorVersion fallback
   - Get-WindowsDriver query against InfPath
3. FAIL if driver not registered or version too old

**Detection (Other drivers):**
1. `Get-WindowsDriver -Online` - search driver store
2. Compare version if `minimumVersion` specified
3. FAIL if driver not found

**Remediation (Printer drivers):**
1. Check if already installed via `Get-PrinterDriver` - skip if exists
2. `pnputil /add-driver [infPath] /install` - add to driver store
3. `Add-PrinterDriver -Name [driverName]` - register with print subsystem
4. `Get-PrinterDriver -Name [driverName]` - verify success (source of truth)
5. If verification fails, list available drivers in error message

**Remediation (Other drivers):**
1. `pnputil /add-driver [infPath] /install`
2. Verify with `Get-WindowsDriver`

**Important:** Driver name must exactly match what the INF installs. Check error messages for "Available drivers" list if remediation fails.

---

### PrinterInstalled

Configures network printers. Requires corresponding DriverInstalled check.

**Properties:**
```json
{
  "printerName": "Personnel",
  "driverName": "Lexmark Universal v2 XL",
  "portName": "mfpr01",
  "printerIP": "mfpr01",
  "portType": "TCP",
  "setAsDefault": true,
  "lprQueue": "lp"
}
```

**Port Types:** `TCP` (default), `LPR` (requires `lprQueue`)

**Detection:**
1. `Get-Printer -Name [printerName]` - check if printer exists
2. Validate driver name matches
3. Validate port name matches
4. `Get-PrinterPort -Name [portName]` - validate port configuration:
   - Port type (TCP vs LPR)
   - PrinterHostAddress matches `printerIP`
   - LprQueueName matches `lprQueue` (if LPR)
5. FAIL if printer missing or any config mismatch

**Remediation:**
1. Verify driver exists via `Get-PrinterDriver` - fail if missing
2. If printer exists but misconfigured:
   - Stop spooler service
   - Clear stuck print jobs from spool directory
   - Restart spooler
   - Remove misconfigured printer and port
3. `Add-PrinterPort` - create TCP or LPR port
4. `Add-Printer` - create printer with driver and port
5. Set as default if `setAsDefault: true`

**Important:** DriverInstalled check must come before PrinterInstalled in Config.json.

---

### ServiceRunning

Manages Windows service state and startup type.

**Properties:**
```json
{
  "serviceName": "Spooler",
  "startupType": "Automatic",
  "ensureRunning": true
}
```

**Startup Types:** `Automatic`, `Manual`, `Disabled`

**Detection:**
1. Get service by name
2. Check startup type matches
3. If `ensureRunning`, check Status is "Running"
4. FAIL if startup type wrong or not running

**Remediation:**
1. Set startup type
2. Start service if `ensureRunning`

---

### ScheduledTaskExists

Creates scheduled tasks.

**Properties:**
```json
{
  "taskName": "ManifestManipulator",
  "taskPath": "\\",
  "execute": "Powershell.exe",
  "arguments": "-ExecutionPolicy Bypass -File C:\\Scripts\\MyScript.ps1",
  "trigger": "AtLogOn",
  "runLevel": "Highest",
  "principal": "NT AUTHORITY\\SYSTEM"
}
```

**Triggers:** `AtLogOn`, `AtStartup`

**Detection:**
1. `Get-ScheduledTask -TaskName [taskName]`
2. FAIL if task does not exist

**Remediation:**
1. Create task action, trigger, principal, settings
2. `Register-ScheduledTask`

---

### WindowsFeature

Enables or disables Windows optional features.

**Properties:**
```json
{
  "featureName": "Microsoft-Windows-Subsystem-Linux",
  "state": "Enabled"
}
```

**States:** `Enabled`, `Disabled`

**Detection:**
1. `Get-WindowsOptionalFeature -FeatureName [featureName]`
2. Compare state
3. FAIL if state mismatch

**Remediation:**
1. `Enable-WindowsOptionalFeature` or `Disable-WindowsOptionalFeature`
2. `-NoRestart` flag used

---

### FirewallRule

Manages Windows Firewall rules.

**Properties:**
```json
{
  "ruleName": "MyApp-Inbound",
  "displayName": "My Application Inbound",
  "direction": "Inbound",
  "action": "Allow",
  "protocol": "TCP",
  "localPort": "8080",
  "remoteAddress": "Any",
  "enabled": true
}
```

**Detection:**
1. `Get-NetFirewallRule -Name [ruleName]`
2. Validate direction, action, enabled state
3. FAIL if rule missing or properties mismatch

**Remediation:**
1. Create or update rule with `New-NetFirewallRule` or `Set-NetFirewallRule`

---

### CertificateInstalled

Deploys certificates to Windows certificate stores.

**Properties:**
```json
{
  "thumbprint": "ABC123...",
  "subject": "CN=My Certificate",
  "storeLocation": "LocalMachine",
  "storeName": "My",
  "sourceAssetPath": "Certificates\\mycert.cer",
  "minimumDaysValid": 30,
  "issuer": "My CA"
}
```

**Detection:**
1. Search certificate store by thumbprint or subject
2. Check if certificate is currently valid (NotBefore < now < NotAfter)
3. If `minimumDaysValid`, check days until expiry
4. If `issuer` specified, validate issuer matches
5. FAIL if not found, expired, or about to expire

**Remediation:**
1. Determine file type from extension (.cer, .crt, .pfx, .p12)
2. `Import-Certificate` for .cer/.crt files
3. `Import-PfxCertificate` for .pfx/.p12 (requires `pfxPassword`)

---

### AssignedAccess

Configures Windows 11 multi-app kiosk mode.

**Properties (XML-based - Recommended):**
```json
{
  "configXmlPath": "XML/AssignedAccessConfig.xml"
}
```

**Properties (Legacy property-based):**
```json
{
  "profileId": "{GUID}",
  "displayName": "Kiosk Profile",
  "allowedApps": [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  ],
  "startPins": [
    "%ALLUSERSPROFILE%\\Microsoft\\Windows\\Start Menu\\Programs\\MyApp.lnk"
  ],
  "showTaskbar": true,
  "allowedNamespaces": ["Downloads"]
}
```

**Detection (XML-based):**
1. Check running as SYSTEM (required)
2. Parse expected XML to extract Profile ID
3. Verify kioskUser0 exists and is enabled
4. Verify AutoLogon configured for kioskUser0
5. Check AssignedAccessConfiguration registry:
   - Profile exists at `HKLM:\SOFTWARE\Microsoft\Windows\AssignedAccessConfiguration\Profiles\{ProfileId}`
   - Kiosk user SID mapped to profile in Configs
   - Taskbar setting matches
6. FAIL if any check fails

**Remediation:**
1. Verify running as SYSTEM
2. Get MDM_AssignedAccess CIM instance
3. Read XML from assets (or generate from legacy properties)
4. HTML-encode and set Configuration property
5. Apply via `Set-CimInstance`

**Important:** Must run as NT AUTHORITY\SYSTEM. When testing locally, use PsExec.

---

### NetworkAdapterConfiguration

Configures network adapter settings. Supports DHCP-to-static conversion.

**Properties (Subnet-based identification):**
```json
{
  "identifyByCurrentSubnet": "192.168.0.0/24",
  "excludeSubnets": ["10.0.0.0/8", "172.16.0.0/12"],
  "staticIPAddress": "192.168.0.100",
  "subnetPrefixLength": 24,
  "defaultGateway": "",
  "dnsServers": [],
  "registerInDns": false,
  "interfaceMetric": 9999,
  "networkCategory": "Private"
}
```

**Properties (IP Range mode for multi-device scenarios):**
```json
{
  "staticIPRange": "192.168.20.1-192.168.20.20",
  "subnetPrefixLength": 24,
  "defaultGateway": "",
  "dnsServers": [],
  "interfaceMetric": 9999
}
```

**Properties (Traditional identification):**
```json
{
  "adapterName": "Ethernet 2",
  "staticIPAddress": "192.168.1.50",
  "subnetPrefixLength": 24,
  "defaultGateway": "192.168.1.1",
  "dnsServers": ["8.8.8.8", "8.8.4.4"]
}
```

**Detection (Subnet-based):**
1. Find wired (802.3) adapter with IP in `identifyByCurrentSubnet`
2. Skip adapters in `excludeSubnets`
3. Skip adapters with gateway outside target subnet (corporate protection)
4. Check static IP, prefix, gateway, DNS, metric, category
5. FAIL if any mismatch

**Detection (IP Range mode):**
1. Requires 2+ active wired adapters (otherwise PASS - doesn't apply)
2. Check if any adapter has DHCP IP in the range
3. FAIL if DHCP adapter found in range (needs static)

**Remediation (Single IP):**
1. Remove existing IP configuration
2. Set static IP with New-NetIPAddress
3. Configure DNS, metric, network category

**Remediation (IP Range):**
1. Find adapter with DHCP IP in range
2. Ping sweep to find available IP in range
3. Assign first available IP as static
4. Apply additional settings

**Safeguards:**
- Only wired (802.3) adapters considered
- Virtual adapters ignored
- Excluded subnets never touched
- Gateway-based protection for corporate NICs

---

### EdgeFavorites

Manages Edge browser favorites bar for all user profiles. Enforces exact desired state.

**Properties:**
```json
{
  "sourceAssetPath": "Favorites/US_CBL_Favorites.html"
}
```

**Source File Format:** Netscape Bookmark HTML (same format Edge uses for export/import):
```html
<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><A HREF="https://example.com">Example Site</A>
    <DT><A HREF="https://another.com">Another Site</A>
</DL><p>
```

**Detection:**
1. Parse HTML file to extract all `<A HREF="url">name</A>` entries
2. Sort expected favorites alphabetically by name
3. For each user profile, read Edge's `Bookmarks` JSON file
4. Compare `bookmark_bar.children` against expected:
   - Count mismatch → FAIL
   - Name mismatch → FAIL
   - URL mismatch → FAIL
   - Extra favorites not in source → FAIL
5. All match → PASS

**Remediation:**
1. Kill Edge processes (`Stop-Process -Name msedge`)
2. Parse HTML, sort favorites alphabetically by name
3. For each user profile + Default profile:
   - Read or create Edge `Bookmarks` JSON
   - Replace `bookmark_bar.children` with expected favorites
   - Write updated JSON
4. Default profile ensures new users inherit favorites

**Important:** Favorites appear flat on the bar (no folders), sorted alphabetically. Any user-added favorites not in the source file will be removed.

---

## Engine Scripts

### Detect.ps1 (ProactiveRemediation)

The detection engine runs on schedule via Intune Proactive Remediation.

**Location:** `ProactiveRemediation/Detect.ps1`

**Flow:**
```
Start
  |
  v
Load C:\ProgramData\ConfigurationBlender\Config.json
  |
  v
For each enabled check:
  |
  +---> Call Test-[CheckType] function
  |        |
  |        v
  |     Returns { Passed: bool, Issue: string }
  |        |
  +--------+
  |
  v
Any failures?
  |
  +---> No  --> Exit 0 (Compliant)
  |
  +---> Yes --> Exit 1 (Non-Compliant, triggers Remediate.ps1)
```

**Exit Codes:**
- `0` - Compliant (all checks passed)
- `1` - Non-compliant (one or more checks failed)

**Logging:** Writes `Detection_YYYYMMDD_HHMMSS.json` to Logs folder.

---

### Remediate.ps1 (ProactiveRemediation)

The remediation engine runs only when Detect.ps1 exits with code 1.

**Location:** `ProactiveRemediation/Remediate.ps1`

**Flow:**
```
Start
  |
  v
Load C:\ProgramData\ConfigurationBlender\Config.json
  |
  v
For each enabled check:
  |
  +---> Call Repair-[CheckType] function
  |        |
  |        v
  |     Returns { Success: bool, Action: string }
  |        |
  +--------+
  |
  v
Log actions and exit
```

**Exit Codes:**
- `0` - All remediations successful
- `1` - One or more remediations failed

**Logging:** Writes `Remediation_YYYYMMDD_HHMMSS.json` to Logs folder.

---

### Execution Context

Both scripts run as `NT AUTHORITY\SYSTEM`:

| Item | SYSTEM Behavior | Recommendation |
|------|-----------------|----------------|
| `HKCU:\` registry | Modifies SYSTEM's hive | Use `HKLM:\` |
| `$env:USERPROFILE` | `C:\Windows\System32\config\systemprofile` | Use explicit paths |
| `$env:TEMP` | `C:\Windows\Temp` | Be aware for temp operations |
| User desktops | Accessible via full path | Enumerate user profiles |

---

## Deployment Pipeline

### Step 1: Create Role Configuration

```powershell
# Create new role folder structure
.\Tools\New-ConfigurationRole.ps1 -Role "US_MPC"

# Creates:
# Configurations/US_MPC/
# Configurations/US_MPC/Assets/
```

Use the WebUI Builder or edit Config.json directly.

### Step 2: Add Assets

Place supporting files in `Assets/` subdirectories:
- `Assets/Icons/` - Icon files for shortcuts
- `Assets/Scripts/` - PowerShell scripts
- `Assets/Drivers/` - Driver packages
- `Assets/XML/` - XML configuration files

**Note:** `Configurations/*` is gitignored (folder structure preserved via `.gitkeep`). Distribute role configs and assets via secure file share or artifact storage.

### Step 3: Package for Intune

```powershell
# Interactive mode - shows menu of roles
.\Tools\New-IntunePackage.ps1

# Direct mode - package specific role
.\Tools\New-IntunePackage.ps1 -Role "US_CBL"

# Preview mode
.\Tools\New-IntunePackage.ps1 -Role "US_CBL" -WhatIf
```

**Output:** `Output/US_CBL_v1.0.0.intunewin`

### Step 4: Deploy Win32 App

Upload to Intune with these settings:

| Setting | Value |
|---------|-------|
| Install command | `powershell.exe -ExecutionPolicy Bypass -File Install.ps1` |
| Uninstall command | `cmd.exe /c echo No uninstall` |
| Detection | Custom script (use generated `Detect.ps1`) |
| Install behavior | System |
| Architecture | 64-bit |
| Minimum OS | Windows 10 1607 |

### Step 5: Configure Proactive Remediation

Create Proactive Remediation policy using scripts from `ProactiveRemediation/`:

1. Upload `Detect.ps1` as detection script
2. Upload `Remediate.ps1` as remediation script
3. Run as: SYSTEM
4. Schedule: Hourly or as needed
5. Assign to same device groups as Win32 app

### Step 6: Update Configurations

1. Edit Config.json
2. Bump version number
3. Run `New-IntunePackage.ps1`
4. Upload new Win32 app to Intune
5. Configure supersedence (new replaces old)

**Version Bump Guidelines:**
- **Major** (1.0.0 → 2.0.0): Breaking changes, new check types
- **Minor** (1.0.0 → 1.1.0): New checks or features
- **Patch** (1.0.0 → 1.0.1): Bug fixes, property changes

---

## Configuration Builder

Open `Builder/ConfigurationBlender.html` in any modern browser.

### Features

| Feature | Description |
|---------|-------------|
| Visual Check Editor | Add/edit checks without writing JSON |
| Real-time JSON Preview | See generated Config.json as you build |
| Dependency Validation | Warns when checks require prerequisites |
| Import/Export | Load existing configs or export new ones |
| Dark Mode | Toggle between light and dark themes |
| Example Templates | Pre-built configurations for common scenarios |
| Keyboard Shortcuts | Ctrl+O (Import), Ctrl+S (Export), Ctrl+N (Add Check) |

### Dependency Validation

The builder warns about missing dependencies:

| Check Type | Required Dependency |
|------------|---------------------|
| `PrinterInstalled` | `DriverInstalled` with matching driver name |
| `ShortcutExists` (with custom icon) | `FilesExist` deploying the icon file |
| `AssignedAccess` | `ShortcutExists` for each pinned shortcut |

---

## Tools Reference

### New-IntunePackage.ps1

Creates `.intunewin` packages for Intune deployment.

```powershell
# Interactive mode
.\Tools\New-IntunePackage.ps1

# Package specific role
.\Tools\New-IntunePackage.ps1 -Role "US_CBL"

# Custom output directory
.\Tools\New-IntunePackage.ps1 -Role "US_CBL" -OutputPath "C:\Packages"

# Preview only
.\Tools\New-IntunePackage.ps1 -Role "US_CBL" -WhatIf
```

**What it does:**
1. Validates `Config.json` exists and is valid
2. Copies `Packaging/Install.ps1` to role folder
3. Generates `Detect.ps1` with role/version placeholders replaced
4. Runs `IntuneWinAppUtil.exe` to create package
5. Renames output to `ROLE_vX.Y.Z.intunewin`

**Prerequisite:** Download `IntuneWinAppUtil.exe` to `Tools/`:
```powershell
Invoke-WebRequest -Uri "https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool/releases/latest/download/IntuneWinAppUtil.exe" -OutFile ".\Tools\IntuneWinAppUtil.exe"
```

### New-ConfigurationRole.ps1

Creates new role folder structure.

```powershell
.\Tools\New-ConfigurationRole.ps1 -Role "US_MPC"
```

Creates:
```
Configurations/US_MPC/
Configurations/US_MPC/Assets/
```

---

## Testing

### Local Testing

```powershell
# 1. Deploy config to test location
New-Item -ItemType Directory -Path "C:\ProgramData\ConfigurationBlender" -Force
Copy-Item "Configurations\US_CBL\Config.json" "C:\ProgramData\ConfigurationBlender\" -Force
Copy-Item "Configurations\US_CBL\Assets" "C:\ProgramData\ConfigurationBlender\" -Recurse -Force

# 2. Run detection (as Admin)
.\ProactiveRemediation\Detect.ps1

# 3. Run remediation if needed
.\ProactiveRemediation\Remediate.ps1

# 4. Check logs
Get-ChildItem "C:\ProgramData\ConfigurationBlender\Logs" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 5
```

### Testing as SYSTEM

Some checks (e.g., `AssignedAccess`) require SYSTEM privileges:

```powershell
# Download PsExec from https://docs.microsoft.com/en-us/sysinternals/downloads/psexec

# Run detection as SYSTEM
psexec -i -s powershell.exe -ExecutionPolicy Bypass -File "C:\Path\To\Detect.ps1"

# Run remediation as SYSTEM
psexec -i -s powershell.exe -ExecutionPolicy Bypass -File "C:\Path\To\Remediate.ps1"
```

### Log Analysis

```powershell
# Get latest detection log
$log = Get-Content (
    Get-ChildItem "C:\ProgramData\ConfigurationBlender\Logs\Detection_*.json" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
).FullName | ConvertFrom-Json

# Show failed checks
$log.Checks | Where-Object { -not $_.Passed } | Format-Table Name, Type, Issue

# Show compliance status
Write-Host "Compliant: $($log.Compliant)" -ForegroundColor $(if ($log.Compliant) { 'Green' } else { 'Red' })
```

---

## Extending Configuration Blender

### Adding New Check Types

**Step 1: Add UI Form** (`Builder/js/checkTypes.js`)

```javascript
case 'MyNewCheck':
    return `
        <div class="form-group">
            <label for="myProperty">My Property</label>
            <input type="text" id="myProperty" required>
        </div>
    `;
```

**Step 2: Add Detection Function** (`ProactiveRemediation/Detect.ps1`)

```powershell
function Test-MyNewCheck {
    param($Properties)

    # Check condition
    if ($conditionMet) {
        return @{
            Passed = $true
            Issue = $null
        }
    } else {
        return @{
            Passed = $false
            Issue = "Description of what failed"
        }
    }
}
```

**Step 3: Add Remediation Function** (`ProactiveRemediation/Remediate.ps1`)

```powershell
function Repair-MyNewCheck {
    param($Properties, $CheckName)

    try {
        # Fix the issue
        return @{
            Success = $true
            Action = "Description of what was done"
        }
    } catch {
        return @{
            Success = $false
            Action = "Failed: $($_.Exception.Message)"
        }
    }
}
```

**Step 4: Add to Switch Statements**

In both `Detect.ps1` and `Remediate.ps1`, add the new case:

```powershell
# In Detect.ps1
"MyNewCheck" { Test-MyNewCheck -Properties $check.properties }

# In Remediate.ps1
"MyNewCheck" { Repair-MyNewCheck -Properties $check.properties -CheckName $check.name }
```

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Configuration file not found" | Wrong path or filename | Must be exactly `C:\ProgramData\ConfigurationBlender\Config.json` |
| Registry changes not applying | Using `HKCU:\` | Use `HKLM:\` for system-wide settings |
| AssignedAccess check skipped | Not running as SYSTEM | Test with PsExec or deploy via Intune |
| Printer driver not found after install | Driver name mismatch | Check "Available drivers" in error message |
| Printer not installing | Driver not registered | Add `DriverInstalled` check before `PrinterInstalled` |
| Shortcut icon missing | Icon not deployed | Add `FilesExist` check for icon before shortcut check |
| NetworkAdapter check not applying | Device has 1 NIC | IP range mode requires 2+ wired adapters |

### Log File Structure

**Detection Log:**
```json
{
  "Timestamp": "2025-12-04T14:30:00",
  "EngineVersion": "1.0.0",
  "ConfigVersion": "1.0.0",
  "Role": "US_CBL",
  "Compliant": false,
  "Checks": [
    {
      "Id": "1",
      "Name": "Check Name",
      "Type": "CheckType",
      "Passed": true,
      "Issue": null
    }
  ],
  "Issues": [
    "Failed Check Name: Error description"
  ]
}
```

**Remediation Log:**
```json
{
  "Timestamp": "2025-12-04T14:30:05",
  "EngineVersion": "1.0.0",
  "ConfigVersion": "1.0.0",
  "Role": "US_CBL",
  "Actions": [
    {
      "CheckId": "1",
      "CheckName": "Check Name",
      "Action": "What was done",
      "Success": true
    }
  ],
  "Summary": {
    "Successful": 5,
    "Failed": 0,
    "Skipped": 2
  }
}
```

---

*Documentation for Configuration Blender v1.0.0. For executive overview, see [README.md](README.md).*
