# Configuration Blender - Technical Documentation

> Comprehensive technical guide for engineers implementing and extending Configuration Blender.

---

## Table of Contents

| Section | Topics |
|---------|--------|
| [Architecture Overview](#architecture-overview) | Pipeline, Components, Data Flow |
| [Installation & Setup](#installation--setup) | Prerequisites, Repository, External Tools |
| [Configuration Builder](#configuration-builder-webui) | Features, Check Types, Validation |
| [Config.json Schema](#configjson-schema) | Metadata, Check Structure, Properties |
| [Deployment Pipeline](#deployment-pipeline) | Create Role, Package, Deploy, Update |
| [Engine Scripts](#engine-scripts) | Detection, Remediation, Execution Context |
| [File Paths & Registry](#file-paths--registry) | Paths, Registry Keys, Logging |
| [Testing](#testing) | Local Testing, SYSTEM Context |
| [Extending](#extending-configuration-blender) | Adding New Check Types |
| [Troubleshooting](#troubleshooting) | Common Issues, Log Analysis |

---

## Architecture Overview

### Three-Stage Pipeline

Configuration Blender uses a three-stage pipeline to separate concerns between configuration definition, deployment, and enforcement.

```mermaid
flowchart LR
    subgraph Stage1["1. CREATE"]
        A[Role Team] --> B[WebUI Builder]
        B --> C[Config.json + Assets]
    end

    subgraph Stage2["2. DEPLOY"]
        C --> D[New-IntunePackage.ps1]
        D --> E[.intunewin Package]
        E --> F[Intune Win32 App]
        F --> G[Endpoints]
    end

    subgraph Stage3["3. ENFORCE"]
        H[Proactive Remediation] --> I{Compliant?}
        I -->|Yes| J[Exit 0]
        I -->|No| K[Remediate.ps1]
        K --> L[Self-Heal]
    end

    G --> H
```

### Component Diagram

```mermaid
graph TB
    subgraph Repository
        Builder[Builder/ConfigurationBlender.html]
        Engine[Engine/Detect.ps1 & Remediate.ps1]
        Packaging[Packaging/Install.ps1 & Detect.ps1]
        Tools[Tools/New-IntunePackage.ps1]
        Configs[Configurations/ROLE/Config.json]
    end

    subgraph Intune
        Win32[Win32 App per Role]
        PR[Proactive Remediation Policy]
    end

    subgraph Endpoint
        ConfigFile[C:\ProgramData\ConfigurationBlender\Config.json]
        Assets[C:\ProgramData\ConfigurationBlender\Assets\]
        Logs[C:\ProgramData\ConfigurationBlender\Logs\]
    end

    Builder -->|Export| Configs
    Configs --> Tools
    Tools -->|Package| Win32
    Engine --> PR
    Win32 -->|Deploy| ConfigFile
    Win32 -->|Deploy| Assets
    PR -->|Read| ConfigFile
    PR -->|Write| Logs
```

### Data Flow

```mermaid
sequenceDiagram
    participant RT as Role Team
    participant WE as Windows Engineering
    participant Intune
    participant Device

    RT->>RT: Create/Edit Config.json in Builder
    RT->>RT: Export and commit to repo
    RT->>WE: Submit change request
    WE->>WE: Run New-IntunePackage.ps1
    WE->>Intune: Upload .intunewin
    Intune->>Device: Deploy Win32 App
    Device->>Device: Install.ps1 copies Config.json

    loop Scheduled
        Device->>Device: Detect.ps1 runs
        alt Non-Compliant
            Device->>Device: Remediate.ps1 fixes drift
            Device->>Device: Log remediation actions
        end
    end
```

---

## Installation & Setup

### Prerequisites

- Windows 10/11 endpoint
- PowerShell 5.1+
- Microsoft Intune license
- Git (recommended)

### Repository Setup

**Option 1: Clone with Git**
```powershell
git clone https://github.com/YOUR_ORG/ConfigurationBlender.git
cd ConfigurationBlender
```

**Option 2: Download ZIP**
1. Download from GitHub
2. Extract to desired location

### External Tools

Download the Microsoft Win32 Content Prep Tool:

```powershell
Invoke-WebRequest -Uri "https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool/releases/latest/download/IntuneWinAppUtil.exe" `
                  -OutFile ".\Tools\IntuneWinAppUtil.exe"
```

---

## Configuration Builder (WebUI)

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

### Check Types Reference

```mermaid
graph LR
    subgraph Applications
        A1[Application]
    end

    subgraph "Files & Folders"
        B1[FilesExist]
        B2[FolderExists]
        B3[FolderEmpty]
        B4[ShortcutExists]
        B5[ShortcutsAllowList]
    end

    subgraph Registry
        C1[RegistryValue]
    end

    subgraph "Hardware & Drivers"
        D1[DriverInstalled]
        D2[PrinterInstalled]
        D3[NetworkAdapterConfiguration]
    end

    subgraph "System & Services"
        E1[ServiceRunning]
        E2[ScheduledTaskExists]
        E3[WindowsFeature]
        E4[AssignedAccess]
    end

    subgraph Security
        F1[FirewallRule]
        F2[CertificateInstalled]
    end
```

| Check Type | Purpose | Key Properties |
|------------|---------|----------------|
| `Application` | Install or remove applications | `applicationName`, `ensureInstalled`, `searchPaths`, `uninstallPaths` |
| `FilesExist` | Deploy single file or multiple files | `mode` (SingleFile/MultipleFiles), `destinationPath`, `sourceAssetPath` |
| `FolderExists` | Ensure folder exists with optional file count | `path`, `minimumFileCount`, `sourceAssetPath` |
| `FolderEmpty` | Ensure folder is empty | `paths`, `includeAllUserProfiles` |
| `ShortcutExists` | Create/verify shortcuts | `path`, `targetPath`, `arguments`, `iconLocation` |
| `ShortcutsAllowList` | Remove unauthorized shortcuts | `path`, `allowedShortcuts` |
| `RegistryValue` | Set registry values | `path`, `name`, `value`, `type` |
| `DriverInstalled` | Install device drivers | `driverName`, `driverClass`, `sourceAssetPath`, `minimumVersion` |
| `PrinterInstalled` | Configure network printers | `printerName`, `driverName`, `printerIP`, `portName`, `portType` |
| `NetworkAdapterConfiguration` | Configure network adapters (DHCP to static) | `identifyByCurrentSubnet`, `excludeSubnets`, `staticIPAddress` or `staticIPRange`, `dnsServers` |
| `ServiceRunning` | Ensure services are running | `serviceName`, `startupType`, `ensureRunning` |
| `ScheduledTaskExists` | Create scheduled tasks | `taskName`, `execute`, `arguments`, `trigger`, `principal` |
| `WindowsFeature` | Enable/disable Windows features | `featureName`, `state` |
| `AssignedAccess` | Configure kiosk mode | `configXmlPath` (recommended) or legacy: `profileId`, `allowedApps`, `startPins` |
| `FirewallRule` | Manage firewall rules | `ruleName`, `direction`, `action`, `protocol`, `remoteAddress` |
| `CertificateInstalled` | Deploy certificates | `thumbprint`, `subject`, `storeLocation`, `sourceAssetPath` |

### Validation System

The Builder validates configurations in real-time:

```mermaid
flowchart TD
    A[User Saves Check] --> B{Required Fields?}
    B -->|Missing| C[Show Error]
    B -->|Complete| D{Duplicate Check?}
    D -->|Yes| E[Prompt User]
    D -->|No| F{Dependencies Met?}
    F -->|No| G[Show Warning]
    F -->|Yes| H[Save Check]

    G --> H
    E -->|Continue| H
    E -->|Cancel| I[Return to Editor]
```

**Dependency Validation:**

| Check Type | Required Dependency |
|------------|---------------------|
| `PrinterInstalled` | `DriverInstalled` with matching driver name |
| `ShortcutExists` (with custom icon) | `FilesExist` deploying the icon file |
| `AssignedAccess` | `ShortcutExists` for each pinned shortcut |

---

## Config.json Schema

### Metadata Fields

```json
{
  "version": "1.0.0",
  "role": "US_CBL",
  "description": "US Computer Based Learning kiosk configuration",
  "author": "John Smith",
  "lastModified": "2025-12-03",
  "checks": []
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `version` | Yes | Semantic version (X.Y.Z) |
| `role` | Yes | Role identifier (e.g., US_CBL, CA_MPC) |
| `description` | No | Human-readable description |
| `author` | No | Configuration author |
| `lastModified` | No | Last modification date (YYYY-MM-DD) |
| `checks` | Yes | Array of check objects |

### Check Structure

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

### Property Reference by Type

<details>
<summary><strong>Application</strong></summary>

```json
{
  "type": "Application",
  "properties": {
    "applicationName": "Google Chrome",
    "ensureInstalled": false,
    "searchPaths": [
      "C:\\Program Files*\\Google\\Chrome\\Application\\chrome.exe"
    ],
    "uninstallPaths": [
      "C:\\Program Files*\\Google\\Chrome\\Application\\*\\Installer\\setup.exe"
    ],
    "uninstallArguments": "--uninstall --force-uninstall",
    "installCommand": "winget install Google.Chrome",
    "minimumVersion": "120.0.0.0"
  }
}
```
</details>

<details>
<summary><strong>FilesExist (MultipleFiles)</strong></summary>

```json
{
  "type": "FilesExist",
  "properties": {
    "mode": "MultipleFiles",
    "destinationPath": "C:\\Company\\Icons",
    "files": ["app1.ico", "app2.ico", "app3.ico"],
    "sourceAssetPath": "Icons"
  }
}
```
</details>

<details>
<summary><strong>FilesExist (SingleFile)</strong></summary>

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
</details>

<details>
<summary><strong>ShortcutExists</strong></summary>

```json
{
  "type": "ShortcutExists",
  "properties": {
    "path": "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\MyApp.lnk",
    "targetPath": "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "arguments": "--kiosk https://example.com --edge-kiosk-type=public-browsing",
    "iconLocation": "C:\\Company\\Icons\\myapp.ico",
    "description": "My Application"
  }
}
```
</details>

<details>
<summary><strong>RegistryValue</strong></summary>

```json
{
  "type": "RegistryValue",
  "properties": {
    "path": "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer",
    "name": "HideRecommendedSection",
    "value": 1,
    "type": "DWord"
  }
}
```

**Registry Types:** `String`, `DWord`, `QWord`, `Binary`, `MultiString`, `ExpandString`
</details>

<details>
<summary><strong>DriverInstalled (Printer)</strong></summary>

```json
{
  "type": "DriverInstalled",
  "properties": {
    "driverName": "HP Universal Printing PCL 6",
    "driverClass": "Printer",
    "sourceAssetPath": "Drivers\\HP_UPD\\hpcu270u.inf",
    "minimumVersion": "7.0.0.0"
  }
}
```

**Detection:**
1. `Get-PrinterDriver -Name "driver name"` - checks print subsystem (not driver store)
2. If `minimumVersion` specified, compares installed version
3. FAIL if driver missing or version too old

**Remediation:**
1. `Get-PrinterDriver` - checks if already installed, skips if exists
2. `pnputil /add-driver` - adds to driver store (exit code ignored)
3. `Add-PrinterDriver` - registers with print subsystem
4. `Get-PrinterDriver` - verifies success (this is the source of truth)

**Important:** Driver name must match exactly what the INF installs. If remediation fails, check the "Available drivers" list in the error message.
</details>

<details>
<summary><strong>PrinterInstalled</strong></summary>

```json
{
  "type": "PrinterInstalled",
  "properties": {
    "printerName": "Office Printer",
    "driverName": "HP Universal Printing PCL 6",
    "printerIP": "192.168.1.100",
    "portName": "IP_192.168.1.100",
    "portType": "TCP",
    "setAsDefault": true
  }
}
```

**Port Types:** `TCP` (default), `LPR` (requires `lprQueue`)

**Detection:**
1. `Get-Printer` - checks if printer exists
2. Validates driver name, port name, port IP, port type match config
3. FAIL if printer missing or any config mismatch

**Remediation:**
1. Verifies driver exists via `Get-PrinterDriver` (fails if missing)
2. If printer exists but misconfigured:
   - Stops spooler, clears stuck jobs, restarts spooler
   - Removes misconfigured printer/port
3. `Add-PrinterPort` - creates TCP or LPR port
4. `Add-Printer` - creates printer with driver and port

**Important:** `DriverInstalled` check must come before `PrinterInstalled` in Config.json.
</details>

<details>
<summary><strong>NetworkAdapterConfiguration (Subnet-based DHCP to Static - Single IP)</strong></summary>

Use this mode when devices have dual NICs and you need to convert a private equipment network from DHCP to static IP while protecting the corporate network.

```json
{
  "type": "NetworkAdapterConfiguration",
  "name": "Private Equipment Network",
  "properties": {
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
}
```

**Key Properties:**
- `identifyByCurrentSubnet`: Find wired adapter with IP in this range (CIDR notation)
- `excludeSubnets`: Never modify adapters in these subnets (corporate protection)
- `staticIPAddress`: Exact static IP to assign (use for single-device scenarios)
- `defaultGateway`: Empty = no gateway (isolates network from routing)
- `dnsServers`: Empty array = clear DNS (prevents DNS conflicts)
- `registerInDns`: `false` = don't register in DNS
- `interfaceMetric`: High value = low priority (corporate NIC wins routing)

**Built-in Safeguards:**
1. Only wired adapters (802.3) are considered
2. Adapters with gateway outside target subnet are skipped
3. Virtual adapters are ignored
4. Excluded subnets are never touched
</details>

<details>
<summary><strong>NetworkAdapterConfiguration (Dual-NIC DHCP to Static - IP Range)</strong></summary>

Use this mode when **multiple devices** at the same location have dual NICs and need unique static IPs on the private network. The check only applies to devices with 2+ active wired connections.

```json
{
  "type": "NetworkAdapterConfiguration",
  "name": "Private Equipment Network (Multi-Device)",
  "properties": {
    "staticIPRange": "192.168.20.1-192.168.20.20",
    "subnetPrefixLength": 24,
    "defaultGateway": "",
    "dnsServers": [],
    "registerInDns": false,
    "interfaceMetric": 9999,
    "networkCategory": "Private"
  }
}
```

**How IP Range Mode Works:**

1. **Detection** (3 conditions must be true for FAIL):
   - Device has **2+ active wired connections**
   - One adapter has a **DHCP-assigned IP** in the specified range
   - That adapter needs to be converted to static

   If device has <2 wired adapters → **PASS** (check doesn't apply)
   If adapter in range is already static → **PASS** (already compliant)
   If adapter in range is DHCP → **FAIL** (needs remediation)

2. **Remediation**:
   - Finds the adapter with DHCP IP in the range
   - Performs ping sweep to find an unused IP in the range
   - Converts adapter from DHCP to static with the available IP
   - Applies additional settings (DNS, metric, category, etc.)

**Key Properties:**
- `staticIPRange`: IP range in format `startIP-endIP` (e.g., `192.168.20.1-192.168.20.20`)
- Use **either** `staticIPAddress` or `staticIPRange`, not both

**Example Scenario:**
A site has 5 kiosk devices, each with:
- NIC 1: Corporate network (10.x.x.x via DHCP) - untouched
- NIC 2: Private equipment network (192.168.20.x via DHCP) - needs static

Device 1 remediation:
1. Detects NIC 2 has DHCP IP 192.168.20.50 (in range)
2. Pings 192.168.20.1 - no response
3. Assigns 192.168.20.1 as static to NIC 2

Device 2 remediation:
1. Detects NIC 2 has DHCP IP 192.168.20.51 (in range)
2. Pings 192.168.20.1 - **responds** (Device 1 has it)
3. Pings 192.168.20.2 - no response
4. Assigns 192.168.20.2 as static to NIC 2

**Built-in Safeguards:**
1. Only applies to devices with 2+ active wired adapters
2. Only modifies adapters with DHCP IP in the specified range
3. Corporate NICs (outside range) are never touched
4. Ping sweep has 1-second timeout per IP
5. Remediation fails cleanly if no IPs are available
</details>

<details>
<summary><strong>NetworkAdapterConfiguration (Traditional)</strong></summary>

Use this mode when you know the adapter name, description, or MAC address.

```json
{
  "type": "NetworkAdapterConfiguration",
  "properties": {
    "adapterName": "Ethernet 2",
    "staticIPAddress": "192.168.1.50",
    "subnetPrefixLength": 24,
    "defaultGateway": "192.168.1.1",
    "dnsServers": ["8.8.8.8", "8.8.4.4"],
    "networkCategory": "Private",
    "interfaceMetric": 10,
    "ensureEnabled": true
  }
}
```
</details>

<details>
<summary><strong>AssignedAccess</strong></summary>

Configure Windows 11 multi-app kiosk mode. The recommended approach uses an external XML configuration file:

**Recommended: XML-based configuration**
```json
{
  "type": "AssignedAccess",
  "properties": {
    "configXmlPath": "XML/AssignedAccessConfig.xml"
  }
}
```

Place your Assigned Access XML file in `Assets/XML/`. The detection verifies:
- kioskUser0 exists and is enabled
- AutoLogon is configured for kioskUser0
- Profile ID from XML exists in registry
- Kiosk user is mapped to the correct profile
- Taskbar setting matches

**Legacy: Property-based configuration (deprecated)**
```json
{
  "type": "AssignedAccess",
  "properties": {
    "profileId": "{GUID}",
    "displayName": "Kiosk Profile",
    "allowedApps": [
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
      "C:\\Windows\\System32\\osk.exe"
    ],
    "startPins": [
      "%ALLUSERSPROFILE%\\Microsoft\\Windows\\Start Menu\\Programs\\MyApp.lnk"
    ],
    "showTaskbar": true,
    "allowedNamespaces": ["Downloads"]
  }
}
```

See `Configurations/US_CBL/Assets/XML/AssignedAccessConfig.xml` for a complete example.
</details>

---

## Deployment Pipeline

### Creating a Role Configuration

```mermaid
flowchart LR
    A[Run New-ConfigurationRole.ps1] --> B[Creates folder structure]
    B --> C[Opens Builder in browser]
    C --> D[Define checks]
    D --> E[Export Config.json]
    E --> F[Add Assets to folder]
```

```powershell
# Create new role structure
.\Tools\New-ConfigurationRole.ps1 -Role "US_MPC"

# This creates:
# Configurations/US_MPC/
# Configurations/US_MPC/Assets/
```

### Packaging for Intune

```powershell
# Interactive mode - shows menu of available roles
.\Tools\New-IntunePackage.ps1

# Direct mode - package specific role
.\Tools\New-IntunePackage.ps1 -Role "US_CBL"

# Preview mode
.\Tools\New-IntunePackage.ps1 -Role "US_CBL" -WhatIf
```

**Output:** `Output/US_CBL_v1.0.0.intunewin`

### Win32 App Settings

| Setting | Value |
|---------|-------|
| Install command | `powershell.exe -ExecutionPolicy Bypass -File Install.ps1` |
| Uninstall command | `cmd.exe /c echo No uninstall` |
| Detection | Custom script (`Packaging/Detect.ps1`) |
| Install behavior | System |

### Updating Configurations

```mermaid
flowchart TD
    A[Edit Config.json] --> B[Bump version]
    B --> C[Run New-IntunePackage.ps1]
    C --> D[Upload new Win32 app to Intune]
    D --> E[Configure supersedence]
    E --> F[Assign to device group]
```

**Version Bump Guidelines:**
- **Major** (1.0.0 → 2.0.0): Breaking changes
- **Minor** (1.0.0 → 1.1.0): New checks or features
- **Patch** (1.0.0 → 1.0.1): Bug fixes or minor changes

---

## Engine Scripts

### Detection (Detect.ps1)

Runs on schedule via Intune Proactive Remediation. Checks all enabled items in Config.json.

```mermaid
flowchart TD
    A[Start] --> B[Load Config.json]
    B --> C[Loop through checks]
    C --> D{Check enabled?}
    D -->|No| C
    D -->|Yes| E[Run Test-CheckType]
    E --> F{Passed?}
    F -->|Yes| G[Log Pass]
    F -->|No| H[Log Fail]
    G --> C
    H --> C
    C --> I{More checks?}
    I -->|Yes| C
    I -->|No| J{Any failures?}
    J -->|No| K[Exit 0 - Compliant]
    J -->|Yes| L[Exit 1 - Non-Compliant]
```

### Remediation (Remediate.ps1)

Runs only when Detect.ps1 exits with code 1.

```mermaid
flowchart TD
    A[Start] --> B[Load Config.json]
    B --> C[Loop through checks]
    C --> D{Check enabled?}
    D -->|No| C
    D -->|Yes| E[Run Test-CheckType]
    E --> F{Passed?}
    F -->|Yes| C
    F -->|No| G[Run Repair-CheckType]
    G --> H[Log action]
    H --> C
    C --> I{More checks?}
    I -->|Yes| C
    I -->|No| J[Exit 0]
```

### Execution Context

Both scripts run as `NT AUTHORITY\SYSTEM`:

| Item | SYSTEM Behavior | Recommendation |
|------|-----------------|----------------|
| `HKCU:\` registry | Modifies SYSTEM's hive | Use `HKLM:\` |
| `$env:USERPROFILE` | `C:\Windows\System32\config\systemprofile` | Use explicit paths |
| `$env:TEMP` | `C:\Windows\Temp` | Be aware for temp operations |
| User desktops | Accessible but need explicit path | Use `C:\Users\Public\Desktop` |

---

## File Paths & Registry

### Production Paths

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

### Logging

**Log Files:**
- `Detection_YYYYMMDD_HHMMSS.json` - Detection results
- `Remediation_YYYYMMDD_HHMMSS.json` - Remediation actions

**Log Structure:**
```json
{
  "Timestamp": "2025-12-03T14:30:00",
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
  ]
}
```

---

## Testing

### Local Testing

```powershell
# 1. Set up test environment
New-Item -ItemType Directory -Path "C:\ProgramData\ConfigurationBlender" -Force
Copy-Item "Configurations\US_CBL\Config.json" "C:\ProgramData\ConfigurationBlender\" -Force
Copy-Item "Configurations\US_CBL\Assets" "C:\ProgramData\ConfigurationBlender\" -Recurse -Force

# 2. Run detection
.\Engine\Detect.ps1

# 3. Run remediation (if needed)
.\Engine\Remediate.ps1

# 4. Check logs
Get-ChildItem "C:\ProgramData\ConfigurationBlender\Logs" | Sort-Object LastWriteTime -Descending | Select-Object -First 5
```

### Testing as SYSTEM

Some checks (e.g., `AssignedAccess`) require SYSTEM privileges:

```powershell
# Download PsExec from https://docs.microsoft.com/en-us/sysinternals/downloads/psexec

# Run detection as SYSTEM
psexec -i -s powershell.exe -ExecutionPolicy Bypass -File "C:\ProgramData\ConfigurationBlender\Engine\Detect.ps1"

# Run remediation as SYSTEM
psexec -i -s powershell.exe -ExecutionPolicy Bypass -File "C:\ProgramData\ConfigurationBlender\Engine\Remediate.ps1"
```

---

## Extending Configuration Blender

### Adding New Check Types

```mermaid
flowchart LR
    A[Add UI Form] --> B[Add Test Function]
    B --> C[Add Repair Function]
    C --> D[Update Switch Statements]
    D --> E[Test]
```

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

**Step 2: Add Detection Function** (`Engine/Detect.ps1`)

```powershell
function Test-MyNewCheck {
    param($Properties)

    # Return $true if compliant, $false if not
    # Set $script:currentIssue for failure message

    if ($condition) {
        return $true
    } else {
        $script:currentIssue = "Description of issue"
        return $false
    }
}
```

**Step 3: Add Remediation Function** (`Engine/Remediate.ps1`)

```powershell
function Repair-MyNewCheck {
    param($Properties, $AssetBasePath)

    # Fix the issue
    # Return $true on success, $false on failure

    try {
        # Remediation logic
        return $true
    } catch {
        return $false
    }
}
```

**Step 4: Update Switch Statements**

Add `'MyNewCheck'` case to the switch statements in both `Detect.ps1` and `Remediate.ps1`.

---

## Troubleshooting

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Configuration file not found" | Wrong filename | Must be exactly `Config.json` |
| Registry changes not applying | Using `HKCU:\` | Use `HKLM:\` for system-wide |
| AssignedAccess check skipped | Not running as SYSTEM | Test with PsExec or deploy via Intune |
| Printer not installing | Driver not present | Add `DriverInstalled` check before `PrinterInstalled` |
| Shortcut icon missing | Icon not deployed | Add `FilesExist` check for icon before shortcut |

### Log Analysis

```powershell
# Get latest detection log
$log = Get-Content (Get-ChildItem "C:\ProgramData\ConfigurationBlender\Logs\Detection_*.json" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1).FullName | ConvertFrom-Json

# Show failed checks
$log.Checks | Where-Object { -not $_.Passed } | Format-Table Name, Type, Issue

# Show compliance status
Write-Host "Compliant: $($log.Compliant)" -ForegroundColor $(if ($log.Compliant) { 'Green' } else { 'Red' })
```

---

*Documentation generated for Configuration Blender. For executive overview, see [README.md](README.md).*
