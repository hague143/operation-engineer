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
