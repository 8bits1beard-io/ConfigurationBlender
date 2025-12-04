# Configuration Blender

**Devices drift. We can't see it. We can't fix it automatically. This changes that.**

Today, workstations are managed through a mix of LGPO, GPO, Intune policies, and SCCM baselines. None of these tell us when a device has drifted from its intended configuration. When autologon breaks, a printer disappears, a shortcut goes missing, or a certificate expires, we find out through an incident. Technicians spend hours manually fixing problems that could be detected and corrected automatically.

Configuration Blender adds a detection and self-healing layer that runs alongside existing tools. Role-owning teams define what their devices should look like. Windows Engineering deploys it. Devices fix themselves.

---

| Responsibility | Owner | Notes |
|----------------|-------|-------|
| Define and maintain configuration | Role-owning team | |
| Change control and approval | Role-owning team | |
| Packaging and deployment | Windows Engineering | Can be automated via workflows |
| Detection and remediation engine | Windows Engineering | Configure once, runs on schedule |

---

**How it works:**

1. Role team runs `git pull` to get the latest version of the tool
2. Role team runs `.\Tools\New-ConfigurationRole.ps1` to create folder structure and open the web-based editor
3. Role team adds checks, exports Config.json and Summary, places both in the role folder
4. Role team runs `.\Tools\New-IntunePackage.ps1` to create a deployable Intune app
5. Upload app to Intune using supplied install settings
6. Assign a group to the app (or to uninstall if removing a role)
7. Intune pushes the configuration file and assets to the workstation
8. Proactive Remediation reads the configuration and enforces it on schedule

---

**What this tool does:**
- Detects configuration drift that existing tools don't monitor
- Automatically corrects drift when possible
- Reduces incidents for autologon, printers, shortcuts, certificates, scheduled tasks, and more
- Gives role teams ownership of their configurations

**What this tool does not do:**
- Replace Intune policies, SCCM baselines, LGPO, or GPO
- Manage configurations outside its defined checks

---

For technical implementation details, see [DOCUMENTATION.md](DOCUMENTATION.md).

---

**Developed by:** Joshua Walderbach, Windows Engineering
