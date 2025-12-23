# ============================================================================
# Configuration Blender - Detection Engine
# ============================================================================
# Version: 1.0.0
# Author: Joshua Walderbach
# Description: Generic detection script for Intune Proactive Remediation.
#              Reads Config.json and checks system compliance.
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
    Compliant = $true
    Checks = @()
    Issues = @()
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
# CHECK TYPE HANDLERS
# ============================================================================

function Test-Application {
    param($Properties)

    # Query all three registry uninstall paths
    $registryPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    $installedApps = @()
    foreach ($path in $registryPaths) {
        $apps = Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object {
            $_.DisplayName -like $Properties.displayName
        }
        if ($apps) { $installedApps += $apps }
    }

    # Filter by publisher if specified
    if ($Properties.publisher -and $installedApps.Count -gt 0) {
        $installedApps = $installedApps | Where-Object {
            $_.Publisher -like $Properties.publisher
        }
    }

    $isInstalled = $installedApps.Count -gt 0

    if ($Properties.ensureInstalled) {
        # Application SHOULD be installed
        if (-not $isInstalled) {
            return @{
                Passed = $false
                Issue = "$($Properties.applicationName) is not installed (DisplayName: '$($Properties.displayName)' not found in registry)"
            }
        }

        # Check minimum version if specified
        if ($Properties.minimumVersion -and $installedApps.Count -gt 0) {
            $installedVersion = $installedApps[0].DisplayVersion
            if ($installedVersion) {
                try {
                    if ([version]$installedVersion -lt [version]$Properties.minimumVersion) {
                        return @{
                            Passed = $false
                            Issue = "$($Properties.applicationName) version $installedVersion is below minimum required $($Properties.minimumVersion)"
                        }
                    }
                } catch {
                    # Version comparison failed (non-standard version string), skip version check
                }
            }
        }
    } else {
        # Application should NOT be installed
        if ($isInstalled) {
            $versions = ($installedApps | ForEach-Object { $_.DisplayVersion }) -join ", "
            return @{
                Passed = $false
                Issue = "$($Properties.applicationName) is installed ($($installedApps.Count) installation(s) found, versions: $versions)"
            }
        }
    }

    return @{ Passed = $true; Issue = $null }
}

function Test-ShortcutsAllowList {
    param($Properties)

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
        return @{ Passed = $true; Issue = $null }
    }

    $allUnwanted = @()

    foreach ($checkPath in $pathsToCheck) {
        if (-not (Test-Path $checkPath)) {
            continue
        }

        $allShortcuts = Get-ChildItem -Path $checkPath -Filter "*.lnk" -ErrorAction SilentlyContinue
        $unwanted = $allShortcuts | Where-Object { $Properties.allowedShortcuts -notcontains $_.Name }

        foreach ($item in $unwanted) {
            $allUnwanted += "$($item.Name) (in $checkPath)"
        }
    }

    if ($allUnwanted.Count -gt 0) {
        return @{
            Passed = $false
            Issue = "Found $($allUnwanted.Count) unwanted shortcut(s): $($allUnwanted -join ', ')"
        }
    }

    return @{ Passed = $true; Issue = $null }
}

function Test-FolderExists {
    param($Properties)

    if (-not (Test-Path $Properties.path)) {
        return @{
            Passed = $false
            Issue = "Folder does not exist: $($Properties.path)"
        }
    }

    # If minimumFileCount is 0 or not specified, just check folder exists
    $minCount = if ($Properties.minimumFileCount) { $Properties.minimumFileCount } else { 0 }

    if ($minCount -gt 0) {
        $fileCount = (Get-ChildItem -Path $Properties.path -File -ErrorAction SilentlyContinue).Count
        if ($fileCount -lt $minCount) {
            return @{
                Passed = $false
                Issue = "Folder has $fileCount file(s), minimum required: $minCount"
            }
        }
    }

    return @{ Passed = $true; Issue = $null }
}

function Test-FilesExist {
    param($Properties)

    # Handle SingleFile mode (legacy FileContent behavior)
    if ($Properties.mode -eq 'SingleFile') {
        if (-not (Test-Path $Properties.destinationPath)) {
            return @{
                Passed = $false
                Issue = "File does not exist: $($Properties.destinationPath)"
            }
        }
        return @{ Passed = $true; Issue = $null }
    }

    # MultipleFiles mode (default behavior for backward compatibility)
    if (-not (Test-Path $Properties.destinationPath)) {
        return @{
            Passed = $false
            Issue = "Destination directory does not exist: $($Properties.destinationPath)"
        }
    }

    $missing = @()
    foreach ($file in $Properties.files) {
        $filePath = Join-Path $Properties.destinationPath $file
        if (-not (Test-Path $filePath)) {
            $missing += $file
        }
    }

    if ($missing.Count -gt 0) {
        return @{
            Passed = $false
            Issue = "$($missing.Count) file(s) missing: $($missing -join ', ')"
        }
    }

    return @{ Passed = $true; Issue = $null }
}

function Test-ShortcutProperties {
    param($Properties)

    if (-not (Test-Path $Properties.path)) {
        return @{
            Passed = $false
            Issue = "Shortcut does not exist: $($Properties.path)"
        }
    }

    # Verify shortcut properties
    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($Properties.path)

        $issues = @()
        if ($shortcut.TargetPath -ne $Properties.targetPath) {
            $issues += "Target path mismatch"
        }
        if ($shortcut.Arguments -ne $Properties.arguments) {
            $issues += "Arguments mismatch"
        }

        if ($issues.Count -gt 0) {
            return @{
                Passed = $false
                Issue = "Shortcut exists but: $($issues -join ', ')"
            }
        }
    } catch {
        return @{
            Passed = $false
            Issue = "Failed to verify shortcut properties: $($_.Exception.Message)"
        }
    }

    return @{ Passed = $true; Issue = $null }
}

function Test-AssignedAccess {
    param($Properties)

    # Check if running as SYSTEM
    $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $isSystem = $currentUser.IsSystem

    if (-not $isSystem) {
        return @{
            Passed = $false
            Issue = "CHECK SKIPPED - Must run as SYSTEM user to verify Assigned Access (current user: $($currentUser.Name)). In production, Intune runs as SYSTEM."
        }
    }

    try {
        # NEW: If configXmlPath is specified, verify observable outcomes from registry
        # This approach is more reliable than comparing XML via WMI
        if ($Properties.configXmlPath) {
            $xmlPath = Join-Path $AssetBasePath $Properties.configXmlPath

            if (-not (Test-Path $xmlPath)) {
                return @{
                    Passed = $false
                    Issue = "Expected configuration XML not found: $xmlPath"
                }
            }

            # Parse the expected XML to extract key values
            $expectedXml = Get-Content -Path $xmlPath -Raw
            $xml = [xml]$expectedXml

            # Extract profile ID from XML
            $ns = New-Object System.Xml.XmlNamespaceManager($xml.NameTable)
            $ns.AddNamespace("aa", "http://schemas.microsoft.com/AssignedAccess/2017/config")
            $ns.AddNamespace("rs5", "http://schemas.microsoft.com/AssignedAccess/201810/config")

            $expectedProfileId = $xml.AssignedAccessConfiguration.Profiles.Profile.Id
            if (-not $expectedProfileId) {
                return @{
                    Passed = $false
                    Issue = "Could not extract Profile ID from expected XML"
                }
            }

            # Normalize GUID format (uppercase, with braces)
            $expectedProfileId = $expectedProfileId.ToUpper()
            if (-not $expectedProfileId.StartsWith('{')) {
                $expectedProfileId = "{$expectedProfileId}"
            }

            # 1. Check if kiosk user exists
            $kioskUser = Get-LocalUser -Name 'kioskUser0' -ErrorAction SilentlyContinue
            if (-not $kioskUser) {
                return @{
                    Passed = $false
                    Issue = "Kiosk user 'kioskUser0' does not exist"
                }
            }

            if (-not $kioskUser.Enabled) {
                return @{
                    Passed = $false
                    Issue = "Kiosk user 'kioskUser0' exists but is disabled"
                }
            }

            # 2. Check AutoLogon is configured for kiosk user
            $autoLogonPath = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
            $autoLogon = Get-ItemProperty -Path $autoLogonPath -ErrorAction SilentlyContinue

            if ($autoLogon.AutoAdminLogon -ne '1') {
                return @{
                    Passed = $false
                    Issue = "AutoAdminLogon is not enabled"
                }
            }

            $defaultUser = ($autoLogon.DefaultUserName -replace '\s+$', '')  # Trim trailing spaces
            if ($defaultUser -ne 'kioskUser0') {
                return @{
                    Passed = $false
                    Issue = "AutoLogon is configured for '$defaultUser', expected 'kioskUser0'"
                }
            }

            # 3. Check AssignedAccessConfiguration registry exists with correct profile
            $aaConfigPath = 'HKLM:\SOFTWARE\Microsoft\Windows\AssignedAccessConfiguration'
            if (-not (Test-Path $aaConfigPath)) {
                return @{
                    Passed = $false
                    Issue = "AssignedAccessConfiguration registry key does not exist"
                }
            }

            # Check profile exists in registry
            $profilePath = "HKLM:\SOFTWARE\Microsoft\Windows\AssignedAccessConfiguration\Profiles\$expectedProfileId"
            if (-not (Test-Path $profilePath)) {
                return @{
                    Passed = $false
                    Issue = "Expected profile '$expectedProfileId' not found in AssignedAccessConfiguration registry"
                }
            }

            # 4. Verify kiosk user is mapped to the profile
            $kioskUserSid = $kioskUser.SID.Value
            $configPath = "HKLM:\SOFTWARE\Microsoft\Windows\AssignedAccessConfiguration\Configs\$kioskUserSid"
            if (-not (Test-Path $configPath)) {
                return @{
                    Passed = $false
                    Issue = "Kiosk user SID '$kioskUserSid' not found in AssignedAccessConfiguration Configs"
                }
            }

            $configProps = Get-ItemProperty -Path $configPath -ErrorAction SilentlyContinue
            $mappedProfileId = $configProps.DefaultProfileId
            if ($mappedProfileId) {
                $mappedProfileId = $mappedProfileId.ToUpper()
                if (-not $mappedProfileId.StartsWith('{')) {
                    $mappedProfileId = "{$mappedProfileId}"
                }
            }

            if ($mappedProfileId -ne $expectedProfileId) {
                return @{
                    Passed = $false
                    Issue = "Kiosk user is mapped to profile '$mappedProfileId', expected '$expectedProfileId'"
                }
            }

            # 5. Check profile settings match expected
            $profileProps = Get-ItemProperty -Path $profilePath -ErrorAction SilentlyContinue

            # Check taskbar setting
            $expectedTaskbar = $xml.AssignedAccessConfiguration.Profiles.Profile.Taskbar.ShowTaskbar
            if ($expectedTaskbar -eq 'true' -and $profileProps.TaskbarAllowed -ne 1) {
                return @{
                    Passed = $false
                    Issue = "Taskbar should be visible but TaskbarAllowed is not set to 1"
                }
            }
            if ($expectedTaskbar -eq 'false' -and $profileProps.TaskbarAllowed -ne 0) {
                return @{
                    Passed = $false
                    Issue = "Taskbar should be hidden but TaskbarAllowed is not set to 0"
                }
            }

            # All checks passed
            return @{ Passed = $true; Issue = $null }
        }

        # LEGACY: WMI-based validation (backward compatibility for property-based config)
        $namespaceName = "root\cimv2\mdm\dmmap"
        $className = "MDM_AssignedAccess"

        $obj = Get-CimInstance -Namespace $namespaceName -ClassName $className -ErrorAction Stop

        if ($null -eq $obj) {
            return @{
                Passed = $false
                Issue = "MDM_AssignedAccess CIM instance not found (kiosk mode may not be enabled)"
            }
        }

        if ([string]::IsNullOrEmpty($obj.Configuration)) {
            return @{
                Passed = $false
                Issue = "Assigned Access configuration is empty (kiosk XML not deployed)"
            }
        }

        $expectedProfile = $Properties.profileId
        if ($obj.Configuration -notlike "*$expectedProfile*") {
            return @{
                Passed = $false
                Issue = "Profile ID '$expectedProfile' not found in WMI configuration"
            }
        }

        return @{ Passed = $true; Issue = $null }

    } catch {
        return @{
            Passed = $false
            Issue = "Unexpected error checking Assigned Access: $($_.Exception.Message)"
        }
    }
}

function Test-RegistryValue {
    param($Properties)

    try {
        if (-not (Test-Path $Properties.path)) {
            return @{
                Passed = $false
                Issue = "Registry path does not exist: $($Properties.path)"
            }
        }

        $currentValue = Get-ItemProperty -Path $Properties.path -Name $Properties.name -ErrorAction SilentlyContinue

        if ($null -eq $currentValue) {
            return @{
                Passed = $false
                Issue = "Registry value '$($Properties.name)' does not exist"
            }
        }

        $actualValue = $currentValue.$($Properties.name)

        if ($actualValue -ne $Properties.value) {
            return @{
                Passed = $false
                Issue = "Registry value mismatch: expected '$($Properties.value)', found '$actualValue'"
            }
        }
    } catch {
        return @{
            Passed = $false
            Issue = "Failed to check registry: $($_.Exception.Message)"
        }
    }

    return @{ Passed = $true; Issue = $null }
}

function Test-ScheduledTaskExists {
    param($Properties)

    $taskPath = if ($Properties.taskPath) { $Properties.taskPath } else { "\" }
    $task = Get-ScheduledTask -TaskName $Properties.taskName -TaskPath $taskPath -ErrorAction SilentlyContinue

    if ($null -eq $task) {
        return @{
            Passed = $false
            Issue = "Scheduled task '$($Properties.taskName)' does not exist at path '$taskPath'"
        }
    }

    return @{ Passed = $true; Issue = $null }
}

function Test-ServiceRunning {
    param($Properties)

    try {
        $service = Get-Service -Name $Properties.serviceName -ErrorAction Stop

        # Check startup type
        $serviceWmi = Get-CimInstance -ClassName Win32_Service -Filter "Name='$($Properties.serviceName)'" -ErrorAction Stop
        $currentStartMode = $serviceWmi.StartMode

        # Map startup types
        $expectedStartMode = switch ($Properties.startupType) {
            "Automatic" { "Auto" }
            "Manual" { "Manual" }
            "Disabled" { "Disabled" }
            default { "Auto" }
        }

        if ($currentStartMode -ne $expectedStartMode) {
            return @{
                Passed = $false
                Issue = "Service startup type is '$currentStartMode', expected '$expectedStartMode'"
            }
        }

        # Check if service is running (if required)
        if ($Properties.ensureRunning -and $service.Status -ne "Running") {
            return @{
                Passed = $false
                Issue = "Service is not running (Status: $($service.Status))"
            }
        }

        return @{ Passed = $true; Issue = $null }

    } catch {
        return @{
            Passed = $false
            Issue = "Service '$($Properties.serviceName)' not found or error: $($_.Exception.Message)"
        }
    }
}

function Test-PrinterInstalled {
    param($Properties)

    try {
        $printer = Get-Printer -Name $Properties.printerName -ErrorAction SilentlyContinue

        if ($null -eq $printer) {
            return @{
                Passed = $false
                Issue = "Printer '$($Properties.printerName)' is not installed"
            }
        }

        # Check driver name
        if ($Properties.driverName -and $printer.DriverName -ne $Properties.driverName) {
            return @{
                Passed = $false
                Issue = "Printer driver mismatch: expected '$($Properties.driverName)', found '$($printer.DriverName)'"
            }
        }

        # Check port name
        if ($Properties.portName -and $printer.PortName -ne $Properties.portName) {
            return @{
                Passed = $false
                Issue = "Printer port mismatch: expected '$($Properties.portName)', found '$($printer.PortName)'"
            }
        }

        # Validate port configuration (if portName is specified)
        if ($Properties.portName) {
            $port = Get-PrinterPort -Name $Properties.portName -ErrorAction SilentlyContinue

            if ($null -eq $port) {
                return @{
                    Passed = $false
                    Issue = "Printer port '$($Properties.portName)' does not exist"
                }
            }

            # Check port type (TCP vs LPR)
            if ($Properties.portType) {
                $actualPortType = if ($port.PortMonitor -like "*Standard TCP/IP*") { "TCP" } elseif ($port.PortMonitor -like "*LPR*") { "LPR" } else { "Unknown" }

                if ($actualPortType -ne $Properties.portType) {
                    return @{
                        Passed = $false
                        Issue = "Port type mismatch: expected '$($Properties.portType)', found '$actualPortType'"
                    }
                }
            }

            # Check printer IP address or hostname (for TCP/IP and LPR ports)
            if ($Properties.printerIP) {
                $actualAddress = $port.PrinterHostAddress

                if ($actualAddress -ne $Properties.printerIP) {
                    return @{
                        Passed = $false
                        Issue = "Printer IP/hostname mismatch: expected '$($Properties.printerIP)', found '$actualAddress'"
                    }
                }
            }

            # Check LPR queue name (if LPR port)
            if ($Properties.portType -eq "LPR" -and $Properties.lprQueue) {
                $actualQueue = $port.LprQueueName

                if ($actualQueue -ne $Properties.lprQueue) {
                    return @{
                        Passed = $false
                        Issue = "LPR queue mismatch: expected '$($Properties.lprQueue)', found '$actualQueue'"
                    }
                }
            }
        }

        return @{ Passed = $true; Issue = $null }

    } catch {
        return @{
            Passed = $false
            Issue = "Error checking printer: $($_.Exception.Message)"
        }
    }
}

function Test-DriverInstalled {
    param($Properties)

    try {
        # For printer drivers, check the print subsystem (not just driver store)
        if ($Properties.driverClass -eq "Printer") {
            $printerDriver = Get-PrinterDriver -Name $Properties.driverName -ErrorAction SilentlyContinue

            if ($null -eq $printerDriver) {
                return @{
                    Passed = $false
                    Issue = "Printer driver '$($Properties.driverName)' is not registered with print subsystem"
                }
            }

            # Check version if specified
            if ($Properties.minimumVersion) {
                # Get-PrinterDriver returns MajorVersion and MinorVersion properties
                # We can also check the driver's InfPath and get version from there
                # Or use the driver version string format: Major.Minor.Build.Revision
                try {
                    # Try to get version from the printer driver's associated inf in driver store
                    $driverVersion = $null

                    # Method 1: Check if PrinterDriver has version info
                    if ($printerDriver.DriverVersion) {
                        $driverVersion = $printerDriver.DriverVersion
                    }

                    # Method 2: Use MajorVersion.MinorVersion if available
                    if (-not $driverVersion -and $printerDriver.MajorVersion) {
                        $driverVersion = "$($printerDriver.MajorVersion).$($printerDriver.MinorVersion).0.0"
                    }

                    # Method 3: Query the inf file from driver store
                    if (-not $driverVersion -and $printerDriver.InfPath) {
                        $storeDriver = Get-WindowsDriver -Online -ErrorAction SilentlyContinue | Where-Object {
                            $_.OriginalFileName -eq $printerDriver.InfPath -or $_.Driver -eq (Split-Path $printerDriver.InfPath -Leaf)
                        } | Select-Object -First 1

                        if ($storeDriver) {
                            $driverVersion = $storeDriver.Version
                        }
                    }

                    if ($driverVersion) {
                        $installedVersion = [version]$driverVersion
                        $requiredVersion = [version]$Properties.minimumVersion

                        if ($installedVersion -lt $requiredVersion) {
                            return @{
                                Passed = $false
                                Issue = "Printer driver version $driverVersion is older than required $($Properties.minimumVersion)"
                            }
                        }
                    }
                } catch {
                    # Version comparison failed, but driver exists - pass with warning
                }
            }

            return @{ Passed = $true; Issue = $null }
        }

        # For non-printer drivers, search driver store by name
        $driver = Get-WindowsDriver -Online | Where-Object {
            $_.OriginalFileName -eq $Properties.driverName -or $_.Driver -eq $Properties.driverName
        } | Select-Object -First 1

        if ($null -eq $driver) {
            return @{
                Passed = $false
                Issue = "Driver '$($Properties.driverName)' is not installed"
            }
        }

        # Optionally check driver class
        if ($Properties.driverClass -and $driver.ClassName -ne $Properties.driverClass) {
            return @{
                Passed = $false
                Issue = "Driver class mismatch: expected '$($Properties.driverClass)', found '$($driver.ClassName)'"
            }
        }

        # Optionally check driver version
        if ($Properties.minimumVersion) {
            try {
                $installedVersion = [version]$driver.Version
                $requiredVersion = [version]$Properties.minimumVersion

                if ($installedVersion -lt $requiredVersion) {
                    return @{
                        Passed = $false
                        Issue = "Driver version $($driver.Version) is older than required $($Properties.minimumVersion)"
                    }
                }
            } catch {
                return @{
                    Passed = $false
                    Issue = "Unable to compare driver versions: $($_.Exception.Message)"
                }
            }
        }

        return @{ Passed = $true; Issue = $null }

    } catch {
        return @{
            Passed = $false
            Issue = "Error checking driver: $($_.Exception.Message)"
        }
    }
}

function Test-WindowsFeature {
    param($Properties)

    try {
        $feature = Get-WindowsOptionalFeature -Online -FeatureName $Properties.featureName -ErrorAction Stop

        if ($null -eq $feature) {
            return @{
                Passed = $false
                Issue = "Windows feature '$($Properties.featureName)' not found"
            }
        }

        $currentState = $feature.State
        $desiredState = $Properties.state

        if ($currentState -ne $desiredState) {
            return @{
                Passed = $false
                Issue = "Feature state is '$currentState', expected '$desiredState'"
            }
        }

        return @{ Passed = $true; Issue = $null }

    } catch {
        return @{
            Passed = $false
            Issue = "Error checking Windows feature: $($_.Exception.Message)"
        }
    }
}

function Test-FirewallRule {
    param($Properties)

    try {
        $rule = Get-NetFirewallRule -Name $Properties.ruleName -ErrorAction SilentlyContinue

        if ($null -eq $rule) {
            return @{
                Passed = $false
                Issue = "Firewall rule '$($Properties.ruleName)' does not exist"
            }
        }

        # Check rule properties
        $issues = @()

        if ($rule.DisplayName -ne $Properties.displayName) {
            $issues += "Display name mismatch"
        }

        if ($rule.Direction -ne $Properties.direction) {
            $issues += "Direction mismatch (expected: $($Properties.direction), found: $($rule.Direction))"
        }

        if ($rule.Action -ne $Properties.action) {
            $issues += "Action mismatch (expected: $($Properties.action), found: $($rule.Action))"
        }

        if ($Properties.enabled -and $rule.Enabled -ne "True") {
            $issues += "Rule is disabled"
        }

        if ($issues.Count -gt 0) {
            return @{
                Passed = $false
                Issue = "Firewall rule exists but: $($issues -join ', ')"
            }
        }

        return @{ Passed = $true; Issue = $null }

    } catch {
        return @{
            Passed = $false
            Issue = "Error checking firewall rule: $($_.Exception.Message)"
        }
    }
}

function Test-CertificateInstalled {
    param($Properties)

    try {
        # Determine certificate store location
        $storeLocation = if ($Properties.storeLocation) { $Properties.storeLocation } else { "LocalMachine" }
        $storeName = if ($Properties.storeName) { $Properties.storeName } else { "My" }
        $certPath = "Cert:\$storeLocation\$storeName"

        # Search for certificate by thumbprint or subject
        $cert = $null
        if ($Properties.thumbprint) {
            $cert = Get-ChildItem -Path $certPath -ErrorAction SilentlyContinue |
                    Where-Object { $_.Thumbprint -eq $Properties.thumbprint }
        } elseif ($Properties.subject) {
            $cert = Get-ChildItem -Path $certPath -ErrorAction SilentlyContinue |
                    Where-Object { $_.Subject -like "*$($Properties.subject)*" }
        } else {
            return @{
                Passed = $false
                Issue = "Either thumbprint or subject must be specified"
            }
        }

        if ($null -eq $cert) {
            $searchCriteria = if ($Properties.thumbprint) { "thumbprint '$($Properties.thumbprint)'" } else { "subject '$($Properties.subject)'" }
            return @{
                Passed = $false
                Issue = "Certificate with $searchCriteria not found in $certPath"
            }
        }

        # If multiple certs match subject, use the first one
        if ($cert -is [array]) {
            $cert = $cert[0]
        }

        # Check expiration if minimumDaysValid is specified
        if ($Properties.minimumDaysValid) {
            $daysUntilExpiry = ($cert.NotAfter - (Get-Date)).Days

            if ($daysUntilExpiry -lt 0) {
                return @{
                    Passed = $false
                    Issue = "Certificate expired on $($cert.NotAfter.ToString('yyyy-MM-dd'))"
                }
            }

            if ($daysUntilExpiry -lt $Properties.minimumDaysValid) {
                return @{
                    Passed = $false
                    Issue = "Certificate expires in $daysUntilExpiry days (minimum required: $($Properties.minimumDaysValid)). Expires on $($cert.NotAfter.ToString('yyyy-MM-dd'))"
                }
            }
        }

        # Check if certificate is not yet valid
        if ($cert.NotBefore -gt (Get-Date)) {
            return @{
                Passed = $false
                Issue = "Certificate is not yet valid. Valid from $($cert.NotBefore.ToString('yyyy-MM-dd'))"
            }
        }

        # Verify issuer if specified
        if ($Properties.issuer) {
            if ($cert.Issuer -notlike "*$($Properties.issuer)*") {
                return @{
                    Passed = $false
                    Issue = "Certificate issuer mismatch: expected '$($Properties.issuer)', found '$($cert.Issuer)'"
                }
            }
        }

        return @{ Passed = $true; Issue = $null }

    } catch {
        return @{
            Passed = $false
            Issue = "Error checking certificate: $($_.Exception.Message)"
        }
    }
}

function Test-NetworkAdapterConfiguration {
    param($Properties)

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
        $adapterIP = $null

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
                    $adapterIP = $candidateIP
                    break
                }
            }

            if ($null -eq $adapter) {
                return @{
                    Passed = $true
                    Issue = $null
                    # No adapter found in target subnet - this is OK, device may not have private network
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
                    Passed = $false
                    Issue = "Network adapter with $searchCriteria not found"
                }
            }
        }

        $issues = @()
        $adapterIndex = $adapter.ifIndex

        # Check if adapter is enabled
        if ($Properties.ensureEnabled -and $adapter.Status -ne "Up") {
            $issues += "Adapter is not enabled (Status: $($adapter.Status))"
        }

        # Get current IP configuration
        $ipConfig = Get-NetIPConfiguration -InterfaceIndex $adapterIndex -ErrorAction SilentlyContinue
        if ($null -eq $adapterIP) {
            $adapterIP = Get-NetIPAddress -InterfaceIndex $adapterIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1
        }

        # Check static IP configuration - supports both single IP and IP range
        if ($Properties.staticIPAddress) {
            # Single IP mode - exact match required with DHCP disabled
            if ($null -eq $adapterIP) {
                $issues += "No IPv4 address configured"
            } else {
                $dhcpStatus = (Get-NetIPInterface -InterfaceIndex $adapterIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).Dhcp
                if ($dhcpStatus -eq "Enabled") {
                    $issues += "DHCP is enabled but static IP is required"
                } elseif ($adapterIP.IPAddress -ne $Properties.staticIPAddress) {
                    $issues += "IP address mismatch: expected '$($Properties.staticIPAddress)', found '$($adapterIP.IPAddress)'"
                }
            }
        } elseif ($Properties.staticIPRange) {
            # IP range mode - different logic:
            # Check if device has 2+ wired adapters AND one has DHCP IP in the range
            # If so, that adapter needs to be converted to static

            $rangeParts = $Properties.staticIPRange -split '-'
            if ($rangeParts.Count -ne 2) {
                $issues += "Invalid staticIPRange format: '$($Properties.staticIPRange)' (expected 'startIP-endIP')"
            } else {
                $startIP = $rangeParts[0].Trim()
                $endIP = $rangeParts[1].Trim()

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

                    # Check: Does device have 2+ active wired connections?
                    if ($wiredAdapters.Count -lt 2) {
                        # Less than 2 wired adapters - this check doesn't apply, pass
                        # (No private network scenario)
                    } else {
                        # Check each adapter for DHCP IP in the range
                        $foundDhcpInRange = $false
                        $foundStaticInRange = $false

                        foreach ($wiredAdapter in $wiredAdapters) {
                            $wiredIP = Get-NetIPAddress -InterfaceIndex $wiredAdapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
                                Where-Object { $_.AddressState -eq "Preferred" } | Select-Object -First 1

                            if ($wiredIP) {
                                # Check if IP is in range
                                $wiredBytes = [System.Net.IPAddress]::Parse($wiredIP.IPAddress).GetAddressBytes()
                                [Array]::Reverse($wiredBytes)
                                $wiredInt = [BitConverter]::ToUInt32($wiredBytes, 0)

                                if ($wiredInt -ge $startInt -and $wiredInt -le $endInt) {
                                    # IP is in range - check if DHCP or static
                                    $dhcpStatus = (Get-NetIPInterface -InterfaceIndex $wiredAdapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).Dhcp

                                    if ($dhcpStatus -eq "Enabled") {
                                        $foundDhcpInRange = $true
                                        $issues += "Adapter '$($wiredAdapter.Name)' has DHCP IP '$($wiredIP.IPAddress)' in range '$($Properties.staticIPRange)' - needs static assignment"
                                    } else {
                                        $foundStaticInRange = $true
                                    }
                                }
                            }
                        }

                        # If we found a static IP in range and no DHCP in range, we're compliant
                        # If we found DHCP in range, we already added the issue above
                    }
                } catch {
                    $issues += "Failed to evaluate IP range: $($_.Exception.Message)"
                }
            }
        }

        # Check subnet mask / prefix length
        if ($Properties.subnetPrefixLength -and $adapterIP) {
            if ($adapterIP.PrefixLength -ne $Properties.subnetPrefixLength) {
                $issues += "Subnet prefix length mismatch: expected '$($Properties.subnetPrefixLength)', found '$($adapterIP.PrefixLength)'"
            }
        }

        # Check default gateway - support explicit "none" via empty string or null
        if ($Properties.PSObject.Properties.Name -contains 'defaultGateway') {
            $currentGateway = ($ipConfig.IPv4DefaultGateway | Select-Object -First 1).NextHop
            $expectedGateway = $Properties.defaultGateway

            if ([string]::IsNullOrEmpty($expectedGateway)) {
                # No gateway should be set
                if ($currentGateway) {
                    $issues += "Gateway should not be configured, found '$currentGateway'"
                }
            } elseif ($currentGateway -ne $expectedGateway) {
                $issues += "Default gateway mismatch: expected '$expectedGateway', found '$currentGateway'"
            }
        }

        # Check DNS servers - support explicit "none" via empty array
        if ($Properties.PSObject.Properties.Name -contains 'dnsServers') {
            $currentDns = (Get-DnsClientServerAddress -InterfaceIndex $adapterIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses
            $expectedDns = $Properties.dnsServers

            if ($null -eq $expectedDns -or $expectedDns.Count -eq 0) {
                # No DNS servers should be set
                if ($currentDns -and $currentDns.Count -gt 0) {
                    $issues += "DNS servers should not be configured, found '$($currentDns -join ', ')'"
                }
            } elseif ($null -eq $currentDns -or $currentDns.Count -eq 0) {
                $issues += "No DNS servers configured"
            } else {
                $dnsMatch = $true
                for ($i = 0; $i -lt $expectedDns.Count; $i++) {
                    if ($i -ge $currentDns.Count -or $currentDns[$i] -ne $expectedDns[$i]) {
                        $dnsMatch = $false
                        break
                    }
                }
                if (-not $dnsMatch) {
                    $issues += "DNS servers mismatch: expected '$($expectedDns -join ', ')', found '$($currentDns -join ', ')'"
                }
            }
        }

        # Check network profile (Public/Private/DomainAuthenticated)
        if ($Properties.networkCategory) {
            $connectionProfile = Get-NetConnectionProfile -InterfaceIndex $adapterIndex -ErrorAction SilentlyContinue
            if ($connectionProfile -and $connectionProfile.NetworkCategory -ne $Properties.networkCategory) {
                $issues += "Network category mismatch: expected '$($Properties.networkCategory)', found '$($connectionProfile.NetworkCategory)'"
            }
        }

        # Check metric
        if ($Properties.interfaceMetric) {
            $currentMetric = (Get-NetIPInterface -InterfaceIndex $adapterIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).InterfaceMetric
            if ($currentMetric -ne $Properties.interfaceMetric) {
                $issues += "Interface metric mismatch: expected '$($Properties.interfaceMetric)', found '$currentMetric'"
            }
        }

        # Check DNS registration
        if ($Properties.PSObject.Properties.Name -contains 'registerInDns') {
            $dnsClient = Get-DnsClient -InterfaceIndex $adapterIndex -ErrorAction SilentlyContinue
            $expectedRegister = $Properties.registerInDns
            if ($dnsClient -and $dnsClient.RegisterThisConnectionsAddress -ne $expectedRegister) {
                $state = if ($expectedRegister) { "enabled" } else { "disabled" }
                $issues += "DNS registration should be $state"
            }
        }

        if ($issues.Count -gt 0) {
            return @{
                Passed = $false
                Issue = $issues -join "; "
            }
        }

        return @{ Passed = $true; Issue = $null }

    } catch {
        return @{
            Passed = $false
            Issue = "Error checking network adapter: $($_.Exception.Message)"
        }
    }
}

function Test-EdgeFavorites {
    param($Properties)

    try {
        # Parse source HTML to get expected favorites
        $sourceHtmlPath = Join-Path $AssetBasePath $Properties.sourceAssetPath
        if (-not (Test-Path $sourceHtmlPath)) {
            return @{
                Passed = $false
                Issue = "Source favorites HTML not found: $sourceHtmlPath"
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
                Passed = $false
                Issue = "No favorites found in source HTML file"
            }
        }

        # Sort alphabetically by name
        $expectedFavorites = $expectedFavorites | Sort-Object { $_.Name }

        # Get all user profile paths
        $userProfiles = Get-ChildItem "C:\Users" -Directory | Where-Object {
            $_.Name -notin @('Public', 'Default', 'Default User', 'All Users') -and
            -not $_.Name.StartsWith('.')
        }

        $issues = @()

        foreach ($profile in $userProfiles) {
            $bookmarksPath = Join-Path $profile.FullName "AppData\Local\Microsoft\Edge\User Data\Default\Bookmarks"

            if (-not (Test-Path $bookmarksPath)) {
                # No Edge profile yet - this is OK, remediation will create it
                continue
            }

            try {
                $bookmarksJson = Get-Content $bookmarksPath -Raw | ConvertFrom-Json
                $bookmarkBar = $bookmarksJson.roots.bookmark_bar.children

                # Get current favorites (only url type, not folders)
                $currentFavorites = @()
                if ($bookmarkBar) {
                    foreach ($item in $bookmarkBar) {
                        if ($item.type -eq "url") {
                            $currentFavorites += @{
                                Name = $item.name
                                Url = $item.url
                            }
                        }
                    }
                }

                # Sort current favorites alphabetically for comparison
                $currentFavorites = $currentFavorites | Sort-Object { $_.Name }

                # Compare count
                if ($currentFavorites.Count -ne $expectedFavorites.Count) {
                    $issues += "User '$($profile.Name)': Expected $($expectedFavorites.Count) favorites, found $($currentFavorites.Count)"
                    continue
                }

                # Compare each favorite
                for ($i = 0; $i -lt $expectedFavorites.Count; $i++) {
                    $expected = $expectedFavorites[$i]
                    $current = $currentFavorites[$i]

                    if ($current.Name -ne $expected.Name) {
                        $issues += "User '$($profile.Name)': Favorite name mismatch at position $($i+1) - expected '$($expected.Name)', found '$($current.Name)'"
                    } elseif ($current.Url -ne $expected.Url) {
                        $issues += "User '$($profile.Name)': URL mismatch for '$($expected.Name)' - expected '$($expected.Url)', found '$($current.Url)'"
                    }
                }
            } catch {
                $issues += "User '$($profile.Name)': Failed to read bookmarks - $($_.Exception.Message)"
            }
        }

        if ($issues.Count -gt 0) {
            return @{
                Passed = $false
                Issue = $issues -join "; "
            }
        }

        return @{ Passed = $true; Issue = $null }

    } catch {
        return @{
            Passed = $false
            Issue = "Error checking Edge favorites: $($_.Exception.Message)"
        }
    }
}

# ============================================================================
# EXECUTE CHECKS
# ============================================================================

foreach ($check in $Config.checks) {
    if (-not $check.enabled) {
        continue
    }

    $checkResult = @{
        Id = $check.id
        Name = $check.name
        Type = $check.type
        Passed = $false
        Issue = $null
    }

    try {
        $testResult = switch ($check.type) {
            "Application" { Test-Application -Properties $check.properties }
            "ShortcutsAllowList" { Test-ShortcutsAllowList -Properties $check.properties }
            "FolderExists" { Test-FolderExists -Properties $check.properties }
            # FolderHasFiles renamed to FolderExists - backward compatibility
            "FolderHasFiles" { Test-FolderExists -Properties $check.properties }
            "FilesExist" { Test-FilesExist -Properties $check.properties }
            "ShortcutProperties" { Test-ShortcutProperties -Properties $check.properties }
            "ShortcutExists" { Test-ShortcutProperties -Properties $check.properties } # backward compatibility
            "AssignedAccess" { Test-AssignedAccess -Properties $check.properties }
            "RegistryValue" { Test-RegistryValue -Properties $check.properties }
            "ScheduledTaskExists" { Test-ScheduledTaskExists -Properties $check.properties }
            # FileContent is now merged into FilesExist - redirect for backward compatibility
            "FileContent" {
                $mappedProps = @{
                    mode = 'SingleFile'
                    destinationPath = $check.properties.path
                    sourceAssetPath = $check.properties.sourceAssetPath
                }
                Test-FilesExist -Properties $mappedProps
            }
            "ServiceRunning" { Test-ServiceRunning -Properties $check.properties }
            "PrinterInstalled" { Test-PrinterInstalled -Properties $check.properties }
            "DriverInstalled" { Test-DriverInstalled -Properties $check.properties }
            "WindowsFeature" { Test-WindowsFeature -Properties $check.properties }
            "FirewallRule" { Test-FirewallRule -Properties $check.properties }
            "CertificateInstalled" { Test-CertificateInstalled -Properties $check.properties }
            "NetworkAdapterConfiguration" { Test-NetworkAdapterConfiguration -Properties $check.properties }
            "EdgeFavorites" { Test-EdgeFavorites -Properties $check.properties }
            default {
                @{
                    Passed = $false
                    Issue = "Unknown check type: $($check.type)"
                }
            }
        }

        $checkResult.Passed = $testResult.Passed
        $checkResult.Issue = $testResult.Issue

        if (-not $testResult.Passed) {
            $Results.Compliant = $false
            # Ensure we have a meaningful error message
            $issueText = if ([string]::IsNullOrWhiteSpace($testResult.Issue)) {
                "Check failed (no details provided)"
            } else {
                $testResult.Issue
            }
            $Results.Issues += "$($check.name): $issueText"
        }
    } catch {
        $checkResult.Passed = $false
        $checkResult.Issue = "Check failed with error: $($_.Exception.Message)"
        $Results.Compliant = $false
        $Results.Issues += "$($check.name): $($checkResult.Issue)"
    }

    $Results.Checks += $checkResult
}

# ============================================================================
# WRITE LOG AND EXIT
# ============================================================================

$logFileName = "Detection_$(Get-Date -Format 'yyyy-MM-dd_HHmmss').json"
$logFilePath = Join-Path $LogPath $logFileName

try {
    $Results | ConvertTo-Json -Depth 10 | Out-File -FilePath $logFilePath -Encoding UTF8
} catch {
    Write-Warning "Failed to write log file: $($_.Exception.Message)"
}

# Output for Intune
if ($Results.Compliant) {
    Write-Output "COMPLIANT - All $($Results.Checks.Count) checks passed. Config version: $($Results.ConfigVersion)"
    exit 0
} else {
    $passedChecks = @($Results.Checks | Where-Object { $_.Passed -eq $true })
    $failedChecks = @($Results.Checks | Where-Object { $_.Passed -eq $false })
    $passedCount = $passedChecks.Count
    $failedCount = $failedChecks.Count
    $totalCount = $Results.Checks.Count

    Write-Output ""
    Write-Output "========================================="
    Write-Output "NON-COMPLIANT"
    Write-Output "========================================="
    Write-Output "Config: $($Results.Role) v$($Results.ConfigVersion)"
    Write-Output "Total Checks: $totalCount"
    Write-Output "Passed: $passedCount"
    Write-Output "Failed: $failedCount"
    Write-Output ""
    Write-Output "Failed Checks:"
    Write-Output "-----------------------------------------"

    foreach ($issue in $Results.Issues) {
        Write-Output "  - $issue"
    }

    Write-Output ""
    Write-Output "Detailed Results:"
    Write-Output "-----------------------------------------"
    foreach ($check in $Results.Checks) {
        $status = if ($check.Passed) { "[PASS]" } else { "[FAIL]" }
        Write-Output "$status $($check.Name)"
        if (-not $check.Passed) {
            Write-Output "       $($check.Issue)"
        }
    }
    Write-Output "========================================="
    Write-Output ""

    exit 1
}
