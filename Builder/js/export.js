/* ============================================================================
   Configuration Blender - Export/Import
   WCAG 2.1/2.2 AA Compliant
   ============================================================================ */

// ============================================================================
// Version and Date Helpers
// ============================================================================

function getTodayDate() {
    const today = new Date();
    return today.toISOString().split('T')[0]; // YYYY-MM-DD format
}

function incrementVersion(version) {
    if (!version) return '1.0.1';
    const parts = version.split('.');
    if (parts.length === 3) {
        parts[2] = String(parseInt(parts[2] || 0) + 1);
        return parts.join('.');
    }
    return version + '.1';
}

// ============================================================================
// Import Configuration
// ============================================================================

function importConfig() {
    document.getElementById('fileInput').click();
}

function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const config = JSON.parse(e.target.result);
            // Auto-increment version and set today's date
            const newVersion = incrementVersion(config.version || '1.0.0');
            document.getElementById('configVersion').value = newVersion;
            document.getElementById('configRole').value = config.role || '';
            document.getElementById('configDescription').value = config.description || '';
            document.getElementById('configAuthor').value = config.author || '';
            document.getElementById('configDate').value = getTodayDate();
            checks = config.checks || [];
            renderChecksList();
            markUnsaved();

            // Show success message
            const message = `Configuration imported. Version bumped to ${newVersion}`;
            showStatus(message, 'success');

            // Announce to screen readers
            if (typeof announceSuccess === 'function') {
                announceSuccess(message);
            }
        } catch (err) {
            const message = `Failed to parse JSON file: ${err.message}`;
            showStatus(message, 'error');

            // Play error sound
            if (typeof playErrorSound === 'function') {
                playErrorSound();
            }

            // Announce to screen readers
            if (typeof announceError === 'function') {
                announceError(message);
            }
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ============================================================================
// Export Configuration
// ============================================================================

function doExportConfig() {
    const config = getConfig();
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Mark as saved
    markSaved();

    // Show success message
    const role = config.role || '[ROLE]';
    const successMessage = 'Config.json exported successfully!';

    // Use accessible modal/toast instead of alert
    if (typeof showStatus === 'function') {
        showStatus(successMessage, 'success');
    }

    // Show detailed info in a more accessible way
    const detailMessage = `${successMessage}\n\nMove this file to:\nConfigurations\\${role}\\Config.json\n\nPlace any assets in:\nConfigurations\\${role}\\Assets\\`;
    alert(detailMessage);

    // Play success sound
    if (typeof playSuccessSound === 'function') {
        playSuccessSound();
    }

    // Announce to screen readers
    if (typeof announceSuccess === 'function') {
        announceSuccess(successMessage);
    }
}

function exportConfig() {
    if (checks.length === 0) {
        const message = 'No checks to export. Add at least one check first.';
        showStatus(message, 'error');

        if (typeof playErrorSound === 'function') {
            playErrorSound();
        }

        if (typeof announceError === 'function') {
            announceError(message);
        }
        return;
    }

    const { errors } = validateConfiguration();
    if (errors.length > 0) {
        showValidationResults();
        if (!confirm('Configuration has errors. Export anyway?')) {
            return;
        }
    }
    doExportConfig();
}

// ============================================================================
// Summary Export - Icons
// ============================================================================

const checkTypeIcons = {
    'Application': '📦',
    'FolderEmpty': '📁',
    'FolderExists': '📁',
    'FilesExist': '📄',
    'ShortcutsAllowList': '🔗',
    'ShortcutExists': '🔗',
    'AssignedAccess': '🖥️',
    'RegistryValue': '🗝️',
    'ScheduledTaskExists': '⏰',
    'ServiceRunning': '⚙️',
    'PrinterInstalled': '🖨️',
    'DriverInstalled': '🔧',
    'WindowsFeature': '⚙️',
    'FirewallRule': '🛡️',
    'CertificateInstalled': '🔐',
    'NetworkAdapterConfiguration': '🌐'
};

// ============================================================================
// Summary Export - Type-Specific Generators
// ============================================================================

function generateApplicationSummary(props) {
    let md = '```mermaid\nflowchart LR\n';
    if (props.ensureInstalled) {
        md += `    A[Check for ${props.applicationName}] --> B{Installed?}\n`;
        md += '    B -->|Yes| C[✅ Pass]\n';
        md += '    B -->|No| D[Run Installer]\n';
        md += '    D --> E[✅ Installed]\n';
    } else {
        md += `    A[Search for ${props.applicationName}] --> B{Found?}\n`;
        md += '    B -->|No| C[✅ Pass]\n';
        md += '    B -->|Yes| D[Run Uninstaller]\n';
        md += '    D --> E[✅ Removed]\n';
    }
    md += '```\n\n';

    md += `**Desired State:** ${props.ensureInstalled ? 'Should be installed' : 'Should NOT be installed'}\n\n`;

    md += '**Detection:**\n';
    md += `- Application: \`${props.applicationName}\`\n`;
    md += 'Searches in:\n';
    (props.searchPaths || []).forEach(p => {
        md += `- \`${p}\`\n`;
    });
    if (props.minimumVersion) md += `- Minimum Version: \`${props.minimumVersion}\`\n`;

    md += '\n**Remediation:**\n';
    if (props.ensureInstalled) {
        if (props.installCommand) md += `- Install Command: \`${props.installCommand}\`\n`;
    } else {
        md += 'Runs uninstaller from:\n';
        (props.uninstallPaths || []).forEach(p => {
            md += `- \`${p}\`\n`;
        });
        if (props.uninstallArguments) {
            md += `\nArguments: \`${props.uninstallArguments}\`\n`;
        }
    }
    return md;
}

function generateFolderEmptySummary(props) {
    let md = '```mermaid\nflowchart LR\n';
    md += '    A[Check Folders] --> B{Empty?}\n';
    md += '    B -->|Yes| C[✅ Pass]\n';
    md += '    B -->|No| D[Delete Contents]\n';
    md += '    D --> E[✅ Cleared]\n';
    md += '```\n\n';

    md += '**Detection:**\n';
    md += 'Checks if these folders are empty:\n';
    (props.paths || []).forEach(p => {
        md += `- \`${p}\`\n`;
    });
    if (props.includeAllUserProfiles) {
        md += '\n*Also checks all user profile folders*\n';
    }

    md += '\n**Remediation:**\n';
    md += 'Deletes all files and subfolders from the listed paths.\n';
    return md;
}

function generateFolderExistsSummary(props) {
    let md = '```mermaid\nflowchart LR\n';
    md += `    A[Check ${props.path}] --> B{Has ${props.minimumFileCount || 1}+ files?}\n`;
    md += '    B -->|Yes| C[✅ Pass]\n';
    md += '    B -->|No| D[Copy from Assets]\n';
    md += '    D --> E[✅ Files Present]\n';
    md += '```\n\n';

    md += '**Detection:**\n';
    md += `- Path: \`${props.path}\`\n`;
    md += `- Minimum Files Required: ${props.minimumFileCount || 1}\n`;

    md += '\n**Remediation:**\n';
    md += `- Copies files from: \`Assets\\${props.sourceAssetPath}\`\n`;
    return md;
}

function generateFilesExistSummary(props) {
    // Handle SingleFile mode
    if (props.mode === 'SingleFile') {
        const fileName = props.destinationPath.split('\\').pop();
        let md = '```mermaid\nflowchart LR\n';
        md += `    A[Assets/${props.sourceAssetPath}] -->|Copy| B[${fileName}]\n`;
        md += '```\n\n';

        md += '**File Details:**\n';
        md += `| Property | Value |\n|----------|-------|\n`;
        md += `| Destination | \`${props.destinationPath}\` |\n`;
        md += `| Source | \`Assets\\${props.sourceAssetPath}\` |\n`;

        md += '\n**Remediation:**\n';
        md += 'Copies the file from Assets to the destination path.\n';
        return md;
    }

    // MultipleFiles mode (default)
    let md = '**Detection:**\n';
    md += `Checks if these files exist in \`${props.destinationPath}\`:\n\n`;
    md += '| File | Status |\n|------|--------|\n';
    (props.files || []).forEach(f => {
        md += `| \`${f}\` | Required |\n`;
    });

    md += '\n**Remediation:**\n';
    md += `Copies missing files from \`Assets\\${props.sourceAssetPath}\`\n`;
    return md;
}

function generateShortcutsAllowListSummary(props) {
    let md = '**Detection:**\n';
    md += `Scans \`${props.path}\` for shortcuts.\n\n`;
    md += '**Allowed Shortcuts:**\n';
    md += '| Shortcut | Status |\n|----------|--------|\n';
    (props.allowedShortcuts || []).forEach(s => {
        md += `| ${s} | ✅ Allowed |\n`;
    });

    md += '\n**Remediation:**\n';
    md += 'Deletes any shortcuts NOT in the allowed list.\n';
    return md;
}

function generateShortcutExistsSummary(props) {
    // Extract URL from arguments if Edge kiosk
    let target = props.targetPath;
    let url = '';
    if (props.arguments && props.arguments.includes('--kiosk')) {
        const match = props.arguments.match(/--kiosk\s+(https?:\/\/[^\s]+)/);
        if (match) url = match[1];
    }

    let md = '```mermaid\nflowchart LR\n';
    if (url) {
        md += `    A[🔗 ${props.description || 'Shortcut'}] --> B[Edge Kiosk]\n`;
        md += `    B --> C[${url}]\n`;
    } else {
        md += `    A[🔗 ${props.description || 'Shortcut'}] --> B[${target.split('\\\\').pop()}]\n`;
    }
    md += '```\n\n';

    md += '**Shortcut Details:**\n';
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| Path | \`${props.path}\` |\n`;
    md += `| Target | \`${props.targetPath}\` |\n`;
    if (props.arguments) md += `| Arguments | \`${props.arguments}\` |\n`;
    if (props.iconLocation) md += `| Icon | \`${props.iconLocation}\` |\n`;
    if (props.description) md += `| Description | ${props.description} |\n`;

    md += '\n**Remediation:**\n';
    md += 'Creates or updates the shortcut with the specified properties.\n';
    return md;
}

function generateAssignedAccessSummary(props) {
    let md = '```mermaid\nflowchart TD\n';
    md += '    subgraph Kiosk["🖥️ ' + (props.displayName || 'Kiosk') + '"]\n';
    md += '        subgraph Apps["Allowed Applications"]\n';
    (props.allowedApps || []).forEach((app, i) => {
        const appName = app.split('\\\\').pop().replace('.exe', '').replace('.EXE', '');
        md += `            A${i}[${appName}]\n`;
    });
    md += '        end\n';
    md += '        subgraph Pins["Start Menu Pins"]\n';
    (props.startPins || []).slice(0, 5).forEach((pin, i) => {
        const pinName = pin.split('\\\\').pop().replace('.lnk', '');
        md += `            P${i}[${pinName}]\n`;
    });
    if ((props.startPins || []).length > 5) {
        md += `            P99[...and ${props.startPins.length - 5} more]\n`;
    }
    md += '        end\n';
    md += '    end\n';
    md += '```\n\n';

    md += '**Configuration:**\n';
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| Profile ID | \`${props.profileId}\` |\n`;
    md += `| Display Name | ${props.displayName} |\n`;
    md += `| Show Taskbar | ${props.showTaskbar ? 'Yes' : 'No'} |\n`;

    md += '\n**Allowed Applications:**\n';
    (props.allowedApps || []).forEach(app => {
        md += `- \`${app}\`\n`;
    });

    md += '\n**Start Menu Pins:**\n';
    (props.startPins || []).forEach(pin => {
        md += `- \`${pin}\`\n`;
    });

    md += '\n**Remediation:**\n';
    md += 'Applies Assigned Access XML configuration via WMI MDM_AssignedAccess class.\n';
    md += '\n*Requires SYSTEM privileges*\n';
    return md;
}

function generateRegistryValueSummary(props) {
    let md = '```mermaid\nflowchart LR\n';
    const keyName = props.path.split('\\\\').pop();
    md += `    A[🗝️ ${keyName}] --> B[${props.name}]\n`;
    md += `    B --> C["${props.value}"]\n`;
    md += '```\n\n';

    md += '**Registry Details:**\n';
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| Path | \`${props.path}\` |\n`;
    md += `| Name | \`${props.name}\` |\n`;
    md += `| Value | \`${props.value}\` |\n`;
    md += `| Type | ${props.type || 'String'} |\n`;

    md += '\n**Remediation:**\n';
    md += 'Creates the registry key (if missing) and sets the value.\n';
    return md;
}

function generateScheduledTaskSummary(props) {
    let md = '```mermaid\nflowchart LR\n';
    md += `    A[⏰ ${props.taskName}] --> B{Trigger: ${props.trigger || 'Manual'}}\n`;
    md += `    B --> C[Run: ${props.execute.split('\\\\').pop()}]\n`;
    if (props.principal) md += `    C --> D[As: ${props.principal}]\n`;
    md += '```\n\n';

    md += '**Task Details:**\n';
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| Task Name | \`${props.taskName}\` |\n`;
    md += `| Task Path | \`${props.taskPath || '\\\\'}\` |\n`;
    md += `| Execute | \`${props.execute}\` |\n`;
    if (props.arguments) md += `| Arguments | \`${props.arguments}\` |\n`;
    md += `| Trigger | ${props.trigger || 'Manual'} |\n`;
    if (props.runLevel) md += `| Run Level | ${props.runLevel} |\n`;
    if (props.principal) md += `| Principal | \`${props.principal}\` |\n`;

    md += '\n**Remediation:**\n';
    md += 'Creates the scheduled task with specified trigger and action.\n';
    return md;
}

function generateServiceRunningSummary(props) {
    let md = '```mermaid\nflowchart LR\n';
    md += `    A[⚙️ ${props.serviceName}] --> B{Running?}\n`;
    md += '    B -->|Yes| C[✅ Pass]\n';
    md += '    B -->|No| D[Start Service]\n';
    md += '    D --> E[✅ Running]\n';
    md += '```\n\n';

    md += '**Service Details:**\n';
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| Service Name | \`${props.serviceName}\` |\n`;
    if (props.startupType) md += `| Startup Type | ${props.startupType} |\n`;
    md += `| Ensure Running | ${props.ensureRunning !== false ? 'Yes' : 'No'} |\n`;

    md += '\n**Remediation:**\n';
    md += 'Sets startup type and starts the service if not running.\n';
    return md;
}

function generatePrinterInstalledSummary(props) {
    let md = '```mermaid\nflowchart LR\n';
    md += `    A[🖨️ ${props.printerName}] --> B[${props.printerIP}]\n`;
    md += `    B --> C[Port: ${props.portName}]\n`;
    md += `    C --> D[Driver: ${props.driverName}]\n`;
    md += '```\n\n';

    md += '**Printer Details:**\n';
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| Printer Name | \`${props.printerName}\` |\n`;
    md += `| Driver | \`${props.driverName}\` |\n`;
    md += `| IP/Hostname | \`${props.printerIP}\` |\n`;
    md += `| Port Name | \`${props.portName}\` |\n`;
    md += `| Port Type | ${props.portType || 'TCP'} |\n`;
    if (props.lprQueue) md += `| LPR Queue | \`${props.lprQueue}\` |\n`;
    md += `| Set as Default | ${props.setAsDefault ? 'Yes' : 'No'} |\n`;

    md += '\n**Remediation:**\n';
    md += 'Creates printer port (if missing) and adds printer with specified driver.\n';
    md += '\n*Driver must be installed before printer can be added*\n';
    return md;
}

function generateDriverInstalledSummary(props) {
    let md = '```mermaid\nflowchart LR\n';
    md += `    A[🔧 ${props.driverName}] --> B{Installed?}\n`;
    md += '    B -->|Yes| C{Version OK?}\n';
    md += '    B -->|No| D[Install Driver]\n';
    md += '    C -->|Yes| E[✅ Pass]\n';
    md += '    C -->|No| F[Update Driver]\n';
    md += '    D --> E\n';
    md += '    F --> E\n';
    md += '```\n\n';

    md += '**Driver Details:**\n';
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| Driver Name | \`${props.driverName}\` |\n`;
    if (props.driverClass) md += `| Driver Class | ${props.driverClass} |\n`;
    if (props.sourceAssetPath) md += `| Source | \`Assets\\${props.sourceAssetPath}\` |\n`;
    if (props.minimumVersion) md += `| Minimum Version | ${props.minimumVersion} |\n`;

    md += '\n**Remediation:**\n';
    md += 'Installs driver using `pnputil /add-driver /install`\n';
    if (props.minimumVersion) {
        md += 'If version is too old, removes existing driver first.\n';
    }
    return md;
}

function generateWindowsFeatureSummary(props) {
    const enabling = props.state === 'Enabled';
    let md = '```mermaid\nflowchart LR\n';
    md += `    A[⚙️ ${props.featureName}] --> B{${enabling ? 'Enabled' : 'Disabled'}?}\n`;
    md += '    B -->|Yes| C[✅ Pass]\n';
    md += `    B -->|No| D[${enabling ? 'Enable' : 'Disable'} Feature]\n`;
    md += '    D --> E[✅ Done]\n';
    md += '```\n\n';

    md += '**Feature Details:**\n';
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| Feature Name | \`${props.featureName}\` |\n`;
    md += `| Desired State | ${props.state} |\n`;

    md += '\n**Remediation:**\n';
    md += `${enabling ? 'Enables' : 'Disables'} the Windows optional feature.\n`;
    md += '\n*May require reboot*\n';
    return md;
}

function generateFirewallRuleSummary(props) {
    let md = '```mermaid\nflowchart LR\n';
    const direction = props.direction === 'Inbound' ? '→' : '←';
    md += `    A[${props.direction === 'Inbound' ? 'Internet' : 'Local'}] --${direction}--> B[🛡️ ${props.displayName}]\n`;
    md += `    B --${props.action === 'Allow' ? '✅' : '❌'}--> C[${props.direction === 'Inbound' ? 'Local' : 'Internet'}]\n`;
    md += '```\n\n';

    md += '**Firewall Rule Details:**\n';
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| Rule Name | \`${props.ruleName}\` |\n`;
    md += `| Display Name | ${props.displayName} |\n`;
    md += `| Direction | ${props.direction} |\n`;
    md += `| Action | ${props.action} |\n`;
    if (props.protocol) md += `| Protocol | ${props.protocol} |\n`;
    if (props.remoteAddress) md += `| Remote Address | \`${props.remoteAddress}\` |\n`;
    if (props.remotePort) md += `| Remote Port | ${props.remotePort} |\n`;
    if (props.localPort) md += `| Local Port | ${props.localPort} |\n`;
    if (props.program) md += `| Program | \`${props.program}\` |\n`;
    md += `| Enabled | ${props.enabled !== false ? 'Yes' : 'No'} |\n`;

    md += '\n**Remediation:**\n';
    md += 'Creates or updates the Windows Firewall rule.\n';
    return md;
}

function generateCertificateInstalledSummary(props) {
    let md = '```mermaid\nflowchart LR\n';
    md += `    A[🔐 Certificate] --> B[${props.storeLocation || 'LocalMachine'}]\n`;
    md += `    B --> C[${props.storeName || 'My'}]\n`;
    if (props.thumbprint) {
        md += `    C --> D[Thumbprint: ${props.thumbprint.substring(0, 8)}...]\n`;
    } else if (props.subject) {
        md += `    C --> D[Subject: ${props.subject}]\n`;
    }
    md += '```\n\n';

    md += '**Certificate Details:**\n';
    md += `| Property | Value |\n|----------|-------|\n`;
    md += `| Store Location | ${props.storeLocation || 'LocalMachine'} |\n`;
    md += `| Store Name | ${props.storeName || 'My'} |\n`;
    if (props.thumbprint) md += `| Thumbprint | \`${props.thumbprint}\` |\n`;
    if (props.subject) md += `| Subject | \`${props.subject}\` |\n`;
    if (props.issuer) md += `| Expected Issuer | \`${props.issuer}\` |\n`;
    if (props.minimumDaysValid) md += `| Min Days Valid | ${props.minimumDaysValid} |\n`;
    if (props.sourceAssetPath) md += `| Source | \`Assets\\${props.sourceAssetPath}\` |\n`;

    md += '\n**Remediation:**\n';
    if (props.sourceAssetPath) {
        md += `Imports certificate from \`Assets\\${props.sourceAssetPath}\`\n`;
    } else {
        md += 'No remediation available (no source certificate specified).\n';
    }
    if (props.minimumDaysValid) {
        md += `\n*Alerts if certificate expires within ${props.minimumDaysValid} days*\n`;
    }
    return md;
}

function generateNetworkAdapterSummary(props) {
    let md = '```mermaid\nflowchart TD\n';

    // Determine identification mode
    const isSubnetMode = !!props.identifyByCurrentSubnet;
    const adapterLabel = isSubnetMode
        ? `Subnet ${props.identifyByCurrentSubnet}`
        : (props.adapterName || props.adapterDescription || props.macAddress || 'Adapter');

    if (isSubnetMode) {
        md += `    A[🔍 Find adapter in ${props.identifyByCurrentSubnet}]\n`;
        md += `    A --> B[🌐 Convert to Static]\n`;
        if (props.staticIPRange) {
            md += `    B --> C[IP Range: ${props.staticIPRange}]\n`;
            md += `    C --> C1[Ping sweep for available IP]\n`;
        } else {
            md += `    B --> C[IP: ${props.staticIPAddress}/${props.subnetPrefixLength || 24}]\n`;
        }
        if (!props.defaultGateway) {
            md += `    C --> D[No Gateway - Isolated]\n`;
        }
        if (!props.dnsServers || props.dnsServers.length === 0) {
            md += `    C --> E[No DNS - No Conflicts]\n`;
        }
    } else {
        md += `    A[🌐 ${adapterLabel}]\n`;
        if (props.staticIPAddress) {
            md += `    A --> B[IP: ${props.staticIPAddress}/${props.subnetPrefixLength || 24}]\n`;
            if (props.defaultGateway) md += `    B --> C[Gateway: ${props.defaultGateway}]\n`;
        } else if (props.staticIPRange) {
            md += `    A --> B[IP Range: ${props.staticIPRange}]\n`;
        }
        if (props.dnsServers && props.dnsServers.length > 0) {
            md += `    A --> D[DNS: ${props.dnsServers.join(', ')}]\n`;
        }
    }
    if (props.networkCategory) {
        md += `    A --> E[Category: ${props.networkCategory}]\n`;
    }
    if (props.interfaceMetric) {
        md += `    A --> F[Metric: ${props.interfaceMetric}]\n`;
    }
    md += '```\n\n';

    md += '**Adapter Identification:**\n';
    md += `| Property | Value |\n|----------|-------|\n`;
    if (isSubnetMode) {
        md += `| Mode | Subnet-based (DHCP to Static) |\n`;
        md += `| Target Subnet | \`${props.identifyByCurrentSubnet}\` |\n`;
        if (props.excludeSubnets && props.excludeSubnets.length > 0) {
            md += `| Excluded Subnets | ${props.excludeSubnets.map(s => '\`' + s + '\`').join(', ')} |\n`;
        }
    } else {
        md += `| Mode | Traditional |\n`;
        if (props.adapterName) md += `| Adapter Name | \`${props.adapterName}\` |\n`;
        if (props.adapterDescription) md += `| Description | \`${props.adapterDescription}\` |\n`;
        if (props.macAddress) md += `| MAC Address | \`${props.macAddress}\` |\n`;
    }

    md += '\n**IP Configuration:**\n';
    md += `| Property | Value |\n|----------|-------|\n`;
    if (props.staticIPAddress) {
        md += `| Static IP | \`${props.staticIPAddress}\` |\n`;
        md += `| Subnet Prefix | /${props.subnetPrefixLength || 24} |\n`;
    } else if (props.staticIPRange) {
        md += `| Static IP Range | \`${props.staticIPRange}\` |\n`;
        md += `| Subnet Prefix | /${props.subnetPrefixLength || 24} |\n`;
        md += `| Assignment | Ping sweep for available IP |\n`;
    } else {
        md += `| DHCP | Enabled |\n`;
    }
    if (props.defaultGateway) {
        md += `| Gateway | \`${props.defaultGateway}\` |\n`;
    } else if (isSubnetMode) {
        md += `| Gateway | None (isolated network) |\n`;
    }
    if (props.dnsServers && props.dnsServers.length > 0) {
        md += `| DNS Servers | ${props.dnsServers.map(d => '\`' + d + '\`').join(', ')} |\n`;
    } else if (isSubnetMode) {
        md += `| DNS Servers | None (prevents DNS conflicts) |\n`;
    }
    if (props.hasOwnProperty('registerInDns')) {
        md += `| Register in DNS | ${props.registerInDns ? 'Yes' : 'No'} |\n`;
    }
    if (props.networkCategory) md += `| Network Category | ${props.networkCategory} |\n`;
    if (props.interfaceMetric) md += `| Interface Metric | ${props.interfaceMetric} |\n`;
    md += `| Ensure Enabled | ${props.ensureEnabled !== false ? 'Yes' : 'No'} |\n`;

    md += '\n**Remediation:**\n';
    if (isSubnetMode) {
        md += 'Finds wired adapter with IP in target subnet, converts from DHCP to static configuration. ';
        md += 'Corporate network is protected by safeguards (wired-only, gateway check, exclude list).\n';
    } else {
        md += 'Configures adapter with specified IP settings, DNS, and network category.\n';
    }
    return md;
}

// ============================================================================
// Summary Export - Check Summary
// ============================================================================

function generateCheckSummary(check, index) {
    const icon = checkTypeIcons[check.type] || '📋';
    const props = check.properties;
    let md = `### ${index + 1}. ${icon} ${check.name}\n`;
    md += `**Type:** \`${check.type}\`  \n`;
    md += `**ID:** \`${check.id}\`  \n`;
    md += `**Enabled:** ${check.enabled ? 'Yes' : 'No'}\n\n`;

    // Type-specific details
    switch (check.type) {
        case 'Application':
            md += generateApplicationSummary(props);
            break;
        case 'FolderEmpty':
            md += generateFolderEmptySummary(props);
            break;
        case 'FolderExists':
            md += generateFolderExistsSummary(props);
            break;
        case 'FilesExist':
            md += generateFilesExistSummary(props);
            break;
        case 'ShortcutsAllowList':
            md += generateShortcutsAllowListSummary(props);
            break;
        case 'ShortcutExists':
            md += generateShortcutExistsSummary(props);
            break;
        case 'AssignedAccess':
            md += generateAssignedAccessSummary(props);
            break;
        case 'RegistryValue':
            md += generateRegistryValueSummary(props);
            break;
        case 'ScheduledTaskExists':
            md += generateScheduledTaskSummary(props);
            break;
        case 'ServiceRunning':
            md += generateServiceRunningSummary(props);
            break;
        case 'PrinterInstalled':
            md += generatePrinterInstalledSummary(props);
            break;
        case 'DriverInstalled':
            md += generateDriverInstalledSummary(props);
            break;
        case 'WindowsFeature':
            md += generateWindowsFeatureSummary(props);
            break;
        case 'FirewallRule':
            md += generateFirewallRuleSummary(props);
            break;
        case 'CertificateInstalled':
            md += generateCertificateInstalledSummary(props);
            break;
        case 'NetworkAdapterConfiguration':
            md += generateNetworkAdapterSummary(props);
            break;
        default:
            md += `**Properties:**\n\`\`\`json\n${JSON.stringify(props, null, 2)}\n\`\`\`\n`;
    }

    md += '\n---\n\n';
    return md;
}

// ============================================================================
// Summary Export - Main Functions
// ============================================================================

function generateSummaryMarkdown() {
    const config = getConfig();
    const configChecks = config.checks || [];

    // Count checks by type
    const typeCounts = {};
    configChecks.forEach(c => {
        typeCounts[c.type] = (typeCounts[c.type] || 0) + 1;
    });

    let md = `# ${config.role || 'Configuration'} Summary\n\n`;

    // Overview section
    md += '## Overview\n\n';
    md += '| Property | Value |\n|----------|-------|\n';
    md += `| Role | ${config.role || 'Not specified'} |\n`;
    md += `| Version | ${config.version || 'Not specified'} |\n`;
    md += `| Description | ${config.description || 'Not specified'} |\n`;
    md += `| Author | ${config.author || 'Not specified'} |\n`;
    md += `| Last Modified | ${config.lastModified || 'Not specified'} |\n`;
    md += `| Total Checks | ${configChecks.length} |\n`;
    md += '\n';

    // Process flow diagram
    md += '## Process Flow\n\n';
    md += '```mermaid\nflowchart TD\n';
    md += '    A[Intune Proactive Remediation] --> B[Detect.ps1]\n';
    md += '    B --> C{All Checks Pass?}\n';
    md += '    C -->|Yes| D[Exit 0 - Compliant]\n';
    md += '    C -->|No| E[Exit 1 - Non-Compliant]\n';
    md += '    E --> F[Remediate.ps1]\n';
    md += '    F --> G[Fix Failed Checks]\n';
    md += '    G --> H[Log Results]\n';
    md += '```\n\n';

    // Checks by type
    md += '## Checks by Type\n\n';
    md += '| Type | Count | Icon |\n|------|-------|------|\n';
    Object.keys(typeCounts).sort().forEach(type => {
        md += `| ${type} | ${typeCounts[type]} | ${checkTypeIcons[type] || '📋'} |\n`;
    });
    md += '\n';

    // Dependencies section
    md += '## Dependencies & Execution Order\n\n';
    md += 'Checks are processed in the order listed below. Notable dependencies:\n\n';

    // Find driver/printer dependencies
    const driverChecks = configChecks.filter(c => c.type === 'DriverInstalled');
    const printerChecks = configChecks.filter(c => c.type === 'PrinterInstalled');
    if (driverChecks.length > 0 && printerChecks.length > 0) {
        md += '- **Driver → Printer:** Printer drivers must be installed before printers can be added\n';
    }

    // Find script/task dependencies (SingleFile mode FilesExist checks are scripts)
    const scriptChecks = configChecks.filter(c => c.type === 'FilesExist' && c.properties.mode === 'SingleFile');
    const taskChecks = configChecks.filter(c => c.type === 'ScheduledTaskExists');
    if (scriptChecks.length > 0 && taskChecks.length > 0) {
        md += '- **Script → Task:** Script files should exist before scheduled tasks reference them\n';
    }

    // Find icon/shortcut dependencies
    const iconChecks = configChecks.filter(c => c.type === 'FilesExist' && c.properties.sourceAssetPath && c.properties.sourceAssetPath.toLowerCase().includes('icon'));
    const shortcutChecks = configChecks.filter(c => c.type === 'ShortcutExists');
    if (iconChecks.length > 0 && shortcutChecks.length > 0) {
        md += '- **Icons → Shortcuts:** Icon files should exist before shortcuts reference them\n';
    }

    md += '\n---\n\n';

    // Individual check details
    md += '## Check Details\n\n';
    configChecks.forEach((check, index) => {
        md += generateCheckSummary(check, index);
    });

    // Footer
    md += '---\n\n';
    md += `*Generated by Configuration Blender on ${new Date().toISOString().split('T')[0]}*\n`;

    return md;
}

function exportSummary() {
    const config = getConfig();
    if (!config.checks || config.checks.length === 0) {
        const message = 'No checks to export. Add at least one check first.';
        showStatus(message, 'error');

        if (typeof playErrorSound === 'function') {
            playErrorSound();
        }

        if (typeof announceError === 'function') {
            announceError(message);
        }
        return;
    }

    const markdown = generateSummaryMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const role = config.role || 'Config';
    a.download = `${role}_Summary.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Show success message
    const successMessage = `${role}_Summary.md exported successfully!`;

    showStatus(successMessage, 'success');
    alert(`${successMessage}\n\nThis markdown file contains visual diagrams that render on GitHub.`);

    // Play success sound
    if (typeof playSuccessSound === 'function') {
        playSuccessSound();
    }

    // Announce to screen readers
    if (typeof announceSuccess === 'function') {
        announceSuccess(successMessage);
    }
}
