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

    $found = @()
    foreach ($searchPath in $Properties.searchPaths) {
        $items = Get-ChildItem $searchPath -ErrorAction SilentlyContinue
        if ($items) { $found += $items }
    }

    $isInstalled = $found.Count -gt 0

    if ($Properties.ensureInstalled) {
        # Application SHOULD be installed
        if (-not $isInstalled) {
            return @{
                Passed = $false
                Issue = "$($Properties.applicationName) is not installed"
            }
        }

        # Check minimum version if specified
        if ($Properties.minimumVersion -and $found.Count -gt 0) {
            try {
                $installedVersion = $found[0].VersionInfo.FileVersion
                if ($installedVersion -and [version]$installedVersion -lt [version]$Properties.minimumVersion) {
                    return @{
                        Passed = $false
                        Issue = "$($Properties.applicationName) version $installedVersion is below minimum required $($Properties.minimumVersion)"
                    }
                }
            } catch {
                # Version comparison failed, assume it's okay
            }
        }
    } else {
        # Application should NOT be installed
        if ($isInstalled) {
            return @{
                Passed = $false
                Issue = "$($Properties.applicationName) is installed ($($found.Count) installation(s) found)"
            }
        }
    }

    return @{ Passed = $true; Issue = $null }
}

function Test-FolderEmpty {
    param($Properties)

    $totalItems = 0
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
            $totalItems += $items.Count
        }
    }

    if ($totalItems -gt 0) {
        return @{
            Passed = $false
            Issue = "Desktop folders contain $totalItems item(s)"
        }
    }

    return @{ Passed = $true; Issue = $null }
}

function Test-ShortcutsAllowList {
    param($Properties)

    if (-not (Test-Path $Properties.path)) {
        return @{ Passed = $true; Issue = $null }
    }

    $allShortcuts = Get-ChildItem -Path $Properties.path -Filter "*.lnk" -ErrorAction SilentlyContinue
    $unwanted = $allShortcuts | Where-Object { $Properties.allowedShortcuts -notcontains $_.Name }

    if ($unwanted.Count -gt 0) {
        return @{
            Passed = $false
            Issue = "Found $($unwanted.Count) unwanted shortcut(s): $($unwanted.Name -join ', ')"
        }
    }

    return @{ Passed = $true; Issue = $null }
}

function Test-FolderHasFiles {
    param($Properties)

    if (-not (Test-Path $Properties.path)) {
        return @{
            Passed = $false
            Issue = "Directory does not exist: $($Properties.path)"
        }
    }

    $fileCount = (Get-ChildItem -Path $Properties.path -File -ErrorAction SilentlyContinue).Count

    if ($fileCount -lt $Properties.minimumFileCount) {
        return @{
            Passed = $false
            Issue = "Directory has $fileCount file(s), minimum required: $($Properties.minimumFileCount)"
        }
    }

    return @{ Passed = $true; Issue = $null }
}

function Test-FilesExist {
    param($Properties)

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

function Test-ShortcutExists {
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
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $isSystem = $currentUser.IsSystem

    if (-not $isSystem) {
        return @{
            Passed = $false
            Issue = "CHECK SKIPPED - Must run as SYSTEM user to verify Assigned Access (current user: $($currentUser.Name)). In production, Intune runs as SYSTEM."
        }
    }

    try {
        $namespaceName = "root\cimv2\mdm\dmmap"
        $className = "MDM_AssignedAccess"

        # Try to get the CIM instance
        $obj = Get-CimInstance -Namespace $namespaceName -ClassName $className -ErrorAction Stop

        # Check if instance was found
        if ($null -eq $obj) {
            return @{
                Passed = $false
                Issue = "MDM_AssignedAccess CIM instance not found (kiosk mode may not be enabled)"
            }
        }

        # Check if configuration exists
        if ([string]::IsNullOrEmpty($obj.Configuration)) {
            return @{
                Passed = $false
                Issue = "Assigned Access configuration is empty (kiosk XML not deployed)"
            }
        }

        # Check if profile ID matches
        $expectedProfile = $Properties.profileId
        if ($obj.Configuration -notlike "*$expectedProfile*") {
            # Get a snippet of the actual configuration for debugging
            $configSnippet = if ($obj.Configuration.Length -gt 100) {
                $obj.Configuration.Substring(0, 100) + "..."
            } else {
                $obj.Configuration
            }

            return @{
                Passed = $false
                Issue = "Profile ID '$expectedProfile' not found in configuration. Config starts with: $configSnippet"
            }
        }

        # All checks passed
        return @{ Passed = $true; Issue = $null }

    } catch [Microsoft.Management.Infrastructure.CimException] {
        return @{
            Passed = $false
            Issue = "CIM Error accessing MDM_AssignedAccess: $($_.Exception.Message)"
        }
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

    $task = Get-ScheduledTask -TaskName $Properties.taskName -ErrorAction SilentlyContinue

    if ($null -eq $task) {
        return @{
            Passed = $false
            Issue = "Scheduled task '$($Properties.taskName)' does not exist"
        }
    }

    return @{ Passed = $true; Issue = $null }
}

function Test-FileContent {
    param($Properties)

    if (-not (Test-Path $Properties.path)) {
        return @{
            Passed = $false
            Issue = "File does not exist: $($Properties.path)"
        }
    }

    # For file content checks, we just verify the file exists
    # More advanced: compare hash with source asset
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
        # Search for driver by name
        $driver = Get-WindowsDriver -Online | Where-Object {
            $_.Driver -like "*$($Properties.driverName)*"
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

    try {
        # Find the adapter by name or description
        $adapter = $null
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

        $issues = @()
        $adapterIndex = $adapter.ifIndex

        # Check if adapter is enabled
        if ($Properties.ensureEnabled -and $adapter.Status -ne "Up") {
            $issues += "Adapter is not enabled (Status: $($adapter.Status))"
        }

        # Get current IP configuration
        $ipConfig = Get-NetIPConfiguration -InterfaceIndex $adapterIndex -ErrorAction SilentlyContinue
        $ipAddress = Get-NetIPAddress -InterfaceIndex $adapterIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1

        # Check static IP configuration
        if ($Properties.staticIPAddress) {
            if ($null -eq $ipAddress) {
                $issues += "No IPv4 address configured"
            } elseif ($ipAddress.IPAddress -ne $Properties.staticIPAddress) {
                $issues += "IP address mismatch: expected '$($Properties.staticIPAddress)', found '$($ipAddress.IPAddress)'"
            }

            # Check if DHCP is disabled (should be for static IP)
            $dhcpStatus = (Get-NetIPInterface -InterfaceIndex $adapterIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).Dhcp
            if ($dhcpStatus -eq "Enabled") {
                $issues += "DHCP is enabled but static IP is configured"
            }
        }

        # Check subnet mask / prefix length
        if ($Properties.subnetPrefixLength -and $ipAddress) {
            if ($ipAddress.PrefixLength -ne $Properties.subnetPrefixLength) {
                $issues += "Subnet prefix length mismatch: expected '$($Properties.subnetPrefixLength)', found '$($ipAddress.PrefixLength)'"
            }
        }

        # Check default gateway
        if ($Properties.defaultGateway) {
            $currentGateway = ($ipConfig.IPv4DefaultGateway | Select-Object -First 1).NextHop
            if ($currentGateway -ne $Properties.defaultGateway) {
                $issues += "Default gateway mismatch: expected '$($Properties.defaultGateway)', found '$currentGateway'"
            }
        }

        # Check DNS servers
        if ($Properties.dnsServers -and $Properties.dnsServers.Count -gt 0) {
            $currentDns = (Get-DnsClientServerAddress -InterfaceIndex $adapterIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue).ServerAddresses
            $expectedDns = $Properties.dnsServers

            if ($null -eq $currentDns -or $currentDns.Count -eq 0) {
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
            "FolderEmpty" { Test-FolderEmpty -Properties $check.properties }
            "ShortcutsAllowList" { Test-ShortcutsAllowList -Properties $check.properties }
            "FolderHasFiles" { Test-FolderHasFiles -Properties $check.properties }
            "FilesExist" { Test-FilesExist -Properties $check.properties }
            "ShortcutExists" { Test-ShortcutExists -Properties $check.properties }
            "AssignedAccess" { Test-AssignedAccess -Properties $check.properties }
            "RegistryValue" { Test-RegistryValue -Properties $check.properties }
            "ScheduledTaskExists" { Test-ScheduledTaskExists -Properties $check.properties }
            "FileContent" { Test-FileContent -Properties $check.properties }
            "ServiceRunning" { Test-ServiceRunning -Properties $check.properties }
            "PrinterInstalled" { Test-PrinterInstalled -Properties $check.properties }
            "DriverInstalled" { Test-DriverInstalled -Properties $check.properties }
            "WindowsFeature" { Test-WindowsFeature -Properties $check.properties }
            "FirewallRule" { Test-FirewallRule -Properties $check.properties }
            "CertificateInstalled" { Test-CertificateInstalled -Properties $check.properties }
            "NetworkAdapterConfiguration" { Test-NetworkAdapterConfiguration -Properties $check.properties }
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
