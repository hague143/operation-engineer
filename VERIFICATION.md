# Local verification

Verified in the prepared Linux cloud environment on 19 October 2026 using Python 3.12.14 and the pinned dependencies.

- Database migrations applied successfully; a repeat run had no pending migrations.
- `manage.py check`: no issues.
- `manage.py makemigrations --check --dry-run`: no schema drift.
- `manage.py test --verbosity 1`: **37 tests passed**, no skips.
- `pip check`: no broken requirements.
- Reusable installation commands exercised in the repository; the existing `.env`, database, and demo records were preserved.
- Chromium acceptance flow passed: create asset/inspection, upload a locally generated image, draw/save/reload a finding, touch redraw, submit, request changes, edit/resubmit, approve, download PDF and CSV.
- SVG rectangle geometry checked against the photograph at **1440, 768, and 390 px** viewport widths. Mobile dashboard/editor had no horizontal page overflow. No browser JavaScript errors were reported.
- Downloaded draft PDF checked for `DRAFT` and `NOT APPROVED`; approved PDF checked for the saved inspection reference, observations, retained change-request comment, approval, and disclaimer, without the draft warning.
- A generated PDF photograph page was rasterized and visually inspected: embedded fonts were legible, the finding rectangle and severity/reference label aligned with the synthetic indication, and wrapped observations/page numbers rendered correctly.
- Dashboard, login, annotation editor, approved workspace, and report-preview screenshots were captured. These and generated downloads live in ignored `test-results/`, not Git.

The browser script creates persistent `E2E-…` synthetic records in the local development database. Those are test/demo data, not real inspections. The Django suite uses isolated temporary database/media state.

## Vercel deployment fix — 20 October 2026

- Added explicit disposable Vercel demo configuration with a build-time synthetic template and instance-local writable runtime copy. Secrets remain required environment inputs; no fallback secret or real credentials were committed.
- The extended Django suite checks missing configuration, exact hosts, debug disabled, proxy HTTPS/CSRF login, secure signed-cookie sessions, snapshot/static creation, sample authenticated media/PDF/CSV, instance isolation, startup concurrency, and server/browser batch upload limits.
- `manage.py test --verbosity 1`: **47 tests passed**, no skips. Django checks and the migration-drift check also passed.
- Ran the published `@vercel/python` 26.0.1 native Django settings-discovery script against the new configuration, capturing its JSON internally without printing settings/secrets. WSGI entrypoint, static URL, debug, and secure cookies were discovered correctly.
- Executed `scripts/build_vercel.py` with locally configured test bindings. Migrations, synthetic seed, 131 collected static files, and checks succeeded. A before/after database hash confirmed the build did not modify the local development database.
- Re-ran the Chromium inspector/reviewer acceptance workflow successfully after the changes, including touch redraw, three viewport widths, and PDF/CSV downloads.
- Vercel account credentials are not available here. Hosted environment-variable entry and the actual redeployment remain user actions; this records local deployment-path verification, not a successful hosted Vercel build.

GitHub Actions is configured to run the Django checks/tests. This document records local verification; it does not claim a hosted Actions run, production deployment, other-browser verification, or restoration in a new cloud task.

## Standalone recruiter edition — 20 October 2026

- Built `standalone/AssetInspect.html` with embedded CSS/JavaScript/icons and locally generated synthetic example images. Packaged the HTML and `README.txt` into `standalone/AssetInspect-demo.zip`; no local database, secrets, user photographs, or runtime dependencies are in the download.
- `scripts/browser_standalone.py --virtual-origin` passed with Chromium network offline and no external HTTP requests or browser JavaScript errors. The complete asset → inspection → upload → annotation → submit → request changes → resubmit → approve workflow ran with persisted local history and locked states.
- Verified mouse, touch, and keyboard rectangles; saved alignment after reload at 1440/768/390 px; invalid upload rejection; multiple findings and confirmed deletion; explicit no-defect submission; CSV formula protection; and approved/unapproved printed PDFs.
- Opened an exported shareable HTML in a fresh recipient browser context and verified its saved photographs/findings. Backup/restore and the storage-disabled temporary-session warning also passed.
- Rasterized and visually inspected a generated report photograph page. Browser print output preserved the numbered severity rectangle, wrapped finding text, and reviewer history. Screenshots/PDF/CSV/shared test files live in ignored `test-results/standalone/`.
- The managed runner blocks direct `file://` navigation. Tests used the exact HTML bytes at an intercepted loopback origin with the network offline and no HTTP server. Browser policies were not changed; direct-file opening remains unverified in this managed runner. The download is self-contained for normal browser use, and corporate restrictions are documented in the standalone guide.
- Existing Django suite: **47 tests passed**. Deterministic standalone build checks also passed and are included in CI. Inspector/Reviewer roles in this offline edition are explicitly simulated, not secure authentication or a shared multi-user service.

## Job-aligned HTML tools — 20 October 2026

- Expanded the **standalone edition** with separate defect/feature records, mechanical/structural/hydraulic disciplines, component/equipment tags, raster drawing evidence types, and a generated P&ID-style component exercise.
- Added manual assessment criteria/reference metadata, rationale, limitations and follow-up dates. Inspector QA gates submission; reviewer QA gates approval. Inspection edits invalidate checks. Overlap hints require manual review. These remain local simulated roles, not authenticated independent sign-off.
- Added a filtered/paginated evidence worklist, asset/component/severity counts, source-image/normalized-rectangle CSV fields, and four-sheet Excel SpreadsheetML XML export. Workbook strings remain string cells; CSV formula-prefix protection is retained.
- Added dependency-free local geometry viewing/import (XYZ/CSV, ASCII PLY, OBJ), declared-unit two-point coordinate distances and saved measurement provenance/endpoints. There is no photograph reconstruction, native Autodesk reader, calibrated accuracy claim or code-compliance engine. The exact role comparison and remaining requirements are in `standalone/REQUIREMENTS.md` and the download's `README.txt`.
- `scripts/browser_job_tools.py` passed with exact generated HTML bytes and Chromium network offline: feature taxonomy/tags and blue rectangles; drawing evidence; assessment validation; inspector/reviewer QA gates and edit invalidation; features-only no-defect confirmation; reclassifying a feature to a defect; 3D rotation/zoom; known synthetic **2.0000 m** and imported **5.0000 mm** distances; PDF report contents; CSV/XML exports; geometry/measurements/QA in independent shareable HTML; old-backup migration; multi-page batch worklist; overlap hints; and invalid coordinate import without replacing the active model.
- `node scripts/check_geometry.cjs` passed: XYZ/CSV, ASCII PLY with reordered coordinate properties, OBJ negative indices/polygon triangulation, known synthetic distance, and nonfinite/missing/oversized/unsupported/binary/weighted-OBJ input rejection. This parser check now runs in CI alongside deterministic packaging.
- Re-ran the original `scripts/browser_standalone.py --virtual-origin` acceptance flow with the required QA steps. It retained uploads, mouse/touch/keyboard rectangle editing, reload/resize alignment, locked review/change/resubmit/approval, PDF/CSV, portable HTML, backups and storage-disabled fallback.
- The new browser acceptance reported **no unexpected HTTP requests or JavaScript errors**. Desktop/mobile geometry and analysis/editor screenshots were inspected. A printed assessment/QA report page was rasterized and visually checked for readable labels, rationale, limitations, due date and checklist text.
- Django regression suite: **47 tests passed**. Generated HTML/ZIP consistency and whitespace checks passed. Browser/PDF fixtures remain in ignored `test-results/standalone/`, outside the download.
- Managed Chromium still blocks direct `file://` navigation. Both browser flows used intercepted loopback document bytes with network offline, without a server or browser-policy changes. This verifies the embedded offline application, not unrestricted direct-file support in this runner or every browser.
