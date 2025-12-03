# Configuration Blender

> **Self-Healing Configuration Management for Windows Endpoints**
>
> *Named in honor of [June Blender](https://github.com/juneb), whose PowerShell documentation made DSC accessible to IT professionals worldwide.*

[![PowerShell](https://img.shields.io/badge/PowerShell-5.1%2B-blue.svg)](https://github.com/PowerShell/PowerShell)
[![Platform](https://img.shields.io/badge/Platform-Windows%2010%2F11-brightgreen.svg)](https://www.microsoft.com/windows)

**Developed by:** Joshua Walderbach

---

## What is Configuration Blender?

Configuration Blender is an enterprise configuration management tool that eliminates configuration drift across Windows workstations. It combines the power of PowerShell DSC with the simplicity of a visual interface and the reach of Microsoft Intune.

### The Problem
- Devices drift from desired state (users change settings, techs make manual fixes)
- Help desk tickets for "my computer is different"
- Security risks from unauthorized changes
- Technicians spend hours manually reconfiguring devices

### The Solution
- **Visual configuration builder** - No PowerShell knowledge required
- **Automatic drift detection** - Checks compliance on schedule (configurable)
- **Self-healing** - Fixes issues automatically (schedule-based)
- **Comprehensive logging** - Full audit trail of all changes
- **Role-based** - Different configs for kiosks, workstations, etc.

---

## Key Features

### Visual Configuration Builder
Create complex configurations through a simple web interface - no coding required.

### Role-Agnostic Engine
**One** Proactive Remediation policy manages **all** roles (US_CBL, US_DVR, CA_MPC, etc.). Traditional tools require separate policies for each role.

### Rapid Deployment
- Create config: **5 minutes**
- Deploy to Intune: **10 minutes**
- Enforce on 1000s of devices: **Automatic**

### Enterprise-Ready
- Runs as SYSTEM (full privileges)
- Tamper-resistant (managed by Intune)
- Detailed JSON logs for compliance audits
- Version control and rollback support

### 19 Check Types
| Type | Example |
|------|---------|
| `RegistryValue` | Windows 11 Start Menu alignment |
| `UserRegistryValue` | Per-user settings (SYSTEM context aware) |
| `ShortcutExists` | Employee portal shortcuts |
| `ApplicationInstalled` | Git for Windows via winget |
| `ApplicationNotInstalled` | Remove unwanted browsers |
| `ScheduledTaskExists` | Daily 3 AM restart for updates |
| `AssignedAccess` | Kiosk mode enforcement |
| `FolderEmpty` | Desktop cleanup |
| `FilesExist` | Deploy custom assets |
| `ServiceRunning` | Ensure Print Spooler is running |
| `PrinterInstalled` | Deploy network printers |
| `DriverInstalled` | Install device drivers |
| `WindowsFeature` | Enable/disable optional features |
| `FirewallRule` | Block telemetry traffic |
| `CertificateInstalled` | Deploy certificates with expiration monitoring |
| `NetworkAdapterConfiguration` | Configure static IPs for dual-NIC setups |

### Real-Time Validation
The WebUI includes intelligent validation that automatically checks for:
- **HKCU:\\ usage warning** - Alerts when RegistryValue uses HKCU:\\ (SYSTEM context issue)
- **Duplicate check IDs** - Prevents ID conflicts
- **Required field validation** - Ensures all mandatory fields are filled
- **Asset path suggestions** - Warns if paths don't follow conventions

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    Three-Stage Pipeline                          │
└─────────────────────────────────────────────────────────────────┘

1. CREATE (Engineer)                    WebUI Builder
   ┌──────────────────┐                 ┌─────────────┐
   │ No Code Required │  ────────────>  │ Config.json │
   │ Visual Interface │                 │ + Assets    │
   └──────────────────┘                 └─────────────┘
                                               │
2. DEPLOY (Intune)                              │
   ┌──────────────────┐                         │
   │   Win32 App      │  <──────────────────────┘
   │  (Per Role)      │  Deploys to C:\ProgramData\ConfigurationBlender\
   └──────────────────┘
               │
3. ENFORCE (Automatic)
   ┌──────────────────┐
   │ Proactive        │  Runs on schedule on ALL devices
   │ Remediation      │  Detects drift → Auto-fixes
   └──────────────────┘
        │
        ▼
   ┌──────────────────┐
   │  Self-Healing    │  Device maintains desired state
   │  Device          │  No manual intervention
   └──────────────────┘
```

---

## Installation

### Get the Code

**Option 1: Clone with Git (Recommended)**
```powershell
# Clone the repository
git clone https://github.com/YOUR_ORG/ConfigurationBlender.git
cd ConfigurationBlender
```

**Option 2: Download ZIP**
1. Go to: `https://github.com/YOUR_ORG/ConfigurationBlender`
2. Click **Code** → **Download ZIP**
3. Extract to your preferred location

### Download External Tools

```powershell
# Download IntuneWinAppUtil.exe (one-time setup)
Invoke-WebRequest -Uri "https://github.com/microsoft/Microsoft-Win32-Content-Prep-Tool/releases/latest/download/IntuneWinAppUtil.exe" `
                  -OutFile ".\Tools\IntuneWinAppUtil.exe"
```

---

## Quick Start

**Prerequisites:** Repository cloned locally, IntuneWinAppUtil.exe downloaded to `Tools/`

1. **Create role structure:**
   ```powershell
   # Automated setup (creates folders and opens WebUI)
   .\Tools\New-ConfigurationRole.ps1 -Role "YOUR_ROLE"

   # Build your configuration in the WebUI, export as Config.json
   ```

2. **Test locally:**
   ```powershell
   # Copy to test location
   Copy-Item Config.json "C:\ProgramData\ConfigurationBlender\"

   # Run detection
   .\Engine\Detect.ps1

   # Run remediation
   .\Engine\Remediate.ps1
   ```

3. **Package for Intune:**
   ```powershell
   # Automated packaging (recommended)
   .\Tools\New-IntunePackage.ps1

   # Or package specific role directly
   .\Tools\New-IntunePackage.ps1 -Role "YOUR_ROLE"
   ```

4. **Deploy** - Upload `.intunewin` to Intune as Win32 app (script provides detailed instructions)

---

## Updating Configurations

**CRITICAL:** When you change Config.json or Assets, you MUST create a new package and deploy it!

### The Update Workflow

1. **Make changes** to Config.json or Assets
2. **Bump version** in Config.json: `1.0.0` → `1.1.0`
3. **Repackage** (detection script updated automatically):
   ```powershell
   .\Tools\New-IntunePackage.ps1 -Role "YOUR_ROLE"
   ```
4. **Upload to Intune** as a **new** Win32 app
5. **Supersede the old version** in Intune (or remove old app's assignments)

**Why?** The Proactive Remediation reads `Config.json` from the device. Changes only take effect when the Win32 app deploys the new file!

---

## Repository Structure

```
ConfigurationBlender/
├── README.md                              # This file - project overview
│
├── WebUI/
│   └── ConfigurationBuilder.html          # Visual configuration builder
│
├── Configurations/                        # Role-specific configs
│   ├── US_CBL/                            # Example: US CBL kiosks
│   │   ├── Config.json
│   │   └── Assets/
│   │       ├── Icons/
│   │       ├── Drivers/
│   │       └── Scripts/
│   └── [YOUR_ROLE]/                       # Create your own
│
├── Packaging/                             # Win32 App deployment scripts
│   ├── Install.ps1                        # Deploys config to devices
│   └── Detect.ps1                         # Intune detection logic
│
├── Engine/                                # Proactive Remediation scripts
│   ├── Detect.ps1                         # Compliance checking
│   └── Remediate.ps1                      # Auto-fix logic
│
└── Tools/                                 # Development and packaging tools
    ├── New-ConfigurationRole.ps1          # Creates role folder structure
    ├── New-IntunePackage.ps1              # Packages roles for Intune
    └── IntuneWinAppUtil.exe               # Microsoft packaging tool (download separately)
```

---

## Execution Context: SYSTEM User

**CRITICAL:** Both Win32 App installation and Proactive Remediation scripts run as **NT AUTHORITY\SYSTEM** in Intune. This affects how checks behave:

### SYSTEM Context Implications:

| Item | SYSTEM Behavior | Solution |
|------|----------------|----------|
| `HKCU:\` registry | Modifies SYSTEM's hive, not user's | Use `UserRegistryValue` check type |
| `$env:USERPROFILE` | `C:\Windows\System32\config\systemprofile\` | Use explicit paths like `C:\Users\Public\` |
| `$env:TEMP` | `C:\Windows\Temp` | Be aware for temp file operations |
| User desktop shortcuts | Can access but need explicit username | Use `C:\Users\Public\Desktop\` for all users |

### Example: Wrong vs Right

**Don't do this (won't work):**
```json
{
  "type": "RegistryValue",
  "properties": {
    "path": "HKCU:\\Software\\...",
    "name": "Setting",
    "value": "Value"
  }
}
```

**Do this instead:**
```json
{
  "type": "UserRegistryValue",
  "properties": {
    "username": "kiosk_user",
    "path": "Software\\...",
    "name": "Setting",
    "value": "Value"
  }
}
```

**Testing as SYSTEM:** Use PsExec to replicate production environment:
```powershell
psexec -i -s powershell.exe -ExecutionPolicy Bypass -File "C:\...\Detect.ps1"
```

---

## Troubleshooting

### Common Issues

**Win32 app install failing: "Configuration file not found"**
- Config file MUST be named exactly `Config.json` (capital C)
- Common mistakes: `config.json`, `config_RoleName.json`, `RoleName.json`

**Registry changes not applying to users**
- You're probably using `RegistryValue` with `HKCU:\` - this modifies SYSTEM's registry
- Solution: Use `UserRegistryValue` check type with explicit username

**AssignedAccess check failing during local testing**
- Expected when running as regular user
- Use PsExec to test as SYSTEM: `psexec -i -s powershell.exe ...`
- In production, Intune runs as SYSTEM automatically

### Logs
All operations log to: `C:\ProgramData\ConfigurationBlender\Logs\`

---

## Contributing

### Adding New Check Types

1. Add form UI in `WebUI/ConfigurationBuilder.html` (`getPropertiesFormForType()`)
2. Add detection logic: `Test-[CheckType]` function in `Engine/Detect.ps1`
3. Add remediation logic: `Repair-[CheckType]` function in `Engine/Remediate.ps1`
4. Update switch statements in both engine scripts

---

## Credits

### Author
**Joshua Walderbach**

### Dedication
Named in honor of **June Blender** ([@juneb](https://github.com/juneb)), whose work as Senior Content Developer at Microsoft made PowerShell and Desired State Configuration accessible to IT professionals worldwide. Her clear, comprehensive documentation inspired this tool's focus on usability and thorough documentation.

---

## License

MIT License - See LICENSE file for details.
