# One-file recruiter demo

Download **[AssetInspect-demo.zip](AssetInspect-demo.zip)**, extract it, and open **[AssetInspect.html](AssetInspect.html)** in a current desktop browser. The HTML contains all its CSS, JavaScript, icons, and synthetic-image generation. It requires no Python, installation, password, backend, API key, or Internet connection.

For a job application, attach the ZIP with a PDF portfolio/report and the GitHub source link. Some mail systems block HTML attachments or show only a document preview; ask the recipient to extract the ZIP and open the HTML in Chrome/Edge. A company's browser policy can also block local HTML files.

The **Demo guide** inside the application walks through asset creation, photograph upload or a generated example, rectangle annotations, submission, simulated reviewer change requests, resubmission, approval, and Print / Save PDF or CSV export. Complete and **Save inspector QA** before submission, and **Save reviewer QA** before approval. Inspection edits clear prior checks. The account selector switches between the Inspector and Reviewer demonstrations. Browser-only role checks are not secure authentication; the Django version implements server-enforced access control.

Data is saved in the browser's IndexedDB when allowed. Moving the file or using another browser/profile can produce a new workspace. **Download shareable HTML** embeds the currently saved records/photos into another self-contained file, giving a recruiter an independent copy of your prepared example. Backups can also be exported/restored as JSON. Review the contents before sharing; use synthetic evidence and avoid confidential asset information.

If browser storage is blocked, the app displays a temporary-session warning and still allows downloading a portable copy. Approved and submitted inspections are read-only within the demonstrated workflow. This is an independent portfolio demonstration, not engineering certification or a shared multi-user system.

## Engineering role additions

The supplied Abyss Solutions role is compared honestly against this edition in [REQUIREMENTS.md](REQUIREMENTS.md). Newly added tools include:

- Separate **defect / feature** annotations, mechanical/structural/hydraulic discipline, component labels and equipment/drawing tags.
- Raster P&ID/isometric/CAD-screenshot evidence categories and a synthetic P&ID-style component exercise.
- Manual inspector/reviewer QA gates, overlapping-annotation hints and automatic QA invalidation after inspection edits.
- User-supplied assessment criteria, reference/revision/clause, preliminary action, rationale, limitations and due date. API/NACE/ASCE/ASME names are reference metadata, with no code-compliance engine.
- Filtered/paginated worklist, asset/component/severity summaries, CSV and four-sheet Excel SpreadsheetML XML export (`.xml`, not `.xlsx`). Findings/Asset summary use worklist filters; QA/Measurements include role-visible inspections. CSV supports Google Sheets interchange.
- A dependency-free 3D mesh / point-cloud viewer, local XYZ/CSV, ASCII PLY and OBJ import, declared-unit two-point coordinate measurements, and inclusion in inspection reports, backups and portable HTML.

The lab measures supplied geometry; it does **not** reconstruct photogrammetry, prove real-world accuracy, run Autodesk software, or apply industry codes. It supports local text geometry up to 8 MB / 20,000 vertices / 20,000 triangles. Unknown units permit viewing only. Native DWG/RVT/NWD/RCP/RCS/LAS/LAZ formats and industrial-scale processing require separate tools. Workspace limits are 100 assets, 200 inspections, 100 images, 1,000 annotations, 1,000 measurements and 5,000 events, subject to browser storage quota. See the comparison for the reasons and suggested next steps.

The embedded synthetic pipe gives a 2 m coordinate distance between vertices 0 and 160. For a small point-cloud exercise, import an XYZ text file containing `0 0 0`, `3 4 0`, `0 0 2` on separate lines and declare its units; vertices 0 and 1 are five model units apart.

## Maintaining the download

The maintainable source lives in `standalone/src/`. The builder also embeds the Django app's local stylesheet, icon symbols, and brand mark, keeping the portfolio editions visually consistent. After editing source:

```bash
python scripts/build_standalone.py
python scripts/build_standalone.py --check
```

Commit both regenerated downloads alongside the source. The ZIP includes only `AssetInspect.html` and beginner-friendly `README.txt`; no development dependencies or local user data are packaged. ZIP output is deterministic, so CI can check for stale downloads.

## Browser acceptance test

Install `requirements-dev.txt` and a Playwright Chromium browser, then run:

```bash
python scripts/browser_standalone.py
```

To use a system Chromium, set `CHROMIUM_EXECUTABLE` to its path. This test runs with the browser network offline and uses isolated browser storage, not the Django database. It exercises uploads, mouse/touch/keyboard annotation, reload/resizing, review locks, mandatory comments, resubmission, PDF/CSV, a downloaded shareable file in an independent recipient context, backup/restore, and storage-disabled fallback.

The provided cloud runner's managed Chromium blocks `file://` navigation. For this runner only, use:

```bash
CHROMIUM_EXECUTABLE=/usr/bin/chromium .venv/bin/python scripts/browser_standalone.py --virtual-origin
```

This serves the exact file bytes through Playwright interception at a loopback origin while the browser network is offline. No HTTP server or external service runs. It verifies the embedded application and independent portable copies, while direct `file://` opening remains unverified in that managed browser. No browser security policy is modified.

The added role-specific browser acceptance script uses the same offline interception technique:

```bash
node scripts/check_geometry.cjs
CHROMIUM_EXECUTABLE=/usr/bin/chromium .venv/bin/python scripts/browser_job_tools.py
```

It verifies feature taxonomy/tags, drawing evidence, assessment validation, QA gates/invalidation, model import/known distances, report and spreadsheet contents, independent shareable geometry/measurements and legacy backup compatibility. Parser checks cover ASCII PLY property order, OBJ negative indices and triangulation, and invalid, binary, unsupported and oversized geometry.

Reports use the browser's print-to-PDF rendering rather than the Django/ReportLab exporter. Shared-file data is independent, not live collaboration. Local history is editable by the browser owner and is not a tamper-proof audit record.

Suggested application note:

> Attached is a self-contained, interactive AssetInspect portfolio demo. Extract the ZIP and open AssetInspect.html in a desktop browser. No setup or login is required. The five-minute guide demonstrates visual inspection evidence, manual annotations, simulated independent review, and report export using clearly labelled synthetic data. The repository also includes the Django implementation with server-side permissions, tests, and PDF generation.
