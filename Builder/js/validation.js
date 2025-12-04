/* ============================================================================
   Configuration Blender - Validation
   ============================================================================ */

// ============================================================================
// Configuration Validation
// ============================================================================

function validateConfiguration() {
    const warnings = [];
    const errors = [];

    // Validate each check
    checks.forEach((check, index) => {
        // Check for HKCU usage in RegistryValue (SYSTEM context issue)
        if (check.type === 'RegistryValue' && check.properties.path && check.properties.path.includes('HKCU:')) {
            warnings.push(`Check "${check.name}": Using HKCU:\\ in RegistryValue will modify SYSTEM's registry, not the logged-in user's. Use HKLM:\\ for system-wide settings instead.`);
        }

        // Check for empty required fields
        if (!check.name) {
            errors.push(`Check #${index + 1}: Missing display name`);
        }

        // Type-specific validations
        switch (check.type) {
            case 'PrinterInstalled':
                if (!check.properties.printerName || !check.properties.driverName || !check.properties.printerIP || !check.properties.portName) {
                    errors.push(`Check "${check.name}": PrinterInstalled requires printerName, driverName, printerIP, and portName`);
                }
                if (check.properties.portType === 'LPR' && !check.properties.lprQueue) {
                    errors.push(`Check "${check.name}": LPR port type requires lprQueue property`);
                }
                break;
            case 'FilesExist':
            case 'FolderHasFiles':
            case 'FileContent':
            case 'DriverInstalled':
                if (check.properties.sourceAssetPath && check.properties.sourceAssetPath.startsWith('Assets')) {
                    warnings.push(`Check "${check.name}": Asset path should NOT start with "Assets\\" - it's already relative to the Assets folder`);
                }
                break;
            case 'CertificateInstalled':
                if (!check.properties.thumbprint && !check.properties.subject) {
                    errors.push(`Check "${check.name}": CertificateInstalled requires either thumbprint or subject`);
                }
                if (check.properties.sourceAssetPath && check.properties.sourceAssetPath.startsWith('Assets')) {
                    warnings.push(`Check "${check.name}": Asset path should NOT start with "Assets\\" - it's already relative to the Assets folder`);
                }
                if (check.properties.pfxPassword) {
                    warnings.push(`Check "${check.name}": PFX password is stored in plain text in Config.json - consider security implications`);
                }
                break;
            case 'NetworkAdapterConfiguration':
                if (!check.properties.adapterName && !check.properties.adapterDescription && !check.properties.macAddress) {
                    errors.push(`Check "${check.name}": NetworkAdapterConfiguration requires adapterName, adapterDescription, or macAddress`);
                }
                if (check.properties.staticIPAddress && !check.properties.subnetPrefixLength) {
                    warnings.push(`Check "${check.name}": Static IP configured without subnet prefix length (will default to /24)`);
                }
                break;
        }
    });

    return { errors, warnings };
}

// ============================================================================
// Show Validation Results
// ============================================================================

function showValidationResults() {
    const { errors, warnings } = validateConfiguration();
    const statusBar = document.getElementById('statusBar');

    if (errors.length > 0) {
        statusBar.innerHTML = '<strong>⚠️ Errors:</strong><br>' + errors.map(e => `• ${e}`).join('<br>');
        statusBar.className = 'status-bar error';
        statusBar.style.display = 'block';
        return false;
    } else if (warnings.length > 0) {
        statusBar.innerHTML = '<strong>⚠️ Warnings:</strong><br>' + warnings.map(w => `• ${w}`).join('<br>');
        statusBar.className = 'status-bar warning';
        statusBar.style.display = 'block';
        return true;
    } else {
        statusBar.innerHTML = '✅ Configuration looks good!';
        statusBar.className = 'status-bar';
        statusBar.style.display = 'block';
        setTimeout(() => {
            statusBar.style.display = 'none';
        }, 3000);
        return true;
    }
}
