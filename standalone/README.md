# One-file recruiter demo

Download **[AssetInspect-demo.zip](AssetInspect-demo.zip)**, extract it, and open **[AssetInspect.html](AssetInspect.html)** in a current desktop browser. The HTML contains all its CSS, JavaScript, icons, and synthetic-image generation. It requires no Python, installation, password, backend, API key, or Internet connection.

For a job application, attach the ZIP with a PDF portfolio/report and the GitHub source link. Some mail systems block HTML attachments or show only a document preview; ask the recipient to extract the ZIP and open the HTML in Chrome/Edge. A company's browser policy can also block local HTML files.

The **Demo guide** inside the application walks through asset creation, photograph upload or a generated example, rectangle annotations, submission, simulated reviewer change requests, resubmission, approval, and Print / Save PDF or CSV export. The account selector switches between the Inspector and Reviewer demonstrations. Browser-only role checks are not secure authentication; the Django version implements server-enforced access control.

Data is saved in the browser's IndexedDB when allowed. Moving the file or using another browser/profile can produce a new workspace. **Download shareable HTML** embeds the currently saved records/photos into another self-contained file, giving a recruiter an independent copy of your prepared example. Backups can also be exported/restored as JSON. Review the contents before sharing; use synthetic evidence and avoid confidential asset information.

If browser storage is blocked, the app displays a temporary-session warning and still allows downloading a portable copy. Approved and submitted inspections are read-only within the demonstrated workflow. This is an independent portfolio demonstration, not engineering certification or a shared multi-user system.

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

Reports use the browser's print-to-PDF rendering rather than the Django/ReportLab exporter. Shared-file data is independent, not live collaboration. Local history is editable by the browser owner and is not a tamper-proof audit record.

Suggested application note:

> Attached is a self-contained, interactive AssetInspect portfolio demo. Extract the ZIP and open AssetInspect.html in a desktop browser. No setup or login is required. The five-minute guide demonstrates visual inspection evidence, manual annotations, simulated independent review, and report export using clearly labelled synthetic data. The repository also includes the Django implementation with server-side permissions, tests, and PDF generation.
