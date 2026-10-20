AssetInspect - Offline Portfolio Demo
====================================

1. Extract this ZIP, then open AssetInspect.html in a current desktop Chrome,
   Edge, Firefox or Safari browser. Chrome/Edge is recommended for drawing.
2. No installation, login, Python, API key, hosting or Internet is required.
   Download the file first if a mail/document preview does not run it.

Try the workflow:
- Keep Inspector selected. Register an asset and create an inspection.
- Upload JPEG/PNG evidence or add a synthetic example / synthetic P&ID.
  Select photograph, P&ID, isometric, CAD screenshot or schematic as appropriate.
- Open the image. Choose Defect or Feature, then discipline (mechanical,
  structural, hydraulic), component and equipment tag. Draw a rectangle,
  record the visible observation and follow-up, and save.
- Edit assessment: supply preliminary condition, rationale, limitations,
  follow-up date and optional document/revision/clause with your own criteria.
- Open 3D / point-cloud lab. Rotate/zoom the synthetic pipe or import local
  XYZ/CSV, ASCII PLY or OBJ geometry. Declare coordinate units. Pick two vertices
  (or type their numbers), then save the coordinate distance to a draft inspection.
- Complete and SAVE inspector QA before submitting. Evidence edits clear QA.
- Switch to Reviewer. Request changes with a comment, or complete and SAVE
  reviewer QA before approval. Inspector can edit and resubmit requested changes.
- Analysis & worklist supplies filters, asset/component counts, CSV and an Excel
  SpreadsheetML XML workbook with Findings, Asset summary, QA and Measurements.
  The workbook is .xml, not .xlsx. Use CSV for Google Sheets interchange.
- Open an inspection report and use Print / Save PDF. Reports include saved
  tags, assessment, QA and model-coordinate measurements.

Sharing / keeping your example:
- Download shareable HTML embeds currently SAVED data and geometry in a new file.
  Give it to a recruiter; their copy is independent, with no live synchronization.
- Export backup / Restore backup moves saved data between browsers. Old version 1
  backups remain readable; absent QA is shown as unrecorded.
- Records persist in this browser's IndexedDB when allowed. Moving the file,
  another browser/profile, private mode or clearing storage can hide/remove them.
- If storage is blocked, a temporary-session warning appears. Export a backup
  or shareable HTML before closing. The original HTML does not rewrite itself.

What this adds for the supplied engineering inspection job description:
- Separate defect and mechanical/structural/hydraulic feature annotations.
- Equipment/drawing tags and raster P&ID/isometric/CAD evidence categories.
- Inspector/reviewer QA checklists, change requests and overlap review hints.
- Manual assessment basis, references, rationale, limitations and follow-up date.
- Searchable worklist, spreadsheet counts/exports and richer engineering reports.
- Local mesh/point-cloud viewing and declared-coordinate two-point measurements.

What is NOT implemented, and why:
- Photogrammetric reconstruction: requires suitable overlapping/calibrated images
  and a separate validated reconstruction/registration pipeline.
- Certified real-world metrology: source scale, registration, calibration and
  uncertainty need independent validation. Decimal display is not precision.
- Automatic API/NACE/ASCE/ASME compliance: selections are reference METADATA ONLY;
  exact documents/editions, client criteria and qualified interpretation are needed.
- Native AutoCAD/Navisworks/Recap formats or tools: no DWG/RVT/NWD/RCP/RCS reader,
  CAD editing or LAS/LAZ processing. Export supported geometry/images first.
  A viewer does not prove professional experience with Autodesk software.
- Industrial data volumes or live remote teamwork: a bounded local browser file
  has no distributed storage, secure identities or live multi-user service.
  Inspector/Reviewer switching and local history are explicit simulations.
- Direct Google Workspace integration: local CSV interchange is supplied instead.

Limits:
- Images: JPEG/PNG, 10 MB each, 8 per upload, 20 MP, 64-10,000 px per side.
  Re-encoding strips original metadata. No automatic defect detection is included.
- Geometry: text only, 8 MB, 20,000 vertices, 20,000 triangles. Unknown units allow
  viewing only. Textures and external resources are ignored. XYZ/CSV uses the first
  3 columns as x/y/z; optional x,y,z header. Binary PLY is unsupported.
- Workspace: up to 100 assets, 200 inspections, 100 images, 1,000 annotation
  records, 1,000 measurements, 5,000 events; browser quota may reduce these.
- Synthetic data is labelled. Measurements use supplied model coordinates only.
- A company browser policy may block local HTML. Browser policies are not changed.

Independent portfolio demonstration. Findings need appropriate engineering
verification. No structural-integrity certification, inspection-standard
compliance or company affiliation is claimed.

Source: https://github.com/hague143/operation-engineer
Branch: feature/assetinspect
Detailed role comparison: standalone/REQUIREMENTS.md in the repository.
