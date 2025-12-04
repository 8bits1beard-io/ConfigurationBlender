/* ============================================================================
   Configuration Blender - Accessibility Features
   WCAG 2.1/2.2 AA Compliant Implementation
   ============================================================================ */

// ============================================================================
// Settings State
// ============================================================================

const accessibilitySettings = {
    enableAudibleAlerts: true,
    enableReducedMotion: false,
    enableHighContrast: false
};

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize accessibility features
 */
function initAccessibility() {
    // Load saved settings
    loadAccessibilitySettings();

    // Detect system preferences
    detectSystemPreferences();

    // Set up keyboard navigation
    setupKeyboardNavigation();

    // Set up focus management
    setupFocusManagement();

    // Set up live regions
    setupLiveRegions();

    // Initialize skip link
    initSkipLink();

    // Set up modal focus trapping
    setupModalFocusTrapping();

    console.log('Accessibility features initialized');
}

/**
 * Load saved accessibility settings from localStorage
 */
function loadAccessibilitySettings() {
    const saved = localStorage.getItem('configBlender_accessibility');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            Object.assign(accessibilitySettings, parsed);
        } catch (e) {
            console.warn('Could not parse saved accessibility settings');
        }
    }
}

/**
 * Save accessibility settings to localStorage
 */
function saveAccessibilitySettings() {
    localStorage.setItem('configBlender_accessibility', JSON.stringify(accessibilitySettings));
}

/**
 * Detect and respect system accessibility preferences
 */
function detectSystemPreferences() {
    // Reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    accessibilitySettings.enableReducedMotion = prefersReducedMotion.matches;

    prefersReducedMotion.addEventListener('change', (e) => {
        accessibilitySettings.enableReducedMotion = e.matches;
    });

    // High contrast preference
    const prefersHighContrast = window.matchMedia('(prefers-contrast: high)');
    accessibilitySettings.enableHighContrast = prefersHighContrast.matches;

    prefersHighContrast.addEventListener('change', (e) => {
        accessibilitySettings.enableHighContrast = e.matches;
    });
}

// ============================================================================
// Audible Alerts
// ============================================================================

// Audio context for generating sounds (avoids needing external files)
let audioContext = null;

/**
 * Initialize audio context (must be called after user interaction)
 */
function initAudioContext() {
    if (!audioContext) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API not supported');
        }
    }
    return audioContext;
}

/**
 * Play an error sound
 * Uses Web Audio API to generate a short, unobtrusive tone
 */
function playErrorSound() {
    if (!accessibilitySettings.enableAudibleAlerts) return;

    // Check for reduced motion (some users may prefer reduced audio too)
    if (accessibilitySettings.enableReducedMotion) return;

    const ctx = initAudioContext();
    if (!ctx) return;

    try {
        // Resume audio context if suspended (browser requirement)
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        // Create a short descending tone
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Error sound: two quick descending tones
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, ctx.currentTime); // A4
        oscillator.frequency.setValueAtTime(330, ctx.currentTime + 0.1); // E4

        // Very low volume - unobtrusive
        gainNode.gain.setValueAtTime(0.15, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.15);
    } catch (e) {
        console.warn('Could not play error sound:', e);
    }
}

/**
 * Play a success sound
 */
function playSuccessSound() {
    if (!accessibilitySettings.enableAudibleAlerts) return;
    if (accessibilitySettings.enableReducedMotion) return;

    const ctx = initAudioContext();
    if (!ctx) return;

    try {
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Success sound: ascending tone
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(330, ctx.currentTime); // E4
        oscillator.frequency.setValueAtTime(440, ctx.currentTime + 0.08); // A4

        gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.12);
    } catch (e) {
        console.warn('Could not play success sound:', e);
    }
}

/**
 * Play a warning sound
 */
function playWarningSound() {
    if (!accessibilitySettings.enableAudibleAlerts) return;
    if (accessibilitySettings.enableReducedMotion) return;

    const ctx = initAudioContext();
    if (!ctx) return;

    try {
        if (ctx.state === 'suspended') {
            ctx.resume();
        }

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        // Warning sound: single mid tone
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(380, ctx.currentTime);

        gainNode.gain.setValueAtTime(0.12, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.18);
    } catch (e) {
        console.warn('Could not play warning sound:', e);
    }
}

// ============================================================================
// Live Regions for Screen Readers
// ============================================================================

let liveRegion = null;
let assertiveLiveRegion = null;

/**
 * Set up ARIA live regions for announcements
 */
function setupLiveRegions() {
    // Polite announcements
    liveRegion = document.createElement('div');
    liveRegion.setAttribute('role', 'status');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.setAttribute('aria-atomic', 'true');
    liveRegion.className = 'visually-hidden';
    liveRegion.id = 'announcements';
    document.body.appendChild(liveRegion);

    // Assertive announcements (for errors)
    assertiveLiveRegion = document.createElement('div');
    assertiveLiveRegion.setAttribute('role', 'alert');
    assertiveLiveRegion.setAttribute('aria-live', 'assertive');
    assertiveLiveRegion.setAttribute('aria-atomic', 'true');
    assertiveLiveRegion.className = 'visually-hidden';
    assertiveLiveRegion.id = 'alerts';
    document.body.appendChild(assertiveLiveRegion);
}

/**
 * Announce a message to screen readers (polite)
 * @param {string} message - Message to announce
 */
function announce(message) {
    if (liveRegion) {
        liveRegion.textContent = '';
        // Small delay to ensure the change is detected
        setTimeout(() => {
            liveRegion.textContent = message;
        }, 100);
    }
}

/**
 * Announce an error to screen readers (assertive)
 * @param {string} message - Error message to announce
 */
function announceError(message) {
    if (assertiveLiveRegion) {
        assertiveLiveRegion.textContent = '';
        setTimeout(() => {
            assertiveLiveRegion.textContent = message;
        }, 100);
    }

    // Also play error sound
    playErrorSound();
}

/**
 * Announce a success message
 * @param {string} message - Success message
 */
function announceSuccess(message) {
    announce(message);
    playSuccessSound();
}

/**
 * Announce a warning message
 * @param {string} message - Warning message
 */
function announceWarning(message) {
    announce(message);
    playWarningSound();
}

// ============================================================================
// Focus Management
// ============================================================================

let lastFocusedElement = null;

/**
 * Set up focus management utilities
 */
function setupFocusManagement() {
    // Track last focused element before modals
    document.addEventListener('focusin', (e) => {
        if (!e.target.closest('.modal')) {
            lastFocusedElement = e.target;
        }
    });
}

/**
 * Save current focus state
 */
function saveFocus() {
    lastFocusedElement = document.activeElement;
}

/**
 * Restore previously saved focus
 */
function restoreFocus() {
    if (lastFocusedElement && lastFocusedElement.focus) {
        lastFocusedElement.focus();
    }
}

/**
 * Move focus to an element
 * @param {HTMLElement|string} element - Element or selector
 */
function moveFocus(element) {
    const el = typeof element === 'string' ? document.querySelector(element) : element;
    if (el) {
        // Make element focusable if it isn't
        if (!el.hasAttribute('tabindex') && !isFocusable(el)) {
            el.setAttribute('tabindex', '-1');
        }
        el.focus();
    }
}

/**
 * Check if an element is focusable
 * @param {HTMLElement} element - Element to check
 * @returns {boolean}
 */
function isFocusable(element) {
    const focusableTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'];
    return focusableTags.includes(element.tagName) &&
           !element.disabled &&
           !element.hasAttribute('aria-hidden');
}

/**
 * Get all focusable elements within a container
 * @param {HTMLElement} container - Container element
 * @returns {HTMLElement[]} Array of focusable elements
 */
function getFocusableElements(container) {
    const selector = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
        '[contenteditable="true"]'
    ].join(', ');

    return Array.from(container.querySelectorAll(selector))
        .filter(el => !el.hasAttribute('aria-hidden') && el.offsetParent !== null);
}

// ============================================================================
// Modal Focus Trapping
// ============================================================================

/**
 * Set up focus trapping for modals
 */
function setupModalFocusTrapping() {
    document.addEventListener('keydown', (e) => {
        const activeModal = document.querySelector('.modal.active');
        if (!activeModal) return;

        if (e.key === 'Tab') {
            trapFocus(activeModal, e);
        }

        if (e.key === 'Escape') {
            // Close modal on Escape
            const closeBtn = activeModal.querySelector('.close-btn');
            if (closeBtn) {
                closeBtn.click();
            }
        }
    });
}

/**
 * Trap focus within a container
 * @param {HTMLElement} container - Container to trap focus in
 * @param {KeyboardEvent} event - Keyboard event
 */
function trapFocus(container, event) {
    const focusableElements = getFocusableElements(container);
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
    } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
    }
}

// ============================================================================
// Keyboard Navigation
// ============================================================================

/**
 * Set up keyboard navigation enhancements
 */
function setupKeyboardNavigation() {
    // Global keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + S to export
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            if (typeof exportConfig === 'function') {
                exportConfig();
            }
        }

        // Ctrl/Cmd + O to import
        if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
            e.preventDefault();
            if (typeof importConfig === 'function') {
                importConfig();
            }
        }

        // Ctrl/Cmd + N to add new check
        if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
            e.preventDefault();
            if (typeof showAddCheckModal === 'function') {
                showAddCheckModal();
            }
        }
    });

    // Arrow key navigation for check list
    setupListKeyboardNavigation();
}

/**
 * Set up arrow key navigation for check list items
 */
function setupListKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        const checksList = document.getElementById('checksList');
        if (!checksList) return;

        const activeItem = document.activeElement;
        if (!activeItem?.classList.contains('check-item')) return;

        const items = Array.from(checksList.querySelectorAll('.check-item'));
        const currentIndex = items.indexOf(activeItem);

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                if (currentIndex < items.length - 1) {
                    items[currentIndex + 1].focus();
                }
                break;

            case 'ArrowUp':
                e.preventDefault();
                if (currentIndex > 0) {
                    items[currentIndex - 1].focus();
                }
                break;

            case 'Home':
                e.preventDefault();
                if (items.length > 0) {
                    items[0].focus();
                }
                break;

            case 'End':
                e.preventDefault();
                if (items.length > 0) {
                    items[items.length - 1].focus();
                }
                break;

            case 'Enter':
            case ' ':
                e.preventDefault();
                activeItem.click();
                break;

            case 'Delete':
            case 'Backspace':
                if (e.shiftKey) {
                    e.preventDefault();
                    const index = parseInt(activeItem.dataset.index);
                    if (!isNaN(index) && typeof deleteCheck === 'function') {
                        deleteCheck(index);
                    }
                }
                break;
        }
    });
}

// ============================================================================
// Skip Link
// ============================================================================

/**
 * Initialize skip link functionality
 */
function initSkipLink() {
    const skipLink = document.querySelector('.skip-link');
    if (skipLink) {
        skipLink.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(skipLink.getAttribute('href'));
            if (target) {
                moveFocus(target);
            }
        });
    }
}

// ============================================================================
// Settings UI
// ============================================================================

/**
 * Create accessibility settings panel HTML
 * @returns {string} HTML string
 */
function createAccessibilitySettingsHTML() {
    const checked = accessibilitySettings.enableAudibleAlerts ? 'checked' : '';

    return `
        <div class="settings-panel" role="group" aria-labelledby="accessibility-heading">
            <h3 id="accessibility-heading">Accessibility</h3>
            <div class="setting-item">
                <div class="setting-label">
                    <span id="audible-alerts-label">Enable Audible Alerts</span>
                    <small>Play a sound when errors occur</small>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox"
                           id="enableAudibleAlerts"
                           ${checked}
                           onchange="toggleAudibleAlerts(this.checked)"
                           aria-labelledby="audible-alerts-label">
                    <span class="toggle-slider" aria-hidden="true"></span>
                </label>
            </div>
        </div>
    `;
}

/**
 * Toggle audible alerts setting
 * @param {boolean} enabled - Whether alerts are enabled
 */
function toggleAudibleAlerts(enabled) {
    accessibilitySettings.enableAudibleAlerts = enabled;
    saveAccessibilitySettings();

    // Initialize audio context on first enable (requires user interaction)
    if (enabled) {
        initAudioContext();
    }

    announce(enabled ? 'Audible alerts enabled' : 'Audible alerts disabled');
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Add ARIA attributes to an element
 * @param {HTMLElement} element - Element to update
 * @param {Object} attrs - ARIA attributes
 */
function setAriaAttributes(element, attrs) {
    Object.entries(attrs).forEach(([key, value]) => {
        if (value === null || value === undefined) {
            element.removeAttribute(`aria-${key}`);
        } else {
            element.setAttribute(`aria-${key}`, value);
        }
    });
}

/**
 * Make an element a live region
 * @param {HTMLElement} element - Element to make live
 * @param {string} politeness - 'polite' or 'assertive'
 */
function makeLiveRegion(element, politeness = 'polite') {
    element.setAttribute('role', politeness === 'assertive' ? 'alert' : 'status');
    element.setAttribute('aria-live', politeness);
    element.setAttribute('aria-atomic', 'true');
}

/**
 * Create an accessible button
 * @param {Object} options - Button options
 * @returns {HTMLButtonElement}
 */
function createAccessibleButton(options) {
    const {
        text,
        ariaLabel,
        className = 'btn',
        type = 'button',
        disabled = false,
        onClick
    } = options;

    const button = document.createElement('button');
    button.type = type;
    button.className = className;
    button.textContent = text;
    button.disabled = disabled;

    if (ariaLabel) {
        button.setAttribute('aria-label', ariaLabel);
    }

    if (onClick) {
        button.addEventListener('click', onClick);
    }

    return button;
}

// ============================================================================
// Export for Global Access
// ============================================================================

window.accessibilitySettings = accessibilitySettings;
window.initAccessibility = initAccessibility;
window.playErrorSound = playErrorSound;
window.playSuccessSound = playSuccessSound;
window.playWarningSound = playWarningSound;
window.announce = announce;
window.announceError = announceError;
window.announceSuccess = announceSuccess;
window.announceWarning = announceWarning;
window.saveFocus = saveFocus;
window.restoreFocus = restoreFocus;
window.moveFocus = moveFocus;
window.getFocusableElements = getFocusableElements;
window.trapFocus = trapFocus;
window.createAccessibilitySettingsHTML = createAccessibilitySettingsHTML;
window.toggleAudibleAlerts = toggleAudibleAlerts;
window.setAriaAttributes = setAriaAttributes;
window.makeLiveRegion = makeLiveRegion;
window.createAccessibleButton = createAccessibleButton;
