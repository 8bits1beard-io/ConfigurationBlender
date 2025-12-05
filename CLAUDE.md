# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Configuration Blender is a configuration-as-code framework for Windows endpoints. It defines desired system state in JSON, detects drift via Intune Proactive Remediation, and auto-remediates.

## Architecture

```
Config.json (declarative) → Win32 App (deploys to endpoint) → Proactive Remediation (enforces)
```

**Key components:**
- `ProactiveRemediation/Detect.ps1` - Detection engine with `Test-*` functions for each check type
- `ProactiveRemediation/Remediate.ps1` - Remediation engine with `Repair-*` functions for each check type
- `Packaging/Install.ps1` - Copies Config.json and Assets to `C:\ProgramData\ConfigurationBlender\`
- `Packaging/Detect.ps1` - Template with `{{ROLE}}` and `{{VERSION}}` placeholders
- `Builder/ConfigurationBlender.html` - Single-page WebUI for building configurations
- `Configurations/[ROLE]/Config.json` - Role-specific configuration definitions

**16 check types:** Application, FilesExist, FolderExists, FolderEmpty, ShortcutExists, ShortcutsAllowList, RegistryValue, DriverInstalled, PrinterInstalled, ServiceRunning, ScheduledTaskExists, WindowsFeature, FirewallRule, CertificateInstalled, AssignedAccess, NetworkAdapterConfiguration

## Commands

```powershell
# Create new role folder structure
.\Tools\New-ConfigurationRole.ps1 -Role "US_MPC"

# Package role for Intune deployment
.\Tools\New-IntunePackage.ps1 -Role "US_CBL"

# Preview packaging without creating
.\Tools\New-IntunePackage.ps1 -Role "US_CBL" -WhatIf

# Local testing (run as Admin)
Copy-Item "Configurations\US_CBL\Config.json" "C:\ProgramData\ConfigurationBlender\" -Force
Copy-Item "Configurations\US_CBL\Assets" "C:\ProgramData\ConfigurationBlender\" -Recurse -Force
.\ProactiveRemediation\Detect.ps1
.\ProactiveRemediation\Remediate.ps1

# Test as SYSTEM (required for AssignedAccess)
psexec -i -s powershell.exe -ExecutionPolicy Bypass -File "C:\Path\To\Detect.ps1"
```

## Adding a New Check Type

1. Add UI form in `Builder/js/checkTypes.js`
2. Add `Test-[CheckType]` function in `ProactiveRemediation/Detect.ps1`
3. Add `Repair-[CheckType]` function in `ProactiveRemediation/Remediate.ps1`
4. Add case to switch statements in both scripts

Each Test function returns `@{ Passed = $bool; Issue = $string }`.
Each Repair function returns `@{ Success = $bool; Action = $string }`.

## Important Patterns

**Printer driver flow:** `pnputil /add-driver` → `Add-PrinterDriver` → `Get-PrinterDriver` (verification source of truth)

**PrinterInstalled requires DriverInstalled:** Driver check must come before printer check in Config.json

**SYSTEM context:** Scripts run as NT AUTHORITY\SYSTEM via Intune. Use `HKLM:\` not `HKCU:\`. Environment variables like `$env:USERPROFILE` resolve to system profile.

**Assets are gitignored:** `Configurations/*/Assets/` folders contain drivers, icons, scripts but are not tracked. Distribute separately.

## File Locations on Endpoints

- Config: `C:\ProgramData\ConfigurationBlender\Config.json`
- Assets: `C:\ProgramData\ConfigurationBlender\Assets\`
- Logs: `C:\ProgramData\ConfigurationBlender\Logs\`
- Registry: `HKLM:\SOFTWARE\ConfigurationBlender\[ROLE]\`
