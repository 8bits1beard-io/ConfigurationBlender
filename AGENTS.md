# Repository Guidelines

## Project Structure & Module Organization
- `Builder/` hosts the web-based configuration builder (`ConfigurationBlender.html`, `css/`, `js/`).
- `Configurations/ROLE/` holds role-specific `Config.json` and `Assets/` (icons, scripts, drivers, XML). Role folders are created by tooling and are generally not committed.
- `ProactiveRemediation/` contains the detection and remediation engines (`Detect.ps1`, `Remediate.ps1`).
- `Packaging/` includes install/detect templates used to build Intune Win32 apps.
- `Tools/` provides PowerShell utilities for role creation and packaging.

## Build, Test, and Development Commands
- `powershell.exe -ExecutionPolicy Bypass -File .\Tools\New-ConfigurationRole.ps1 -Role "US_CBL"` creates a new role folder and opens the builder.
- `powershell.exe -ExecutionPolicy Bypass -File .\Tools\New-IntunePackage.ps1` packages an `.intunewin` file (interactive role picker).
- `powershell.exe -ExecutionPolicy Bypass -File .\Tools\New-IntunePackage.ps1 -Role "US_CBL" -WhatIf` previews packaging steps.
- Open `Builder/ConfigurationBlender.html` in a browser to edit configurations; there is no build step.

## Coding Style & Naming Conventions
- PowerShell scripts follow Verb-Noun naming (e.g., `New-IntunePackage.ps1`) and use PascalCase functions; match existing 4-space indentation.
- Role names should be uppercase with an underscore (recommended `XX_YYY`, e.g., `US_CBL`).
- `Config.json` must include `role` and `version` and should match the folder name.

## Testing Guidelines
- There is no automated test harness; validate by running the engine scripts locally.
- Local test flow:
  - `Copy-Item Configurations\US_CBL\Config.json C:\ProgramData\ConfigurationBlender\` and copy `Assets/`.
  - Run `ProactiveRemediation\Detect.ps1`, then `ProactiveRemediation\Remediate.ps1` if needed.
- Some checks require SYSTEM; use PsExec as documented in `DOCUMENTATION.md`.

## Commit & Pull Request Guidelines
- Recent commit messages are short, sentence-case imperatives (e.g., “Improve Intune package output structure”). Keep them concise and action-oriented.
- PRs should describe the role/feature change, list updated scripts or configurations, and include packaging/testing notes (e.g., role name, version bump, and whether `New-IntunePackage.ps1` was run).

## Configuration & Deployment Notes
- `IntuneWinAppUtil.exe` is required for packaging and is not committed; download it into `Tools/` before running the packaging script.
- Generated output lands in `IntunePackages/ROLE/` and is typically gitignored.
