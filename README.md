# AssetInspect — Visual Infrastructure Inspection

An independent portfolio application for organizing infrastructure photographs, manually annotating visible conditions, and reviewing inspection findings. Built with Python, Django templates, vanilla JavaScript, SQLite, Pillow, and ReportLab. Everything runs locally; no API keys, paid services, cloud storage, or runtime CDNs are needed.

**Workflow:** Register asset → Create inspection → Upload photographs → Draw findings → Submit → Request changes or approve → Export PDF and CSV.

This is a demonstration tool, not a certified engineering assessment system. It has no company affiliation and makes no claim of compliance with inspection standards.

## What works

- Responsive navy/teal dashboard with database-backed metrics and finding breakdowns.
- Shared asset register, inspection search/status filters, photograph galleries, review queue, and report previews.
- Django login and Inspector/Reviewer groups. Inspectors can edit only their own Draft/Changes Requested inspections. Reviewers can read submitted, changes-requested, and approved records. A reviewer cannot decide their own inspection, even with both roles.
- Multi-file upload, content validation, generated storage names, EXIF orientation correction, and metadata removal. Images are served only through permission-checked authenticated routes.
- Mouse, touch, and keyboard-accessible rectangle entry; multiple findings; saved selection, text edits, redraw, deletion confirmation, and unsaved-change warnings. Coordinates are normalized to the image.
- Locked Submitted/Approved evidence, mandatory change-request explanations, version-checked decisions, resubmission, and an append-only application audit history.
- PDFs with annotated images, numbered finding references, wrapped observations, review history, page numbers, and an explicit unapproved warning. CSV text is protected against spreadsheet formulas.
- An explicit, idempotent local demo command with clearly synthetic schematic images, 3 assets, 6 inspections across all statuses, findings, and review history.

## Requirements

Use **Python 3.12** (tested on 3.12.14) and Git. Exact tested dependency versions are in `requirements.txt`: Django 5.2.18 (LTS), Pillow 12.3.0, ReportLab 4.5.1, and python-dotenv 1.2.4, plus pinned transitive dependencies. SQLite ships with Python. The browser suite is optional and uses the separately pinned `requirements-dev.txt`.

## Windows PowerShell setup

From the directory containing your projects:

```powershell
git clone https://github.com/hague143/operation-engineer.git
Set-Location operation-engineer
# Until merged to main, select the implementation branch:
git switch feature/assetinspect
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe scripts\init_local.py
.\.venv\Scripts\python.exe manage.py migrate
.\.venv\Scripts\python.exe manage.py seed_demo --create-demo-users
.\.venv\Scripts\python.exe manage.py changepassword demo.inspector
.\.venv\Scripts\python.exe manage.py changepassword demo.reviewer
.\.venv\Scripts\python.exe manage.py runserver
```

Use distinct passwords at the prompts. Calling the virtual environment's Python directly avoids PowerShell execution-policy changes and does not require activation. Open `http://127.0.0.1:8000` in your browser. This address is for your own local machine.

## macOS / Linux setup

```bash
git clone https://github.com/hague143/operation-engineer.git
cd operation-engineer
git switch feature/assetinspect
python3.12 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python scripts/init_local.py
.venv/bin/python manage.py migrate
.venv/bin/python manage.py seed_demo --create-demo-users
.venv/bin/python manage.py changepassword demo.inspector
.venv/bin/python manage.py changepassword demo.reviewer
.venv/bin/python manage.py runserver
```

Open `http://127.0.0.1:8000`. If Python 3.12 is already your default, `python3` can replace `python3.12`. On Debian/Ubuntu, install the matching `python3.12-venv` system package if virtual environment creation is unavailable.

On the prepared cloud machine, the checkout is `/workspace/operation-engineer`, dependencies are in `.venv`, migrations have run, and local demo data exists. Use that checkout directly; each cloud task is already isolated. Live development servers must be restarted in a new task.

## Configuration and accounts

`scripts/init_local.py` creates an ignored `.env` containing a fresh secret, local hostnames, and `DJANGO_DEBUG=True`. It never overwrites an existing file. `.env.example` documents the supported names. You can instead copy that file to `.env`, replace the secret placeholder, and configure values manually. Real environment variables take precedence over `.env`.

`seed_demo --create-demo-users` is an **explicit local-development step**. It creates `demo.inspector` and `demo.reviewer`. Without configured demo passwords these accounts have unusable passwords until you run the two `changepassword` commands above. Alternatively, supply distinct, locally configured `DEMO_INSPECTOR_PASSWORD` and `DEMO_REVIEWER_PASSWORD` values (at least 12 characters) before the first seed run. Never commit passwords or paste them into chat. Re-running the seed command preserves existing records, edits, and passwords; it does not reset an account. `seed_demo` without the flag requires the accounts to exist already.

For your own users and group assignments:

```bash
.venv/bin/python manage.py createsuperuser
```

Then sign in to `/admin/`, create users, and assign Inspector or Reviewer groups. Groups are created by migrations. Admin can manage users and new assets; saved evidence, inspection states, and audit events are read-only in Admin so decisions go through the application workflow. Use an Inspector account for ordinary inspection work.

Assets are shared metadata within the workspace. Their details are locked if any associated inspection is Submitted or Approved, preserving report content. Inspectors see their own inspections; reviewers see all non-draft inspections. An account without a role cannot access the application workspace.

## Photographs and annotations

- Actual JPEG/PNG content only, at most **10 MB per input file**, **8 images per batch**, **20 megapixels**, and **10,000 pixels per side**; minimum dimensions are **64×64**. Animated images are rejected.
- Pillow verifies the content, decodes it, normalizes EXIF orientation, removes metadata, and saves a fresh JPEG under a generated UUID name. Original filenames are retained only as escaped metadata.
- `media/` is private. Do not expose it directly through a web server. Images are retrieved through `/photos/<id>/image/`, which checks the same object access rules as the inspection.
- Open a photograph, drag around a visible indication, complete the category/severity/observation/follow-up fields, and save. Select a finding from **Saved findings** to edit or redraw it. **+ New** starts another finding. The expandable coordinate inputs provide a keyboard alternative (X/Y/width/height in the range 0–1).
- Finding references are unique within the inspection and never reused after deletion. Positions survive reload and responsive resizing; these are image fractions, not measurements of the real asset.
- At least one photograph is required to submit. With zero findings, explicitly confirm **“No visible defects observed in the supplied photographs.”** This statement concerns only the supplied photographs.

## Checks and automated tests

Run from the repository root (on Windows replace `.venv/bin/python` with `.\.venv\Scripts\python.exe`):

```bash
.venv/bin/python manage.py check
.venv/bin/python manage.py makemigrations --check --dry-run
.venv/bin/python manage.py test --verbosity 2
```

The test suite covers authentication, roles, ownership, authenticated media/exports, CSRF, upload limits/content/orientation, coordinate validation, annotation create/read/edit/delete, unique references, stale edits/decisions, submission locks, self-approval prevention, mandatory review comments, explicit no-defect inspections, resubmission/history, dashboard counts, PDF/CSV output, escaping, audit immutability, and demo idempotence. Tests use an isolated temporary database and media directory. GitHub Actions runs migrations, migration-drift checks, Django checks, and this suite with Python 3.12.

### Optional real-browser acceptance test

This creates persistent `E2E-…` synthetic assets/inspections in the local database. Use a disposable development database, never production. Install the browser dependencies:

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m playwright install chromium
```

Set `DEMO_INSPECTOR_PASSWORD` and `DEMO_REVIEWER_PASSWORD` in the ignored local `.env` to match the demo accounts' current passwords. Start the server in another terminal, then:

```bash
.venv/bin/python scripts/browser_smoke.py
```

If using an existing Chromium executable, set `CHROMIUM_EXECUTABLE` to its path. On the prepared Linux machine:

```bash
CHROMIUM_EXECUTABLE=/usr/bin/chromium .venv/bin/python scripts/browser_smoke.py
```

The script logs in through the real UI, creates an asset/inspection, uploads a synthetic image, draws and saves a rectangle, checks alignment at 1440/768/390 px, redraws using touch input, requests changes, resubmits, approves, and downloads/asserts PDF and CSV content. Screenshots and downloads go to ignored `test-results/`. It checks for JavaScript errors and horizontal page overflow. `ASSETINSPECT_TEST_URL` can override the local test address.

## Five-minute interview demonstration

1. **0:00–0:45 — Orient.** Sign in as `demo.inspector`. Explain that the dashboard totals come from saved records and all demo photographs are locally generated schematics.
2. **0:45–1:30 — Organize.** Open the asset register, inspect a history, and create a new inspection for an asset. Give it a unique reference and a specific visual scope.
3. **1:30–2:30 — Observe.** Upload a synthetic JPEG/PNG, draw a rectangle, choose a category and preliminary severity, and record an observation and engineering follow-up. Save, reload, and resize the browser. Show that the rectangle remains aligned.
4. **2:30–3:45 — Review.** Submit. Show the editing lock. Sign out, sign in as `demo.reviewer`, open the queue, and request changes with a comment. As inspector, update and resubmit. As reviewer, approve. Point out retained comments and that inspectors cannot approve their own work.
5. **3:45–5:00 — Communicate.** Preview/download the PDF and CSV. Show numbered rectangles, saved observations, review history, and the disclaimer. Contrast the approved report with the prominent warning on a draft report. Describe the automated permission and workflow tests.

For a shorter demonstration, use the pre-seeded Changes Requested and Submitted inspections instead of creating the full sequence.

## Architecture and folders

```text
assetinspect/                  Django settings, root URLs, WSGI
inspections/
  models.py                    Assets, inspections, photographs, annotations, audit events
  permissions.py               Shared role/object permission rules
  forms.py                     Forms and validated multi-image processing
  workflow.py                  Transactional, version-checked submit/review transitions
  views.py, urls.py            Authenticated, server-rendered interfaces/endpoints
  exports.py                   Annotated Pillow images, ReportLab PDF, safe CSV
  admin.py                     Administrative users/assets and read-only evidence
  migrations/                  Schema and role creation
  management/commands/         Idempotent synthetic demo seed
  templates/inspections/       Dedicated inspector/reviewer interfaces
  static/inspections/          Locally served CSS, SVG, and vanilla JavaScript
  tests/                       Django integration/security tests
scripts/                       Safe local initialization and optional browser smoke test
.github/workflows/tests.yml    CI checks and tests
```

Requests authenticate through Django sessions, then filter inspections by role and ownership before fetching related photographs/findings. Mutations also check editability on the server. Submit/review transitions run in transactions and compare a version counter before committing, preventing stale or duplicate decisions. An append-only audit event is written with each relevant change. Finding coordinates are fractions of the normalized image; JavaScript maps them onto an SVG overlay and Pillow maps them onto report pixels. Reports are generated on demand from saved records, never from unsaved form fields. See [ARCHITECTURE.md](ARCHITECTURE.md) for invariants and tradeoffs.

## Production boundary and limitations

This is a working **local portfolio application**, not a production deployment or certified assessment product.

- For production: use a unique managed `DJANGO_SECRET_KEY`, `DJANGO_DEBUG=False`, explicit `DJANGO_ALLOWED_HOSTS`, HTTPS, a production WSGI server, private media serving, static collection/hosting, backups, upload quotas, authentication rate limiting, monitoring, and a production database. With debug disabled, secure session/CSRF cookies require HTTPS. `manage.py runserver` is for local development only.
- SQLite is appropriate for this local workflow. Version checks reject stale decisions, but heavy simultaneous writes may encounter SQLite locks. A production deployment needs PostgreSQL and concurrency/load validation.
- The audit trail is append-only through application workflows and read-only in Admin. It is not a cryptographically sealed or externally tamper-proof record against database operators.
- No public media, sharing links, email notifications, password-reset mailer, organizational tenancy, automated defect detection, geometry calibration, or physical measurements are implemented. Do not infer wall thickness, crack depth, real dimensions, structural safety, or code compliance from these photographs.
- Photographs are normalized to JPEG, so original EXIF/alpha and lossless PNG fidelity are not retained. There is no original-file archive.
- Large galleries are not paginated; very large reports are generated synchronously. PDF body fonts cover Western text best; additional font/language support may be needed for other writing systems.
- Automated tests focus on the local workflow; production hosting, throughput, external accessibility audits, and other browsers are outside the verified scope.

Future work could add pagination, background report jobs, point-cloud viewing with calibrated geometry, organization boundaries, and clearly separated **engineer-verified AI suggestions** with evidence provenance and human review.

## Portfolio description

> AssetInspect is an independent Django portfolio project for visual infrastructure inspection workflows. I implemented authenticated asset and inspection management, validated photograph processing, persistent normalized rectangle annotations, role-based independent review, transactional status transitions, and an application audit trail. The application generates annotated PDF reports and formula-protected CSV exports, and includes synthetic demo data, integration tests, browser workflow validation, and CI. All observations are human-recorded and preliminary; the project does not certify structural integrity or compliance with engineering standards.

## GitHub

The implementation uses `feature/assetinspect`. No existing history was reset or force-pushed. If pushing is unavailable in your environment:

```bash
git remote -v
# Only if no origin exists:
git remote add origin https://github.com/hague143/operation-engineer.git
git switch feature/assetinspect
git add .
git commit -m "Build AssetInspect visual infrastructure inspection application"
git push -u origin feature/assetinspect
```

Review the staged file list before committing; `.env`, virtual environments, SQLite databases, private media, and generated reports are ignored.
