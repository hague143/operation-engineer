AssetInspect - Offline Portfolio Demo
====================================

1. Extract this ZIP first.
2. Double-click AssetInspect.html and open it in a current Chrome, Edge,
   Firefox, or Safari browser. A desktop/laptop gives the best drawing experience.
3. No installation, passwords, Python, API keys, hosting, or Internet connection
   is required. If a mail/document preview does not run it, download the file
   and open it directly in your browser instead.

Try this five-minute workflow:
- Keep Inspector selected in the account menu.
- Register an asset, create an inspection, and add a photograph.
  You can use "Add synthetic example" instead of a real photograph.
- Open the photograph, draw a rectangle, fill in a visible observation and
  recommended follow-up, then save. Reload/resize to check alignment.
- Submit the inspection. Editing becomes locked.
- Switch to Reviewer using the account menu. Open the review queue and request
  changes with a comment.
- Switch back to Inspector, edit the finding, and resubmit.
- As Reviewer, approve. Open the report, then Print / Save PDF or export CSV.

Sharing your own prepared example:
- Click "Download shareable HTML". It creates another single HTML file containing
  your currently saved records and photographs.
- Attach that downloaded file or ZIP it for a recruiter. The recipient gets
  their own independent demo copy. Review the contents before sharing.
- "Export backup" and "Restore backup" transfer saved data between browsers.

Storage and scope:
- Data is stored locally using IndexedDB, in this browser/profile/file context.
  Moving the file, private browsing, clearing browser data, or storage policies
  can hide/remove it. Use a backup/shareable HTML to move your saved example.
- If local browser storage is blocked, an explicit temporary-session warning is
  displayed. Saving/downloading a portable copy still works in that session.
- Inspector/Reviewer switching demonstrates the workflow; it is not secure
  authentication or a shared multi-user server. The separate Django application
  in the repository implements the server-side permission and audit controls.
- Reports use the browser's Print / Save as PDF feature. Choose Save as PDF and
  turn off browser headers/footers if desired. CSV and backup downloads are local.
- JPEG/PNG uploads: at most 10 MB each, 8 files per batch, 20 megapixels,
  64 px minimum and 10,000 px maximum per side. Large collections can exhaust
  browser storage. Original metadata is stripped by re-encoding to JPEG.
- Synthetic demo photographs/findings are clearly labelled. Uploaded observations
  are human-entered; there is no automated defect detection or physical measurement.
- The demo makes no company affiliation or inspection-standard compliance claim.

Independent portfolio demonstration. Findings are based on supplied visual
evidence and require appropriate engineering verification. This report does not
certify structural integrity or compliance with inspection standards.

Source project: https://github.com/hague143/operation-engineer
Implementation branch: feature/assetinspect
