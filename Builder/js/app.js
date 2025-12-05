/* ============================================================================
   Configuration Blender - Main Application
   Accessibility Enhanced - WCAG 2.1/2.2 AA Compliant
   ============================================================================ */

// Global state
let checks = [];
let editingCheckIndex = -1;
let hasUnsavedChanges = false;
let draggedIndex = null;


// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Initialize theme from localStorage or system preference
    initTheme();

    // Set today's date
    document.getElementById('configDate').value = new Date().toISOString().split('T')[0];
    updatePreview();

    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    // Set up check list keyboard navigation
    setupCheckListAccessibility();
});

// ============================================================================
// Theme Management
// ============================================================================

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        setTheme(savedTheme);
    } else if (systemPrefersDark) {
        setTheme('dark');
    } else {
        setTheme('light');
    }

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
        if (!localStorage.getItem('theme')) {
            setTheme(e.matches ? 'dark' : 'light');
        }
    });
}

function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeToggleButton(theme);

    // Update meta theme-color for browser UI
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.setAttribute('content', theme === 'dark' ? '#1A1A1A' : '#2684FF');
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);

    // Announce theme change to screen readers
    if (typeof announce === 'function') {
        announce(`Switched to ${newTheme} mode`);
    }
}

function updateThemeToggleButton(theme) {
    const button = document.getElementById('themeToggle');
    if (!button) return;

    const isDark = theme === 'dark';
    button.setAttribute('aria-pressed', isDark.toString());
    button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    button.setAttribute('title', isDark ? 'Switch to light mode' : 'Switch to dark mode');
}

// ============================================================================
// State Management
// ============================================================================

function markUnsaved() {
    hasUnsavedChanges = true;
    const indicator = document.getElementById('unsavedIndicator');
    indicator.classList.add('visible');
    indicator.setAttribute('aria-hidden', 'false');
}

function markSaved() {
    hasUnsavedChanges = false;
    const indicator = document.getElementById('unsavedIndicator');
    indicator.classList.remove('visible');
    indicator.setAttribute('aria-hidden', 'true');
}

// ============================================================================
// Configuration Management
// ============================================================================

function getConfig() {
    return {
        version: document.getElementById('configVersion').value || '1.0.0',
        role: document.getElementById('configRole').value || '',
        description: document.getElementById('configDescription').value || '',
        author: document.getElementById('configAuthor').value || '',
        lastModified: document.getElementById('configDate').value || '',
        checks: checks
    };
}

function updatePreview() {
    const config = getConfig();
    const preview = document.getElementById('jsonPreview');
    preview.textContent = JSON.stringify(config, null, 2);
}

// ============================================================================
// Check List Rendering - Accessible
// ============================================================================

function renderChecksList(filterText = '') {
    const list = document.getElementById('checksList');
    const countEl = document.getElementById('checkCount');
    countEl.textContent = checks.length;

    if (checks.length === 0) {
        list.innerHTML = `
            <div class="editor-placeholder" role="status">
                <span>No checks added yet.</span><br>
                <span>Click "Add Check" to begin.</span>
            </div>`;
    } else {
        const filteredChecks = filterText
            ? checks.map((check, index) => ({ check, index })).filter(({ check }) =>
                check.name.toLowerCase().includes(filterText.toLowerCase()) ||
                check.type.toLowerCase().includes(filterText.toLowerCase()) ||
                String(check.id).toLowerCase().includes(filterText.toLowerCase())
            )
            : checks.map((check, index) => ({ check, index }));

        if (filteredChecks.length === 0) {
            list.innerHTML = `<div class="editor-placeholder" role="status">No checks match your search.</div>`;
        } else {
            // Group checks by category
            const groupedChecks = {};
            filteredChecks.forEach(({ check, index }) => {
                const category = getCheckTypeCategory(check.type);
                if (!groupedChecks[category]) {
                    groupedChecks[category] = [];
                }
                groupedChecks[category].push({ check, index });
            });

            // Sort categories alphabetically by display name
            const sortedCategories = Object.keys(groupedChecks).sort((a, b) => {
                const nameA = categoryInfo[a]?.name || a;
                const nameB = categoryInfo[b]?.name || b;
                return nameA.localeCompare(nameB);
            });

            // Render grouped checks
            list.innerHTML = sortedCategories.map(category => {
                const categoryChecks = groupedChecks[category];
                const isCollapsed = !expandedCategories.has(category);
                const categoryName = categoryInfo[category]?.name || category;

                return `
                    <div class="check-category" data-category="${category}">
                        <button type="button"
                                class="check-category-header ${isCollapsed ? 'collapsed' : ''}"
                                onclick="toggleCategory('${category}')"
                                aria-expanded="${!isCollapsed}"
                                aria-controls="category-${category}">
                            <span class="category-toggle">${isCollapsed ? '▶' : '▼'}</span>
                            <span class="category-name">${categoryName}</span>
                            <span class="category-count">(${categoryChecks.length})</span>
                        </button>
                        <div class="check-category-items ${isCollapsed ? 'collapsed' : ''}"
                             id="category-${category}"
                             role="group"
                             aria-label="${categoryName} checks">
                            ${categoryChecks.map(({ check, index }) => `
                                <div class="check-item ${!check.enabled ? 'disabled' : ''}"
                                     role="option"
                                     tabindex="0"
                                     draggable="true"
                                     data-index="${index}"
                                     aria-selected="false"
                                     aria-label="${escapeHtml(check.name)}, ${check.type}, ${check.enabled ? 'enabled' : 'disabled'}"
                                     ondragstart="handleDragStart(event, ${index})"
                                     ondragover="handleDragOver(event)"
                                     ondragenter="handleDragEnter(event)"
                                     ondragleave="handleDragLeave(event)"
                                     ondrop="handleDrop(event, ${index})"
                                     ondragend="handleDragEnd(event)"
                                     onclick="selectCheck(${index})"
                                     ondblclick="editCheck(${index})"
                                     onkeydown="handleCheckItemKeydown(event, ${index})">
                                    <div class="check-reorder-buttons">
                                        <button type="button"
                                                class="btn-reorder"
                                                onclick="event.stopPropagation(); moveCheck(${index}, -1)"
                                                title="Move up"
                                                aria-label="Move ${escapeHtml(check.name)} up"
                                                ${index === 0 ? 'disabled' : ''}>&#9650;</button>
                                        <button type="button"
                                                class="btn-reorder"
                                                onclick="event.stopPropagation(); moveCheck(${index}, 1)"
                                                title="Move down"
                                                aria-label="Move ${escapeHtml(check.name)} down"
                                                ${index === checks.length - 1 ? 'disabled' : ''}>&#9660;</button>
                                    </div>
                                    <span class="check-order" aria-hidden="true">${index + 1}</span>
                                    <div class="check-info">
                                        <div class="check-name">${escapeHtml(check.name)}</div>
                                        <span class="check-type ${getCheckTypeCategory(check.type)}" translate="no">${escapeHtml(check.type)}</span>
                                        ${!check.enabled ? '<span class="check-type disabled-badge">Off</span>' : ''}
                                    </div>
                                    <button type="button"
                                            class="btn btn-danger btn-sm"
                                            onclick="event.stopPropagation(); deleteCheck(${index})"
                                            title="Delete"
                                            aria-label="Delete ${escapeHtml(check.name)}">&#215;</button>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
    updatePreview();
    checkDependencyWarnings();

    // Run validation automatically
    if (checks.length > 0) {
        showValidationResults();
    }
}

/**
 * Toggle category collapse state
 */
function toggleCategory(category) {
    if (expandedCategories.has(category)) {
        expandedCategories.delete(category);
    } else {
        expandedCategories.add(category);
    }
    renderChecksList(document.getElementById('checkSearch')?.value || '');
}

/**
 * Handle keyboard navigation within check items
 */
function handleCheckItemKeydown(event, index) {
    switch (event.key) {
        case 'Enter':
        case ' ':
            event.preventDefault();
            selectCheck(index);
            break;
        case 'Delete':
        case 'Backspace':
            if (event.shiftKey) {
                event.preventDefault();
                deleteCheck(index);
            }
            break;
        case 'e':
        case 'E':
            if (event.ctrlKey || event.metaKey) {
                event.preventDefault();
                editCheck(index);
            }
            break;
    }
}

/**
 * Set up accessibility features for the check list
 */
function setupCheckListAccessibility() {
    const list = document.getElementById('checksList');
    if (!list) return;

    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', 'Configuration checks list');
}

// ============================================================================
// Utility Functions
// ============================================================================

function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
}

function getCheckTypeCategory(type) {
    const categoryMap = {
        'Application': 'cat-applications',
        'FolderExists': 'cat-files',
        'FilesExist': 'cat-files',
        'ShortcutProperties': 'cat-shortcuts',
        'ShortcutExists': 'cat-shortcuts', // backward compatibility
        'ShortcutsAllowList': 'cat-shortcuts',
        'RegistryValue': 'cat-registry',
        'ScheduledTaskExists': 'cat-system',
        'ServiceRunning': 'cat-system',
        'WindowsFeature': 'cat-system',
        'AssignedAccess': 'cat-system',
        'DriverInstalled': 'cat-hardware',
        'PrinterInstalled': 'cat-hardware',
        'NetworkAdapterConfiguration': 'cat-hardware',
        'FirewallRule': 'cat-security',
        'CertificateInstalled': 'cat-security',
        'EdgeFavorites': 'cat-browser'
    };
    return categoryMap[type] || 'cat-system';
}

// Category display names and order
const categoryInfo = {
    'cat-applications': { name: 'Applications', order: 1 },
    'cat-files': { name: 'Files & Folders', order: 2 },
    'cat-shortcuts': { name: 'Shortcuts', order: 3 },
    'cat-registry': { name: 'Registry', order: 4 },
    'cat-hardware': { name: 'Hardware & Drivers', order: 5 },
    'cat-system': { name: 'System & Services', order: 6 },
    'cat-security': { name: 'Security', order: 7 },
    'cat-browser': { name: 'Browser', order: 8 }
};

// Track expanded state of categories (collapsed by default)
const expandedCategories = new Set();

/**
 * Find a duplicate check based on type and key properties
 * @param {string} type - The check type
 * @param {object} properties - The check properties
 * @param {string} name - The check name
 * @returns {object|null} - The duplicate check if found, null otherwise
 */
function findDuplicateCheck(type, properties, name) {
    // Check for exact name match first
    const nameMatch = checks.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (nameMatch) return nameMatch;

    // Check for key property matches based on check type
    return checks.find(c => {
        if (c.type !== type) return false;

        switch (type) {
            case 'Application':
                return c.properties.applicationName?.toLowerCase() === properties.applicationName?.toLowerCase();

            case 'RegistryValue':
                return c.properties.path?.toLowerCase() === properties.path?.toLowerCase() &&
                       c.properties.name?.toLowerCase() === properties.name?.toLowerCase();

            case 'ShortcutExists':
                return c.properties.path?.toLowerCase() === properties.path?.toLowerCase();

            case 'ShortcutsAllowList':
                return c.properties.path?.toLowerCase() === properties.path?.toLowerCase();

            case 'FolderExists':
                return c.properties.path?.toLowerCase() === properties.path?.toLowerCase();

            case 'FilesExist':
                return c.properties.destinationPath?.toLowerCase() === properties.destinationPath?.toLowerCase();

            case 'ScheduledTaskExists':
                return c.properties.taskName?.toLowerCase() === properties.taskName?.toLowerCase();

            case 'ServiceRunning':
                return c.properties.serviceName?.toLowerCase() === properties.serviceName?.toLowerCase();

            case 'WindowsFeature':
                return c.properties.featureName?.toLowerCase() === properties.featureName?.toLowerCase();

            case 'DriverInstalled':
                return c.properties.driverName?.toLowerCase() === properties.driverName?.toLowerCase();

            case 'PrinterInstalled':
                return c.properties.printerName?.toLowerCase() === properties.printerName?.toLowerCase();

            case 'FirewallRule':
                return c.properties.ruleName?.toLowerCase() === properties.ruleName?.toLowerCase();

            case 'CertificateInstalled':
                return c.properties.thumbprint?.toLowerCase() === properties.thumbprint?.toLowerCase();

            case 'NetworkAdapterConfiguration':
                return c.properties.adapterName?.toLowerCase() === properties.adapterName?.toLowerCase();

            case 'AssignedAccess':
                return c.properties.profileId?.toLowerCase() === properties.profileId?.toLowerCase();

            default:
                return false;
        }
    });
}

function filterChecks() {
    const searchText = document.getElementById('checksSearch').value;
    renderChecksList(searchText);

    // Announce results to screen readers
    const count = checks.filter(check =>
        check.name.toLowerCase().includes(searchText.toLowerCase()) ||
        check.type.toLowerCase().includes(searchText.toLowerCase())
    ).length;

    if (typeof announce === 'function') {
        announce(`${count} checks found`);
    }
}

// ============================================================================
// Drag and Drop
// ============================================================================

function moveCheck(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= checks.length) return;

    const [removed] = checks.splice(index, 1);
    checks.splice(newIndex, 0, removed);
    markUnsaved();
    renderChecksList();

    const message = direction < 0 ? 'Check moved up' : 'Check moved down';
    showStatus(message, 'success');

    if (typeof announce === 'function') {
        announce(message);
    }
}

function handleDragStart(e, index) {
    draggedIndex = index;
    e.target.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', e.target.innerHTML);
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
    e.preventDefault();
    const item = e.target.closest('.check-item');
    if (item) item.classList.add('drag-over');
}

function handleDragLeave(e) {
    const item = e.target.closest('.check-item');
    if (item) item.classList.remove('drag-over');
}

function handleDrop(e, dropIndex) {
    e.preventDefault();
    const item = e.target.closest('.check-item');
    if (item) item.classList.remove('drag-over');

    if (draggedIndex !== null && draggedIndex !== dropIndex) {
        const [removed] = checks.splice(draggedIndex, 1);
        checks.splice(dropIndex, 0, removed);
        markUnsaved();
        renderChecksList();

        showStatus('Check reordered', 'success');

        if (typeof announce === 'function') {
            announce('Check reordered');
        }
    }
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
    document.querySelectorAll('.check-item').forEach(item => {
        item.classList.remove('drag-over');
    });
    draggedIndex = null;
}

// ============================================================================
// Dependency Warnings
// ============================================================================

function checkDependencyWarnings() {
    // Use the detailed validation from validation.js
    if (typeof showDependencyWarnings === 'function') {
        showDependencyWarnings();
    }
}

// ============================================================================
// Check Modal Management - Accessible
// ============================================================================

function showAddCheckModal() {
    editingCheckIndex = -1;

    document.getElementById('checkModalTitle').textContent = 'Add Check';
    document.getElementById('checkType').value = '';
    document.getElementById('checkName').value = '';
    document.getElementById('checkEnabled').checked = true;
    document.getElementById('checkProperties').innerHTML = '';

    const modal = document.getElementById('checkModal');
    modal.classList.add('active');

    if (typeof saveFocus === 'function') saveFocus();

    setTimeout(() => {
        const firstInput = modal.querySelector('select, input, button');
        if (firstInput) firstInput.focus();
    }, 100);
}

function closeCheckModal() {
    document.getElementById('checkModal').classList.remove('active');
    editingCheckIndex = -1;

    if (typeof restoreFocus === 'function') restoreFocus();
}

function selectCheck(index) {
    editingCheckIndex = index;
    const check = checks[index];

    // Update ARIA selected state
    document.querySelectorAll('.check-item').forEach((el, i) => {
        const isSelected = parseInt(el.dataset.index) === index;
        el.classList.toggle('selected', isSelected);
        el.setAttribute('aria-selected', isSelected.toString());
    });

    // Show preview in middle panel
    showCheckPreview(check, index);

    if (typeof announce === 'function') {
        announce(`Selected ${check.name}`);
    }
}

function editCheck(index) {
    editingCheckIndex = index;
    const check = checks[index];

    document.getElementById('checkModalTitle').textContent = 'Edit Check';
    document.getElementById('checkType').value = check.type;
    document.getElementById('checkName').value = check.name;
    document.getElementById('checkEnabled').checked = check.enabled;
    showCheckProperties();
    populateCheckProperties(check.properties);

    const modal = document.getElementById('checkModal');
    modal.classList.add('active');

    if (typeof saveFocus === 'function') saveFocus();

    setTimeout(() => {
        document.getElementById('checkName').focus();
    }, 100);
}

function showCheckPreview(check, index) {
    const editorTitle = document.getElementById('editorTitle');
    const editorContent = document.getElementById('editorContent');

    editorTitle.textContent = `Check #${index + 1}: ${check.name}`;

    const categoryClass = getCheckTypeCategory(check.type);

    let propsHtml = '';
    for (const [key, value] of Object.entries(check.properties || {})) {
        const displayValue = Array.isArray(value) ? value.join(', ') : value;
        propsHtml += `
            <div class="preview-prop">
                <span class="preview-prop-key" translate="no">${escapeHtml(key)}:</span>
                <span class="preview-prop-value" translate="no">${escapeHtml(String(displayValue))}</span>
            </div>`;
    }

    editorContent.innerHTML = `
        <article class="check-preview" aria-labelledby="editorTitle">
            <header class="preview-header">
                <span class="check-type ${categoryClass}" translate="no">${escapeHtml(check.type)}</span>
                ${!check.enabled ? '<span class="check-type disabled-badge">Disabled</span>' : ''}
            </header>
            <section class="preview-section">
                <h4>Properties</h4>
                ${propsHtml || '<p class="preview-empty">No properties defined</p>'}
            </section>
            <footer class="preview-actions">
                <button type="button" class="btn btn-primary" onclick="editCheck(${index})">Edit Check</button>
                <button type="button" class="btn btn-secondary" onclick="duplicateCheck(${index})">Duplicate</button>
                <button type="button" class="btn btn-danger" onclick="deleteCheck(${index})">Delete</button>
            </footer>
        </article>
    `;
}

function duplicateCheck(index) {
    const original = checks[index];
    const copy = JSON.parse(JSON.stringify(original));
    copy.name = copy.name + ' (Copy)';
    copy.id = getNextCheckId();
    checks.push(copy);
    markUnsaved();
    renderChecksList();

    showStatus('Check duplicated', 'success');

    if (typeof announceSuccess === 'function') {
        announceSuccess('Check duplicated');
    }
}

function deleteCheck(index) {
    if (confirm('Are you sure you want to delete this check?')) {
        checks.splice(index, 1);
        markUnsaved();
        renderChecksList();

        // Reset editor panel
        const editorTitle = document.getElementById('editorTitle');
        const editorContent = document.getElementById('editorContent');
        editorTitle.textContent = 'Check Editor';
        editorContent.innerHTML = `
            <div class="editor-placeholder" role="status">
                <span>Select a check to edit, or click "Add Check" to create a new one.</span>
            </div>`;

        showStatus('Check deleted', 'warning');

        if (typeof announceWarning === 'function') {
            announceWarning('Check deleted');
        }
    }
}

// ============================================================================
// Check Save
// ============================================================================

function getNextCheckId() {
    if (checks.length === 0) return "1";
    const maxId = Math.max(...checks.map(c => parseInt(c.id) || 0));
    return String(maxId + 1);
}

function saveCheck() {
    const type = document.getElementById('checkType').value;
    const name = document.getElementById('checkName').value;
    const enabled = document.getElementById('checkEnabled').checked;

    if (!type || !name) {
        showStatus('Please fill in all required fields (Type, Display Name)', 'error');

        if (typeof announceError === 'function') {
            announceError('Please fill in all required fields');
        }

        if (!type) {
            document.getElementById('checkType').focus();
        } else if (!name) {
            document.getElementById('checkName').focus();
        }
        return;
    }

    const id = editingCheckIndex >= 0 ? checks[editingCheckIndex].id : getNextCheckId();
    const properties = getCheckProperties();

    const check = {
        id: id,
        name: name,
        type: type,
        enabled: enabled,
        properties: properties
    };

    // Check for duplicate checks (only when adding new, not editing)
    if (editingCheckIndex < 0) {
        const duplicate = findDuplicateCheck(type, properties, name);
        if (duplicate) {
            const proceed = confirm(
                `A similar check already exists:\n\n` +
                `"${duplicate.name}" (${duplicate.type})\n\n` +
                `Are you sure you want to add this check anyway?`
            );
            if (!proceed) {
                return;
            }
        }
    }

    // Check for missing icon dependency on ShortcutExists
    if (type === 'ShortcutExists' && properties.iconLocation) {
        const iconPath = properties.iconLocation.toLowerCase();
        // Only check if not a system icon
        if (!iconPath.includes('system32') && !iconPath.includes('windows') && !iconPath.includes(',')) {
            const iconFileName = properties.iconLocation.split('\\').pop();
            const hasIconCheck = checks.some(c => {
                if (c.type !== 'FilesExist') return false;
                if (c.properties.mode === 'SingleFile') {
                    return c.properties.destinationPath?.toLowerCase() === properties.iconLocation.toLowerCase();
                } else {
                    const files = c.properties.files || [];
                    return files.some(f => f.toLowerCase() === iconFileName.toLowerCase());
                }
            });

            if (!hasIconCheck) {
                const addIcon = confirm(
                    `This shortcut uses a custom icon "${iconFileName}" but no FilesExist check deploys this icon.\n\n` +
                    `Would you like to add a FilesExist check for this icon?\n\n` +
                    `Click OK to add the icon check, or Cancel to continue without it.`
                );

                if (addIcon) {
                    // Extract folder path from icon location
                    const iconFolder = properties.iconLocation.substring(0, properties.iconLocation.lastIndexOf('\\'));
                    const iconCheck = {
                        id: getNextCheckId(),
                        name: `Deploy ${iconFileName}`,
                        type: 'FilesExist',
                        enabled: true,
                        properties: {
                            mode: 'MultipleFiles',
                            destinationPath: iconFolder,
                            files: [iconFileName],
                            sourceAssetPath: 'Icons'
                        }
                    };
                    // Insert before the shortcut check
                    const insertIndex = editingCheckIndex >= 0 ? editingCheckIndex : checks.length;
                    checks.splice(insertIndex, 0, iconCheck);
                    // Adjust editing index since we inserted before
                    if (editingCheckIndex >= 0) {
                        editingCheckIndex++;
                    }
                }
            }
        }
    }

    // Check for missing driver dependency on PrinterInstalled
    if (type === 'PrinterInstalled' && properties.driverName) {
        const hasDriverCheck = checks.some(c =>
            c.type === 'DriverInstalled' &&
            c.properties.driverName?.toLowerCase() === properties.driverName.toLowerCase()
        );

        if (!hasDriverCheck) {
            const addDriver = confirm(
                `This printer uses driver "${properties.driverName}" but no DriverInstalled check exists for it.\n\n` +
                `Printers require their driver to be installed first.\n\n` +
                `Would you like to add a DriverInstalled check?\n\n` +
                `Click OK to add the driver check, or Cancel to continue without it.`
            );

            if (addDriver) {
                const driverCheck = {
                    id: getNextCheckId(),
                    name: `${properties.driverName} Driver`,
                    type: 'DriverInstalled',
                    enabled: true,
                    properties: {
                        driverName: properties.driverName,
                        driverClass: 'Printer',
                        sourceAssetPath: 'Drivers\\',
                        minimumVersion: ''
                    }
                };
                // Insert before the printer check
                const insertIndex = editingCheckIndex >= 0 ? editingCheckIndex : checks.length;
                checks.splice(insertIndex, 0, driverCheck);
                // Adjust editing index since we inserted before
                if (editingCheckIndex >= 0) {
                    editingCheckIndex++;
                }
                showToast('Driver check added - update the sourceAssetPath to point to your .inf file', 'info', 'Driver Check Created');
            }
        }
    }

    let message;
    if (editingCheckIndex >= 0) {
        checks[editingCheckIndex] = check;
        message = 'Check updated successfully';
    } else {
        checks.push(check);
        message = 'Check added successfully';
    }

    showStatus(message, 'success');
    if (typeof announceSuccess === 'function') {
        announceSuccess(message);
    }

    markUnsaved();
    closeCheckModal();
    renderChecksList();
}

// ============================================================================
// About Modal
// ============================================================================

function showAbout() {
    const modal = document.getElementById('aboutModal');
    modal.classList.add('active');

    if (typeof saveFocus === 'function') saveFocus();

    setTimeout(() => {
        const closeBtn = modal.querySelector('.close-btn');
        if (closeBtn) closeBtn.focus();
    }, 100);
}

function closeAbout() {
    document.getElementById('aboutModal').classList.remove('active');
    if (typeof restoreFocus === 'function') restoreFocus();
}

// ============================================================================
// Settings Modal
// ============================================================================

function showSettings() {
    const modal = document.getElementById('settingsModal');
    const content = document.getElementById('settingsContent');

    // Populate settings content
    if (typeof createAccessibilitySettingsHTML === 'function') {
        content.innerHTML = createAccessibilitySettingsHTML();
    } else {
        content.innerHTML = '<p>Settings not available</p>';
    }

    modal.classList.add('active');

    if (typeof saveFocus === 'function') saveFocus();

    setTimeout(() => {
        const firstInput = modal.querySelector('input, select, button:not(.close-btn)');
        if (firstInput) firstInput.focus();
    }, 100);
}

function closeSettings() {
    document.getElementById('settingsModal').classList.remove('active');
    if (typeof restoreFocus === 'function') restoreFocus();
}

// ============================================================================
// Examples Modal
// ============================================================================

const exampleConfigurations = [
    {
        name: 'Kiosk Setup',
        description: 'Basic kiosk configuration with Edge shortcuts and Assigned Access',
        icon: '&#128421;', // Desktop monitor
        config: {
            role: 'Kiosk',
            description: 'Kiosk configuration with limited apps',
            checks: [
                {
                    id: '1', name: 'Kiosk Shortcut', type: 'ShortcutProperties', enabled: true,
                    properties: {
                        path: 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\Kiosk App.lnk',
                        targetPath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
                        arguments: '--no-first-run --kiosk https://example.com --edge-kiosk-type=public-browsing',
                        description: 'Kiosk Application'
                    }
                }
            ]
        }
    },
    {
        name: 'Browser Control',
        description: 'Ensure only approved browsers are installed',
        icon: '&#127760;', // Globe
        config: {
            role: 'Browser',
            description: 'Browser installation enforcement',
            checks: [
                {
                    id: '1', name: 'Chrome Not Installed', type: 'Application', enabled: true,
                    properties: {
                        applicationName: 'Google Chrome',
                        ensureInstalled: false,
                        searchPaths: [
                            'C:\\Program Files*\\Google\\Chrome\\Application\\chrome.exe',
                            'C:\\Users\\*\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
                        ],
                        uninstallPaths: [
                            'C:\\Program Files*\\Google\\Chrome\\Application\\*\\Installer\\setup.exe',
                            'C:\\Users\\*\\AppData\\Local\\Google\\Chrome\\Application\\*\\Installer\\setup.exe'
                        ],
                        uninstallArguments: '--uninstall --multi-install --chrome --system-level --force-uninstall'
                    }
                },
                {
                    id: '2', name: 'Firefox Not Installed', type: 'Application', enabled: true,
                    properties: {
                        applicationName: 'Mozilla Firefox',
                        ensureInstalled: false,
                        searchPaths: ['C:\\Program Files*\\Mozilla Firefox\\firefox.exe'],
                        uninstallPaths: ['C:\\Program Files*\\Mozilla Firefox\\uninstall\\helper.exe'],
                        uninstallArguments: '/S'
                    }
                }
            ]
        }
    },
    {
        name: 'Printer Setup',
        description: 'Deploy network printer with driver',
        icon: '&#128424;', // Printer
        config: {
            role: 'Printer',
            description: 'Network printer deployment with driver installation',
            checks: [
                {
                    id: '1', name: 'Printer Driver', type: 'DriverInstalled', enabled: true,
                    properties: {
                        driverName: 'HP Universal Printing PCL 6',
                        driverClass: 'Printer',
                        sourceAssetPath: 'Drivers\\HP_UPD\\hpcu270u.inf'
                    }
                },
                {
                    id: '2', name: 'Office Printer', type: 'PrinterInstalled', enabled: true,
                    properties: {
                        printerName: 'Office Printer',
                        driverName: 'HP Universal Printing PCL 6',
                        printerIP: '192.168.1.100',
                        portName: 'IP_192.168.1.100',
                        portType: 'TCP',
                        setAsDefault: true
                    }
                }
            ]
        }
    },
    {
        name: 'Registry Policies',
        description: 'Common Windows policy settings via registry',
        icon: '&#128273;', // Key
        config: {
            role: 'Policies',
            description: 'Windows registry-based policy settings',
            checks: [
                {
                    id: '1', name: 'Disable First Run Experience', type: 'RegistryValue', enabled: true,
                    properties: {
                        path: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge',
                        name: 'HideFirstRunExperience',
                        value: 1,
                        type: 'DWord'
                    }
                },
                {
                    id: '2', name: 'Left-Align Start Menu', type: 'RegistryValue', enabled: true,
                    properties: {
                        path: 'HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer',
                        name: 'HideRecommendedSection',
                        value: 1,
                        type: 'DWord'
                    }
                }
            ]
        }
    },
    {
        name: 'Service Management',
        description: 'Ensure critical services are running',
        icon: '&#9881;', // Gear
        config: {
            role: 'Services',
            description: 'Service state enforcement',
            checks: [
                {
                    id: '1', name: 'Print Spooler Running', type: 'ServiceRunning', enabled: true,
                    properties: {
                        serviceName: 'Spooler',
                        startupType: 'Automatic',
                        ensureRunning: true
                    }
                },
                {
                    id: '2', name: 'Windows Update Running', type: 'ServiceRunning', enabled: true,
                    properties: {
                        serviceName: 'wuauserv',
                        startupType: 'Manual',
                        ensureRunning: true
                    }
                }
            ]
        }
    }
];

function showExamples() {
    const modal = document.getElementById('examplesModal');
    const content = document.getElementById('examplesContent');

    content.innerHTML = exampleConfigurations.map((example, index) => `
        <div class="example-card" onclick="loadExample(${index})" tabindex="0" role="button"
             onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();loadExample(${index});}">
            <div class="example-icon" aria-hidden="true">${example.icon}</div>
            <div class="example-info">
                <h4>${escapeHtml(example.name)}</h4>
                <p>${escapeHtml(example.description)}</p>
                <span class="example-count">${example.config.checks.length} checks</span>
            </div>
        </div>
    `).join('');

    modal.classList.add('active');

    if (typeof saveFocus === 'function') saveFocus();

    setTimeout(() => {
        const firstCard = content.querySelector('.example-card');
        if (firstCard) firstCard.focus();
    }, 100);
}

function closeExamples() {
    document.getElementById('examplesModal').classList.remove('active');
    if (typeof restoreFocus === 'function') restoreFocus();
}

function loadExample(index) {
    const example = exampleConfigurations[index];
    if (!example) return;

    if (checks.length > 0) {
        if (!confirm('This will replace your current checks. Continue?')) {
            return;
        }
    }

    // Load the example configuration
    document.getElementById('configRole').value = example.config.role || '';
    document.getElementById('configDescription').value = example.config.description || '';
    document.getElementById('configVersion').value = '1.0.0';
    document.getElementById('configDate').value = new Date().toISOString().split('T')[0];

    // Clear imported version since this is a new config from example
    if (typeof clearImportedVersion === 'function') {
        clearImportedVersion();
    }

    checks = JSON.parse(JSON.stringify(example.config.checks));
    renderChecksList();
    markUnsaved();
    closeExamples();

    showStatus(`Loaded "${example.name}" example with ${checks.length} checks`, 'success');

    if (typeof announceSuccess === 'function') {
        announceSuccess(`Loaded ${example.name} example`);
    }
}

// ============================================================================
// Status Messages - Accessible
// ============================================================================

function showStatus(message, type = 'success') {
    const statusBar = document.getElementById('statusBar');
    statusBar.textContent = message;
    statusBar.className = 'status-bar';

    if (type === 'error') {
        statusBar.classList.add('error');
        statusBar.setAttribute('role', 'alert');
    } else if (type === 'warning') {
        statusBar.classList.add('warning');
        statusBar.setAttribute('role', 'alert');
    } else {
        statusBar.setAttribute('role', 'status');
    }

    statusBar.style.display = 'block';

    setTimeout(() => {
        statusBar.style.display = 'none';
    }, type === 'error' ? 5000 : 3000);
}

// ============================================================================
// Toast Notifications
// ============================================================================

function showToast(message, type = 'info', title = '') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');

    const icons = {
        success: '&#10003;',
        error: '!',
        warning: '&#9888;',
        info: 'i'
    };

    toast.innerHTML = `
        <span class="toast-icon" aria-hidden="true">${icons[type] || icons.info}</span>
        <div class="toast-content">
            ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ''}
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
        <button type="button" class="toast-close" onclick="this.parentElement.remove()" aria-label="Dismiss">&#215;</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.remove();
        }
    }, type === 'error' ? 8000 : 5000);
}

// ============================================================================
// Modal Click Handler - Close on Backdrop Click
// ============================================================================

window.onclick = (event) => {
    const modals = ['aboutModal', 'settingsModal'];
    modals.forEach(modalId => {
        if (event.target.id === modalId) {
            event.target.classList.remove('active');
            if (typeof restoreFocus === 'function') restoreFocus();
        }
    });
};
