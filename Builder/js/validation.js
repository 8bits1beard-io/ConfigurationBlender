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
    const checkTypes = checks.map(c => c.type);

    checks.forEach((check, index) => {
        switch (check.type) {
            case 'PrinterInstalled':
                // Check if there's a DriverInstalled check before this one
                const hasDriverBefore = checks.slice(0, index).some(c => c.type === 'DriverInstalled');
                if (!hasDriverBefore) {
                    warnings.push({
                        message: `"${check.name}" may need a DriverInstalled check before it (printer driver must be installed first)`,
                        checkIndex: index,
                        checkName: check.name
                    });
                }
                break;
            case 'ShortcutExists':
                // Check if a custom icon is specified
                if (check.properties.iconLocation) {
                    const iconPath = check.properties.iconLocation.toLowerCase();
                    // Only validate if iconLocation is not a system path
                    if (!iconPath.includes('system32') && !iconPath.includes('windows') && !iconPath.includes(',')) {
                        // Extract the icon filename from the path
                        const iconFileName = check.properties.iconLocation.split('\\').pop().toLowerCase();

                        // Look for a FilesExist check that deploys this specific icon
                        const hasIconDeployed = checks.slice(0, index).some(c => {
                            if (c.type !== 'FilesExist') return false;

                            if (c.properties.mode === 'SingleFile') {
                                // SingleFile mode: check if destinationPath matches the icon location
                                return c.properties.destinationPath?.toLowerCase() === check.properties.iconLocation.toLowerCase();
                            } else {
                                // MultipleFiles mode: check if files array contains the icon filename
                                const files = c.properties.files || [];
                                return files.some(f => f.toLowerCase() === iconFileName);
                            }
                        });

                        if (!hasIconDeployed) {
                            warnings.push({
                                message: `"${check.name}" uses icon "${iconFileName}" but no FilesExist check deploys this icon file. Add a FilesExist check before this shortcut.`,
                                checkIndex: index,
                                checkName: check.name
                            });
                        }
                    }
                }
                break;
            case 'ScheduledTaskExists':
                // Check if the task references a script that should be deployed first
                if (check.properties.arguments) {
                    const scriptMatch = check.properties.arguments.match(/[A-Z]:\\[^\s]+\.ps1/i);
                    if (scriptMatch) {
                        const hasScriptBefore = checks.slice(0, index).some(c =>
                            c.type === 'FilesExist' &&
                            c.properties.mode === 'SingleFile' &&
                            scriptMatch[0].toLowerCase().includes(c.properties.destinationPath?.toLowerCase())
                        );
                        if (!hasScriptBefore) {
                            warnings.push({
                                message: `"${check.name}" (${check.type}) should come AFTER a FilesExist check to deploy the script`,
                                checkIndex: index,
                                checkName: check.name
                            });
                        }
                    }
                }
                break;
            case 'AssignedAccess':
                // AssignedAccess requires a manifest script and scheduled task to rename pinned shortcuts
                // Check for FilesExist (SingleFile mode) with manifest script
                const hasManifestScript = checks.some(c =>
                    c.type === 'FilesExist' &&
                    c.properties.mode === 'SingleFile' &&
                    c.properties.sourceAssetPath &&
                    (c.properties.sourceAssetPath.toLowerCase().includes('manifest') ||
                     c.properties.sourceAssetPath.toLowerCase().includes('rename'))
                );
                // Check for ScheduledTask that runs the manifest script
                const hasManifestTask = checks.some(c =>
                    c.type === 'ScheduledTaskExists' &&
                    c.properties.arguments &&
                    (c.properties.arguments.toLowerCase().includes('manifest') ||
                     c.properties.arguments.toLowerCase().includes('rename'))
                );
                if (!hasManifestScript) {
                    warnings.push({
                        message: `"${check.name}" requires a FilesExist check (SingleFile mode) to deploy the manifest rename script (renames pinned Edge shortcuts in Start Menu)`,
                        checkIndex: index,
                        checkName: check.name
                    });
                }
                if (!hasManifestTask) {
                    warnings.push({
                        message: `"${check.name}" requires a ScheduledTaskExists check to run the manifest rename script at logon`,
                        checkIndex: index,
                        checkName: check.name
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
        let html = `<div class="dependency-warnings" role="region" aria-label="Dependency warnings">`;
        html += `<details>`;
        html += `<summary>Dependency Suggestions (${warnings.length})</summary>`;
        html += `<ul class="validation-list">`;
        warnings.forEach(w => {
            html += `<li>${escapeHtml(w.message)}</li>`;
        });
        html += `</ul></details></div>`;
        container.innerHTML = html;
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
