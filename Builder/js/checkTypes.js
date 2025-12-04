/* ============================================================================
   Configuration Blender - Check Types
   Form generation, property management, and conditional fields
   ============================================================================ */

// ============================================================================
// Conditional Field Toggle Functions
// ============================================================================

function toggleLprQueue() {
    const portType = document.getElementById('prop_portType').value;
    const lprQueueGroup = document.getElementById('lprQueueGroup');
    if (portType === 'LPR') {
        lprQueueGroup.style.display = 'block';
    } else {
        lprQueueGroup.style.display = 'none';
    }
}

function toggleApplicationFields() {
    const ensureInstalled = document.getElementById('prop_ensureInstalled').value;
    const installFields = document.getElementById('installFields');
    const uninstallFields = document.getElementById('uninstallFields');
    if (ensureInstalled === 'true') {
        installFields.style.display = 'block';
        uninstallFields.style.display = 'none';
    } else {
        installFields.style.display = 'none';
        uninstallFields.style.display = 'block';
    }
}

// ============================================================================
// Show Properties Form
// ============================================================================

function showCheckProperties() {
    const type = document.getElementById('checkType').value;
    const container = document.getElementById('checkProperties');

    if (!type) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = getPropertiesFormForType(type);
}

// ============================================================================
// Properties Form Templates
// ============================================================================

function getPropertiesFormForType(type) {
    switch (type) {
        case 'Application':
            return `
                <div class="property-group">
                    <h4>Application Properties</h4>
                    <div class="form-group">
                        <label>Application Name</label>
                        <input type="text" id="prop_applicationName" placeholder="e.g., Google Chrome">
                    </div>
                    <div class="form-group">
                        <label>Desired State</label>
                        <select id="prop_ensureInstalled" onchange="toggleApplicationFields()">
                            <option value="false">Should NOT be installed (remove if found)</option>
                            <option value="true">Should be installed (install if missing)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Detection Paths (one per line)</label>
                        <textarea id="prop_searchPaths" rows="3" placeholder="C:\\Program Files*\\Google\\Chrome\\Application\\chrome.exe"></textarea>
                        <small style="color: #666;">Wildcard paths to detect if the application is installed</small>
                    </div>
                    <div id="uninstallFields">
                        <div class="form-group">
                            <label>Uninstall Paths (one per line)</label>
                            <textarea id="prop_uninstallPaths" rows="3" placeholder="C:\\Program Files*\\Google\\Chrome\\Application\\*\\Installer\\setup.exe"></textarea>
                            <small style="color: #666;">Paths to uninstaller executables</small>
                        </div>
                        <div class="form-group">
                            <label>Uninstall Arguments</label>
                            <input type="text" id="prop_uninstallArguments" placeholder="--uninstall --force-uninstall">
                        </div>
                    </div>
                    <div id="installFields" style="display: none;">
                        <div class="form-group">
                            <label>Install Command</label>
                            <input type="text" id="prop_installCommand" placeholder="winget install --id Google.Chrome --silent">
                            <small style="color: #666;">Command to install the application (runs as SYSTEM)</small>
                        </div>
                        <div class="form-group">
                            <label>Minimum Version (optional)</label>
                            <input type="text" id="prop_minimumVersion" placeholder="e.g., 120.0.0">
                            <small style="color: #666;">Leave blank to accept any version</small>
                        </div>
                    </div>
                </div>
            `;
        case 'FolderEmpty':
            return `
                <div class="property-group">
                    <h4>Folder Properties</h4>
                    <div class="form-group">
                        <label>Paths to Clear (one per line)</label>
                        <textarea id="prop_paths" rows="3" placeholder="$env:PUBLIC\\Desktop"></textarea>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="prop_includeAllUserProfiles"> Include All User Profiles
                        </label>
                    </div>
                </div>
            `;
        case 'ShortcutsAllowList':
            return `
                <div class="property-group">
                    <h4>Allow List Properties</h4>
                    <div class="form-group">
                        <label>Start Menu Path</label>
                        <input type="text" id="prop_path" value="C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs">
                    </div>
                    <div class="form-group">
                        <label>Allowed Shortcuts (one per line)</label>
                        <textarea id="prop_allowedShortcuts" rows="6" placeholder="GTA Time Clock.lnk"></textarea>
                    </div>
                </div>
            `;
        case 'FolderHasFiles':
            return `
                <div class="property-group">
                    <h4>Folder Properties</h4>
                    <div class="form-group">
                        <label>Destination Path</label>
                        <input type="text" id="prop_path" placeholder="C:\\ProgramData\\Microsoft\\User Account Pictures">
                    </div>
                    <div class="form-group">
                        <label>Minimum File Count</label>
                        <input type="number" id="prop_minimumFileCount" value="1" min="1">
                    </div>
                    <div class="form-group">
                        <label>Source Asset Path (relative)</label>
                        <input type="text" id="prop_sourceAssetPath" placeholder="AccountPictures">
                        <small style="color: #666;">Relative to Assets folder (do not include "Assets\\")</small>
                    </div>
                </div>
            `;
        case 'FilesExist':
            return `
                <div class="property-group">
                    <h4>Files Properties</h4>
                    <div class="form-group">
                        <label>Destination Path</label>
                        <input type="text" id="prop_destinationPath" placeholder="C:\\ProgramData\\ConfigurationBlender\\Icons">
                    </div>
                    <div class="form-group">
                        <label>Required Files (one per line)</label>
                        <textarea id="prop_files" rows="6" placeholder="icon1.ico&#10;icon2.ico"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Source Asset Path (relative)</label>
                        <input type="text" id="prop_sourceAssetPath" placeholder="Icons">
                        <small style="color: #666;">Relative to Assets folder (do not include "Assets\\")</small>
                    </div>
                </div>
            `;
        case 'ShortcutExists':
            return `
                <div class="property-group">
                    <h4>Shortcut Properties</h4>
                    <div class="form-group">
                        <label>Shortcut Path</label>
                        <input type="text" id="prop_path" placeholder="C:\\ProgramData\\...\\Shortcut.lnk">
                    </div>
                    <div class="form-group">
                        <label>Target Path</label>
                        <input type="text" id="prop_targetPath" placeholder="C:\\Program Files\\...\\app.exe">
                    </div>
                    <div class="form-group">
                        <label>Arguments</label>
                        <input type="text" id="prop_arguments" placeholder="--kiosk http://example.com">
                    </div>
                    <div class="form-group">
                        <label>Icon Location</label>
                        <input type="text" id="prop_iconLocation" placeholder="C:\\...\\icon.ico">
                    </div>
                    <div class="form-group">
                        <label>Description</label>
                        <input type="text" id="prop_description" placeholder="Shortcut description">
                    </div>
                </div>
            `;
        case 'AssignedAccess':
            return `
                <div class="property-group">
                    <h4>Assigned Access Properties</h4>
                    <div class="form-group">
                        <label>Profile ID (GUID)</label>
                        <input type="text" id="prop_profileId" placeholder="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}">
                    </div>
                    <div class="form-group">
                        <label>Display Name</label>
                        <input type="text" id="prop_displayName" placeholder="Kiosk Profile">
                    </div>
                    <div class="form-group">
                        <label>Allowed Apps (one per line)</label>
                        <textarea id="prop_allowedApps" rows="6" placeholder="C:\\Program Files\\...\\app.exe"></textarea>
                    </div>
                    <div class="form-group">
                        <label>Start Pins (one per line)</label>
                        <textarea id="prop_startPins" rows="6" placeholder="%ALLUSERSPROFILE%\\...\\Shortcut.lnk"></textarea>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="prop_showTaskbar" checked> Show Taskbar
                        </label>
                    </div>
                    <div class="form-group">
                        <label>Allowed Namespaces (one per line)</label>
                        <textarea id="prop_allowedNamespaces" rows="2" placeholder="Downloads"></textarea>
                    </div>
                </div>
            `;
        case 'RegistryValue':
            return `
                <div class="property-group">
                    <h4>Registry Properties</h4>
                    <div class="form-group">
                        <label>Registry Path</label>
                        <input type="text" id="prop_path" placeholder="HKLM:\\SOFTWARE\\...">
                    </div>
                    <div class="form-group">
                        <label>Value Name</label>
                        <input type="text" id="prop_name" placeholder="ValueName">
                    </div>
                    <div class="form-group">
                        <label>Value</label>
                        <input type="text" id="prop_value" placeholder="1">
                    </div>
                    <div class="form-group">
                        <label>Type</label>
                        <select id="prop_type">
                            <option value="String">String</option>
                            <option value="DWord">DWord</option>
                            <option value="QWord">QWord</option>
                            <option value="Binary">Binary</option>
                            <option value="MultiString">MultiString</option>
                            <option value="ExpandString">ExpandString</option>
                        </select>
                    </div>
                </div>
            `;
        case 'ScheduledTaskExists':
            return `
                <div class="property-group">
                    <h4>Scheduled Task Properties</h4>
                    <div class="form-group">
                        <label>Task Name</label>
                        <input type="text" id="prop_taskName" placeholder="MyTask">
                    </div>
                    <div class="form-group">
                        <label>Task Path</label>
                        <input type="text" id="prop_taskPath" value="\\">
                    </div>
                    <div class="form-group">
                        <label>Execute</label>
                        <input type="text" id="prop_execute" placeholder="Powershell.exe">
                    </div>
                    <div class="form-group">
                        <label>Arguments</label>
                        <input type="text" id="prop_arguments" placeholder="-File C:\\...\\script.ps1">
                    </div>
                    <div class="form-group">
                        <label>Trigger</label>
                        <select id="prop_trigger">
                            <option value="AtLogOn">At Logon</option>
                            <option value="AtStartup">At Startup</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Run Level</label>
                        <select id="prop_runLevel">
                            <option value="Highest">Highest</option>
                            <option value="Limited">Limited</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Principal</label>
                        <input type="text" id="prop_principal" value="NT AUTHORITY\\SYSTEM">
                    </div>
                </div>
            `;
        case 'FileContent':
            return `
                <div class="property-group">
                    <h4>File Content Properties</h4>
                    <div class="form-group">
                        <label>Destination Path</label>
                        <input type="text" id="prop_path" placeholder="C:\\...\\script.ps1">
                    </div>
                    <div class="form-group">
                        <label>Source Asset Path (relative)</label>
                        <input type="text" id="prop_sourceAssetPath" placeholder="Scripts\\script.ps1">
                        <small style="color: #666;">Relative to Assets folder (do not include "Assets\\")</small>
                    </div>
                </div>
            `;
        case 'ServiceRunning':
            return `
                <div class="property-group">
                    <h4>Service Properties</h4>
                    <div class="form-group">
                        <label>Service Name</label>
                        <input type="text" id="prop_serviceName" placeholder="e.g., Spooler">
                    </div>
                    <div class="form-group">
                        <label>Startup Type</label>
                        <select id="prop_startupType">
                            <option value="Automatic">Automatic</option>
                            <option value="Manual">Manual</option>
                            <option value="Disabled">Disabled</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="prop_ensureRunning" checked> Ensure Service is Running
                        </label>
                    </div>
                </div>
            `;
        case 'PrinterInstalled':
            return `
                <div class="property-group">
                    <h4>Network Printer Properties</h4>
                    <p style="color: #d32f2f; font-size: 0.85rem; margin-bottom: 1rem; padding: 0.5rem; background: #ffebee; border-radius: 4px;">
                        <strong>Important:</strong> The printer driver must be installed BEFORE adding the printer.
                        Use a "Driver Installed" check first to deploy the driver package.
                    </p>
                    <div class="form-group">
                        <label>Printer Name (Required)</label>
                        <input type="text" id="prop_printerName" placeholder="e.g., Office-HP-LaserJet-3F">
                    </div>
                    <div class="form-group">
                        <label>Printer Driver Name (Exact Match Required)</label>
                        <input type="text" id="prop_driverName" placeholder="e.g., HP Universal Printing PCL 6">
                        <small style="color: #666;">Must match the driver name exactly as installed. Run "Get-PrinterDriver" to see installed drivers.</small>
                    </div>
                    <div class="form-group">
                        <label>Printer IP Address or Hostname (Required)</label>
                        <input type="text" id="prop_printerIP" placeholder="e.g., 192.168.1.100 or PRINTER-3F">
                    </div>
                    <div class="form-group">
                        <label>Port Name (Required)</label>
                        <input type="text" id="prop_portName" placeholder="e.g., IP_192.168.1.100 or PRINTER-3F">
                        <small style="color: #666;">Can be IP-based (IP_192.168.1.100) or hostname (PRINTER-3F)</small>
                    </div>
                    <div class="form-group">
                        <label>Port Type</label>
                        <select id="prop_portType" onchange="toggleLprQueue()">
                            <option value="TCP">TCP/IP Port (Standard)</option>
                            <option value="LPR">LPR Port</option>
                        </select>
                        <small style="color: #666;">TCP for most network printers, LPR for Unix/Linux print servers</small>
                    </div>
                    <div class="form-group" id="lprQueueGroup" style="display:none;">
                        <label>LPR Queue Name (Required for LPR)</label>
                        <input type="text" id="prop_lprQueue" placeholder="e.g., lp0 or print">
                        <small style="color: #666;">The queue name on the LPR print server</small>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="prop_setAsDefault"> Set as Default Printer
                        </label>
                    </div>
                </div>
            `;
        case 'DriverInstalled':
            return `
                <div class="property-group">
                    <h4>Driver Properties</h4>
                    <p style="color: #1565c0; font-size: 0.85rem; margin-bottom: 1rem; padding: 0.5rem; background: #e3f2fd; border-radius: 4px;">
                        <strong>Tip:</strong> Place the complete driver package (.inf + all referenced files) in Assets/Drivers/.
                        For printer drivers, add this check BEFORE the "Printer Installed" check.
                    </p>
                    <div class="form-group">
                        <label>Driver Name</label>
                        <input type="text" id="prop_driverName" placeholder="e.g., HP Universal Printing PCL 6">
                        <small style="color: #666;">Name as it appears after installation (check Device Manager or Get-PrinterDriver)</small>
                    </div>
                    <div class="form-group">
                        <label>Driver Class (Optional)</label>
                        <select id="prop_driverClass">
                            <option value="">Any Class</option>
                            <option value="Display">Display</option>
                            <option value="Net">Network</option>
                            <option value="AudioEndpoint">Audio</option>
                            <option value="Printer">Printer</option>
                            <option value="USB">USB</option>
                            <option value="System">System</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Source Asset Path (.inf file)</label>
                        <input type="text" id="prop_sourceAssetPath" placeholder="Drivers\\HPUniversal\\hpcu255u.inf">
                        <small style="color: #666;">Path to .inf file. All driver files must be in same folder or subfolders.</small>
                    </div>
                    <div class="form-group">
                        <label>Minimum Version (Optional)</label>
                        <input type="text" id="prop_minimumVersion" placeholder="e.g., 3.0 or 30.0.101.1960">
                        <small style="color: #666;">If specified, driver will be updated if installed version is older</small>
                    </div>
                </div>
            `;
        case 'WindowsFeature':
            return `
                <div class="property-group">
                    <h4>Windows Feature Properties</h4>
                    <div class="form-group">
                        <label>Feature Name</label>
                        <input type="text" id="prop_featureName" placeholder="e.g., Microsoft-Hyper-V-All">
                        <small style="color: #666;">Use Get-WindowsOptionalFeature -Online to find feature names</small>
                    </div>
                    <div class="form-group">
                        <label>Desired State</label>
                        <select id="prop_state">
                            <option value="Enabled">Enabled</option>
                            <option value="Disabled">Disabled</option>
                        </select>
                    </div>
                </div>
            `;
        case 'FirewallRule':
            return `
                <div class="property-group">
                    <h4>Firewall Rule Properties</h4>
                    <div class="form-group">
                        <label>Rule Name</label>
                        <input type="text" id="prop_ruleName" placeholder="e.g., Block Telemetry">
                    </div>
                    <div class="form-group">
                        <label>Display Name</label>
                        <input type="text" id="prop_displayName" placeholder="e.g., Block Windows Telemetry">
                    </div>
                    <div class="form-group">
                        <label>Direction</label>
                        <select id="prop_direction">
                            <option value="Inbound">Inbound</option>
                            <option value="Outbound">Outbound</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Action</label>
                        <select id="prop_action">
                            <option value="Allow">Allow</option>
                            <option value="Block">Block</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Protocol (Optional)</label>
                        <select id="prop_protocol">
                            <option value="">Any</option>
                            <option value="TCP">TCP</option>
                            <option value="UDP">UDP</option>
                            <option value="ICMPv4">ICMPv4</option>
                            <option value="ICMPv6">ICMPv6</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Remote Address (Optional)</label>
                        <input type="text" id="prop_remoteAddress" placeholder="e.g., 192.168.1.0/24 or telemetry.microsoft.com">
                    </div>
                    <div class="form-group">
                        <label>Remote Port (Optional)</label>
                        <input type="text" id="prop_remotePort" placeholder="e.g., 443 or 80,443">
                    </div>
                    <div class="form-group">
                        <label>Local Port (Optional)</label>
                        <input type="text" id="prop_localPort" placeholder="e.g., 8080">
                    </div>
                    <div class="form-group">
                        <label>Program Path (Optional)</label>
                        <input type="text" id="prop_program" placeholder="e.g., C:\\Program Files\\App\\app.exe">
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="prop_enabled" checked> Rule Enabled
                        </label>
                    </div>
                </div>
            `;
        case 'CertificateInstalled':
            return `
                <div class="property-group">
                    <h4>Certificate Properties</h4>
                    <div class="form-group">
                        <label>Certificate Store Location</label>
                        <select id="prop_storeLocation">
                            <option value="LocalMachine">Local Machine</option>
                            <option value="CurrentUser">Current User</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Certificate Store Name</label>
                        <select id="prop_storeName">
                            <option value="My">Personal (My)</option>
                            <option value="Root">Trusted Root CA (Root)</option>
                            <option value="CA">Intermediate CA (CA)</option>
                            <option value="TrustedPublisher">Trusted Publishers</option>
                            <option value="TrustedPeople">Trusted People</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Certificate Thumbprint (Preferred)</label>
                        <input type="text" id="prop_thumbprint" placeholder="e.g., 1A2B3C4D5E6F...">
                        <small style="color: #666;">The unique SHA1 thumbprint of the certificate</small>
                    </div>
                    <div class="form-group">
                        <label>Certificate Subject (Alternative)</label>
                        <input type="text" id="prop_subject" placeholder="e.g., CN=MyCert or *.example.com">
                        <small style="color: #666;">Partial match on certificate subject. Use if thumbprint unknown.</small>
                    </div>
                    <div class="form-group">
                        <label>Expected Issuer (Optional)</label>
                        <input type="text" id="prop_issuer" placeholder="e.g., DigiCert or CN=Enterprise CA">
                        <small style="color: #666;">Verify the certificate was issued by expected CA</small>
                    </div>
                    <div class="form-group">
                        <label>Minimum Days Valid (Optional)</label>
                        <input type="number" id="prop_minimumDaysValid" placeholder="e.g., 30" min="0">
                        <small style="color: #666;">Alert if certificate expires within this many days</small>
                    </div>
                    <div class="form-group">
                        <label>Source Asset Path (for remediation)</label>
                        <input type="text" id="prop_sourceAssetPath" placeholder="Certificates\\MyCert.cer">
                        <small style="color: #666;">Relative to Assets folder. Supports .cer, .crt, .pfx, .p12</small>
                    </div>
                    <div class="form-group">
                        <label>PFX Password (if .pfx/.p12)</label>
                        <input type="password" id="prop_pfxPassword" placeholder="Password for PFX file">
                        <small style="color: #666; color: #d32f2f;">Warning: Stored in plain text in Config.json</small>
                    </div>
                </div>
            `;
        case 'NetworkAdapterConfiguration':
            return `
                <div class="property-group">
                    <h4>Adapter Identification (choose one)</h4>
                    <div class="form-group">
                        <label>Adapter Name</label>
                        <input type="text" id="prop_adapterName" placeholder="e.g., Ethernet 2">
                        <small style="color: #666;">Exact name as shown in Network Connections</small>
                    </div>
                    <div class="form-group">
                        <label>Adapter Description (Alternative)</label>
                        <input type="text" id="prop_adapterDescription" placeholder="e.g., Intel(R) I211 Gigabit">
                        <small style="color: #666;">Partial match on hardware description</small>
                    </div>
                    <div class="form-group">
                        <label>MAC Address (Alternative)</label>
                        <input type="text" id="prop_macAddress" placeholder="e.g., 00:1A:2B:3C:4D:5E or 00-1A-2B-3C-4D-5E">
                        <small style="color: #666;">Physical address of the adapter</small>
                    </div>
                </div>
                <div class="property-group">
                    <h4>IP Configuration</h4>
                    <div class="form-group">
                        <label>Static IP Address</label>
                        <input type="text" id="prop_staticIPAddress" placeholder="e.g., 192.168.1.100">
                        <small style="color: #666;">Leave empty to keep DHCP</small>
                    </div>
                    <div class="form-group">
                        <label>Subnet Prefix Length</label>
                        <input type="number" id="prop_subnetPrefixLength" placeholder="e.g., 24" min="1" max="32">
                        <small style="color: #666;">24 = 255.255.255.0, 16 = 255.255.0.0</small>
                    </div>
                    <div class="form-group">
                        <label>Default Gateway</label>
                        <input type="text" id="prop_defaultGateway" placeholder="e.g., 192.168.1.1">
                    </div>
                    <div class="form-group">
                        <label>DNS Servers (one per line)</label>
                        <textarea id="prop_dnsServers" rows="2" placeholder="8.8.8.8&#10;8.8.4.4"></textarea>
                    </div>
                </div>
                <div class="property-group">
                    <h4>Network Profile & Settings</h4>
                    <div class="form-group">
                        <label>Network Category</label>
                        <select id="prop_networkCategory">
                            <option value="">Do not change</option>
                            <option value="Private">Private</option>
                            <option value="Public">Public</option>
                        </select>
                        <small style="color: #666;">Private enables network discovery; Public is more secure</small>
                    </div>
                    <div class="form-group">
                        <label>Interface Metric (Priority)</label>
                        <input type="number" id="prop_interfaceMetric" placeholder="e.g., 10" min="1">
                        <small style="color: #666;">Lower = higher priority. Use to prefer one adapter over another.</small>
                    </div>
                    <div class="form-group">
                        <label>
                            <input type="checkbox" id="prop_ensureEnabled" checked> Ensure Adapter is Enabled
                        </label>
                    </div>
                </div>
            `;
        default:
            return '<p>Select a check type to see properties.</p>';
    }
}

// ============================================================================
// Populate Properties (for editing)
// ============================================================================

function populateCheckProperties(properties) {
    if (!properties) return;

    for (const [key, value] of Object.entries(properties)) {
        const element = document.getElementById('prop_' + key);
        if (element) {
            if (element.type === 'checkbox') {
                element.checked = value;
            } else if (element.tagName === 'TEXTAREA' && Array.isArray(value)) {
                element.value = value.join('\n');
            } else {
                element.value = value;
            }
        }
    }

    // Handle conditional field visibility for PrinterInstalled
    const portTypeElement = document.getElementById('prop_portType');
    if (portTypeElement) {
        toggleLprQueue();
    }

    // Handle conditional field visibility for Application
    const ensureInstalledElement = document.getElementById('prop_ensureInstalled');
    if (ensureInstalledElement) {
        toggleApplicationFields();
    }
}

// ============================================================================
// Get Properties (for saving)
// ============================================================================

function getCheckProperties() {
    const type = document.getElementById('checkType').value;
    const properties = {};

    switch (type) {
        case 'Application':
            properties.applicationName = document.getElementById('prop_applicationName').value;
            properties.ensureInstalled = document.getElementById('prop_ensureInstalled').value === 'true';
            properties.searchPaths = document.getElementById('prop_searchPaths').value.split('\n').filter(p => p.trim());
            if (properties.ensureInstalled) {
                properties.installCommand = document.getElementById('prop_installCommand').value;
                const minVer = document.getElementById('prop_minimumVersion').value;
                if (minVer) properties.minimumVersion = minVer;
            } else {
                properties.uninstallPaths = document.getElementById('prop_uninstallPaths').value.split('\n').filter(p => p.trim());
                properties.uninstallArguments = document.getElementById('prop_uninstallArguments').value;
            }
            break;
        case 'FolderEmpty':
            properties.paths = document.getElementById('prop_paths').value.split('\n').filter(p => p.trim());
            properties.includeAllUserProfiles = document.getElementById('prop_includeAllUserProfiles').checked;
            break;
        case 'ShortcutsAllowList':
            properties.path = document.getElementById('prop_path').value;
            properties.allowedShortcuts = document.getElementById('prop_allowedShortcuts').value.split('\n').filter(p => p.trim());
            break;
        case 'FolderHasFiles':
            properties.path = document.getElementById('prop_path').value;
            properties.minimumFileCount = parseInt(document.getElementById('prop_minimumFileCount').value) || 1;
            properties.sourceAssetPath = document.getElementById('prop_sourceAssetPath').value;
            break;
        case 'FilesExist':
            properties.destinationPath = document.getElementById('prop_destinationPath').value;
            properties.files = document.getElementById('prop_files').value.split('\n').filter(p => p.trim());
            properties.sourceAssetPath = document.getElementById('prop_sourceAssetPath').value;
            break;
        case 'ShortcutExists':
            properties.path = document.getElementById('prop_path').value;
            properties.targetPath = document.getElementById('prop_targetPath').value;
            properties.arguments = document.getElementById('prop_arguments').value;
            properties.iconLocation = document.getElementById('prop_iconLocation').value;
            properties.description = document.getElementById('prop_description').value;
            break;
        case 'AssignedAccess':
            properties.profileId = document.getElementById('prop_profileId').value;
            properties.displayName = document.getElementById('prop_displayName').value;
            properties.allowedApps = document.getElementById('prop_allowedApps').value.split('\n').filter(p => p.trim());
            properties.startPins = document.getElementById('prop_startPins').value.split('\n').filter(p => p.trim());
            properties.showTaskbar = document.getElementById('prop_showTaskbar').checked;
            properties.allowedNamespaces = document.getElementById('prop_allowedNamespaces').value.split('\n').filter(p => p.trim());
            break;
        case 'RegistryValue':
            properties.path = document.getElementById('prop_path').value;
            properties.name = document.getElementById('prop_name').value;
            const regValue = document.getElementById('prop_value').value;
            const regType = document.getElementById('prop_type').value;
            properties.value = (regType === 'DWord' || regType === 'QWord') ? parseInt(regValue) : regValue;
            properties.type = regType;
            break;
        case 'ScheduledTaskExists':
            properties.taskName = document.getElementById('prop_taskName').value;
            properties.taskPath = document.getElementById('prop_taskPath').value;
            properties.execute = document.getElementById('prop_execute').value;
            properties.arguments = document.getElementById('prop_arguments').value;
            properties.trigger = document.getElementById('prop_trigger').value;
            properties.runLevel = document.getElementById('prop_runLevel').value;
            properties.principal = document.getElementById('prop_principal').value;
            break;
        case 'FileContent':
            properties.path = document.getElementById('prop_path').value;
            properties.sourceAssetPath = document.getElementById('prop_sourceAssetPath').value;
            break;
        case 'ServiceRunning':
            properties.serviceName = document.getElementById('prop_serviceName').value;
            properties.startupType = document.getElementById('prop_startupType').value;
            properties.ensureRunning = document.getElementById('prop_ensureRunning').checked;
            break;
        case 'PrinterInstalled':
            properties.printerName = document.getElementById('prop_printerName').value;
            properties.driverName = document.getElementById('prop_driverName').value;
            properties.portName = document.getElementById('prop_portName').value;
            properties.printerIP = document.getElementById('prop_printerIP').value;
            properties.portType = document.getElementById('prop_portType').value;
            const lprQueueValue = document.getElementById('prop_lprQueue').value;
            if (lprQueueValue) {
                properties.lprQueue = lprQueueValue;
            }
            properties.setAsDefault = document.getElementById('prop_setAsDefault').checked;
            break;
        case 'DriverInstalled':
            properties.driverName = document.getElementById('prop_driverName').value;
            properties.driverClass = document.getElementById('prop_driverClass').value;
            properties.sourceAssetPath = document.getElementById('prop_sourceAssetPath').value;
            properties.minimumVersion = document.getElementById('prop_minimumVersion').value;
            break;
        case 'WindowsFeature':
            properties.featureName = document.getElementById('prop_featureName').value;
            properties.state = document.getElementById('prop_state').value;
            break;
        case 'FirewallRule':
            properties.ruleName = document.getElementById('prop_ruleName').value;
            properties.displayName = document.getElementById('prop_displayName').value;
            properties.direction = document.getElementById('prop_direction').value;
            properties.action = document.getElementById('prop_action').value;
            properties.protocol = document.getElementById('prop_protocol').value;
            properties.remoteAddress = document.getElementById('prop_remoteAddress').value;
            properties.remotePort = document.getElementById('prop_remotePort').value;
            properties.localPort = document.getElementById('prop_localPort').value;
            properties.program = document.getElementById('prop_program').value;
            properties.enabled = document.getElementById('prop_enabled').checked;
            break;
        case 'CertificateInstalled':
            properties.storeLocation = document.getElementById('prop_storeLocation').value;
            properties.storeName = document.getElementById('prop_storeName').value;
            const thumbprint = document.getElementById('prop_thumbprint').value;
            if (thumbprint) properties.thumbprint = thumbprint;
            const subject = document.getElementById('prop_subject').value;
            if (subject) properties.subject = subject;
            const issuer = document.getElementById('prop_issuer').value;
            if (issuer) properties.issuer = issuer;
            const minDays = document.getElementById('prop_minimumDaysValid').value;
            if (minDays) properties.minimumDaysValid = parseInt(minDays);
            const certSourcePath = document.getElementById('prop_sourceAssetPath').value;
            if (certSourcePath) properties.sourceAssetPath = certSourcePath;
            const pfxPass = document.getElementById('prop_pfxPassword').value;
            if (pfxPass) properties.pfxPassword = pfxPass;
            break;
        case 'NetworkAdapterConfiguration':
            const adapterName = document.getElementById('prop_adapterName').value;
            if (adapterName) properties.adapterName = adapterName;
            const adapterDesc = document.getElementById('prop_adapterDescription').value;
            if (adapterDesc) properties.adapterDescription = adapterDesc;
            const macAddr = document.getElementById('prop_macAddress').value;
            if (macAddr) properties.macAddress = macAddr;
            const staticIP = document.getElementById('prop_staticIPAddress').value;
            if (staticIP) properties.staticIPAddress = staticIP;
            const prefixLen = document.getElementById('prop_subnetPrefixLength').value;
            if (prefixLen) properties.subnetPrefixLength = parseInt(prefixLen);
            const gateway = document.getElementById('prop_defaultGateway').value;
            if (gateway) properties.defaultGateway = gateway;
            const dnsText = document.getElementById('prop_dnsServers').value;
            if (dnsText) properties.dnsServers = dnsText.split('\n').filter(d => d.trim());
            const netCategory = document.getElementById('prop_networkCategory').value;
            if (netCategory) properties.networkCategory = netCategory;
            const metric = document.getElementById('prop_interfaceMetric').value;
            if (metric) properties.interfaceMetric = parseInt(metric);
            properties.ensureEnabled = document.getElementById('prop_ensureEnabled').checked;
            break;
    }

    return properties;
}
