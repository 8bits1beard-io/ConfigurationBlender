/* ============================================================================
   Configuration Blender - Check Types
   Form generation, property management, and conditional fields
   WCAG 2.1/2.2 AA Compliant
   ============================================================================ */

// ============================================================================
// Conditional Field Toggle Functions
// ============================================================================

function toggleLprQueue() {
    const portType = document.getElementById('prop_portType').value;
    const lprQueueGroup = document.getElementById('lprQueueGroup');
    if (portType === 'LPR') {
        lprQueueGroup.style.display = 'block';
        lprQueueGroup.setAttribute('aria-hidden', 'false');
    } else {
        lprQueueGroup.style.display = 'none';
        lprQueueGroup.setAttribute('aria-hidden', 'true');
    }
}

function toggleApplicationFields() {
    const ensureInstalled = document.getElementById('prop_ensureInstalled').value;
    const installFields = document.getElementById('installFields');
    const uninstallFields = document.getElementById('uninstallFields');
    if (ensureInstalled === 'true') {
        installFields.style.display = 'block';
        installFields.setAttribute('aria-hidden', 'false');
        uninstallFields.style.display = 'none';
        uninstallFields.setAttribute('aria-hidden', 'true');
    } else {
        installFields.style.display = 'none';
        installFields.setAttribute('aria-hidden', 'true');
        uninstallFields.style.display = 'block';
        uninstallFields.setAttribute('aria-hidden', 'false');
    }
}

function toggleNetworkAdapterMode() {
    const mode = document.getElementById('prop_identificationMode').value;
    const traditionalFields = document.getElementById('traditionalAdapterFields');
    const subnetFields = document.getElementById('subnetAdapterFields');
    if (mode === 'subnet') {
        traditionalFields.style.display = 'none';
        traditionalFields.setAttribute('aria-hidden', 'true');
        subnetFields.style.display = 'block';
        subnetFields.setAttribute('aria-hidden', 'false');
    } else {
        traditionalFields.style.display = 'block';
        traditionalFields.setAttribute('aria-hidden', 'false');
        subnetFields.style.display = 'none';
        subnetFields.setAttribute('aria-hidden', 'true');
    }
}

function toggleIPMode() {
    const mode = document.getElementById('prop_ipMode').value;
    const singleFields = document.getElementById('singleIPFields');
    const rangeFields = document.getElementById('rangeIPFields');
    if (mode === 'range') {
        singleFields.style.display = 'none';
        singleFields.setAttribute('aria-hidden', 'true');
        rangeFields.style.display = 'block';
        rangeFields.setAttribute('aria-hidden', 'false');
    } else {
        singleFields.style.display = 'block';
        singleFields.setAttribute('aria-hidden', 'false');
        rangeFields.style.display = 'none';
        rangeFields.setAttribute('aria-hidden', 'true');
    }
}

function toggleFilesExistMode() {
    const mode = document.getElementById('prop_mode').value;
    const multipleFilesGroup = document.getElementById('multipleFilesGroup');
    const destinationPathHint = document.getElementById('prop_destinationPath_hint');

    if (mode === 'SingleFile') {
        multipleFilesGroup.style.display = 'none';
        multipleFilesGroup.setAttribute('aria-hidden', 'true');
        if (destinationPathHint) {
            destinationPathHint.textContent = 'Full path including filename (e.g., C:\\Scripts\\script.ps1)';
        }
    } else {
        multipleFilesGroup.style.display = 'block';
        multipleFilesGroup.setAttribute('aria-hidden', 'false');
        if (destinationPathHint) {
            destinationPathHint.textContent = 'Folder path where files will be copied';
        }
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

    if (typeof announce === 'function') {
        announce(`${type} properties form loaded`);
    }
}

// ============================================================================
// Form Group Helper
// ============================================================================

function formGroup(id, labelText, inputHtml, hintText = '', required = false, noTranslate = false) {
    const hintId = hintText ? `${id}_hint` : '';
    const requiredAttr = required ? 'aria-required="true"' : '';
    const describedBy = hintText ? `aria-describedby="${hintId}"` : '';
    const translateAttr = noTranslate ? ' translate="no"' : '';

    let html = `<div class="form-group"${translateAttr}>`;
    html += `<label for="${id}">${labelText}`;
    if (required) {
        html += ` <span class="required" aria-hidden="true">*</span>`;
    }
    html += `</label>`;

    let modifiedInput = inputHtml;
    if (requiredAttr && !modifiedInput.includes('aria-required')) {
        modifiedInput = modifiedInput.replace(/id="/, `${requiredAttr} id="`);
    }
    if (describedBy && !modifiedInput.includes('aria-describedby')) {
        modifiedInput = modifiedInput.replace(/id="/, `${describedBy} id="`);
    }

    html += modifiedInput;

    if (hintText) {
        html += `<small id="${hintId}" class="form-hint">${hintText}</small>`;
    }

    html += `</div>`;
    return html;
}

function checkboxGroup(id, labelText, checked = false) {
    const checkedAttr = checked ? 'checked' : '';
    return `
        <div class="form-group">
            <label class="checkbox-label">
                <input type="checkbox" id="${id}" ${checkedAttr}>
                <span>${labelText}</span>
            </label>
        </div>
    `;
}

// ============================================================================
// Properties Form Templates
// ============================================================================

function getPropertiesFormForType(type) {
    switch (type) {
        case 'Application':
            return `
                <fieldset class="property-group">
                    <legend>Application Properties</legend>
                    ${formGroup('prop_applicationName', 'Application Name',
                        `<input type="text" id="prop_applicationName" placeholder="e.g., Google Chrome">`,
                        '', true)}
                    ${formGroup('prop_ensureInstalled', 'Desired State',
                        `<select id="prop_ensureInstalled" onchange="toggleApplicationFields()">
                            <option value="false">Should NOT be installed (remove if found)</option>
                            <option value="true">Should be installed (install if missing)</option>
                        </select>`)}
                    ${formGroup('prop_searchPaths', 'Detection Paths (one per line)',
                        `<textarea id="prop_searchPaths" rows="3" placeholder="C:\\Program Files*\\Google\\Chrome\\Application\\chrome.exe" translate="no"></textarea>`,
                        'Wildcard paths to detect if the application is installed', false, true)}
                    <div id="uninstallFields" role="group" aria-label="Uninstall settings">
                        ${formGroup('prop_uninstallPaths', 'Uninstall Paths (one per line)',
                            `<textarea id="prop_uninstallPaths" rows="3" placeholder="C:\\Program Files*\\Google\\Chrome\\Application\\*\\Installer\\setup.exe" translate="no"></textarea>`,
                            'Paths to uninstaller executables', false, true)}
                        ${formGroup('prop_uninstallArguments', 'Uninstall Arguments',
                            `<input type="text" id="prop_uninstallArguments" placeholder="--uninstall --force-uninstall" translate="no">`,
                            '', false, true)}
                    </div>
                    <div id="installFields" style="display: none;" aria-hidden="true" role="group" aria-label="Install settings">
                        ${formGroup('prop_installCommand', 'Install Command',
                            `<input type="text" id="prop_installCommand" placeholder="winget install --id Google.Chrome --silent" translate="no">`,
                            'Command to install the application (runs as SYSTEM)', false, true)}
                        ${formGroup('prop_minimumVersion', 'Minimum Version (optional)',
                            `<input type="text" id="prop_minimumVersion" placeholder="e.g., 120.0.0" translate="no">`,
                            'Leave blank to accept any version', false, true)}
                    </div>
                </fieldset>
            `;
        case 'ShortcutsAllowList':
            return `
                <fieldset class="property-group">
                    <legend>Allow List Properties</legend>
                    ${formGroup('prop_paths', 'Paths to Check (one per line)',
                        `<textarea id="prop_paths" rows="3" placeholder="C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs" translate="no"></textarea>`,
                        'Folders where only allowed shortcuts should exist', true, true)}
                    ${checkboxGroup('prop_includeAllDesktops', 'Include All Desktops (Public + All User Profiles)')}
                    ${formGroup('prop_allowedShortcuts', 'Allowed Shortcuts (one per line)',
                        `<textarea id="prop_allowedShortcuts" rows="6" placeholder="GTA Time Clock.lnk"></textarea>`,
                        'Only these .lnk files will be kept; all others will be removed')}
                </fieldset>
            `;
        case 'FolderExists':
            return `
                <fieldset class="property-group">
                    <legend>Folder Properties</legend>
                    ${formGroup('prop_path', 'Folder Path',
                        `<input type="text" id="prop_path" placeholder="C:\\ProgramData\\Microsoft\\User Account Pictures" translate="no">`,
                        '', true, true)}
                    ${formGroup('prop_minimumFileCount', 'Minimum File Count',
                        `<input type="number" id="prop_minimumFileCount" value="1" min="1">`,
                        'Set to 0 to only check folder exists')}
                    ${formGroup('prop_sourceAssetPath', 'Source Asset Path (relative)',
                        `<input type="text" id="prop_sourceAssetPath" placeholder="AccountPictures" translate="no">`,
                        'Relative to Assets folder - files copied if folder has fewer than minimum', false, true)}
                </fieldset>
            `;
        case 'FilesExist':
            return `
                <fieldset class="property-group">
                    <legend>Files Properties</legend>
                    ${formGroup('prop_mode', 'Mode',
                        `<select id="prop_mode" onchange="toggleFilesExistMode()">
                            <option value="MultipleFiles">Multiple Files (copy files to folder)</option>
                            <option value="SingleFile">Single File (copy file to exact path)</option>
                        </select>`,
                        'Choose whether deploying multiple files to a folder or one file to a specific path')}
                    ${formGroup('prop_destinationPath', 'Destination Path',
                        `<input type="text" id="prop_destinationPath" placeholder="C:\\ProgramData\\ConfigurationBlender\\Icons" translate="no">`,
                        'Folder path where files will be copied', true, true)}
                    <div id="multipleFilesGroup" role="group" aria-label="Multiple files settings">
                        ${formGroup('prop_files', 'Required Files (one per line)',
                            `<textarea id="prop_files" rows="6" placeholder="icon1.ico&#10;icon2.ico" translate="no"></textarea>`,
                            '', false, true)}
                    </div>
                    ${formGroup('prop_sourceAssetPath', 'Source Asset Path (relative)',
                        `<input type="text" id="prop_sourceAssetPath" placeholder="Icons" translate="no">`,
                        'Relative to Assets folder (do not include "Assets\\")', false, true)}
                </fieldset>
            `;
        case 'ShortcutProperties':
        case 'ShortcutExists': // backward compatibility
            return `
                <fieldset class="property-group">
                    <legend>Shortcut Properties</legend>
                    ${formGroup('prop_path', 'Shortcut Path',
                        `<input type="text" id="prop_path" placeholder="C:\\ProgramData\\...\\Shortcut.lnk" translate="no">`,
                        '', true, true)}
                    ${formGroup('prop_targetPath', 'Target Path',
                        `<input type="text" id="prop_targetPath" placeholder="C:\\Program Files\\...\\app.exe" translate="no">`,
                        '', true, true)}
                    ${formGroup('prop_arguments', 'Arguments',
                        `<input type="text" id="prop_arguments" placeholder="--kiosk http://example.com" translate="no">`,
                        '', false, true)}
                    ${formGroup('prop_iconLocation', 'Icon Location',
                        `<input type="text" id="prop_iconLocation" placeholder="C:\\...\\icon.ico" translate="no">`,
                        '', false, true)}
                    ${formGroup('prop_description', 'Description',
                        `<input type="text" id="prop_description" placeholder="Shortcut description">`)}
                </fieldset>
            `;
        case 'AssignedAccess':
            return `
                <fieldset class="property-group">
                    <legend>Assigned Access Properties</legend>
                    <div class="alert alert-warning" role="alert">
                        <strong>Required Companion Checks:</strong>
                        <p>AssignedAccess pins Edge shortcuts to the Start Menu, but they display as "Microsoft Edge" by default. To show custom names:</p>
                        <ol>
                            <li><strong>FilesExist check (SingleFile mode)</strong>: Deploy a manifest rename script (e.g., Scripts\\Rename-StartPins.ps1)</li>
                            <li><strong>ScheduledTaskExists check</strong>: Run the script at user logon to rename the pinned shortcuts</li>
                        </ol>
                        <p><em>The script modifies the Start Menu manifest to display your preferred shortcut names instead of "Microsoft Edge".</em></p>
                    </div>
                    ${formGroup('prop_profileId', 'Profile ID (GUID)',
                        `<input type="text" id="prop_profileId" placeholder="{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}" translate="no">`,
                        '', true, true)}
                    ${formGroup('prop_displayName', 'Display Name',
                        `<input type="text" id="prop_displayName" placeholder="Kiosk Profile">`)}
                    ${formGroup('prop_allowedApps', 'Allowed Apps (one per line)',
                        `<textarea id="prop_allowedApps" rows="6" placeholder="C:\\Program Files\\...\\app.exe" translate="no"></textarea>`,
                        '', false, true)}
                    ${formGroup('prop_startPins', 'Start Pins (one per line)',
                        `<textarea id="prop_startPins" rows="6" placeholder="%ALLUSERSPROFILE%\\...\\Shortcut.lnk" translate="no"></textarea>`,
                        'These will display as "Microsoft Edge" until renamed by the manifest script', false, true)}
                    ${checkboxGroup('prop_showTaskbar', 'Show Taskbar', true)}
                    ${formGroup('prop_allowedNamespaces', 'Allowed Namespaces (one per line)',
                        `<textarea id="prop_allowedNamespaces" rows="2" placeholder="Downloads" translate="no"></textarea>`,
                        '', false, true)}
                </fieldset>
            `;
        case 'RegistryValue':
            return `
                <fieldset class="property-group" translate="no">
                    <legend>Registry Properties</legend>
                    ${formGroup('prop_path', 'Registry Path',
                        `<input type="text" id="prop_path" placeholder="HKLM:\\SOFTWARE\\...">`,
                        '', true, true)}
                    ${formGroup('prop_name', 'Value Name',
                        `<input type="text" id="prop_name" placeholder="ValueName">`,
                        '', true, true)}
                    ${formGroup('prop_value', 'Value',
                        `<input type="text" id="prop_value" placeholder="1">`,
                        '', true, true)}
                    ${formGroup('prop_type', 'Type',
                        `<select id="prop_type">
                            <option value="String">String</option>
                            <option value="DWord">DWord</option>
                            <option value="QWord">QWord</option>
                            <option value="Binary">Binary</option>
                            <option value="MultiString">MultiString</option>
                            <option value="ExpandString">ExpandString</option>
                        </select>`,
                        '', false, true)}
                </fieldset>
            `;
        case 'ScheduledTaskExists':
            return `
                <fieldset class="property-group">
                    <legend>Scheduled Task Properties</legend>
                    ${formGroup('prop_taskName', 'Task Name',
                        `<input type="text" id="prop_taskName" placeholder="MyTask">`,
                        '', true)}
                    ${formGroup('prop_taskPath', 'Task Path',
                        `<input type="text" id="prop_taskPath" value="\\" translate="no">`,
                        '', false, true)}
                    ${formGroup('prop_execute', 'Execute',
                        `<input type="text" id="prop_execute" placeholder="Powershell.exe" translate="no">`,
                        '', true, true)}
                    ${formGroup('prop_arguments', 'Arguments',
                        `<input type="text" id="prop_arguments" placeholder="-File C:\\...\\script.ps1" translate="no">`,
                        '', false, true)}
                    ${formGroup('prop_trigger', 'Trigger',
                        `<select id="prop_trigger">
                            <option value="AtLogOn">At Logon</option>
                            <option value="AtStartup">At Startup</option>
                        </select>`)}
                    ${formGroup('prop_runLevel', 'Run Level',
                        `<select id="prop_runLevel">
                            <option value="Highest">Highest</option>
                            <option value="Limited">Limited</option>
                        </select>`)}
                    ${formGroup('prop_principal', 'Principal',
                        `<input type="text" id="prop_principal" value="NT AUTHORITY\\SYSTEM" translate="no">`,
                        '', false, true)}
                </fieldset>
            `;
        case 'ServiceRunning':
            return `
                <fieldset class="property-group">
                    <legend>Service Properties</legend>
                    ${formGroup('prop_serviceName', 'Service Name',
                        `<input type="text" id="prop_serviceName" placeholder="e.g., Spooler" translate="no">`,
                        '', true, true)}
                    ${formGroup('prop_startupType', 'Startup Type',
                        `<select id="prop_startupType">
                            <option value="Automatic">Automatic</option>
                            <option value="Manual">Manual</option>
                            <option value="Disabled">Disabled</option>
                        </select>`)}
                    ${checkboxGroup('prop_ensureRunning', 'Ensure Service is Running', true)}
                </fieldset>
            `;
        case 'PrinterInstalled':
            return `
                <fieldset class="property-group">
                    <legend>Network Printer Properties</legend>
                    <div class="alert alert-warning" role="alert">
                        <strong>Important:</strong>
                        The printer driver must be installed BEFORE adding the printer. Use a "Driver Installed" check first to deploy the driver package.
                    </div>
                    ${formGroup('prop_printerName', 'Printer Name',
                        `<input type="text" id="prop_printerName" placeholder="e.g., Office-HP-LaserJet-3F">`,
                        '', true)}
                    ${formGroup('prop_driverName', 'Printer Driver Name (Exact Match Required)',
                        `<input type="text" id="prop_driverName" placeholder="e.g., HP Universal Printing PCL 6">`,
                        'Must match the driver name exactly as installed. Run "Get-PrinterDriver" to see installed drivers.', true)}
                    ${formGroup('prop_printerIP', 'Printer IP Address or Hostname',
                        `<input type="text" id="prop_printerIP" placeholder="e.g., 192.168.1.100 or PRINTER-3F" translate="no">`,
                        '', true, true)}
                    ${formGroup('prop_portName', 'Port Name',
                        `<input type="text" id="prop_portName" placeholder="e.g., IP_192.168.1.100 or PRINTER-3F" translate="no">`,
                        'Can be IP-based (IP_192.168.1.100) or hostname (PRINTER-3F)', true, true)}
                    ${formGroup('prop_portType', 'Port Type',
                        `<select id="prop_portType" onchange="toggleLprQueue()">
                            <option value="TCP">TCP/IP Port (Standard)</option>
                            <option value="LPR">LPR Port</option>
                        </select>`,
                        'TCP for most network printers, LPR for Unix/Linux print servers')}
                    <div class="form-group" id="lprQueueGroup" style="display:none;" aria-hidden="true" translate="no">
                        <label for="prop_lprQueue">
                            LPR Queue Name (Required for LPR)
                            <span class="required" aria-hidden="true">*</span>
                        </label>
                        <input type="text" id="prop_lprQueue" placeholder="e.g., lp0 or print" aria-describedby="prop_lprQueue_hint">
                        <small id="prop_lprQueue_hint" class="form-hint">The queue name on the LPR print server</small>
                    </div>
                    ${checkboxGroup('prop_setAsDefault', 'Set as Default Printer')}
                </fieldset>
            `;
        case 'DriverInstalled':
            return `
                <fieldset class="property-group">
                    <legend>Driver Properties</legend>
                    <div class="alert alert-info" role="note">
                        <strong>Tip:</strong>
                        Place the complete driver package (.inf + all referenced files) in Assets/Drivers/. For printer drivers, add this check BEFORE the "Printer Installed" check.
                    </div>
                    ${formGroup('prop_driverName', 'Driver Name',
                        `<input type="text" id="prop_driverName" placeholder="e.g., HP Universal Printing PCL 6">`,
                        'Name as it appears after installation (check Device Manager or Get-PrinterDriver)', true)}
                    ${formGroup('prop_driverClass', 'Driver Class (Optional)',
                        `<select id="prop_driverClass">
                            <option value="">Any Class</option>
                            <option value="Display">Display</option>
                            <option value="Net">Network</option>
                            <option value="AudioEndpoint">Audio</option>
                            <option value="Printer">Printer</option>
                            <option value="USB">USB</option>
                            <option value="System">System</option>
                        </select>`)}
                    ${formGroup('prop_sourceAssetPath', 'Source Asset Path (.inf file)',
                        `<input type="text" id="prop_sourceAssetPath" placeholder="Drivers\\HPUniversal\\hpcu255u.inf" translate="no">`,
                        'Path to .inf file. All driver files must be in same folder or subfolders.', false, true)}
                    ${formGroup('prop_minimumVersion', 'Minimum Version (Optional)',
                        `<input type="text" id="prop_minimumVersion" placeholder="e.g., 3.0 or 30.0.101.1960" translate="no">`,
                        'If specified, driver will be updated if installed version is older', false, true)}
                </fieldset>
            `;
        case 'WindowsFeature':
            return `
                <fieldset class="property-group">
                    <legend>Windows Feature Properties</legend>
                    ${formGroup('prop_featureName', 'Feature Name',
                        `<input type="text" id="prop_featureName" placeholder="e.g., Microsoft-Hyper-V-All" translate="no">`,
                        'Use Get-WindowsOptionalFeature -Online to find feature names', true, true)}
                    ${formGroup('prop_state', 'Desired State',
                        `<select id="prop_state">
                            <option value="Enabled">Enabled</option>
                            <option value="Disabled">Disabled</option>
                        </select>`)}
                </fieldset>
            `;
        case 'FirewallRule':
            return `
                <fieldset class="property-group">
                    <legend>Firewall Rule Properties</legend>
                    ${formGroup('prop_ruleName', 'Rule Name',
                        `<input type="text" id="prop_ruleName" placeholder="e.g., Block Telemetry">`,
                        '', true)}
                    ${formGroup('prop_displayName', 'Display Name',
                        `<input type="text" id="prop_displayName" placeholder="e.g., Block Windows Telemetry">`)}
                    ${formGroup('prop_direction', 'Direction',
                        `<select id="prop_direction">
                            <option value="Inbound">Inbound</option>
                            <option value="Outbound">Outbound</option>
                        </select>`)}
                    ${formGroup('prop_action', 'Action',
                        `<select id="prop_action">
                            <option value="Allow">Allow</option>
                            <option value="Block">Block</option>
                        </select>`)}
                    ${formGroup('prop_protocol', 'Protocol (Optional)',
                        `<select id="prop_protocol">
                            <option value="">Any</option>
                            <option value="TCP">TCP</option>
                            <option value="UDP">UDP</option>
                            <option value="ICMPv4">ICMPv4</option>
                            <option value="ICMPv6">ICMPv6</option>
                        </select>`)}
                    ${formGroup('prop_remoteAddress', 'Remote Address (Optional)',
                        `<input type="text" id="prop_remoteAddress" placeholder="e.g., 192.168.1.0/24 or telemetry.microsoft.com" translate="no">`,
                        '', false, true)}
                    ${formGroup('prop_remotePort', 'Remote Port (Optional)',
                        `<input type="text" id="prop_remotePort" placeholder="e.g., 443 or 80,443" translate="no">`,
                        '', false, true)}
                    ${formGroup('prop_localPort', 'Local Port (Optional)',
                        `<input type="text" id="prop_localPort" placeholder="e.g., 8080" translate="no">`,
                        '', false, true)}
                    ${formGroup('prop_program', 'Program Path (Optional)',
                        `<input type="text" id="prop_program" placeholder="e.g., C:\\Program Files\\App\\app.exe" translate="no">`,
                        '', false, true)}
                    ${checkboxGroup('prop_enabled', 'Rule Enabled', true)}
                </fieldset>
            `;
        case 'CertificateInstalled':
            return `
                <fieldset class="property-group">
                    <legend>Certificate Properties</legend>
                    ${formGroup('prop_storeLocation', 'Certificate Store Location',
                        `<select id="prop_storeLocation">
                            <option value="LocalMachine">Local Machine</option>
                            <option value="CurrentUser">Current User</option>
                        </select>`)}
                    ${formGroup('prop_storeName', 'Certificate Store Name',
                        `<select id="prop_storeName">
                            <option value="My">Personal (My)</option>
                            <option value="Root">Trusted Root CA (Root)</option>
                            <option value="CA">Intermediate CA (CA)</option>
                            <option value="TrustedPublisher">Trusted Publishers</option>
                            <option value="TrustedPeople">Trusted People</option>
                        </select>`)}
                    ${formGroup('prop_thumbprint', 'Certificate Thumbprint (Preferred)',
                        `<input type="text" id="prop_thumbprint" placeholder="e.g., 1A2B3C4D5E6F..." translate="no">`,
                        'The unique SHA1 thumbprint of the certificate', false, true)}
                    ${formGroup('prop_subject', 'Certificate Subject (Alternative)',
                        `<input type="text" id="prop_subject" placeholder="e.g., CN=MyCert or *.example.com" translate="no">`,
                        'Partial match on certificate subject. Use if thumbprint unknown.', false, true)}
                    ${formGroup('prop_issuer', 'Expected Issuer (Optional)',
                        `<input type="text" id="prop_issuer" placeholder="e.g., DigiCert or CN=Enterprise CA" translate="no">`,
                        'Verify the certificate was issued by expected CA', false, true)}
                    ${formGroup('prop_minimumDaysValid', 'Minimum Days Valid (Optional)',
                        `<input type="number" id="prop_minimumDaysValid" placeholder="e.g., 30" min="0">`,
                        'Alert if certificate expires within this many days')}
                    ${formGroup('prop_sourceAssetPath', 'Source Asset Path (for remediation)',
                        `<input type="text" id="prop_sourceAssetPath" placeholder="Certificates\\MyCert.cer" translate="no">`,
                        'Relative to Assets folder. Supports .cer, .crt, .pfx, .p12', false, true)}
                    <div class="form-group" translate="no">
                        <label for="prop_pfxPassword">PFX Password (if .pfx/.p12)</label>
                        <input type="password" id="prop_pfxPassword" placeholder="Password for PFX file" aria-describedby="prop_pfxPassword_hint">
                        <small id="prop_pfxPassword_hint" class="form-hint form-hint-warning">Warning: Stored in plain text in Config.json</small>
                    </div>
                </fieldset>
            `;
        case 'EdgeFavorites':
            return `
                <fieldset class="property-group">
                    <legend>Edge Favorites Properties</legend>
                    <div class="alert alert-info" role="note">
                        <strong>How it works:</strong>
                        <p>Manages Edge's favorites bar for all user profiles. The HTML file should be in Netscape Bookmark format (same as Edge export).</p>
                        <ul>
                            <li>Favorites are sorted alphabetically by name on the favorites bar</li>
                            <li>No folders - all favorites appear directly on the bar</li>
                            <li>Edge will be closed during remediation to update the Bookmarks file</li>
                        </ul>
                    </div>
                    ${formGroup('prop_sourceAssetPath', 'Favorites HTML File (relative to Assets)',
                        `<input type="text" id="prop_sourceAssetPath" placeholder="Favorites/US_CBL_Favorites.html" translate="no">`,
                        'Netscape Bookmark format HTML file exported from Edge or created manually', true, true)}
                </fieldset>
            `;
        case 'NetworkAdapterConfiguration':
            return `
                <fieldset class="property-group">
                    <legend>Adapter Identification</legend>
                    <div class="form-group">
                        <label for="prop_identificationMode">Identification Mode</label>
                        <select id="prop_identificationMode" onchange="toggleNetworkAdapterMode()">
                            <option value="traditional">By Name, Description, or MAC</option>
                            <option value="subnet">By Current Subnet (DHCP to Static)</option>
                        </select>
                        <small class="form-help">Subnet mode finds adapters by their current DHCP IP range</small>
                    </div>
                    <div id="traditionalAdapterFields">
                        ${formGroup('prop_adapterName', 'Adapter Name',
                            `<input type="text" id="prop_adapterName" placeholder="e.g., Ethernet 2">`,
                            'Exact name as shown in Network Connections')}
                        ${formGroup('prop_adapterDescription', 'Adapter Description (Alternative)',
                            `<input type="text" id="prop_adapterDescription" placeholder="e.g., Intel(R) I211 Gigabit">`,
                            'Partial match on hardware description')}
                        ${formGroup('prop_macAddress', 'MAC Address (Alternative)',
                            `<input type="text" id="prop_macAddress" placeholder="e.g., 00:1A:2B:3C:4D:5E or 00-1A-2B-3C-4D-5E" translate="no">`,
                            'Physical address of the adapter', false, true)}
                    </div>
                    <div id="subnetAdapterFields" style="display: none;">
                        ${formGroup('prop_identifyByCurrentSubnet', 'Target Subnet (CIDR)',
                            `<input type="text" id="prop_identifyByCurrentSubnet" placeholder="e.g., 192.168.0.0/24" translate="no">`,
                            'Find wired adapter with IP in this subnet', true, true)}
                        ${formGroup('prop_excludeSubnets', 'Exclude Subnets (safety, one per line)',
                            `<textarea id="prop_excludeSubnets" rows="2" placeholder="10.0.0.0/8&#10;172.16.0.0/12" translate="no"></textarea>`,
                            'Corporate subnets that should NEVER be modified', false, true)}
                        <div class="info-box">
                            <strong>Safeguards:</strong> Only wired adapters are checked. Adapters with a gateway outside the target subnet are skipped (protects corporate network).
                        </div>
                    </div>
                </fieldset>
                <fieldset class="property-group" translate="no">
                    <legend>IP Configuration</legend>
                    ${formGroup('prop_ipMode', 'IP Assignment Mode',
                        `<select id="prop_ipMode" onchange="toggleIPMode()">
                            <option value="single">Single Static IP</option>
                            <option value="range">IP Range (Multi-Device)</option>
                        </select>`,
                        'Range mode: finds unused IP via ping sweep (requires 2+ wired NICs)')}
                    <div id="singleIPFields">
                        ${formGroup('prop_staticIPAddress', 'Static IP Address',
                            `<input type="text" id="prop_staticIPAddress" placeholder="e.g., 192.168.0.100">`,
                            'The exact IP to assign to this adapter', true, true)}
                    </div>
                    <div id="rangeIPFields" style="display: none;">
                        ${formGroup('prop_staticIPRange', 'Static IP Range',
                            `<input type="text" id="prop_staticIPRange" placeholder="e.g., 192.168.20.1-192.168.20.20">`,
                            'Format: startIP-endIP. Ping sweep finds first available.', true, true)}
                        <div class="info-box">
                            <strong>Dual-NIC Mode:</strong> Only applies to devices with 2+ wired connections. Finds the adapter with DHCP IP in this range and converts it to static.
                        </div>
                    </div>
                    ${formGroup('prop_subnetPrefixLength', 'Subnet Prefix Length',
                        `<input type="number" id="prop_subnetPrefixLength" placeholder="e.g., 24" min="1" max="32">`,
                        '24 = 255.255.255.0, 16 = 255.255.0.0', false, true)}
                    ${formGroup('prop_defaultGateway', 'Default Gateway',
                        `<input type="text" id="prop_defaultGateway" placeholder="Leave empty for isolated network">`,
                        'Empty = no gateway (prevents routing through this adapter)', false, true)}
                </fieldset>
                <fieldset class="property-group">
                    <legend>DNS Configuration</legend>
                    ${formGroup('prop_dnsServers', 'DNS Servers (one per line)',
                        `<textarea id="prop_dnsServers" rows="2" placeholder="Leave empty to clear DNS"></textarea>`,
                        'Empty = no DNS servers (prevents DNS queries on this adapter)', false, true)}
                    ${checkboxGroup('prop_registerInDns', 'Register this connection in DNS', false)}
                    <small class="form-help" style="margin-top: -0.5rem; display: block;">Disable for private equipment networks to prevent DNS conflicts</small>
                </fieldset>
                <fieldset class="property-group">
                    <legend>Network Profile & Settings</legend>
                    ${formGroup('prop_networkCategory', 'Network Category',
                        `<select id="prop_networkCategory">
                            <option value="">Do not change</option>
                            <option value="Private">Private</option>
                            <option value="Public">Public</option>
                        </select>`,
                        'Private enables network discovery; Public is more secure')}
                    ${formGroup('prop_interfaceMetric', 'Interface Metric (Priority)',
                        `<input type="number" id="prop_interfaceMetric" placeholder="e.g., 9999" min="1">`,
                        'Higher = lower priority. Use 9999 for equipment networks so corporate NIC is preferred.')}
                    ${checkboxGroup('prop_ensureEnabled', 'Ensure Adapter is Enabled', true)}
                </fieldset>
            `;
        default:
            return `<p role="status">Select a check type to see properties.</p>`;
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

    // Handle conditional field visibility
    const portTypeElement = document.getElementById('prop_portType');
    if (portTypeElement) {
        toggleLprQueue();
    }

    const ensureInstalledElement = document.getElementById('prop_ensureInstalled');
    if (ensureInstalledElement) {
        toggleApplicationFields();
    }

    // Handle NetworkAdapterConfiguration mode toggle
    const idModeElement = document.getElementById('prop_identificationMode');
    if (idModeElement) {
        // Determine mode from properties
        if (properties.identifyByCurrentSubnet) {
            idModeElement.value = 'subnet';
        } else {
            idModeElement.value = 'traditional';
        }
        toggleNetworkAdapterMode();
    }

    // Handle IP mode toggle (single vs range)
    const ipModeElement = document.getElementById('prop_ipMode');
    if (ipModeElement) {
        if (properties.staticIPRange) {
            ipModeElement.value = 'range';
        } else {
            ipModeElement.value = 'single';
        }
        toggleIPMode();
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
        case 'ShortcutsAllowList':
            properties.paths = document.getElementById('prop_paths').value.split('\n').filter(p => p.trim());
            properties.includeAllDesktops = document.getElementById('prop_includeAllDesktops').checked;
            properties.allowedShortcuts = document.getElementById('prop_allowedShortcuts').value.split('\n').filter(p => p.trim());
            break;
        case 'FolderExists':
            properties.path = document.getElementById('prop_path').value;
            properties.minimumFileCount = parseInt(document.getElementById('prop_minimumFileCount').value) || 0;
            properties.sourceAssetPath = document.getElementById('prop_sourceAssetPath').value;
            break;
        case 'FilesExist':
            properties.mode = document.getElementById('prop_mode').value;
            properties.destinationPath = document.getElementById('prop_destinationPath').value;
            properties.sourceAssetPath = document.getElementById('prop_sourceAssetPath').value;
            // Only include files array for MultipleFiles mode
            if (properties.mode === 'MultipleFiles') {
                properties.files = document.getElementById('prop_files').value.split('\n').filter(p => p.trim());
            }
            break;
        case 'ShortcutProperties':
        case 'ShortcutExists': // backward compatibility
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
        case 'EdgeFavorites':
            properties.sourceAssetPath = document.getElementById('prop_sourceAssetPath').value;
            break;
        case 'NetworkAdapterConfiguration':
            // Identification mode determines which fields to use
            const idMode = document.getElementById('prop_identificationMode').value;
            if (idMode === 'subnet') {
                // Subnet-based identification
                const targetSubnet = document.getElementById('prop_identifyByCurrentSubnet').value;
                if (targetSubnet) properties.identifyByCurrentSubnet = targetSubnet;
                const excludeText = document.getElementById('prop_excludeSubnets').value;
                if (excludeText) {
                    properties.excludeSubnets = excludeText.split('\n').map(s => s.trim()).filter(s => s);
                }
            } else {
                // Traditional identification
                const adapterName = document.getElementById('prop_adapterName').value;
                if (adapterName) properties.adapterName = adapterName;
                const adapterDesc = document.getElementById('prop_adapterDescription').value;
                if (adapterDesc) properties.adapterDescription = adapterDesc;
                const macAddr = document.getElementById('prop_macAddress').value;
                if (macAddr) properties.macAddress = macAddr;
            }
            // IP Configuration - single IP or range mode
            const ipMode = document.getElementById('prop_ipMode').value;
            if (ipMode === 'range') {
                const staticIPRange = document.getElementById('prop_staticIPRange').value;
                if (staticIPRange) properties.staticIPRange = staticIPRange;
            } else {
                const staticIP = document.getElementById('prop_staticIPAddress').value;
                if (staticIP) properties.staticIPAddress = staticIP;
            }
            const prefixLen = document.getElementById('prop_subnetPrefixLength').value;
            if (prefixLen) properties.subnetPrefixLength = parseInt(prefixLen);
            // Gateway: empty string means "no gateway" (important for isolated networks)
            const gateway = document.getElementById('prop_defaultGateway').value;
            properties.defaultGateway = gateway; // Include even if empty to indicate "no gateway"
            // DNS: empty array means "clear DNS" (important for isolated networks)
            const dnsText = document.getElementById('prop_dnsServers').value;
            properties.dnsServers = dnsText ? dnsText.split('\n').map(d => d.trim()).filter(d => d) : [];
            // DNS Registration
            properties.registerInDns = document.getElementById('prop_registerInDns').checked;
            // Network settings
            const netCategory = document.getElementById('prop_networkCategory').value;
            if (netCategory) properties.networkCategory = netCategory;
            const metric = document.getElementById('prop_interfaceMetric').value;
            if (metric) properties.interfaceMetric = parseInt(metric);
            properties.ensureEnabled = document.getElementById('prop_ensureEnabled').checked;
            break;
    }

    return properties;
}
