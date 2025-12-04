/* ============================================================================
   Configuration Blender - Validation
   WCAG 2.1/2.2 AA Compliant with accessible error handling
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
            warnings.push({
                message: `Check "${check.name}": Using HKCU:\\ in RegistryValue will modify SYSTEM's registry, not the logged-in user's. Use HKLM:\\ for system-wide settings instead.`,
                checkIndex: index,
                checkName: check.name
            });
        }

        // Check for empty required fields
        if (!check.name) {
            errors.push({
                message: `Check #${index + 1}: Missing display name`,
                checkIndex: index,
                checkName: `Check #${index + 1}`
            });
        }

        // Type-specific validations
        switch (check.type) {
            case 'PrinterInstalled':
                if (!check.properties.printerName || !check.properties.driverName || !check.properties.printerIP || !check.properties.portName) {
                    errors.push({
                        message: `Check "${check.name}": PrinterInstalled requires printerName, driverName, printerIP, and portName`,
                        checkIndex: index,
                        checkName: check.name
                    });
                }
                if (check.properties.portType === 'LPR' && !check.properties.lprQueue) {
                    errors.push({
                        message: `Check "${check.name}": LPR port type requires lprQueue property`,
                        checkIndex: index,
                        checkName: check.name
                    });
                }
                break;
            case 'FilesExist':
            case 'FolderExists':
            case 'DriverInstalled':
                if (check.properties.sourceAssetPath && check.properties.sourceAssetPath.startsWith('Assets')) {
                    warnings.push({
                        message: `Check "${check.name}": Asset path should NOT start with "Assets\\" - it's already relative to the Assets folder`,
                        checkIndex: index,
                        checkName: check.name
                    });
                }
                break;
            case 'CertificateInstalled':
                if (!check.properties.thumbprint && !check.properties.subject) {
                    errors.push({
                        message: `Check "${check.name}": CertificateInstalled requires either thumbprint or subject`,
                        checkIndex: index,
                        checkName: check.name
                    });
                }
                if (check.properties.sourceAssetPath && check.properties.sourceAssetPath.startsWith('Assets')) {
                    warnings.push({
                        message: `Check "${check.name}": Asset path should NOT start with "Assets\\" - it's already relative to the Assets folder`,
                        checkIndex: index,
                        checkName: check.name
                    });
                }
                if (check.properties.pfxPassword) {
                    warnings.push({
                        message: `Check "${check.name}": PFX password is stored in plain text in Config.json - consider security implications`,
                        checkIndex: index,
                        checkName: check.name
                    });
                }
                break;
            case 'NetworkAdapterConfiguration':
                if (!check.properties.adapterName && !check.properties.adapterDescription && !check.properties.macAddress) {
                    errors.push({
                        message: `Check "${check.name}": NetworkAdapterConfiguration requires adapterName, adapterDescription, or macAddress`,
                        checkIndex: index,
                        checkName: check.name
                    });
                }
                if (check.properties.staticIPAddress && !check.properties.subnetPrefixLength) {
                    warnings.push({
                        message: `Check "${check.name}": Static IP configured without subnet prefix length (will default to /24)`,
                        checkIndex: index,
                        checkName: check.name
                    });
                }
                break;
        }
    });

    return { errors, warnings };
}

// ============================================================================
// Show Validation Results (Accessible)
// ============================================================================

function showValidationResults() {
    const { errors, warnings } = validateConfiguration();
    const statusBar = document.getElementById('statusBar');

    if (errors.length > 0) {
        // Build accessible error list
        let html = `<div role="alert" aria-live="assertive">`;
        html += `<strong>Errors:</strong>`;
        html += `<ul class="validation-list" aria-label="Error list">`;
        errors.forEach(e => {
            html += `<li>${escapeHtml(e.message)}</li>`;
        });
        html += `</ul></div>`;

        statusBar.innerHTML = html;
        statusBar.className = 'status-bar error';
        statusBar.style.display = 'block';

        // Play error sound if available
        if (typeof playErrorSound === 'function') {
            playErrorSound();
        }

        // Announce to screen readers
        if (typeof announceError === 'function') {
            const errorCount = errors.length;
            announceError(`${errorCount} validation error${errorCount === 1 ? '' : 's'} found`);
        }

        // Focus the status bar for keyboard users
        statusBar.setAttribute('tabindex', '-1');
        statusBar.focus();

        return false;
    } else if (warnings.length > 0) {
        // Build accessible warning list
        let html = `<div role="alert" aria-live="polite">`;
        html += `<strong>Warnings:</strong>`;
        html += `<ul class="validation-list" aria-label="Warning list">`;
        warnings.forEach(w => {
            html += `<li>${escapeHtml(w.message)}</li>`;
        });
        html += `</ul></div>`;

        statusBar.innerHTML = html;
        statusBar.className = 'status-bar warning';
        statusBar.style.display = 'block';

        // Play warning sound if available
        if (typeof playWarningSound === 'function') {
            playWarningSound();
        }

        // Announce to screen readers
        if (typeof announce === 'function') {
            const warningCount = warnings.length;
            announce(`${warningCount} warning${warningCount === 1 ? '' : 's'} found`);
        }

        return true;
    } else {
        statusBar.innerHTML = `<div role="status" aria-live="polite">Configuration looks good!</div>`;
        statusBar.className = 'status-bar success';
        statusBar.style.display = 'block';

        // Play success sound if available
        if (typeof playSuccessSound === 'function') {
            playSuccessSound();
        }

        // Announce to screen readers
        if (typeof announceSuccess === 'function') {
            announceSuccess('Configuration looks good!');
        }

        setTimeout(() => {
            statusBar.style.display = 'none';
        }, 3000);
        return true;
    }
}

// ============================================================================
// Dependency Validation
// ============================================================================

function validateDependencies() {
    const warnings = [];

    checks.forEach((check, index) => {
        if (!check.enabled) return;

        switch (check.type) {
            case 'PrinterInstalled':
                // Check if there's a DriverInstalled check with the SPECIFIC driver name
                if (check.properties.driverName) {
                    const driverName = check.properties.driverName.toLowerCase();
                    const hasMatchingDriver = checks.slice(0, index).some(c =>
                        c.type === 'DriverInstalled' &&
                        c.enabled &&
                        c.properties.driverName?.toLowerCase() === driverName
                    );
                    const hasAnyMatchingDriver = checks.some(c =>
                        c.type === 'DriverInstalled' &&
                        c.enabled &&
                        c.properties.driverName?.toLowerCase() === driverName
                    );

                    if (!hasAnyMatchingDriver) {
                        warnings.push({
                            message: `"${check.name}" requires driver "${check.properties.driverName}" but no DriverInstalled check exists for this driver. Add a DriverInstalled check.`,
                            checkIndex: index,
                            checkName: check.name,
                            severity: 'error'
                        });
                    } else if (!hasMatchingDriver) {
                        warnings.push({
                            message: `"${check.name}" should come AFTER the DriverInstalled check for "${check.properties.driverName}" (drivers must be installed before printers)`,
                            checkIndex: index,
                            checkName: check.name,
                            severity: 'warning'
                        });
                    }
                }
                break;

            case 'ShortcutExists':
                // Check if a custom icon is specified and deployed
                if (check.properties.iconLocation) {
                    const iconPath = check.properties.iconLocation.toLowerCase();
                    // Only validate if iconLocation is not a system path or embedded icon (contains comma)
                    if (!iconPath.includes('system32') && !iconPath.includes('windows\\') && !iconPath.includes(',')) {
                        const iconFileName = check.properties.iconLocation.split('\\').pop().toLowerCase();
                        const iconFolder = check.properties.iconLocation.substring(0, check.properties.iconLocation.lastIndexOf('\\')).toLowerCase();

                        // Look for a FilesExist check that deploys this specific icon BEFORE this check
                        const hasIconDeployed = checks.slice(0, index).some(c => {
                            if (c.type !== 'FilesExist' || !c.enabled) return false;

                            if (c.properties.mode === 'SingleFile') {
                                return c.properties.destinationPath?.toLowerCase() === check.properties.iconLocation.toLowerCase();
                            } else {
                                // MultipleFiles mode: check if files array contains the icon filename
                                // AND the destination folder matches
                                const files = c.properties.files || [];
                                const destPath = c.properties.destinationPath?.toLowerCase() || '';
                                return files.some(f => f.toLowerCase() === iconFileName) &&
                                       destPath === iconFolder;
                            }
                        });

                        const hasIconAnyOrder = checks.some(c => {
                            if (c.type !== 'FilesExist' || !c.enabled) return false;
                            if (c.properties.mode === 'SingleFile') {
                                return c.properties.destinationPath?.toLowerCase() === check.properties.iconLocation.toLowerCase();
                            } else {
                                const files = c.properties.files || [];
                                const destPath = c.properties.destinationPath?.toLowerCase() || '';
                                return files.some(f => f.toLowerCase() === iconFileName) &&
                                       destPath === iconFolder;
                            }
                        });

                        if (!hasIconAnyOrder) {
                            warnings.push({
                                message: `"${check.name}" uses custom icon "${iconFileName}" but no FilesExist check deploys this icon. Add a FilesExist check to deploy the icon file.`,
                                checkIndex: index,
                                checkName: check.name,
                                severity: 'error'
                            });
                        } else if (!hasIconDeployed) {
                            warnings.push({
                                message: `"${check.name}" should come AFTER the FilesExist check that deploys "${iconFileName}" (icon must exist before shortcut is created)`,
                                checkIndex: index,
                                checkName: check.name,
                                severity: 'warning'
                            });
                        }
                    }
                }
                break;


            case 'AssignedAccess':
                // AssignedAccess uses startPins which reference shortcuts - verify they exist
                const startPins = check.properties.startPins || [];
                startPins.forEach(pin => {
                    // Convert environment variables to check for shortcut
                    const pinLower = pin.toLowerCase()
                        .replace('%allusersprofile%', 'c:\\programdata')
                        .replace('%programdata%', 'c:\\programdata');

                    // Check if there's a ShortcutExists check for this pin
                    const hasShortcut = checks.some(c =>
                        c.type === 'ShortcutExists' &&
                        c.enabled &&
                        c.properties.path?.toLowerCase() === pinLower
                    );

                    if (!hasShortcut && !pinLower.includes('\\windows\\')) {
                        const shortcutName = pin.split('\\').pop();
                        warnings.push({
                            message: `"${check.name}" pins "${shortcutName}" to Start Menu but no ShortcutExists check creates this shortcut. Add a ShortcutExists check.`,
                            checkIndex: index,
                            checkName: check.name,
                            severity: 'warning'
                        });
                    }
                });

                // Check that shortcuts come BEFORE AssignedAccess
                const shortcutChecks = checks.filter(c => c.type === 'ShortcutExists' && c.enabled);
                const assignedAccessIndex = index;
                const shortcutsAfter = shortcutChecks.filter((c, i) =>
                    checks.indexOf(c) > assignedAccessIndex
                );
                if (shortcutsAfter.length > 0) {
                    warnings.push({
                        message: `"${check.name}" should come AFTER all ShortcutExists checks (shortcuts must exist before AssignedAccess configures them)`,
                        checkIndex: index,
                        checkName: check.name,
                        severity: 'warning'
                    });
                }
                break;

            case 'FilesExist':
                // For MultipleFiles mode, warn if sourceAssetPath is empty
                if (check.properties.mode !== 'SingleFile' && !check.properties.sourceAssetPath) {
                    warnings.push({
                        message: `"${check.name}" has no sourceAssetPath specified. Files won't be copied from Assets folder during remediation.`,
                        checkIndex: index,
                        checkName: check.name,
                        severity: 'warning'
                    });
                }
                break;
        }
    });

    return warnings;
}

// ============================================================================
// Display Dependency Warnings
// ============================================================================

function showDependencyWarnings() {
    const warnings = validateDependencies();
    const container = document.getElementById('dependencyWarnings');

    if (!container) return;

    if (warnings.length > 0) {
        const errors = warnings.filter(w => w.severity === 'error');
        const warns = warnings.filter(w => w.severity !== 'error');

        let html = '';

        if (errors.length > 0) {
            html += `<div class="dependency-errors" role="alert" aria-live="assertive">`;
            html += `<strong>Missing Dependencies (${errors.length}):</strong>`;
            html += `<ul class="validation-list">`;
            errors.forEach(e => {
                html += `<li class="dep-error">${escapeHtml(e.message)}</li>`;
            });
            html += `</ul></div>`;
        }

        if (warns.length > 0) {
            html += `<div class="dependency-warnings" role="region" aria-label="Dependency warnings">`;
            html += `<details ${errors.length === 0 ? 'open' : ''}>`;
            html += `<summary>Order Suggestions (${warns.length})</summary>`;
            html += `<ul class="validation-list">`;
            warns.forEach(w => {
                html += `<li class="dep-warning">${escapeHtml(w.message)}</li>`;
            });
            html += `</ul></details></div>`;
        }

        container.innerHTML = html;

        // Announce if there are critical errors
        if (errors.length > 0 && typeof announceError === 'function') {
            announceError(`${errors.length} missing dependency${errors.length === 1 ? '' : 'ies'} found`);
        }
    } else {
        container.innerHTML = '';
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================================
// Form Validation Helpers
// ============================================================================

function validateRequiredFields() {
    const type = document.getElementById('checkType').value;
    const name = document.getElementById('checkName').value;

    if (!type || !name) {
        // Show inline error
        if (typeof showStatus === 'function') {
            showStatus('Please fill in all required fields (Type, Display Name)', 'error');
        }

        // Play error sound
        if (typeof playErrorSound === 'function') {
            playErrorSound();
        }

        // Announce to screen readers
        if (typeof announceError === 'function') {
            announceError('Please fill in all required fields');
        }

        // Focus first empty required field
        if (!type) {
            document.getElementById('checkType').focus();
        } else if (!name) {
            document.getElementById('checkName').focus();
        }

        return false;
    }

    return true;
}

// ============================================================================
// Live Validation (for real-time feedback)
// ============================================================================

function setupLiveValidation() {
    // Add input listeners for immediate feedback on required fields
    const requiredFields = document.querySelectorAll('[aria-required="true"], [required]');

    requiredFields.forEach(field => {
        field.addEventListener('blur', function() {
            validateField(this);
        });

        field.addEventListener('input', function() {
            // Clear error state on input
            this.classList.remove('field-error');
            this.setAttribute('aria-invalid', 'false');

            // Find and hide any error message
            const errorId = this.getAttribute('aria-describedby');
            if (errorId) {
                const errorEl = document.getElementById(errorId);
                if (errorEl && errorEl.classList.contains('field-error-message')) {
                    errorEl.style.display = 'none';
                }
            }
        });
    });
}

function validateField(field) {
    const value = field.value.trim();
    const isRequired = field.hasAttribute('required') || field.getAttribute('aria-required') === 'true';

    if (isRequired && !value) {
        // Mark field as invalid
        field.classList.add('field-error');
        field.setAttribute('aria-invalid', 'true');

        // Show error message if there's a describedby element
        const errorId = field.getAttribute('aria-describedby');
        if (errorId) {
            const errorEl = document.getElementById(errorId);
            if (errorEl) {
                errorEl.textContent = 'This field is required';
                errorEl.classList.add('field-error-message');
                errorEl.style.display = 'block';
            }
        }

        return false;
    }

    return true;
}

// ============================================================================
// Initialize Validation on DOM Ready
// ============================================================================

document.addEventListener('DOMContentLoaded', function() {
    // Setup live validation if not already done
    setupLiveValidation();
});
