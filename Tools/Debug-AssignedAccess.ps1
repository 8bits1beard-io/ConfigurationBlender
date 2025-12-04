<#
.SYNOPSIS
    Debug script to investigate Assigned Access configuration on Windows 11
.DESCRIPTION
    Collects information about Assigned Access from multiple sources to help
    diagnose configuration detection issues.
.NOTES
    Run as SYSTEM: psexec.exe -i -s powershell.exe -ExecutionPolicy Bypass -File Debug-AssignedAccess.ps1
#>

$OutputPath = "C:\Temp\AssignedAccessTS\AssignedAccess-Debug.txt"

# Ensure output directory exists
if (-not (Test-Path "C:\Temp\AssignedAccessTS")) {
    New-Item -Path "C:\Temp\AssignedAccessTS" -ItemType Directory -Force | Out-Null
}

# Start transcript to capture everything
Start-Transcript -Path $OutputPath -Force

Write-Host "=============================================="
Write-Host "ASSIGNED ACCESS DEBUG REPORT"
Write-Host "=============================================="
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host "Computer: $env:COMPUTERNAME"
Write-Host "User Context: $([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)"
Write-Host ""

#region MDM Bridge WMI
Write-Host "=============================================="
Write-Host "1. MDM BRIDGE WMI (MDM_AssignedAccess)"
Write-Host "=============================================="
try {
    $mdmObj = Get-CimInstance -Namespace 'root\cimv2\mdm\dmmap' -ClassName 'MDM_AssignedAccess' -ErrorAction Stop
    Write-Host "Instance found: Yes"
    Write-Host "InstanceID: $($mdmObj.InstanceID)"
    Write-Host "ParentID: $($mdmObj.ParentID)"
    Write-Host "Configuration length: $($mdmObj.Configuration.Length) chars"
    Write-Host ""
    Write-Host "--- Decoded Configuration ---"
    if ($mdmObj.Configuration) {
        [System.Net.WebUtility]::HtmlDecode($mdmObj.Configuration)
    } else {
        Write-Host "(empty)"
    }
    Write-Host "--- End Configuration ---"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
Write-Host ""
#endregion

#region Registry - AssignedAccessConfiguration DEEP DIVE
Write-Host "=============================================="
Write-Host "2. REGISTRY: AssignedAccessConfiguration (FULL)"
Write-Host "=============================================="
$basePath = 'HKLM:\SOFTWARE\Microsoft\Windows\AssignedAccessConfiguration'
Write-Host "Base Path: $basePath"
if (Test-Path $basePath) {
    Write-Host "EXISTS - Dumping all values recursively..."
    Write-Host ""

    # Get properties on the base key
    Write-Host "--- Base Key Properties ---"
    try {
        $baseProps = Get-ItemProperty -Path $basePath -ErrorAction SilentlyContinue
        $baseProps.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
            $val = $_.Value
            $valType = $val.GetType().Name
            if ($val -is [byte[]]) {
                $val = [System.Text.Encoding]::Unicode.GetString($val)
            }
            if ($val -is [string] -and $val.Length -gt 5000) {
                $val = $val.Substring(0, 5000) + "... (truncated, total length: $($_.Value.Length))"
            }
            Write-Host "  [$valType] $($_.Name):"
            Write-Host "    $val"
            Write-Host ""
        }
    } catch {
        Write-Host "  ERROR reading base: $($_.Exception.Message)"
    }

    # Recursively get all subkeys and their values
    Write-Host "--- Subkeys ---"
    try {
        Get-ChildItem -Path $basePath -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
            $keyPath = $_.PSPath
            Write-Host ""
            Write-Host "KEY: $($_.Name)"

            # Get all properties for this key
            try {
                $props = Get-ItemProperty -Path $keyPath -ErrorAction SilentlyContinue
                $props.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                    $val = $_.Value
                    $valType = $val.GetType().Name

                    # Handle byte arrays (often contain XML/config data)
                    if ($val -is [byte[]]) {
                        try {
                            $val = [System.Text.Encoding]::Unicode.GetString($val)
                        } catch {
                            $val = [System.BitConverter]::ToString($val).Substring(0, [Math]::Min(200, $val.Length * 3))
                        }
                    }

                    if ($val -is [string] -and $val.Length -gt 5000) {
                        $val = $val.Substring(0, 5000) + "... (truncated, total: $($_.Value.Length) chars)"
                    }

                    Write-Host "  [$valType] $($_.Name):"
                    Write-Host "    $val"
                }
            } catch {
                Write-Host "  ERROR reading properties: $($_.Exception.Message)"
            }
        }
    } catch {
        Write-Host "ERROR enumerating subkeys: $($_.Exception.Message)"
    }
} else {
    Write-Host "NOT FOUND"
}
Write-Host ""
#endregion

#region Registry - PolicyManager
Write-Host "=============================================="
Write-Host "3. REGISTRY: PolicyManager AssignedAccess"
Write-Host "=============================================="
$policyPaths = @(
    'HKLM:\SOFTWARE\Microsoft\PolicyManager\current\device\AssignedAccess',
    'HKLM:\SOFTWARE\Microsoft\PolicyManager\providers',
    'HKLM:\SOFTWARE\Microsoft\Provisioning\Diagnostics\AutoPilot'
)
foreach ($path in $policyPaths) {
    Write-Host "Path: $path"
    if (Test-Path $path) {
        Write-Host "  EXISTS"
        try {
            Get-ItemProperty -Path $path -ErrorAction SilentlyContinue | ForEach-Object {
                $_.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                    $val = $_.Value
                    if ($val -is [string] -and $val.Length -gt 200) { $val = $val.Substring(0, 200) + "..." }
                    Write-Host "    $($_.Name): $val"
                }
            }
        } catch {
            Write-Host "  ERROR: $($_.Exception.Message)"
        }
    } else {
        Write-Host "  NOT FOUND"
    }
    Write-Host ""
}
#endregion

#region Kiosk User Account
Write-Host "=============================================="
Write-Host "4. KIOSK USER ACCOUNTS"
Write-Host "=============================================="
try {
    $kioskUsers = Get-LocalUser | Where-Object { $_.Name -like '*kiosk*' -or $_.Description -like '*kiosk*' }
    if ($kioskUsers) {
        $kioskUsers | ForEach-Object {
            Write-Host "User: $($_.Name)"
            Write-Host "  Enabled: $($_.Enabled)"
            Write-Host "  Description: $($_.Description)"
            Write-Host "  SID: $($_.SID)"
            Write-Host "  LastLogon: $($_.LastLogon)"
            Write-Host ""
        }
    } else {
        Write-Host "No kiosk users found"
    }

    # Also check for auto-logon account
    Write-Host "--- AutoLogon Registry ---"
    $autoLogonPath = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
    $autoLogon = Get-ItemProperty -Path $autoLogonPath -ErrorAction SilentlyContinue
    Write-Host "  DefaultUserName: $($autoLogon.DefaultUserName)"
    Write-Host "  AutoAdminLogon: $($autoLogon.AutoAdminLogon)"
    Write-Host "  DefaultDomainName: $($autoLogon.DefaultDomainName)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
Write-Host ""
#endregion

#region AppLocker Policies
Write-Host "=============================================="
Write-Host "5. APPLOCKER POLICIES (Effective)"
Write-Host "=============================================="
try {
    $appLockerXml = Get-AppLockerPolicy -Effective -Xml -ErrorAction Stop
    if ($appLockerXml -and $appLockerXml.Length -gt 50) {
        Write-Host "AppLocker policy found (length: $($appLockerXml.Length) chars)"
        Write-Host ""
        # Parse and show summary
        $appLocker = [xml]$appLockerXml
        $ruleCollections = $appLocker.AppLockerPolicy.RuleCollection
        foreach ($collection in $ruleCollections) {
            Write-Host "  Collection: $($collection.Type) (Enforcement: $($collection.EnforcementMode))"
            $ruleCount = ($collection.ChildNodes | Where-Object { $_.LocalName -ne '#whitespace' }).Count
            Write-Host "    Rules: $ruleCount"
        }
        Write-Host ""
        Write-Host "--- Full AppLocker XML (first 5000 chars) ---"
        if ($appLockerXml.Length -gt 5000) {
            Write-Host $appLockerXml.Substring(0, 5000)
            Write-Host "... (truncated)"
        } else {
            Write-Host $appLockerXml
        }
    } else {
        Write-Host "No AppLocker policy found or policy is empty"
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
Write-Host ""
#endregion

#region Shell Launcher
Write-Host "=============================================="
Write-Host "6. SHELL LAUNCHER / CUSTOM SHELL"
Write-Host "=============================================="
try {
    # Check Shell Launcher WMI
    $shellLauncher = Get-CimInstance -Namespace 'root\standardcimv2\embedded' -ClassName 'WESL_UserSetting' -ErrorAction SilentlyContinue
    if ($shellLauncher) {
        Write-Host "Shell Launcher settings found:"
        $shellLauncher | ForEach-Object {
            Write-Host "  SID: $($_.Sid)"
            Write-Host "  Shell: $($_.Shell)"
            Write-Host "  DefaultAction: $($_.DefaultAction)"
        }
    } else {
        Write-Host "No Shell Launcher (WESL) settings found"
    }
} catch {
    Write-Host "Shell Launcher WMI not available: $($_.Exception.Message)"
}

# Check registry shell
Write-Host ""
Write-Host "--- Shell Registry ---"
try {
    $shellReg = Get-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon' -Name 'Shell' -ErrorAction SilentlyContinue
    Write-Host "  Default Shell: $($shellReg.Shell)"
} catch {
    Write-Host "  Could not read shell registry"
}
Write-Host ""
#endregion

#region Provisioning Packages
Write-Host "=============================================="
Write-Host "7. PROVISIONING PACKAGES"
Write-Host "=============================================="
try {
    $provPackages = Get-ProvisioningPackage -AllInstalledPackages -ErrorAction SilentlyContinue
    if ($provPackages) {
        $provPackages | ForEach-Object {
            Write-Host "  Package: $($_.PackageName)"
            Write-Host "    ID: $($_.PackageId)"
            Write-Host "    Version: $($_.Version)"
            Write-Host ""
        }
    } else {
        Write-Host "No provisioning packages found"
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
Write-Host ""
#endregion

#region Assigned Access CSP Direct Query
Write-Host "=============================================="
Write-Host "8. ALL MDM_AssignedAccess PROPERTIES"
Write-Host "=============================================="
try {
    $allInstances = Get-CimInstance -Namespace 'root\cimv2\mdm\dmmap' -ClassName 'MDM_AssignedAccess' -ErrorAction Stop
    $count = ($allInstances | Measure-Object).Count
    Write-Host "Total instances: $count"
    $i = 0
    $allInstances | ForEach-Object {
        $i++
        Write-Host ""
        Write-Host "--- Instance $i ---"
        # Dump ALL properties
        $_.PSObject.Properties | Where-Object { $_.Name -notlike 'Cim*' -and $_.Name -notlike 'PS*' } | ForEach-Object {
            $val = $_.Value
            if ($_.Name -eq 'Configuration' -and $val) {
                Write-Host "$($_.Name): (length $($val.Length) - shown in section 1)"
            } elseif ($val -is [string] -and $val.Length -gt 500) {
                Write-Host "$($_.Name): $($val.Substring(0, 500))... (truncated)"
            } else {
                Write-Host "$($_.Name): $val"
            }
        }
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
Write-Host ""
#endregion

#region Current User Session Info
Write-Host "=============================================="
Write-Host "9. CURRENT USER SESSIONS"
Write-Host "=============================================="
try {
    $sessions = query user 2>&1
    Write-Host $sessions
} catch {
    Write-Host "Could not query user sessions"
}
Write-Host ""
#endregion

#region Expected vs Actual Comparison
Write-Host "=============================================="
Write-Host "10. EXPECTED CONFIG FILE CHECK"
Write-Host "=============================================="
$expectedPath = 'C:\ProgramData\ConfigurationBlender\Assets\XML\AssignedAccessConfig.xml'
Write-Host "Expected config path: $expectedPath"
if (Test-Path $expectedPath) {
    Write-Host "File EXISTS"
    $content = Get-Content -Path $expectedPath -Raw
    Write-Host "File size: $($content.Length) chars"
    Write-Host ""
    Write-Host "--- Full Expected Config ---"
    Write-Host $content
} else {
    Write-Host "File NOT FOUND"
}
Write-Host ""
#endregion

#region Start Menu Configuration
Write-Host "=============================================="
Write-Host "11. START MENU CONFIGURATION"
Write-Host "=============================================="
# Check for start layout policies
$startLayoutPaths = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Start',
    'HKLM:\SOFTWARE\Policies\Microsoft\Windows\Explorer',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Start'
)
foreach ($path in $startLayoutPaths) {
    Write-Host "Path: $path"
    if (Test-Path $path) {
        Write-Host "  EXISTS"
        try {
            Get-ItemProperty -Path $path -ErrorAction SilentlyContinue | ForEach-Object {
                $_.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                    $val = $_.Value
                    if ($val -is [string] -and $val.Length -gt 500) { $val = $val.Substring(0, 500) + "..." }
                    Write-Host "    $($_.Name): $val"
                }
            }
        } catch {
            Write-Host "  ERROR: $($_.Exception.Message)"
        }
    } else {
        Write-Host "  NOT FOUND"
    }
    Write-Host ""
}

# Check for Start Menu json files
Write-Host "--- Start Menu Layout Files ---"
$startLayoutFiles = @(
    'C:\Users\Default\AppData\Local\Microsoft\Windows\Shell\LayoutModification.json',
    'C:\Users\kioskUser0\AppData\Local\Microsoft\Windows\Shell\LayoutModification.json',
    "$env:LOCALAPPDATA\Microsoft\Windows\Shell\LayoutModification.json"
)
foreach ($file in $startLayoutFiles) {
    Write-Host "File: $file"
    if (Test-Path $file) {
        Write-Host "  EXISTS"
        $content = Get-Content -Path $file -Raw -ErrorAction SilentlyContinue
        if ($content.Length -gt 2000) {
            Write-Host $content.Substring(0, 2000)
            Write-Host "... (truncated)"
        } else {
            Write-Host $content
        }
    } else {
        Write-Host "  NOT FOUND"
    }
    Write-Host ""
}
#endregion

#region Kiosk User Profile Registry
Write-Host "=============================================="
Write-Host "12. KIOSK USER PROFILE DETAILS"
Write-Host "=============================================="
# Get kiosk user SID
try {
    $kioskUser = Get-LocalUser -Name 'kioskUser0' -ErrorAction SilentlyContinue
    if ($kioskUser) {
        $kioskSid = $kioskUser.SID.Value
        Write-Host "Kiosk User SID: $kioskSid"
        Write-Host ""

        # Check the user's registry hive if loaded
        $userRegPath = "Registry::HKEY_USERS\$kioskSid"
        Write-Host "User Registry: $userRegPath"
        if (Test-Path $userRegPath) {
            Write-Host "  User hive is LOADED"

            # Check shell settings
            $shellPath = "$userRegPath\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\Shell Folders"
            if (Test-Path $shellPath) {
                Write-Host ""
                Write-Host "  --- Shell Folders ---"
                Get-ItemProperty -Path $shellPath -ErrorAction SilentlyContinue | ForEach-Object {
                    $_.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object {
                        Write-Host "    $($_.Name): $($_.Value)"
                    }
                }
            }
        } else {
            Write-Host "  User hive NOT loaded"
        }
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
}
Write-Host ""
#endregion

#region Test applying config and checking result
Write-Host "=============================================="
Write-Host "13. TEST: APPLY AND VERIFY"
Write-Host "=============================================="
Write-Host "Attempting to apply expected config and immediately read back..."
Write-Host ""

try {
    $expectedPath = 'C:\ProgramData\ConfigurationBlender\Assets\XML\AssignedAccessConfig.xml'
    if (Test-Path $expectedPath) {
        $xml = Get-Content -Path $expectedPath -Raw
        $obj = Get-CimInstance -Namespace 'root\cimv2\mdm\dmmap' -ClassName 'MDM_AssignedAccess'

        Write-Host "Before apply - Config length: $($obj.Configuration.Length)"

        $obj.Configuration = [System.Net.WebUtility]::HtmlEncode($xml)
        Set-CimInstance -CimInstance $obj -ErrorAction Stop

        Write-Host "Set-CimInstance completed without error"

        # Immediately read back
        Start-Sleep -Seconds 2
        $obj2 = Get-CimInstance -Namespace 'root\cimv2\mdm\dmmap' -ClassName 'MDM_AssignedAccess'

        Write-Host "After apply - Config length: $($obj2.Configuration.Length)"
        Write-Host ""
        Write-Host "--- Decoded Config After Apply ---"
        [System.Net.WebUtility]::HtmlDecode($obj2.Configuration)
        Write-Host "--- End ---"
    } else {
        Write-Host "Expected config file not found, skipping test"
    }
} catch {
    Write-Host "ERROR during apply test: $($_.Exception.Message)"
}
Write-Host ""
#endregion

Write-Host "=============================================="
Write-Host "DEBUG REPORT COMPLETE"
Write-Host "=============================================="
Write-Host "Output saved to: $OutputPath"

Stop-Transcript
