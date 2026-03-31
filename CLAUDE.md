# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sewera Price Intelligence — a zero-build single-page application for price monitoring and scraping control. Uses plain HTML/CSS/JavaScript with Google Drive API for file storage and SheetJS for Excel parsing.

## Development

```bash
# Run local dev server
python3 -m http.server 8000
# Open http://localhost:8000/index.html
```

No build step, no package manager, no linting, no automated tests. Manual QA only.

## Architecture

### Script Load Order (Critical)

Scripts in `index.html` must load in this exact order — each depends on the previous:

```
drive.js → parser.js → cache.js → charts.js → nav.js → scraping.js → analysis.js
```

All code uses global functions on `window` (no ES modules).

### Key Files

- **js/drive.js** — Google Drive API wrapper (OAuth2, upload, download, list). Exports `FOLDERS` constant with 10 folder IDs.
- **js/parser.js** — XLSX parsing & analysis engine. Contains `BRANCH_CONFIG` defining Sewera vs Dobromir differences. Handles Polish number format (comma decimals), outlier filtering, segment analysis.
- **js/cache.js** — IndexedDB-based analysis cache. Stores `analyzeFile()` results (~2KB each) to avoid re-downloading/parsing XLSX files. Background preloads all files on page open. Falls back to in-memory cache if IndexedDB unavailable.
- **js/charts.js** — Chart.js wrappers with canvas instance tracking. Charts must be destroyed before recreating (tracked in `chartInstances`).
- **js/nav.js** — Page/branch routing via CSS class switching on `<body>`. Generates favicon.
- **js/scraping.js** — Drag-and-drop upload UI, day picker, file validation.
- **js/analysis.js** — File picker, single-file dashboard (KPIs + charts + tables), multi-file trend view.
- **lib/xlsx.full.min.js** — Vendored SheetJS library.

### CSS Theming

Page switching works entirely through CSS variables — no JS color manipulation:
- `body.page-scraping` → green accent (#c8f060)
- `body.page-sewera` → blue accent (#60a0f0)
- `body.page-dobromir` → orange accent (#f0a040)

All interactive elements reference `var(--accent)`.

### Branch Configuration

Analysis is branch-agnostic. Sewera and Dobromir differ only in config (`parser.js:BRANCH_CONFIG`): column names, competitor lists, folder IDs, and accent colors.

### Google Drive Folders

10 folder IDs configured in `js/drive.js`:
- `scraping/input` — immediate uploads
- `scraping/{monday..sunday}` — scheduled uploads
- `analysis/sewera` and `analysis/dobromir` — output files

### Deployment Requirements

1. Set OAuth client ID in `<meta name="google-client-id">` (index.html)
2. Set all 10 folder IDs in `js/drive.js`
3. Serve over HTTPS (required by Google OAuth)

## Specification

`BUILD_PLAN.md` is the source of truth — contains full project spec, task breakdowns, and test cases.
