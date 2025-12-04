# Configuration Blender

**Self-Healing Configuration Management for Windows Endpoints**

---

## Executive Summary

Configuration Blender enables **role-owning teams to fully own their workstation configurations** without requiring PowerShell expertise or direct access to deployment infrastructure.

| Responsibility | Owner |
|----------------|-------|
| Configuration definition & changes | Role-owning teams |
| Change control & approval process | Role-owning teams |
| CI/CD pipeline & Intune deployment | Windows Engineering |
| Detection & remediation engine | Windows Engineering |

---

## Problem Statement

- **No drift detection** — Devices are managed through a mix of LGPO, GPO, Intune policies, and SCCM baselines, but we have no way to identify when configurations drift from desired state or correct it automatically
- **Unclear ownership** — Windows Engineering maintains role configurations but often cannot identify the role owner, and there is no regular review process to ensure configurations reflect current business requirements
- **Manual remediation** — Technicians spend hours troubleshooting and reconfiguring devices for issues like broken autologon, missing printers, missing shortcuts, expired certificates, and similar problems
- **Slow time-to-fix** — Without a CI/CD pipeline, configuration changes require manual intervention and have unpredictable deployment timelines

---

## Solution

Configuration Blender separates **what** (configuration definition) from **how** (deployment and enforcement):

1. **Role teams** define desired state using a visual builder — no scripting required
2. **Windows Engineering** packages and deploys configurations via Intune
3. **Proactive Remediation** automatically detects drift and self-heals on schedule

```
Role Team                    Windows Engineering              Endpoints
───────────                  ───────────────────              ─────────
Config.json  ──────────────► Intune Win32 App ──────────────► Deploy
                             Proactive Remediation ─────────► Detect & Fix
```

---

## Key Capabilities

| Capability | Description |
|------------|-------------|
| Visual Configuration Builder | Browser-based UI for defining configurations without code |
| 16 Check Types | Applications, registry, shortcuts, printers, drivers, scheduled tasks, kiosk mode, firewall rules, certificates, and more |
| Self-Healing | Automatic remediation when drift is detected |
| Role-Agnostic Engine | Single Proactive Remediation policy supports all roles |
| Audit Logging | JSON logs for compliance and troubleshooting |
| Dependency Validation | Builder warns when checks require prerequisites |

---

## Ownership Model

### Role-Owning Teams
- Define and maintain `Config.json` for their role
- Add/modify checks as business requirements change
- Follow their own change control process for configuration updates
- Own the `Configurations/[ROLE]/` folder and its contents

### Windows Engineering
- Maintains the Configuration Blender engine (`Engine/Detect.ps1`, `Engine/Remediate.ps1`)
- Manages the Intune deployment pipeline
- Packages role configurations into Win32 apps
- Operates the Proactive Remediation policy

---

## Repository Structure

```
ConfigurationBlender/
├── Builder/                    # Visual configuration builder (HTML/JS)
├── Configurations/             # Role-specific configurations
│   └── [ROLE]/
│       ├── Config.json         # Role configuration (owned by role team)
│       └── Assets/             # Icons, drivers, scripts for this role
├── Engine/                     # Detection and remediation scripts
├── Packaging/                  # Intune Win32 app scripts
└── Tools/                      # Packaging and setup utilities
```

---

## Workflow

1. **Role team** opens the Builder and defines/modifies their configuration
2. **Role team** exports `Config.json` and commits to their role folder
3. **Role team** submits change request per their change control process
4. **Windows Engineering** packages the configuration and deploys via Intune
5. **Proactive Remediation** enforces the configuration on all assigned devices

---

## What This Tool Is (and Isn't)

Configuration Blender **does not replace** Intune policies, SCCM baselines, LGPO, or GPO. Those tools remain the primary methods for device management.

Configuration Blender **complements** existing tools by:
- Detecting known configuration drift that existing tools don't monitor
- Automatically correcting drift when possible
- Providing a clear ownership model for role-specific configurations
- Reducing incident volume for common issues (autologon, printers, shortcuts, certificates, etc.)

---

## Technical Notes

- Runs as `NT AUTHORITY\SYSTEM` — use `HKLM:\` for registry, `C:\Users\Public\` for shared files
- One configuration per device — role assignment determines which config is deployed
- Logs written to `C:\ProgramData\ConfigurationBlender\Logs\`
- See [DOCUMENTATION.md](DOCUMENTATION.md) for technical implementation details

---

**Developed by:** Joshua Walderbach, Windows Engineering
