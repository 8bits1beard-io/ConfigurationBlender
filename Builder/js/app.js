/* ============================================================================
   Configuration Blender - Main Application
   ============================================================================ */

// Global state
let checks = [];
let editingCheckIndex = -1;
let hasUnsavedChanges = false;
let draggedIndex = null;

// Check dependencies - which check types should come before others
const checkDependencies = {
    'PrinterInstalled': ['DriverInstalled'],
    'ShortcutExists': ['FilesExist', 'ApplicationInstalled'],
    'AssignedAccess': ['ShortcutExists']
};

// ============================================================================
// Initialization
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('configDate').value = new Date().toISOString().split('T')[0];
    updatePreview();

    // Warn before leaving with unsaved changes
    window.addEventListener('beforeunload', (e) => {
        if (hasUnsavedChanges) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
});

// ============================================================================
// State Management
// ============================================================================

function markUnsaved() {
    hasUnsavedChanges = true;
    document.getElementById('unsavedIndicator').classList.add('visible');
}

function markSaved() {
    hasUnsavedChanges = false;
    document.getElementById('unsavedIndicator').classList.remove('visible');
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
// Check List Rendering
// ============================================================================

function renderChecksList(filterText = '') {
    const list = document.getElementById('checksList');
    const countEl = document.getElementById('checkCount');
    countEl.textContent = checks.length;

    if (checks.length === 0) {
        list.innerHTML = '<div style="padding: 2rem; text-align: center; color: #666;">No checks added yet. Click "Add Check" to begin.</div>';
    } else {
        const filteredChecks = filterText
            ? checks.map((check, index) => ({ check, index })).filter(({ check }) =>
                check.name.toLowerCase().includes(filterText.toLowerCase()) ||
                check.type.toLowerCase().includes(filterText.toLowerCase()) ||
                check.id.toLowerCase().includes(filterText.toLowerCase())
            )
            : checks.map((check, index) => ({ check, index }));

        if (filteredChecks.length === 0) {
            list.innerHTML = '<div style="padding: 2rem; text-align: center; color: #666;">No checks match your search.</div>';
        } else {
            list.innerHTML = filteredChecks.map(({ check, index }) => `
                <div class="check-item ${!check.enabled ? 'disabled' : ''}"
                     draggable="true"
                     data-index="${index}"
                     ondragstart="handleDragStart(event, ${index})"
                     ondragover="handleDragOver(event)"
                     ondragenter="handleDragEnter(event)"
                     ondragleave="handleDragLeave(event)"
                     ondrop="handleDrop(event, ${index})"
                     ondragend="handleDragEnd(event)"
                     onclick="selectCheck(${index})"
                     ondblclick="editCheck(${index})">
                    <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
                    <span class="check-order">${index + 1}</span>
                    <div class="check-info">
                        <div class="check-name">${escapeHtml(check.name)}</div>
                        <span class="check-type ${getCheckTypeCategory(check.type)}">${check.type}</span>${!check.enabled ? '<span class="check-type disabled-badge">Off</span>' : ''}
                    </div>
                    <button class="btn btn-danger btn-sm" onclick="event.stopPropagation(); deleteCheck(${index})" title="Delete">×</button>
                </div>
            `).join('');
        }
    }
    updatePreview();
    checkDependencyWarnings();

    // Run validation automatically
    if (checks.length > 0) {
        showValidationResults();
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

function getCheckTypeCategory(type) {
    const categoryMap = {
        'Application': 'cat-applications',
        'FolderEmpty': 'cat-files',
        'FolderHasFiles': 'cat-files',
        'FilesExist': 'cat-files',
        'FileContent': 'cat-files',
        'ShortcutExists': 'cat-shortcuts',
        'ShortcutsAllowList': 'cat-shortcuts',
        'RegistryValue': 'cat-registry',
        'ScheduledTaskExists': 'cat-system',
        'ServiceRunning': 'cat-system',
        'WindowsFeature': 'cat-system',
        'AssignedAccess': 'cat-system',
        'DriverInstalled': 'cat-system',
        'PrinterInstalled': 'cat-network',
        'NetworkAdapterConfiguration': 'cat-network',
        'FirewallRule': 'cat-security',
        'CertificateInstalled': 'cat-security'
    };
    return categoryMap[type] || 'cat-system';
}

function filterChecks() {
    const searchText = document.getElementById('checksSearch').value;
    renderChecksList(searchText);
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
    showStatus(`Check moved ${direction < 0 ? 'up' : 'down'}`, 'success');
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
    const warningsContainer = document.getElementById('dependencyWarnings');
    const warnings = [];

    checks.forEach((check, index) => {
        if (!check.enabled) return;

        const deps = checkDependencies[check.type];
        if (!deps) return;

        deps.forEach(depType => {
            const depIndex = checks.findIndex((c, i) => i < index && c.type === depType && c.enabled);
            const hasDepAnywhere = checks.some((c, i) => c.type === depType && c.enabled);

            if (hasDepAnywhere && depIndex === -1) {
                warnings.push(`"${check.name}" (${check.type}) should come AFTER a ${depType} check`);
            } else if (!hasDepAnywhere && depType === 'DriverInstalled' && check.type === 'PrinterInstalled') {
                warnings.push(`"${check.name}" may need a DriverInstalled check before it (printer driver must be installed first)`);
            }
        });
    });

    if (warnings.length > 0) {
        warningsContainer.innerHTML = warnings.map(w =>
            `<div class="dependency-warning">${escapeHtml(w)}</div>`
        ).join('');
    } else {
        warningsContainer.innerHTML = '';
    }
}

// ============================================================================
// Check Modal Management
// ============================================================================

function showAddCheckModal() {
    editingCheckIndex = -1;
    document.getElementById('checkModalTitle').textContent = 'Add Check';
    document.getElementById('checkType').value = '';
    document.getElementById('checkName').value = '';
    document.getElementById('checkEnabled').checked = true;
    document.getElementById('checkProperties').innerHTML = '';
    document.getElementById('checkModal').classList.add('active');
}

function closeCheckModal() {
    document.getElementById('checkModal').classList.remove('active');
    editingCheckIndex = -1;
}

function selectCheck(index) {
    editingCheckIndex = index;
    const check = checks[index];

    // Highlight selected item in list
    document.querySelectorAll('.check-item').forEach((el, i) => {
        el.classList.toggle('selected', parseInt(el.dataset.index) === index);
    });

    // Show preview in middle panel
    showCheckPreview(check, index);
}

function editCheck(index) {
    editingCheckIndex = index;
    const check = checks[index];

    // Open modal for editing
    document.getElementById('checkModalTitle').textContent = 'Edit Check';
    document.getElementById('checkType').value = check.type;
    document.getElementById('checkName').value = check.name;
    document.getElementById('checkEnabled').checked = check.enabled;
    showCheckProperties();
    populateCheckProperties(check.properties);
    document.getElementById('checkModal').classList.add('active');
}

function showCheckPreview(check, index) {
    const editorTitle = document.getElementById('editorTitle');
    const editorContent = document.getElementById('editorContent');

    editorTitle.textContent = `Check #${index + 1}: ${check.name}`;

    const categoryClass = getCheckTypeCategory(check.type);
    let propsHtml = '';
    for (const [key, value] of Object.entries(check.properties || {})) {
        const displayValue = Array.isArray(value) ? value.join(', ') : value;
        propsHtml += `<div class="preview-prop"><span class="preview-prop-key">${key}:</span> <span class="preview-prop-value">${escapeHtml(String(displayValue))}</span></div>`;
    }

    editorContent.innerHTML = `
        <div class="check-preview">
            <div class="preview-header">
                <span class="check-type ${categoryClass}">${check.type}</span>
                ${!check.enabled ? '<span class="check-type disabled-badge">Disabled</span>' : ''}
            </div>
            <div class="preview-section">
                <h4>Properties</h4>
                ${propsHtml || '<div class="preview-empty">No properties defined</div>'}
            </div>
            <div class="preview-actions">
                <button class="btn btn-primary" onclick="editCheck(${index})">Edit Check</button>
                <button class="btn btn-secondary" onclick="duplicateCheck(${index})">Duplicate</button>
                <button class="btn btn-danger" onclick="deleteCheck(${index})">Delete</button>
            </div>
        </div>
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
}

function deleteCheck(index) {
    if (confirm('Are you sure you want to delete this check?')) {
        checks.splice(index, 1);
        markUnsaved();
        renderChecksList();
        showStatus('Check deleted', 'warning');
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
        return;
    }

    const id = editingCheckIndex >= 0 ? checks[editingCheckIndex].id : getNextCheckId();

    const check = {
        id: id,
        name: name,
        type: type,
        enabled: enabled,
        properties: getCheckProperties()
    };

    if (editingCheckIndex >= 0) {
        checks[editingCheckIndex] = check;
        showStatus('Check updated successfully', 'success');
    } else {
        checks.push(check);
        showStatus('Check added successfully', 'success');
    }

    markUnsaved();
    closeCheckModal();
    renderChecksList();
}

// ============================================================================
// About Modal
// ============================================================================

function showAbout() {
    document.getElementById('aboutModal').classList.add('active');
}

function closeAbout() {
    document.getElementById('aboutModal').classList.remove('active');
}

// ============================================================================
// Status Messages
// ============================================================================

function showStatus(message, type = 'success') {
    const statusBar = document.getElementById('statusBar');
    statusBar.textContent = message;
    statusBar.className = 'status-bar';
    if (type === 'error') statusBar.classList.add('error');
    if (type === 'warning') statusBar.classList.add('warning');
    statusBar.style.display = 'block';
    setTimeout(() => {
        statusBar.style.display = 'none';
    }, 3000);
}

// ============================================================================
// Modal Click Handler
// ============================================================================

window.onclick = (event) => {
    if (event.target.id === 'aboutModal') {
        event.target.classList.remove('active');
    }
};
