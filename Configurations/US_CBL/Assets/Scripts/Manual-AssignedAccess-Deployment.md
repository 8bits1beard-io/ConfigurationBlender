# Assigned Access Configuration - Manual Deployment Guide

## Overview

This guide explains how to manually apply the Windows 11 Multi-App Kiosk (Assigned Access) configuration to a device. This is useful for testing, troubleshooting, or deploying outside of the normal Intune remediation cycle.

## Prerequisites

- Windows 11 22H2 or later
- PsExec.exe (from [Sysinternals](https://learn.microsoft.com/en-us/sysinternals/downloads/psexec))
- Administrator access to the device
- The configuration files copied to the device

## Files Required

| File | Description |
|------|-------------|
| `AssignedAccessConfig.xml` | The kiosk configuration (allowed apps, start pins, etc.) |
| `Set-AssignedAccess.ps1` | Helper script to apply the configuration |

## Instructions

### Step 1: Copy Files to Device

Copy the following files to a local folder on the device (e.g., `C:\Temp\Kiosk`):
- `Assets\XML\AssignedAccessConfig.xml`
- `Assets\Scripts\Set-AssignedAccess.ps1`

### Step 2: Open Admin Command Prompt

1. Press `Win + X`
2. Select **Terminal (Admin)** or **Command Prompt (Admin)**
3. Navigate to the folder containing the files:
   ```cmd
   cd C:\Temp\Kiosk
   ```

### Step 3: Apply the Configuration

**Option A: Using the helper script (recommended)**
```cmd
psexec.exe -i -s powershell.exe -ExecutionPolicy Bypass -File "Set-AssignedAccess.ps1"
```

**Option B: One-liner command**
```cmd
psexec.exe -i -s powershell.exe -ExecutionPolicy Bypass -Command "$xml = Get-Content -Path 'AssignedAccessConfig.xml' -Raw; $obj = Get-CimInstance -Namespace 'root\cimv2\mdm\dmmap' -ClassName 'MDM_AssignedAccess'; $obj.Configuration = [System.Net.WebUtility]::HtmlEncode($xml); Set-CimInstance -CimInstance $obj"
```

### Step 4: Reboot the Device

```cmd
shutdown /r /t 0
```

The device will restart and boot into kiosk mode.

## Verification

To verify the configuration was applied correctly:

```cmd
psexec.exe -i -s powershell.exe -Command "$obj = Get-CimInstance -Namespace 'root\cimv2\mdm\dmmap' -ClassName 'MDM_AssignedAccess'; [System.Net.WebUtility]::HtmlDecode($obj.Configuration)"
```

This will display the current Assigned Access XML configuration.

## Troubleshooting

### "Access Denied" or "Permission" errors
- Ensure you are running as Administrator
- Ensure PsExec.exe is in the current directory or in your PATH

### "File not found" errors
- Verify you are in the correct directory (`cd C:\Temp\Kiosk`)
- Verify the XML and PS1 files exist in that directory

### Configuration not taking effect
- Ensure the device has rebooted after applying
- Check that the AutoLogon account was created (look for "kioskuser0" or similar)

### Interactive troubleshooting
Open an interactive SYSTEM PowerShell session:
```cmd
psexec.exe -i -s powershell.exe
```

Then run commands manually to diagnose issues.

## Removing Assigned Access

To clear the kiosk configuration and return to normal mode:

```cmd
psexec.exe -i -s powershell.exe -Command "$obj = Get-CimInstance -Namespace 'root\cimv2\mdm\dmmap' -ClassName 'MDM_AssignedAccess'; $obj.Configuration = $null; Set-CimInstance -CimInstance $obj"
```

Then reboot the device.
