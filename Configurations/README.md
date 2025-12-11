# Lider Chile Kiosk Landing Page

**Author:** Joshua Walderbach

## Overview

This application generates a landing page for Windows 11 Single-App Kiosk devices running Microsoft Edge. The landing page displays the device's computer name and provides a branded entry point to the Punto de Compra (Point of Purchase) system.

## What It Does

When a kiosk device starts up, customers see a welcome screen that:

- Displays the **Lider Chile logo**
- Shows the **computer name** in the upper-right corner (for device identification)
- Provides a **clickable button** to enter the Punto de Compra system
- **Automatically redirects** to the main application after 20 seconds

## Files Included

| File | Purpose |
|------|---------|
| `Generate-LandingPage.ps1` | PowerShell script that creates the landing page |
| `README.md` | This documentation file |

## Requirements

- Windows 10 or Windows 11
- PowerShell 5.1 or later (included with Windows)
- Microsoft Edge (for kiosk display)

## Deployment Options

There are three ways to deploy this application:

1. **Run Locally** - For testing or single device setup
2. **Microsoft Intune** - For cloud-managed devices
3. **SCCM** - For on-premises managed devices

---

## Option 1: Run Locally

Use this method for testing or setting up individual devices.

### Step 1: Copy the Script

Copy `Generate-LandingPage.ps1` to:

```
C:\Walmart Applications\LandingPage\
```

### Step 2: Run the Script

Open **Command Prompt as Administrator** and run:

```
powershell -ExecutionPolicy Bypass -File "C:\Walmart Applications\LandingPage\Generate-LandingPage.ps1"
```

### Step 3: Verify

Open the generated file to confirm it works:

```
start "" "C:\Walmart Applications\LandingPage\index.html"
```

---

## Option 2: Microsoft Intune Deployment

Use this method to deploy to cloud-managed kiosk devices.

### Prepare the Package

1. Create a folder containing `Generate-LandingPage.ps1`
2. Download and install the [Microsoft Win32 Content Prep Tool](https://github.com/Microsoft/Microsoft-Win32-Content-Prep-Tool)
3. Run the tool to create an `.intunewin` file:
   ```
   IntuneWinAppUtil.exe -c <source_folder> -s Generate-LandingPage.ps1 -o <output_folder>
   ```

### Create the App in Intune

In the Microsoft Intune admin center, go to **Apps > All apps > Add** and select **Windows app (Win32)**.

#### App Information

| Field | Value |
|-------|-------|
| Name | `Lider Chile Kiosk Landing Page` |
| Description | `Generates the landing page for kiosk devices with embedded computer name` |
| Publisher | `Walmart Chile` |

#### Program

| Field | Value |
|-------|-------|
| Install command | `powershell -ExecutionPolicy Bypass -File "Generate-LandingPage.ps1"` |
| Uninstall command | `cmd /c del "C:\Walmart Applications\LandingPage\index.html"` |
| Install behavior | `System` |
| Device restart behavior | `No specific action` |

#### Requirements

| Field | Value |
|-------|-------|
| Operating system architecture | `64-bit` |
| Minimum operating system | `Windows 10 1903` |

#### Detection Rules

Select **Manually configure detection rules** and add:

| Rule type | Value |
|-----------|-------|
| Type | `File` |
| Path | `C:\Walmart Applications\LandingPage` |
| File or folder | `index.html` |
| Detection method | `File or folder exists` |

#### Assignments

Assign to your kiosk device group.

---

## Option 3: SCCM Deployment

Use this method to deploy to on-premises managed kiosk devices.

### Create the Package

1. Copy `Generate-LandingPage.ps1` to a network share accessible by SCCM
2. In the SCCM console, go to **Software Library > Application Management > Packages**
3. Right-click and select **Create Package**

#### Package Settings

| Field | Value |
|-------|-------|
| Name | `Lider Chile Kiosk Landing Page` |
| Manufacturer | `Walmart Chile` |
| Source folder | `<path to folder containing script>` |

#### Program Settings

| Field | Value |
|-------|-------|
| Name | `Generate Landing Page` |
| Command line | `powershell -ExecutionPolicy Bypass -File "Generate-LandingPage.ps1"` |
| Run | `Hidden` |
| Program can run | `Whether or not a user is logged on` |
| Run mode | `Run with administrative rights` |

### Create Detection Method (if using Application model)

| Detection type | Value |
|----------------|-------|
| Setting Type | `File System` |
| Path | `C:\Walmart Applications\LandingPage` |
| File name | `index.html` |
| Property | `File or folder exists` |

### Deploy

1. Distribute content to distribution points
2. Deploy to your kiosk device collection
3. Set purpose to **Required**

---

## Configure Edge Kiosk

After deployment, configure Edge to open the landing page. Set the kiosk URL to:

```
file:///C:/Walmart%20Applications/LandingPage/index.html
```

## How It Works

1. The PowerShell script reads the device's computer name from Windows
2. It generates an HTML file (`index.html`) with the computer name embedded
3. The HTML file contains all styling and the Lider logo inline (no external files needed)
4. When displayed in Edge, customers see the branded landing page
5. After 20 seconds, the page automatically redirects to the Punto de Compra application

## Configuration

The following settings are configured in the script:

| Setting | Current Value |
|---------|---------------|
| Redirect URL | `https://puntodecompra.www.lider.cl/inicio` |
| Redirect Timer | 20 seconds |
| Output Location | `C:\Walmart Applications\LandingPage\index.html` |
| Language | Spanish (Chile) |

To modify these settings, edit the `Generate-LandingPage.ps1` file.

## Accessibility

This landing page is designed to meet WCAG (Web Content Accessibility Guidelines) standards:

- Screen reader compatible
- Keyboard navigable
- High contrast colors
- Minimum touch target sizes (44px)
- Supports reduced motion preferences

## Troubleshooting

**Landing page shows wrong computer name:**
Run the script again to regenerate the page with the correct name.

**Logo not displaying:**
Ensure you are using the latest version of the script. The logo is embedded directly in the HTML.

**Page not redirecting:**
Check that JavaScript is enabled in Edge. The page also uses a meta refresh as a backup.

**Script won't run:**
Ensure you are running PowerShell as Administrator and using the `-ExecutionPolicy Bypass` parameter.

## Support

For issues or questions, contact your IT department or submit an issue in this repository.
