# ============================================================================
# Configuration Blender - Remediation Engine
# ============================================================================
# Version: 1.0.0
# Author: Joshua Walderbach
# Description: Generic remediation script for Intune Proactive Remediation.
#              Reads Config.json and fixes non-compliant items.
# ============================================================================

$EngineVersion = "1.0.0"
$ConfigPath = "C:\ProgramData\ConfigurationBlender\Config.json"
$LogPath = "C:\ProgramData\ConfigurationBlender\Logs"
$AssetBasePath = "C:\ProgramData\ConfigurationBlender\Assets"

# ============================================================================
# INITIALIZATION
# ============================================================================

# Ensure log directory exists
if (-not (Test-Path $LogPath)) {
    New-Item -ItemType Directory -Path $LogPath -Force | Out-Null
}

# Initialize results
$Results = @{
    Timestamp = Get-Date -Format "yyyy-MM-ddTHH:mm:ss"
    EngineVersion = $EngineVersion
    ConfigVersion = ""
    Role = ""
    Actions = @()
    Summary = @{
        Successful = 0
        Failed = 0
        Skipped = 0
    }
}

# ============================================================================
# LOAD CONFIGURATION
# ============================================================================

if (-not (Test-Path $ConfigPath)) {
    Write-Output "FATAL: Configuration file not found at $ConfigPath"
    exit 1
}

try {
    $Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    $Results.ConfigVersion = $Config.version
    $Results.Role = $Config.role
} catch {
    Write-Output "FATAL: Failed to parse configuration file: $($_.Exception.Message)"
    exit 1
}

# ============================================================================
# REMEDIATION HANDLERS
# ============================================================================

function Repair-Application {
    param($Properties, $CheckName)

    if ($Properties.ensureInstalled) {
        # Application SHOULD be installed - run install command
        if (-not $Properties.installCommand) {
            return @{
                Success = $false
                Action = "No install command specified for $($Properties.applicationName)"
            }
        }

        try {
            # Parse the command - first part is executable, rest is arguments
            $cmdParts = $Properties.installCommand -split ' ', 2
            $executable = $cmdParts[0]
            $arguments = if ($cmdParts.Length -gt 1) { $cmdParts[1] } else { "" }

            $process = Start-Process -FilePath $executable -ArgumentList $arguments -Wait -PassThru
            if ($process.ExitCode -eq 0) {
                return @{
                    Success = $true
                    Action = "Installed $($Properties.applicationName)"
                }
            } else {
                return @{
                    Success = $false
                    Action = "Install command returned exit code $($process.ExitCode)"
                }
            }
        } catch {
            return @{
                Success = $false
                Action = "Failed to install $($Properties.applicationName): $($_.Exception.Message)"
            }
        }
    } else {
        # Application should NOT be installed - uninstall it
        $uninstalled = 0
        foreach ($uninstallPath in $Properties.uninstallPaths) {
            $installers = Get-ChildItem $uninstallPath -ErrorAction SilentlyContinue
            foreach ($installer in $installers) {
                try {
                    Start-Process -FilePath $installer.FullName -ArgumentList $Properties.uninstallArguments -Wait -PassThru | Out-Null
                    $uninstalled++
                } catch {
                    return @{
                        Success = $false
                        Action = "Failed to uninstall from $($installer.FullName): $($_.Exception.Message)"
                    }
                }
            }
        }

        if ($uninstalled -gt 0) {
            return @{
                Success = $true
                Action = "Uninstalled $uninstalled instance(s) of $($Properties.applicationName)"
            }
        }

        return @{
            Success = $true
            Action = "No installations found to remove"
        }
    }
}

function Repair-FolderEmpty {
    param($Properties, $CheckName)

    $removedCount = 0
    $paths = @()

    foreach ($path in $Properties.paths) {
        $expandedPath = $ExecutionContext.InvokeCommand.ExpandString($path)
        $paths += $expandedPath
    }

    if ($Properties.includeAllUserProfiles) {
        $users = Get-CimInstance -ClassName Win32_UserProfile | Where-Object { $_.Special -eq $false }
        foreach ($user in $users) {
            $paths += Join-Path -Path $user.LocalPath -ChildPath "Desktop"
        }
    }

    foreach ($path in $paths) {
        if (Test-Path $path) {
            $items = Get-ChildItem -Path $path -ErrorAction SilentlyContinue
            foreach ($item in $items) {
                try {
                    Remove-Item -Path $item.FullName -Force -Recurse -ErrorAction Stop
                    $removedCount++
                } catch {
                    # Continue on individual failures
                }
            }
        }
    }

    return @{
        Success = $true
        Action = "Removed $removedCount item(s) from desktop folders"
    }
}

function Repair-ShortcutsAllowList {
    param($Properties, $CheckName)

    # Build list of paths to check
    $pathsToCheck = @()

    # Support both old single 'path' and new 'paths' array for backward compatibility
    if ($Properties.paths) {
        $pathsToCheck += $Properties.paths
    } elseif ($Properties.path) {
        $pathsToCheck += $Properties.path
    }

    # Add desktop paths if includeAllDesktops is true
    if ($Properties.includeAllDesktops) {
        # Public Desktop
        $pathsToCheck += "C:\Users\Public\Desktop"

        # All user profile desktops
        $userProfiles = Get-ChildItem "C:\Users" -Directory | Where-Object {
            $_.Name -notin @('Public', 'Default', 'Default User', 'All Users') -and
            -not $_.Name.StartsWith('.')
        }
        foreach ($profile in $userProfiles) {
            $desktopPath = Join-Path $profile.FullName "Desktop"
            if (Test-Path $desktopPath) {
                $pathsToCheck += $desktopPath
            }
        }
    }

    if ($pathsToCheck.Count -eq 0) {
        return @{
            Success = $true
            Action = "No paths specified, nothing to clean"
        }
    }

    $removedCount = 0
    $removedDetails = @()

    foreach ($checkPath in $pathsToCheck) {
        if (-not (Test-Path $checkPath)) {
            continue
        }

        $allShortcuts = Get-ChildItem -Path $checkPath -Filter "*.lnk" -ErrorAction SilentlyContinue
        $unwanted = $allShortcuts | Where-Object { $Properties.allowedShortcuts -notcontains $_.Name }

        foreach ($shortcut in $unwanted) {
            try {
                Remove-Item -Path $shortcut.FullName -Force -ErrorAction Stop
                $removedCount++
                $removedDetails += "$($shortcut.Name)"
            } catch {
                # Continue on individual failures
            }
        }
    }

    if ($removedCount -eq 0) {
        return @{
            Success = $true
            Action = "No unwanted shortcuts found"
        }
    }

    return @{
        Success = $true
        Action = "Removed $removedCount unwanted shortcut(s): $($removedDetails -join ', ')"
    }
}

function Repair-FolderExists {
    param($Properties, $CheckName)

    # Ensure folder exists
    if (-not (Test-Path $Properties.path)) {
        New-Item -ItemType Directory -Path $Properties.path -Force | Out-Null
    }

    # If minimumFileCount is 0 or not specified, just ensure folder exists
    $minCount = if ($Properties.minimumFileCount) { $Properties.minimumFileCount } else { 0 }

    if ($minCount -eq 0 -or -not $Properties.sourceAssetPath) {
        return @{
            Success = $true
            Action = "Folder exists: $($Properties.path)"
        }
    }

    # Copy files from asset source if folder needs files
    $sourcePath = Join-Path $AssetBasePath $Properties.sourceAssetPath
    if (-not (Test-Path $sourcePath)) {
        return @{
            Success = $false
            Action = "Source asset path not found: $sourcePath"
        }
    }

    $copiedCount = 0
    $files = Get-ChildItem -Path $sourcePath -File -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        try {
            Copy-Item -Path $file.FullName -Destination $Properties.path -Force -ErrorAction Stop
            $copiedCount++
        } catch {
            # Continue on individual failures
        }
    }

    return @{
        Success = $true
        Action = "Copied $copiedCount file(s) to $($Properties.path)"
    }
}

function Repair-FilesExist {
    param($Properties, $CheckName)

    # Handle SingleFile mode (legacy FileContent behavior)
    if ($Properties.mode -eq 'SingleFile') {
        try {
            # Ensure parent directory exists
            $parentDir = Split-Path $Properties.destinationPath -Parent
            if (-not (Test-Path $parentDir)) {
                New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
            }

            # Copy from asset source
            $sourcePath = Join-Path $AssetBasePath $Properties.sourceAssetPath
            if (-not (Test-Path $sourcePath)) {
                return @{
                    Success = $false
                    Action = "Source asset not found: $sourcePath"
                }
            }

            Copy-Item -Path $sourcePath -Destination $Properties.destinationPath -Force

            return @{
                Success = $true
                Action = "Copied file to $($Properties.destinationPath)"
            }
        } catch {
            return @{
                Success = $false
                Action = "Failed to copy file: $($_.Exception.Message)"
            }
        }
    }

    # MultipleFiles mode (default behavior for backward compatibility)
    # Ensure destination directory exists
    if (-not (Test-Path $Properties.destinationPath)) {
        New-Item -ItemType Directory -Path $Properties.destinationPath -Force | Out-Null
    }

    # Copy missing files from asset source
    $sourcePath = Join-Path $AssetBasePath $Properties.sourceAssetPath
    if (-not (Test-Path $sourcePath)) {
        return @{
            Success = $false
            Action = "Source asset path not found: $sourcePath"
        }
    }

    $copiedCount = 0
    foreach ($file in $Properties.files) {
        $destFile = Join-Path $Properties.destinationPath $file
        if (-not (Test-Path $destFile)) {
            $sourceFile = Join-Path $sourcePath $file
            if (Test-Path $sourceFile) {
                try {
                    Copy-Item -Path $sourceFile -Destination $destFile -Force -ErrorAction Stop
                    $copiedCount++
                } catch {
                    # Continue on individual failures
                }
            }
        }
    }

    return @{
        Success = $true
        Action = "Copied $copiedCount missing file(s)"
    }
}

function Repair-ShortcutProperties {
    param($Properties, $CheckName)

    try {
        # Ensure parent directory exists
        $parentDir = Split-Path $Properties.path -Parent
        if (-not (Test-Path $parentDir)) {
            New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
        }

        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($Properties.path)
        $shortcut.TargetPath = $Properties.targetPath
        $shortcut.Arguments = $Properties.arguments
        $shortcut.IconLocation = $Properties.iconLocation
        $shortcut.Description = $Properties.description
        $shortcut.WindowStyle = 1
        $shortcut.Save()

        return @{
            Success = $true
            Action = "Created/updated shortcut: $($Properties.description)"
        }
    } catch {
        return @{
            Success = $false
            Action = "Failed to create shortcut: $($_.Exception.Message)"
        }
    }
}

function Repair-AssignedAccess {
    param($Properties, $CheckName)

    try {
        # Check if running as SYSTEM (required for MDM_AssignedAccess)
        $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        if ($currentUser -ne "NT AUTHORITY\SYSTEM") {
            return @{
                Success = $false
                Action = "SKIPPED - AssignedAccess requires SYSTEM context. Current user: $currentUser. Use PsExec or run via Intune."
            }
        }

        $namespaceName = "root\cimv2\mdm\dmmap"
        $className = "MDM_AssignedAccess"
        $obj = Get-CimInstance -Namespace $namespaceName -ClassName $className

        # NEW: If configXmlPath is specified, read XML from file
        if ($Properties.configXmlPath) {
            $xmlPath = Join-Path $AssetBasePath $Properties.configXmlPath

            if (-not (Test-Path $xmlPath)) {
                return @{
                    Success = $false
                    Action = "Configuration XML not found: $xmlPath"
                }
            }

            $configXml = Get-Content -Path $xmlPath -Raw

            $obj.Configuration = [System.Net.WebUtility]::HtmlEncode($configXml)
            Set-CimInstance -CimInstance $obj -ErrorAction Stop

            return @{
                Success = $true
                Action = "Applied Assigned Access configuration from $($Properties.configXmlPath)"
            }
        }

        # LEGACY: Property-based XML generation (backward compatibility)
        # Escape backslashes for JSON (\ becomes \\)
        $startPinsJson = ($Properties.startPins | ForEach-Object {
            $escapedPath = $_ -replace '\\', '\\'
            "{`"desktopAppLink`":`"$escapedPath`"}"
        }) -join ","
        $allowedAppsXml = ($Properties.allowedApps | ForEach-Object { "<App DesktopAppPath=`"$_`" />" }) -join "`n            "
        $namespacesXml = ($Properties.allowedNamespaces | ForEach-Object { "<rs5:AllowedNamespace Name=`"$_`"/>" }) -join "`n          "

        $configXml = @"
<?xml version="1.0" encoding="utf-8" ?>
<AssignedAccessConfiguration
    xmlns:rs5="http://schemas.microsoft.com/AssignedAccess/201810/config"
    xmlns="http://schemas.microsoft.com/AssignedAccess/2017/config"
    xmlns:win11="http://schemas.microsoft.com/AssignedAccess/2022/config">

    <Profiles>
      <Profile Id="$($Properties.profileId)">
        <AllAppsList>
          <AllowedApps>
            $allowedAppsXml
          </AllowedApps>
        </AllAppsList>

        <rs5:FileExplorerNamespaceRestrictions>
          $namespacesXml
        </rs5:FileExplorerNamespaceRestrictions>

      <win11:StartPins>
          <![CDATA[
            { "pinnedList":[
              $startPinsJson
            ] }
          ]]>
        </win11:StartPins>

        <Taskbar ShowTaskbar="$($Properties.showTaskbar.ToString().ToLower())"/>

      </Profile>
  </Profiles>
  <Configs>
    <Config>
      <AutoLogonAccount rs5:DisplayName="$($Properties.displayName)"/>
      <DefaultProfile Id="$($Properties.profileId)" />
    </Config>
  </Configs>
</AssignedAccessConfiguration>
"@

        $obj.Configuration = [System.Net.WebUtility]::HtmlEncode($configXml)
        Set-CimInstance -CimInstance $obj -ErrorAction Stop

        return @{
            Success = $true
            Action = "Applied Assigned Access configuration (legacy property-based)"
        }
    } catch {
        return @{
            Success = $false
            Action = "Failed to configure Assigned Access: $($_.Exception.Message)"
        }
    }
}

function Repair-RegistryValue {
    param($Properties, $CheckName)

    try {
        # Ensure registry path exists
        if (-not (Test-Path $Properties.path)) {
            New-Item -Path $Properties.path -Force | Out-Null
        }

        Set-ItemProperty -Path $Properties.path -Name $Properties.name -Value $Properties.value -Type $Properties.type -Force

        return @{
            Success = $true
            Action = "Set registry value $($Properties.name) to $($Properties.value)"
        }
    } catch {
        return @{
            Success = $false
            Action = "Failed to set registry value: $($_.Exception.Message)"
        }
    }
}

function Repair-ScheduledTaskExists {
    param($Properties, $CheckName)

    try {
        $existingTask = Get-ScheduledTask -TaskName $Properties.taskName -ErrorAction SilentlyContinue

        if ($null -eq $existingTask) {
            $action = New-ScheduledTaskAction -Execute $Properties.execute -Argument $Properties.arguments

            $trigger = switch ($Properties.trigger) {
                "AtLogOn" { New-ScheduledTaskTrigger -AtLogOn }
                "AtStartup" { New-ScheduledTaskTrigger -AtStartup }
                default { New-ScheduledTaskTrigger -AtLogOn }
            }

            $principal = New-ScheduledTaskPrincipal $Properties.principal -RunLevel $Properties.runLevel
            $settings = New-ScheduledTaskSettingsSet
            $task = New-ScheduledTask -Action $action -Principal $principal -Trigger $trigger -Settings $settings

            Register-ScheduledTask $Properties.taskName -InputObject $task | Out-Null

            return @{
                Success = $true
                Action = "Created scheduled task: $($Properties.taskName)"
            }
        }

        return @{
            Success = $true
            Action = "Scheduled task already exists"
        }
    } catch {
        return @{
            Success = $false
            Action = "Failed to create scheduled task: $($_.Exception.Message)"
        }
    }
}

function Repair-ServiceRunning {
    param($Properties, $CheckName)

    try {
        $service = Get-Service -Name $Properties.serviceName -ErrorAction Stop

        # Set startup type
        $serviceWmi = Get-CimInstance -ClassName Win32_Service -Filter "Name='$($Properties.serviceName)'"
        $startMode = switch ($Properties.startupType) {
            "Automatic" { "Automatic" }
            "Manual" { "Manual" }
            "Disabled" { "Disabled" }
            default { "Automatic" }
        }

        Set-Service -Name $Properties.serviceName -StartupType $startMode

        # Start service if required
        if ($Properties.ensureRunning -and $service.Status -ne "Running") {
            Start-Service -Name $Properties.serviceName -ErrorAction Stop
            return @{
                Success = $true
                Action = "Set service to '$startMode' and started service"
            }
        }

        return @{
            Success = $true
            Action = "Set service startup type to '$startMode'"
        }

    } catch {
        return @{
            Success = $false
            Action = "Failed to configure service: $($_.Exception.Message)"
        }
    }
}

function Repair-PrinterInstalled {
    param($Properties, $CheckName)

    try {
        # Validate required fields for network printers
        if (-not $Properties.printerName -or -not $Properties.driverName -or -not $Properties.printerIP -or -not $Properties.portName) {
            return @{
                Success = $false
                Action = "Missing required fields: printerName, driverName, printerIP, and portName are all required"
            }
        }

        # Check if printer already exists
        $existingPrinter = Get-Printer -Name $Properties.printerName -ErrorAction SilentlyContinue
        $needsRecreation = $false
        $recreationReasons = @()

        # Check if printer needs to be recreated due to configuration mismatch
        if ($existingPrinter) {
            # Check driver
            if ($Properties.driverName -and $existingPrinter.DriverName -ne $Properties.driverName) {
                $needsRecreation = $true
                $recreationReasons += "driver mismatch"
            }

            # Check port assignment
            if ($Properties.portName -and $existingPrinter.PortName -ne $Properties.portName) {
                $needsRecreation = $true
                $recreationReasons += "port mismatch"
            }

            # Check port configuration
            if ($Properties.portName) {
                $existingPort = Get-PrinterPort -Name $Properties.portName -ErrorAction SilentlyContinue

                if ($existingPort) {
                    # Check port type
                    if ($Properties.portType) {
                        $actualPortType = if ($existingPort.PortMonitor -like "*Standard TCP/IP*") { "TCP" } elseif ($existingPort.PortMonitor -like "*LPR*") { "LPR" } else { "Unknown" }

                        if ($actualPortType -ne $Properties.portType) {
                            $needsRecreation = $true
                            $recreationReasons += "port type mismatch"
                        }
                    }

                    # Check IP address
                    if ($Properties.printerIP -and $existingPort.PrinterHostAddress -ne $Properties.printerIP) {
                        $needsRecreation = $true
                        $recreationReasons += "IP/hostname mismatch"
                    }

                    # Check LPR queue
                    if ($Properties.portType -eq "LPR" -and $Properties.lprQueue -and $existingPort.LprQueueName -ne $Properties.lprQueue) {
                        $needsRecreation = $true
                        $recreationReasons += "LPR queue mismatch"
                    }
                }
            }
        }

        # Remove and recreate printer if configuration is wrong
        if ($needsRecreation) {
            # Stop Print Spooler service to clear any stuck jobs
            $spoolerWasStopped = $false
            try {
                $spooler = Get-Service -Name Spooler -ErrorAction Stop

                if ($spooler.Status -eq "Running") {
                    Stop-Service -Name Spooler -Force -ErrorAction Stop

                    # Wait for service to stop (10 second timeout)
                    $timeout = 20
                    $elapsed = 0
                    while ($elapsed -lt $timeout) {
                        Start-Sleep -Milliseconds 500
                        $spooler.Refresh()
                        if ($spooler.Status -eq "Stopped") {
                            $spoolerWasStopped = $true
                            break
                        }
                        $elapsed++
                    }

                    # Force-kill spooler process if graceful stop failed
                    if (-not $spoolerWasStopped) {
                        $spoolerProcess = Get-Process -Name spoolsv -ErrorAction SilentlyContinue
                        if ($spoolerProcess) {
                            Stop-Process -Name spoolsv -Force -ErrorAction SilentlyContinue
                            Start-Sleep -Seconds 2
                        }
                        $spoolerWasStopped = $true
                    }
                }
            } catch {
                # Continue even if spooler stop fails
                Write-Warning "Could not stop spooler cleanly: $($_.Exception.Message)"
            }

            # Clear print jobs from spool directory (while spooler is stopped)
            try {
                $spoolPath = "C:\Windows\System32\spool\PRINTERS"
                if (Test-Path $spoolPath) {
                    Get-ChildItem -Path $spoolPath -Filter "*.shd" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
                    Get-ChildItem -Path $spoolPath -Filter "*.spl" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
                }
            } catch {
                # Continue even if clearing spool fails
                Write-Warning "Could not clear spool files: $($_.Exception.Message)"
            }

            # Restart spooler - it must be running to remove/add printers
            if ($spoolerWasStopped) {
                try {
                    Start-Service -Name Spooler -ErrorAction Stop

                    # Wait for spooler to be fully ready (up to 15 seconds)
                    $spooler = Get-Service -Name Spooler
                    $timeout = 30
                    $elapsed = 0
                    while ($elapsed -lt $timeout) {
                        $spooler.Refresh()
                        if ($spooler.Status -eq "Running") {
                            # Give it a moment to fully initialize
                            Start-Sleep -Seconds 2
                            break
                        }
                        Start-Sleep -Milliseconds 500
                        $elapsed++
                    }

                    if ($spooler.Status -ne "Running") {
                        return @{
                            Success = $false
                            Action = "Failed to restart Print Spooler service after clearing jobs"
                        }
                    }
                } catch {
                    return @{
                        Success = $false
                        Action = "Failed to restart Print Spooler service: $($_.Exception.Message)"
                    }
                }
            }

            # Remove existing printer (spooler must be running)
            try {
                Remove-Printer -Name $Properties.printerName -ErrorAction Stop
            } catch {
                return @{
                    Success = $false
                    Action = "Failed to remove misconfigured printer: $($_.Exception.Message)"
                }
            }

            # Remove port if it needs to be recreated
            if ($recreationReasons -contains "port type mismatch" -or $recreationReasons -contains "IP/hostname mismatch" -or $recreationReasons -contains "LPR queue mismatch") {
                try {
                    $existingPort = Get-PrinterPort -Name $Properties.portName -ErrorAction SilentlyContinue
                    if ($existingPort) {
                        Remove-PrinterPort -Name $Properties.portName -ErrorAction Stop
                    }
                } catch {
                    # Continue even if port removal fails
                    Write-Warning "Could not remove port: $($_.Exception.Message)"
                }
            }

            # Mark that we need to create the printer
            $existingPrinter = $null
        }

        # Create printer if it doesn't exist or was just removed
        if ($null -eq $existingPrinter) {
            # Verify driver exists
            $driver = Get-PrinterDriver -Name $Properties.driverName -ErrorAction SilentlyContinue
            if ($null -eq $driver) {
                return @{
                    Success = $false
                    Action = "Printer driver '$($Properties.driverName)' not found. Driver must be installed on the system first."
                }
            }

            # Create or validate printer port
            $existingPort = Get-PrinterPort -Name $Properties.portName -ErrorAction SilentlyContinue

            if ($null -eq $existingPort) {
                # Determine port type (default to TCP if not specified)
                $portType = if ($Properties.portType) { $Properties.portType } else { "TCP" }

                if ($portType -eq "TCP") {
                    # Create Standard TCP/IP Port
                    Add-PrinterPort -Name $Properties.portName -PrinterHostAddress $Properties.printerIP -ErrorAction Stop
                } elseif ($portType -eq "LPR") {
                    # Create LPR Port
                    if (-not $Properties.lprQueue) {
                        return @{
                            Success = $false
                            Action = "LPR queue name (lprQueue) is required for LPR port type"
                        }
                    }
                    Add-PrinterPort -Name $Properties.portName -LprHostAddress $Properties.printerIP -LprQueue $Properties.lprQueue -ErrorAction Stop
                } else {
                    return @{
                        Success = $false
                        Action = "Unsupported port type: $portType (use 'TCP' or 'LPR')"
                    }
                }
            }

            # Add network printer with exact driver name and port
            Add-Printer -Name $Properties.printerName -DriverName $Properties.driverName -PortName $Properties.portName -ErrorAction Stop

            # Set as default if requested
            if ($Properties.setAsDefault) {
                $printer = Get-CimInstance -ClassName Win32_Printer -Filter "Name='$($Properties.printerName)'"
                Invoke-CimMethod -InputObject $printer -MethodName SetDefaultPrinter | Out-Null
            }

            # Determine action message
            if ($needsRecreation) {
                return @{
                    Success = $true
                    Action = "Recreated printer due to: $($recreationReasons -join ', ')"
                }
            } else {
                return @{
                    Success = $true
                    Action = "Installed network printer '$($Properties.printerName)' on port $($Properties.portName) with driver '$($Properties.driverName)'"
                }
            }
        }

        return @{
            Success = $true
            Action = "Printer already configured correctly"
        }

    } catch {
        return @{
            Success = $false
            Action = "Failed to configure printer: $($_.Exception.Message)"
        }
    }
}

function Repair-DriverInstalled {
    param($Properties, $CheckName)

    try {
        # Resolve source asset path
        if (-not $Properties.sourceAssetPath) {
            return @{
                Success = $false
                Action = "No sourceAssetPath specified for driver installation"
            }
        }

        $sourcePath = Join-Path $AssetBasePath $Properties.sourceAssetPath

        if (-not (Test-Path $sourcePath)) {
            return @{
                Success = $false
                Action = "Driver .inf file not found: $sourcePath"
            }
        }

        # Check if driver already exists - use different methods for printer vs other drivers
        $needsInstall = $false
        $needsUpdate = $false
        $existingVersion = $null

        if ($Properties.driverClass -eq "Printer") {
            # For printer drivers, check the print subsystem
            $printerDriver = Get-PrinterDriver -Name $Properties.driverName -ErrorAction SilentlyContinue

            if (-not $printerDriver) {
                $needsInstall = $true
            } elseif ($Properties.minimumVersion) {
                # Printer drivers don't expose version easily, but we can check MajorVersion/MinorVersion
                # For now, assume if driver exists it meets requirements unless we can parse version
                $existingVersion = "installed"
            }
        } else {
            # For other drivers, check Windows driver store
            $existingDriver = Get-WindowsDriver -Online -ErrorAction SilentlyContinue | Where-Object {
                $_.OriginalFileName -like "*$($Properties.driverName)*" -or $_.Driver -like "*$($Properties.driverName)*"
            } | Select-Object -First 1

            if (-not $existingDriver) {
                $needsInstall = $true
            } elseif ($Properties.minimumVersion) {
                try {
                    $installedVersion = [version]$existingDriver.Version
                    $requiredVersion = [version]$Properties.minimumVersion
                    $existingVersion = $existingDriver.Version

                    if ($installedVersion -lt $requiredVersion) {
                        $needsUpdate = $true
                    }
                } catch {
                    $needsUpdate = $true
                }
            } else {
                $existingVersion = $existingDriver.Version
            }
        }

        # Driver already installed and meets requirements
        if (-not $needsInstall -and -not $needsUpdate) {
            return @{
                Success = $true
                Action = "Driver '$($Properties.driverName)' already installed ($existingVersion)"
            }
        }

        # Remove old driver if update is needed (non-printer drivers only)
        if ($needsUpdate -and $Properties.driverClass -ne "Printer") {
            $existingDriver = Get-WindowsDriver -Online -ErrorAction SilentlyContinue | Where-Object {
                $_.OriginalFileName -like "*$($Properties.driverName)*" -or $_.Driver -like "*$($Properties.driverName)*"
            } | Select-Object -First 1

            if ($existingDriver) {
                try {
                    $driverInfName = $existingDriver.Driver
                    if ($driverInfName) {
                        & pnputil /delete-driver $driverInfName /uninstall /force 2>&1 | Out-Null
                    }
                } catch {
                    Write-Warning "Could not cleanly remove old driver: $($_.Exception.Message)"
                }
            }
        }

        # Run pnputil to install/update the driver to the driver store
        # Note: pnputil exit codes are unreliable, so we verify success by checking if driver exists afterward
        $pnpOutput = & pnputil /add-driver "$sourcePath" /install 2>&1 | Out-String

        # For printer drivers, register with print subsystem then verify
        if ($Properties.driverClass -eq "Printer") {
            # Give the system a moment to process the driver
            Start-Sleep -Seconds 2

            # Register driver with print subsystem
            try {
                Add-PrinterDriver -Name $Properties.driverName -ErrorAction Stop
            } catch {
                # Add-PrinterDriver failed - the driver name in the INF may not match what we expect
                $availableDrivers = Get-PrinterDriver -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
                $driverList = if ($availableDrivers) { ($availableDrivers | Select-Object -First 10) -join ", " } else { "none" }
                return @{
                    Success = $false
                    Action = "Failed to register printer driver '$($Properties.driverName)': $($_.Exception.Message). Available drivers: $driverList. pnputil output: $pnpOutput"
                }
            }

            # Verify driver is now available
            Start-Sleep -Seconds 1
            $printerDriver = Get-PrinterDriver -Name $Properties.driverName -ErrorAction SilentlyContinue

            if ($printerDriver) {
                return @{
                    Success = $true
                    Action = "Installed printer driver '$($Properties.driverName)'"
                }
            } else {
                $availableDrivers = Get-PrinterDriver -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
                $driverList = if ($availableDrivers) { ($availableDrivers | Select-Object -First 10) -join ", " } else { "none" }
                return @{
                    Success = $false
                    Action = "Printer driver '$($Properties.driverName)' not found after installation. Available drivers: $driverList"
                }
            }
        }

        # For non-printer drivers, verify in driver store using Get-WindowsDriver
        $installedDriver = Get-WindowsDriver -Online -ErrorAction SilentlyContinue | Where-Object {
            $_.OriginalFileName -like "*$($Properties.driverName)*" -or $_.Driver -like "*$($Properties.driverName)*"
        } | Select-Object -First 1

        if ($installedDriver) {
            # Driver exists - check version if required
            if ($Properties.minimumVersion) {
                try {
                    $installedVersion = [version]$installedDriver.Version
                    $requiredVersion = [version]$Properties.minimumVersion

                    if ($installedVersion -lt $requiredVersion) {
                        return @{
                            Success = $false
                            Action = "Driver installed but version $($installedDriver.Version) is below required $($Properties.minimumVersion)"
                        }
                    }
                } catch {
                    # Version comparison failed but driver exists
                }
            }

            return @{
                Success = $true
                Action = "Installed driver '$($Properties.driverName)' version $($installedDriver.Version)"
            }
        } else {
            # Driver not found after pnputil - actual failure
            return @{
                Success = $false
                Action = "Driver not found after installation attempt. pnputil output: $pnpOutput"
            }
        }

    } catch {
        return @{
            Success = $false
            Action = "Failed to install driver: $($_.Exception.Message)"
        }
    }
}

function Repair-WindowsFeature {
    param($Properties, $CheckName)

    try {
        $desiredState = $Properties.state

        if ($desiredState -eq "Enabled") {
            Enable-WindowsOptionalFeature -Online -FeatureName $Properties.featureName -NoRestart -ErrorAction Stop

            return @{
                Success = $true
                Action = "Enabled Windows feature '$($Properties.featureName)'"
            }
        } else {
            Disable-WindowsOptionalFeature -Online -FeatureName $Properties.featureName -NoRestart -ErrorAction Stop

            return @{
                Success = $true
                Action = "Disabled Windows feature '$($Properties.featureName)'"
            }
        }

    } catch {
        return @{
            Success = $false
            Action = "Failed to configure Windows feature: $($_.Exception.Message)"
        }
    }
}

function Repair-FirewallRule {
    param($Properties, $CheckName)

    try {
        # Check if rule exists
        $existingRule = Get-NetFirewallRule -Name $Properties.ruleName -ErrorAction SilentlyContinue

        # Build parameters for New/Set-NetFirewallRule
        $ruleParams = @{
            Name = $Properties.ruleName
            DisplayName = $Properties.displayName
            Direction = $Properties.direction
            Action = $Properties.action
            Enabled = if ($Properties.enabled) { "True" } else { "False" }
        }

        # Add optional parameters
        if ($Properties.protocol) {
            $ruleParams['Protocol'] = $Properties.protocol
        }
        if ($Properties.remoteAddress) {
            $ruleParams['RemoteAddress'] = $Properties.remoteAddress
        }
        if ($Properties.remotePort) {
            $ruleParams['RemotePort'] = $Properties.remotePort
        }
        if ($Properties.localPort) {
            $ruleParams['LocalPort'] = $Properties.localPort
        }
        if ($Properties.program) {
            $ruleParams['Program'] = $Properties.program
        }

        if ($null -eq $existingRule) {
            # Create new rule
            New-NetFirewallRule @ruleParams -ErrorAction Stop | Out-Null

            return @{
                Success = $true
                Action = "Created firewall rule '$($Properties.displayName)'"
            }
        } else {
            # Update existing rule
            Set-NetFirewallRule @ruleParams -ErrorAction Stop

            return @{
                Success = $true
                Action = "Updated firewall rule '$($Properties.displayName)'"
            }
        }

    } catch {
        return @{
            Success = $false
            Action = "Failed to configure firewall rule: $($_.Exception.Message)"
        }
    }
}

function Repair-CertificateInstalled {
    param($Properties, $CheckName)

    try {
        # Determine certificate store location
        $storeLocation = if ($Properties.storeLocation) { $Properties.storeLocation } else { "LocalMachine" }
        $storeName = if ($Properties.storeName) { $Properties.storeName } else { "My" }
        $certPath = "Cert:\$storeLocation\$storeName"

        # Check if we have a source certificate file
        if ($Properties.sourceAssetPath) {
            $sourcePath = Join-Path $AssetBasePath $Properties.sourceAssetPath

            if (-not (Test-Path $sourcePath)) {
                return @{
                    Success = $false
                    Action = "Certificate file not found: $sourcePath"
                }
            }

            # Determine certificate file type and import
            $extension = [System.IO.Path]::GetExtension($sourcePath).ToLower()

            if ($extension -eq ".cer" -or $extension -eq ".crt") {
                # Import .cer or .crt (public key only)
                $cert = Import-Certificate -FilePath $sourcePath -CertStoreLocation $certPath -ErrorAction Stop

                return @{
                    Success = $true
                    Action = "Imported certificate from $sourcePath to $certPath (Thumbprint: $($cert.Thumbprint))"
                }
            } elseif ($extension -eq ".pfx" -or $extension -eq ".p12") {
                # Import .pfx or .p12 (with private key)
                if (-not $Properties.pfxPassword) {
                    return @{
                        Success = $false
                        Action = "PFX password required for .pfx/.p12 certificate import"
                    }
                }

                $securePassword = ConvertTo-SecureString -String $Properties.pfxPassword -AsPlainText -Force
                $cert = Import-PfxCertificate -FilePath $sourcePath -CertStoreLocation $certPath -Password $securePassword -ErrorAction Stop

                return @{
                    Success = $true
                    Action = "Imported PFX certificate from $sourcePath to $certPath (Thumbprint: $($cert.Thumbprint))"
                }
            } else {
                return @{
                    Success = $false
                    Action = "Unsupported certificate file type: $extension (supported: .cer, .crt, .pfx, .p12)"
                }
            }
        }

        # If no source file, we can't remediate - certificate must be deployed via asset
        return @{
            Success = $false
            Action = "Cannot remediate: No sourceAssetPath specified for certificate installation"
        }

    } catch {
        return @{
            Success = $false
            Action = "Failed to install certificate: $($_.Exception.Message)"
        }
    }
}

function Repair-NetworkAdapterConfiguration {
    param($Properties, $CheckName)

    # Helper function to check if an IP is in a subnet (CIDR notation)
    function Test-IPInSubnet {
        param([string]$IPAddress, [string]$Subnet)
        try {
            $parts = $Subnet -split '/'
            $networkAddress = $parts[0]
            $prefixLength = [int]$parts[1]

            $ipBytes = [System.Net.IPAddress]::Parse($IPAddress).GetAddressBytes()
            $networkBytes = [System.Net.IPAddress]::Parse($networkAddress).GetAddressBytes()

            # Convert to UInt32 for bitwise operations (handle byte order)
            [Array]::Reverse($ipBytes)
            [Array]::Reverse($networkBytes)
            $ipInt = [BitConverter]::ToUInt32($ipBytes, 0)
            $networkInt = [BitConverter]::ToUInt32($networkBytes, 0)

            # Create subnet mask
            $mask = [uint32]::MaxValue -shl (32 - $prefixLength)

            return (($ipInt -band $mask) -eq ($networkInt -band $mask))
        } catch {
            return $false
        }
    }

    try {
        $adapter = $null

        # Mode 1: Identify adapter by current subnet (for DHCP-to-static conversion)
        if ($Properties.identifyByCurrentSubnet) {
            $targetSubnet = $Properties.identifyByCurrentSubnet

            # Get all wired adapters that are up (safety: exclude Wi-Fi)
            $wiredAdapters = Get-NetAdapter | Where-Object {
                $_.Status -eq "Up" -and
                $_.PhysicalMediaType -eq "802.3" -and
                $_.Virtual -eq $false
            }

            foreach ($candidate in $wiredAdapters) {
                $candidateIP = Get-NetIPAddress -InterfaceIndex $candidate.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                    Where-Object { $_.AddressState -eq "Preferred" } | Select-Object -First 1

                if ($candidateIP -and (Test-IPInSubnet -IPAddress $candidateIP.IPAddress -Subnet $targetSubnet)) {
                    # Check excludeSubnets safeguard
                    if ($Properties.excludeSubnets) {
                        $excluded = $false
                        foreach ($excludeSubnet in $Properties.excludeSubnets) {
                            if (Test-IPInSubnet -IPAddress $candidateIP.IPAddress -Subnet $excludeSubnet) {
                                $excluded = $true
                                break
                            }
                        }
                        if ($excluded) { continue }
                    }

                    # Check gateway safeguard: skip if adapter has gateway outside target subnet
                    $candidateConfig = Get-NetIPConfiguration -InterfaceIndex $candidate.ifIndex -ErrorAction SilentlyContinue
                    $candidateGateway = ($candidateConfig.IPv4DefaultGateway | Select-Object -First 1).NextHop
                    if ($candidateGateway -and -not (Test-IPInSubnet -IPAddress $candidateGateway -Subnet $targetSubnet)) {
                        # Gateway points outside target subnet, likely corporate - skip
                        continue
                    }

                    $adapter = $candidate
                    break
                }
            }

            if ($null -eq $adapter) {
                return @{
                    Success = $true
                    Action = "No adapter found in target subnet $targetSubnet - skipping (device may not have private network)"
                }
            }
        }
        # Mode 2: Traditional identification by name, description, or MAC
        else {
            if ($Properties.adapterName) {
                $adapter = Get-NetAdapter | Where-Object { $_.Name -eq $Properties.adapterName } | Select-Object -First 1
            } elseif ($Properties.adapterDescription) {
                $adapter = Get-NetAdapter | Where-Object { $_.InterfaceDescription -like "*$($Properties.adapterDescription)*" } | Select-Object -First 1
            } elseif ($Properties.macAddress) {
                $normalizedMac = $Properties.macAddress -replace '[:-]', ''
                $adapter = Get-NetAdapter | Where-Object { ($_.MacAddress -replace '[:-]', '') -eq $normalizedMac } | Select-Object -First 1
            }

            if ($null -eq $adapter) {
                $searchCriteria = if ($Properties.adapterName) { "name '$($Properties.adapterName)'" }
                                  elseif ($Properties.adapterDescription) { "description '$($Properties.adapterDescription)'" }
                                  else { "MAC '$($Properties.macAddress)'" }
                return @{
                    Success = $false
                    Action = "Network adapter with $searchCriteria not found"
                }
            }
        }

        $adapterIndex = $adapter.ifIndex
        $adapterName = $adapter.Name
        $actions = @()

        # Enable adapter if required
        if ($Properties.ensureEnabled -and $adapter.Status -ne "Up") {
            Enable-NetAdapter -InterfaceIndex $adapterIndex -Confirm:$false -ErrorAction Stop
            $actions += "Enabled adapter '$adapterName'"
            Start-Sleep -Seconds 2  # Give adapter time to initialize
        }

        # Configure static IP if specified (single IP or IP range)
        if ($Properties.staticIPAddress) {
            # Single IP mode - use exact IP on the identified adapter
            $targetIP = $Properties.staticIPAddress
            $prefixLength = if ($Properties.subnetPrefixLength) { $Properties.subnetPrefixLength } else { 24 }

            # Remove existing IP configuration
            $existingIP = Get-NetIPAddress -InterfaceIndex $adapterIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue
            if ($existingIP) {
                Remove-NetIPAddress -InterfaceIndex $adapterIndex -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue
            }

            # Remove existing gateway
            $existingRoute = Get-NetRoute -InterfaceIndex $adapterIndex -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue
            if ($existingRoute) {
                Remove-NetRoute -InterfaceIndex $adapterIndex -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -Confirm:$false -ErrorAction SilentlyContinue
            }

            $newIPParams = @{
                InterfaceIndex = $adapterIndex
                IPAddress = $targetIP
                PrefixLength = $prefixLength
                AddressFamily = "IPv4"
            }

            # Only add gateway if explicitly specified and not empty
            if ($Properties.PSObject.Properties.Name -contains 'defaultGateway' -and -not [string]::IsNullOrEmpty($Properties.defaultGateway)) {
                $newIPParams['DefaultGateway'] = $Properties.defaultGateway
            }

            New-NetIPAddress @newIPParams -ErrorAction Stop | Out-Null
            $actions += "Set static IP on '$adapterName': $targetIP/$prefixLength"

            if ($Properties.defaultGateway) {
                $actions += "Set gateway: $($Properties.defaultGateway)"
            } else {
                $actions += "No gateway configured (isolated network)"
            }
        } elseif ($Properties.staticIPRange) {
            # IP range mode - find adapter with DHCP IP in range and convert to static
            $rangeParts = $Properties.staticIPRange -split '-'
            if ($rangeParts.Count -ne 2) {
                return @{
                    Success = $false
                    Action = "Invalid staticIPRange format: '$($Properties.staticIPRange)' (expected 'startIP-endIP')"
                }
            }

            $startIP = $rangeParts[0].Trim()
            $endIP = $rangeParts[1].Trim()
            $prefixLength = if ($Properties.subnetPrefixLength) { $Properties.subnetPrefixLength } else { 24 }

            try {
                $startBytes = [System.Net.IPAddress]::Parse($startIP).GetAddressBytes()
                $endBytes = [System.Net.IPAddress]::Parse($endIP).GetAddressBytes()
                [Array]::Reverse($startBytes)
                [Array]::Reverse($endBytes)
                $startInt = [BitConverter]::ToUInt32($startBytes, 0)
                $endInt = [BitConverter]::ToUInt32($endBytes, 0)

                # Get all active wired adapters
                $wiredAdapters = Get-NetAdapter | Where-Object {
                    $_.Status -eq "Up" -and
                    $_.PhysicalMediaType -eq "802.3" -and
                    $_.Virtual -eq $false
                }

                # Must have 2+ wired adapters for this check to apply
                if ($wiredAdapters.Count -lt 2) {
                    $actions += "Less than 2 wired adapters - IP range check does not apply"
                } else {
                    # Find the adapter with DHCP IP in the range
                    $targetAdapter = $null
                    $currentDhcpIP = $null

                    foreach ($wiredAdapter in $wiredAdapters) {
                        $wiredIP = Get-NetIPAddress -InterfaceIndex $wiredAdapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                            Where-Object { $_.AddressState -eq "Preferred" } | Select-Object -First 1

                        if ($wiredIP) {
                            $wiredBytes = [System.Net.IPAddress]::Parse($wiredIP.IPAddress).GetAddressBytes()
                            [Array]::Reverse($wiredBytes)
                            $wiredInt = [BitConverter]::ToUInt32($wiredBytes, 0)

                            if ($wiredInt -ge $startInt -and $wiredInt -le $endInt) {
                                $dhcpStatus = (Get-NetIPInterface -InterfaceIndex $wiredAdapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).Dhcp

                                if ($dhcpStatus -eq "Enabled") {
                                    $targetAdapter = $wiredAdapter
                                    $currentDhcpIP = $wiredIP.IPAddress
                                    break
                                }
                            }
                        }
                    }

                    if ($null -eq $targetAdapter) {
                        $actions += "No adapter found with DHCP IP in range - already compliant or not applicable"
                    } else {
                        # Ping sweep to find an available IP
                        $targetIP = $null

                        for ($ipInt = $startInt; $ipInt -le $endInt; $ipInt++) {
                            $ipBytes = [BitConverter]::GetBytes([uint32]$ipInt)
                            [Array]::Reverse($ipBytes)
                            $candidateIP = [System.Net.IPAddress]::new($ipBytes).ToString()

                            # Skip the current DHCP IP (it's ours temporarily)
                            if ($candidateIP -eq $currentDhcpIP) {
                                continue
                            }

                            # Ping the candidate IP
                            $pingResult = Test-Connection -ComputerName $candidateIP -Count 1 -TimeoutSeconds 1 -ErrorAction SilentlyContinue

                            if (-not $pingResult) {
                                # No response - IP is available
                                $targetIP = $candidateIP
                                break
                            }
                        }

                        if ($null -eq $targetIP) {
                            return @{
                                Success = $false
                                Action = "No available IP found in range $($Properties.staticIPRange) - all IPs responded to ping"
                            }
                        }

                        # Apply static IP to the target adapter
                        $targetIndex = $targetAdapter.ifIndex
                        $targetName = $targetAdapter.Name

                        # Remove existing IP configuration
                        Remove-NetIPAddress -InterfaceIndex $targetIndex -AddressFamily IPv4 -Confirm:$false -ErrorAction SilentlyContinue

                        # Remove existing gateway
                        $existingRoute = Get-NetRoute -InterfaceIndex $targetIndex -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue
                        if ($existingRoute) {
                            Remove-NetRoute -InterfaceIndex $targetIndex -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -Confirm:$false -ErrorAction SilentlyContinue
                        }

                        $newIPParams = @{
                            InterfaceIndex = $targetIndex
                            IPAddress = $targetIP
                            PrefixLength = $prefixLength
                            AddressFamily = "IPv4"
                        }

                        # Only add gateway if explicitly specified and not empty
                        if ($Properties.PSObject.Properties.Name -contains 'defaultGateway' -and -not [string]::IsNullOrEmpty($Properties.defaultGateway)) {
                            $newIPParams['DefaultGateway'] = $Properties.defaultGateway
                        }

                        New-NetIPAddress @newIPParams -ErrorAction Stop | Out-Null
                        $actions += "Converted '$targetName' from DHCP ($currentDhcpIP) to static IP '$targetIP' from range '$($Properties.staticIPRange)'"

                        if ($Properties.defaultGateway) {
                            $actions += "Set gateway: $($Properties.defaultGateway)"
                        } else {
                            $actions += "No gateway configured (isolated network)"
                        }

                        # Apply additional settings to the target adapter
                        if ($Properties.PSObject.Properties.Name -contains 'dnsServers') {
                            if ($null -eq $Properties.dnsServers -or $Properties.dnsServers.Count -eq 0) {
                                Set-DnsClientServerAddress -InterfaceIndex $targetIndex -ResetServerAddresses -ErrorAction Stop
                                $actions += "Cleared DNS servers on '$targetName'"
                            } else {
                                Set-DnsClientServerAddress -InterfaceIndex $targetIndex -ServerAddresses $Properties.dnsServers -ErrorAction Stop
                                $actions += "Set DNS on '$targetName': $($Properties.dnsServers -join ', ')"
                            }
                        }

                        if ($Properties.PSObject.Properties.Name -contains 'registerInDns') {
                            Set-DnsClient -InterfaceIndex $targetIndex -RegisterThisConnectionsAddress $Properties.registerInDns -ErrorAction Stop
                            $state = if ($Properties.registerInDns) { "enabled" } else { "disabled" }
                            $actions += "DNS registration $state on '$targetName'"
                        }

                        if ($Properties.networkCategory) {
                            Set-NetConnectionProfile -InterfaceIndex $targetIndex -NetworkCategory $Properties.networkCategory -ErrorAction Stop
                            $actions += "Set network category on '$targetName': $($Properties.networkCategory)"
                        }

                        if ($Properties.interfaceMetric) {
                            Set-NetIPInterface -InterfaceIndex $targetIndex -AddressFamily IPv4 -InterfaceMetric $Properties.interfaceMetric -ErrorAction Stop
                            $actions += "Set interface metric on '$targetName': $($Properties.interfaceMetric)"
                        }
                    }
                }
            } catch {
                return @{
                    Success = $false
                    Action = "Failed to process IP range: $($_.Exception.Message)"
                }
            }
        }

        # Configure DNS servers - support clearing DNS
        if ($Properties.PSObject.Properties.Name -contains 'dnsServers') {
            if ($null -eq $Properties.dnsServers -or $Properties.dnsServers.Count -eq 0) {
                # Clear DNS servers
                Set-DnsClientServerAddress -InterfaceIndex $adapterIndex -ResetServerAddresses -ErrorAction Stop
                $actions += "Cleared DNS servers"
            } else {
                Set-DnsClientServerAddress -InterfaceIndex $adapterIndex -ServerAddresses $Properties.dnsServers -ErrorAction Stop
                $actions += "Set DNS: $($Properties.dnsServers -join ', ')"
            }
        }

        # Configure DNS registration
        if ($Properties.PSObject.Properties.Name -contains 'registerInDns') {
            Set-DnsClient -InterfaceIndex $adapterIndex -RegisterThisConnectionsAddress $Properties.registerInDns -ErrorAction Stop
            $state = if ($Properties.registerInDns) { "enabled" } else { "disabled" }
            $actions += "DNS registration $state"
        }

        # Set network category (Public/Private)
        if ($Properties.networkCategory) {
            Set-NetConnectionProfile -InterfaceIndex $adapterIndex -NetworkCategory $Properties.networkCategory -ErrorAction Stop
            $actions += "Set network category: $($Properties.networkCategory)"
        }

        # Set interface metric
        if ($Properties.interfaceMetric) {
            Set-NetIPInterface -InterfaceIndex $adapterIndex -AddressFamily IPv4 -InterfaceMetric $Properties.interfaceMetric -ErrorAction Stop
            $actions += "Set interface metric: $($Properties.interfaceMetric)"
        }

        if ($actions.Count -eq 0) {
            return @{
                Success = $true
                Action = "Network adapter '$adapterName' already configured correctly"
            }
        }

        return @{
            Success = $true
            Action = $actions -join "; "
        }

    } catch {
        return @{
            Success = $false
            Action = "Failed to configure network adapter: $($_.Exception.Message)"
        }
    }
}

function Repair-EdgeFavorites {
    param($Properties, $CheckName)

    try {
        # Parse source HTML to get expected favorites
        $sourceHtmlPath = Join-Path $AssetsPath $Properties.sourceAssetPath
        if (-not (Test-Path $sourceHtmlPath)) {
            return @{
                Success = $false
                Action = "Source favorites HTML not found: $sourceHtmlPath"
            }
        }

        $htmlContent = Get-Content $sourceHtmlPath -Raw
        $expectedFavorites = @()

        # Parse Netscape Bookmark format - extract <A HREF="url">name</A>
        $regexMatches = [regex]::Matches($htmlContent, '<A\s+HREF="([^"]+)"[^>]*>([^<]+)</A>', 'IgnoreCase')
        foreach ($match in $regexMatches) {
            $expectedFavorites += @{
                Name = $match.Groups[2].Value.Trim()
                Url = $match.Groups[1].Value.Trim()
            }
        }

        if ($expectedFavorites.Count -eq 0) {
            return @{
                Success = $false
                Action = "No favorites found in source HTML file"
            }
        }

        # Sort alphabetically by name
        $expectedFavorites = $expectedFavorites | Sort-Object { $_.Name }

        # Kill Edge processes to release file locks
        $edgeProcesses = Get-Process -Name "msedge" -ErrorAction SilentlyContinue
        if ($edgeProcesses) {
            Stop-Process -Name "msedge" -Force -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
        }

        # Get all user profile paths (including Default for new users)
        $userPaths = @()

        # Add Default profile
        $defaultPath = "C:\Users\Default\AppData\Local\Microsoft\Edge\User Data\Default"
        $userPaths += @{ Name = "Default"; Path = $defaultPath }

        # Add existing user profiles
        $userProfiles = Get-ChildItem "C:\Users" -Directory | Where-Object {
            $_.Name -notin @('Public', 'Default', 'Default User', 'All Users') -and
            -not $_.Name.StartsWith('.')
        }

        foreach ($profile in $userProfiles) {
            $profilePath = Join-Path $profile.FullName "AppData\Local\Microsoft\Edge\User Data\Default"
            $userPaths += @{ Name = $profile.Name; Path = $profilePath }
        }

        $actions = @()
        $failures = @()

        foreach ($userPath in $userPaths) {
            $bookmarksPath = Join-Path $userPath.Path "Bookmarks"
            $edgeProfileDir = $userPath.Path

            try {
                # Ensure Edge profile directory exists
                if (-not (Test-Path $edgeProfileDir)) {
                    New-Item -ItemType Directory -Path $edgeProfileDir -Force | Out-Null
                }

                # Build new bookmarks structure
                $timestamp = [math]::Floor((([datetime]::UtcNow - [datetime]::new(1601, 1, 1)).TotalMicroseconds))

                $bookmarkBarChildren = @()
                foreach ($fav in $expectedFavorites) {
                    $bookmarkBarChildren += @{
                        date_added = $timestamp.ToString()
                        date_last_used = "0"
                        guid = [guid]::NewGuid().ToString()
                        id = ($bookmarkBarChildren.Count + 1).ToString()
                        name = $fav.Name
                        type = "url"
                        url = $fav.Url
                    }
                }

                # Check if Bookmarks file exists and read existing structure
                $bookmarksData = $null
                if (Test-Path $bookmarksPath) {
                    try {
                        $existingContent = Get-Content $bookmarksPath -Raw
                        $bookmarksData = $existingContent | ConvertFrom-Json
                    } catch {
                        # Corrupted file, will create new
                    }
                }

                # Create new or update existing structure
                if ($null -eq $bookmarksData) {
                    $bookmarksData = @{
                        checksum = ""
                        roots = @{
                            bookmark_bar = @{
                                children = $bookmarkBarChildren
                                date_added = $timestamp.ToString()
                                date_last_used = "0"
                                date_modified = $timestamp.ToString()
                                guid = [guid]::NewGuid().ToString()
                                id = "1"
                                name = "Bookmarks bar"
                                type = "folder"
                            }
                            other = @{
                                children = @()
                                date_added = $timestamp.ToString()
                                date_last_used = "0"
                                date_modified = "0"
                                guid = [guid]::NewGuid().ToString()
                                id = "2"
                                name = "Other bookmarks"
                                type = "folder"
                            }
                            synced = @{
                                children = @()
                                date_added = $timestamp.ToString()
                                date_last_used = "0"
                                date_modified = "0"
                                guid = [guid]::NewGuid().ToString()
                                id = "3"
                                name = "Mobile bookmarks"
                                type = "folder"
                            }
                        }
                        version = 1
                    }
                } else {
                    # Update existing bookmark bar
                    $bookmarksData.roots.bookmark_bar.children = $bookmarkBarChildren
                    $bookmarksData.roots.bookmark_bar.date_modified = $timestamp.ToString()
                }

                # Edge calculates checksum but accepts empty - leave it empty
                $bookmarksData.checksum = ""

                # Write the file
                $jsonOutput = $bookmarksData | ConvertTo-Json -Depth 10
                Set-Content -Path $bookmarksPath -Value $jsonOutput -Encoding UTF8 -Force

                $actions += "Updated favorites for '$($userPath.Name)'"

            } catch {
                $failures += "Failed to update '$($userPath.Name)': $($_.Exception.Message)"
            }
        }

        if ($failures.Count -gt 0 -and $actions.Count -eq 0) {
            return @{
                Success = $false
                Action = $failures -join "; "
            }
        }

        $resultAction = $actions -join "; "
        if ($failures.Count -gt 0) {
            $resultAction += " (Failures: $($failures -join '; '))"
        }

        return @{
            Success = $true
            Action = $resultAction
        }

    } catch {
        return @{
            Success = $false
            Action = "Failed to update Edge favorites: $($_.Exception.Message)"
        }
    }
}

# ============================================================================
# EXECUTE REMEDIATIONS
# ============================================================================

foreach ($check in $Config.checks) {
    if (-not $check.enabled) {
        $Results.Summary.Skipped++
        continue
    }

    $actionResult = @{
        CheckId = $check.id
        CheckName = $check.name
        Action = ""
        Success = $false
    }

    try {
        $repairResult = switch ($check.type) {
            "Application" { Repair-Application -Properties $check.properties -CheckName $check.name }
            "FolderEmpty" { Repair-FolderEmpty -Properties $check.properties -CheckName $check.name }
            "ShortcutsAllowList" { Repair-ShortcutsAllowList -Properties $check.properties -CheckName $check.name }
            "FolderExists" { Repair-FolderExists -Properties $check.properties -CheckName $check.name }
            # FolderHasFiles renamed to FolderExists - backward compatibility
            "FolderHasFiles" { Repair-FolderExists -Properties $check.properties -CheckName $check.name }
            "FilesExist" { Repair-FilesExist -Properties $check.properties -CheckName $check.name }
            "ShortcutProperties" { Repair-ShortcutProperties -Properties $check.properties -CheckName $check.name }
            "ShortcutExists" { Repair-ShortcutProperties -Properties $check.properties -CheckName $check.name } # backward compatibility
            "AssignedAccess" { Repair-AssignedAccess -Properties $check.properties -CheckName $check.name }
            "RegistryValue" { Repair-RegistryValue -Properties $check.properties -CheckName $check.name }
            "ScheduledTaskExists" { Repair-ScheduledTaskExists -Properties $check.properties -CheckName $check.name }
            # FileContent is now merged into FilesExist - redirect for backward compatibility
            "FileContent" {
                $mappedProps = @{
                    mode = 'SingleFile'
                    destinationPath = $check.properties.path
                    sourceAssetPath = $check.properties.sourceAssetPath
                }
                Repair-FilesExist -Properties $mappedProps -CheckName $check.name
            }
            "ServiceRunning" { Repair-ServiceRunning -Properties $check.properties -CheckName $check.name }
            "PrinterInstalled" { Repair-PrinterInstalled -Properties $check.properties -CheckName $check.name }
            "DriverInstalled" { Repair-DriverInstalled -Properties $check.properties -CheckName $check.name }
            "WindowsFeature" { Repair-WindowsFeature -Properties $check.properties -CheckName $check.name }
            "FirewallRule" { Repair-FirewallRule -Properties $check.properties -CheckName $check.name }
            "CertificateInstalled" { Repair-CertificateInstalled -Properties $check.properties -CheckName $check.name }
            "NetworkAdapterConfiguration" { Repair-NetworkAdapterConfiguration -Properties $check.properties -CheckName $check.name }
            "EdgeFavorites" { Repair-EdgeFavorites -Properties $check.properties -CheckName $check.name }
            default {
                @{
                    Success = $false
                    Action = "Unknown check type: $($check.type)"
                }
            }
        }

        $actionResult.Success = $repairResult.Success
        $actionResult.Action = $repairResult.Action

        if ($repairResult.Success) {
            $Results.Summary.Successful++
        } else {
            $Results.Summary.Failed++
        }
    } catch {
        $actionResult.Success = $false
        $actionResult.Action = "Remediation failed with error: $($_.Exception.Message)"
        $Results.Summary.Failed++
    }

    $Results.Actions += $actionResult
}

# ============================================================================
# WRITE LOG AND EXIT
# ============================================================================

$logFileName = "Remediation_$(Get-Date -Format 'yyyy-MM-dd_HHmmss').json"
$logFilePath = Join-Path $LogPath $logFileName

try {
    $Results | ConvertTo-Json -Depth 10 | Out-File -FilePath $logFilePath -Encoding UTF8
} catch {
    Write-Warning "Failed to write log file: $($_.Exception.Message)"
}

# Update last remediation time in registry
try {
    $regPath = "HKLM:\SOFTWARE\ConfigurationBlender\$($Config.role)"
    if (-not (Test-Path $regPath)) {
        New-Item -Path $regPath -Force | Out-Null
    }
    Set-ItemProperty -Path $regPath -Name "LastRemediationTime" -Value (Get-Date -Format "yyyy-MM-ddTHH:mm:ss") -Force
} catch {
    # Non-critical, continue
}

# Output for Intune
Write-Output "REMEDIATION COMPLETE"
Write-Output "  Successful: $($Results.Summary.Successful)"
Write-Output "  Failed: $($Results.Summary.Failed)"
Write-Output "  Skipped: $($Results.Summary.Skipped)"
Write-Output "  Log: $logFilePath"

if ($Results.Summary.Failed -gt 0) {
    Write-Output ""
    Write-Output "Failed actions:"
    foreach ($action in ($Results.Actions | Where-Object { -not $_.Success })) {
        Write-Output "  - $($action.CheckName): $($action.Action)"
    }
    exit 1
} else {
    exit 0
}
