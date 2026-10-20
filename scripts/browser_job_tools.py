"""Offline acceptance of the job-aligned HTML tools, using exact packaged bytes.

The managed browser blocks file://. Route fulfillment at a loopback origin is
used with network offline; no server is started and no browser policy is changed.
"""

import csv
import io
import json
import os
from pathlib import Path
import xml.etree.ElementTree as ET

from playwright.sync_api import sync_playwright, expect
from pypdf import PdfReader
from browser_standalone import complete_qa, role, wait_page

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "test-results/standalone/job-tools"
OUTPUT.mkdir(parents=True, exist_ok=True)
ORIGIN = "http://127.0.0.1:8771"


def download(page, selector, filename):
    with page.expect_download() as pending:
        selector.click()
    path = OUTPUT / filename
    pending.value.save_as(path)
    return path


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=os.getenv("CHROMIUM_EXECUTABLE"))
        errors, network = [], []

        def context():
            c = browser.new_context(
                offline=True,
                accept_downloads=True,
                viewport={"width": 1440, "height": 1050},
            )
            paths = {
                ORIGIN + "/AssetInspect.html": ROOT / "standalone/AssetInspect.html",
                ORIGIN + "/shared.html": OUTPUT / "shared.html",
            }

            def serve(route):
                path = paths.get(route.request.url)
                if path and path.exists():
                    route.fulfill(
                        body=path.read_bytes(), content_type="text/html; charset=utf-8"
                    )
                else:
                    network.append(route.request.url)
                    route.abort()

            c.route("**/*", serve)
            return c

        c = context()
        page = c.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())
        page.goto(ORIGIN + "/AssetInspect.html#/geometry")
        wait_page(page, "3D / point-cloud lab.")
        expect(page.locator("#geometry-distance")).to_have_text("2.0000 m")
        canvas = page.locator("#geometry-canvas")
        before = canvas.screenshot()
        canvas.focus()
        page.keyboard.press("ArrowRight")
        page.get_by_role("button", name="Zoom +", exact=True).click()
        assert canvas.screenshot() != before
        page.get_by_role("button", name="Reset view", exact=True).click()
        page.screenshot(path=str(OUTPUT / "geometry-desktop.png"), full_page=True)
        page.set_viewport_size({"width": 390, "height": 1000})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=str(OUTPUT / "geometry-mobile.png"), full_page=True)
        page.set_viewport_size({"width": 1440, "height": 1050})
        target = (
            page.locator("#measurement-target option").nth(1).get_attribute("value")
        )
        page.get_by_label("Save to editable inspection", exact=True).select_option(
            target
        )
        page.get_by_label("Measurement label", exact=True).fill("Synthetic pipe length")
        page.get_by_label("Measurement context / limitations", exact=True).fill(
            "Known synthetic coordinates only; not a calibrated survey."
        )
        page.get_by_role(
            "button", name="Save coordinate measurement", exact=True
        ).click()
        workspace_url = ORIGIN + "/AssetInspect.html#/inspection/" + target
        page.get_by_text("Synthetic pipe length: 2.0000 m", exact=True).wait_for()

        # Import local point cloud and persist an actual 3-4-5 coordinate distance.
        page.goto(ORIGIN + "/AssetInspect.html#/geometry")
        page.get_by_label("XYZ/CSV, ASCII PLY or OBJ", exact=True).set_input_files(
            {
                "name": "fixture.csv",
                "mimeType": "text/csv",
                "buffer": b"x,y,z\n0,0,0\n3,4,0\n0,0,2",
            }
        )
        page.get_by_label("Coordinate units from source", exact=True).select_option(
            "mm"
        )
        page.get_by_role("button", name="Import geometry", exact=True).click()
        expect(page.locator("#geometry-distance")).to_have_text("5.0000 mm")
        page.get_by_label("Save to editable inspection", exact=True).select_option(
            target
        )
        page.get_by_label("Measurement label", exact=True).fill(
            "Imported point distance"
        )
        page.get_by_label("Measurement context / limitations", exact=True).fill(
            "User-declared millimetres. Fixture data; accuracy unverified."
        )
        page.get_by_role(
            "button", name="Save coordinate measurement", exact=True
        ).click()
        page.get_by_text("Imported point distance: 5.0000 mm", exact=True).wait_for()

        # Add drawing evidence and label a hydraulic valve feature with no severity.
        page.get_by_role("button", name="Add synthetic P&ID", exact=True).click()
        page.locator(".photo-card a").last.click()
        wait_page(page, "Annotation workspace.")
        editor_url = page.url
        page.get_by_label("Record type", exact=True).select_option("feature")
        page.get_by_label("Engineering discipline", exact=True).select_option(
            "hydraulic"
        )
        page.get_by_label("Feature / component", exact=True).select_option("valve")
        page.get_by_label("Equipment / drawing tag", exact=True).fill("V-101")
        assert not page.get_by_label("Preliminary severity", exact=True).is_visible()
        page.locator(".coordinate-help summary").click()
        for key, value in {"x": 0.53, "y": 0.42, "width": 0.15, "height": 0.18}.items():
            page.get_by_label("Rectangle " + key).fill(str(value))
        page.get_by_label("Observation", exact=True).fill(
            "SYNTHETIC: Valve symbol V-101 identified manually in the process schematic."
        )
        page.get_by_label("Recommended follow-up", exact=True).fill(
            "=FORMULA_MUST_STAY_TEXT"
        )
        page.get_by_role("button", name="Save finding", exact=True).click()
        expect(page.locator("[data-action=select-finding]")).to_have_count(1)
        expect(page.locator(".annotation-rect.feature")).to_have_count(1)
        page.reload()
        page.locator("[data-action=select-finding]").click()
        expect(page.get_by_label("Equipment / drawing tag", exact=True)).to_have_value(
            "V-101"
        )
        expect(page.get_by_label("Engineering discipline", exact=True)).to_have_value(
            "hydraulic"
        )
        page.screenshot(path=str(OUTPUT / "feature-editor.png"), full_page=True)

        # Structured assessment requires a real user-supplied basis and limitations.
        page.goto(workspace_url)
        page.get_by_role("button", name="Edit assessment", exact=True).click()
        dialog = page.locator("#form-dialog")
        page.get_by_label("Assessment basis", exact=True).select_option("client")
        page.get_by_label("Reference family (metadata only)", exact=True).select_option(
            "ASME"
        )
        page.get_by_label("Scope / evidence limitations", exact=True).fill(
            "Synthetic drawing and coordinate data only. No field survey or code compliance assessment."
        )
        dialog.get_by_role("button", name="Save assessment", exact=True).click()
        expect(dialog.locator(".dialog-error")).to_contain_text(
            "Supply the document reference"
        )
        page.get_by_label("Document / revision / clause", exact=True).fill(
            "DEMO-CLIENT-001 Rev A; no licensed standard applied"
        )
        page.get_by_label("User-supplied assessment criteria", exact=True).fill(
            "Illustrative client rule: visible indications require follow-up; not an ASME rule."
        )
        page.get_by_label("Preliminary condition / action", exact=True).select_option(
            "monitor"
        )
        page.get_by_label("Rationale linked to saved evidence", exact=True).fill(
            "Existing synthetic defect indications require engineering verification."
        )
        page.get_by_label("Follow-up due (optional)", exact=True).fill("2026-12-01")
        dialog.get_by_role("button", name="Save assessment", exact=True).click()
        expect(dialog).not_to_be_visible()
        page.get_by_text("Follow-up due: 2026-12-01", exact=True).wait_for()
        page.get_by_role("button", name="Submit for review", exact=True).click()
        expect(page.locator("#feedback")).to_contain_text("inspector QA checklist")
        complete_qa(page, "inspector")
        page.get_by_role("button", name="Add synthetic P&ID", exact=True).click()
        expect(page.locator("form[data-form=qa] input:checked")).to_have_count(0)
        complete_qa(page, "inspector")
        page.get_by_role("button", name="Submit for review", exact=True).click()
        expect(page.locator(".status-heading .badge")).to_have_text("Submitted")
        role(page, "reviewer")
        page.goto(workspace_url)
        page.get_by_role("button", name="Save review decision", exact=True).click()
        expect(page.locator("#feedback")).to_contain_text("reviewer QA checklist")
        complete_qa(page, "reviewer")
        page.get_by_role("button", name="Save review decision", exact=True).click()
        expect(page.locator(".status-heading .badge")).to_have_text("Approved")

        # Reports include declared units, provenance, component tags and QA.
        page.get_by_role("link", name="View report", exact=True).click()
        report = page.locator(".report-paper")
        expect(report).to_contain_text("V-101")
        expect(report).to_contain_text("5.0000 mm")
        expect(report).to_contain_text("DEMO-CLIENT-001")
        page.locator(".report-paper img").evaluate_all(
            "imgs => Promise.all(imgs.map(i=>i.decode()))"
        )
        page.pdf(
            path=str(OUTPUT / "engineering-report.pdf"),
            print_background=True,
            prefer_css_page_size=True,
        )
        pdf_text = "\n".join(
            p.extract_text() for p in PdfReader(OUTPUT / "engineering-report.pdf").pages
        )
        assert (
            "V-101" in pdf_text
            and "5.0000 mm" in pdf_text
            and "Quality assurance" in pdf_text
        )
        assert "undefined" not in report.inner_text()

        # Worklist filters and formula-safe exports are based on saved records.
        role(page, "inspector")
        page.goto(ORIGIN + "/AssetInspect.html#/analytics")
        page.get_by_label("Filter record type", exact=True).select_option("feature")
        page.get_by_label("Filter discipline", exact=True).select_option("hydraulic")
        page.get_by_label("Search worklist", exact=True).fill("V-101")
        page.get_by_role("button", name="Apply worklist filters", exact=True).click()
        expect(page.locator(".stat-value").first).to_have_text("1")
        data_path = download(
            page,
            page.get_by_role("button", name="Export filtered CSV", exact=True),
            "features.csv",
        )
        rows = list(csv.reader(io.StringIO(data_path.read_text(encoding="utf-8-sig"))))
        assert len(rows) == 2 and rows[1][2] == "Feature" and rows[1][5] == "V-101"
        assert rows[1][7] == "" and rows[1][-1] == "'=FORMULA_MUST_STAY_TEXT"
        workbook = download(
            page,
            page.get_by_role("button", name="Download Excel XML workbook", exact=True),
            "workbook.xml",
        )
        root = ET.parse(workbook).getroot()
        ns = {"s": "urn:schemas-microsoft-com:office:spreadsheet"}
        assert len(root.findall("s:Worksheet", ns)) == 4
        cells = root.findall(".//s:Data", ns)
        assert any(
            c.text == "=FORMULA_MUST_STAY_TEXT"
            and c.attrib.get("{urn:schemas-microsoft-com:office:spreadsheet}Type")
            == "String"
            for c in cells
        )
        assert not any("Formula" in key for e in root.iter() for key in e.attrib)
        page.screenshot(path=str(OUTPUT / "analysis.png"), full_page=True)

        backup = download(
            page,
            page.get_by_role("button", name="Export backup", exact=True),
            "backup.json",
        )
        state = json.loads(backup.read_text())["state"]
        assert len(state["measurements"]) == 2
        assert state["geometry"]["name"] == "fixture.csv"
        record = next(f for f in state["findings"] if f.get("tag") == "V-101")
        assert record["severity"] is None and record["kind"] == "feature"
        item = next(i for i in state["inspections"] if i["id"] == target)
        assert all(item["qa"]["reviewer"].values())
        download(
            page,
            page.get_by_role("button", name="Download shareable HTML", exact=True),
            "shared.html",
        )
        recipient = context().new_page()
        recipient.on("pageerror", lambda e: errors.append(str(e)))
        recipient.goto(ORIGIN + "/shared.html#/geometry")
        expect(recipient.locator("#geometry-distance")).to_have_text("5.0000 mm")
        recipient.goto(ORIGIN + "/shared.html#/report/" + target)
        expect(recipient.locator(".report-paper")).to_contain_text("V-101")
        expect(recipient.locator(".report-paper")).to_contain_text("5.0000 mm")

        # New validation still accepts old backups without any added fields.
        legacy = {"format": 1, "state": json.loads(json.dumps(state))}
        old = legacy["state"]
        old.pop("geometry", None)
        old.pop("measurements", None)
        old["findings"] = [f for f in old["findings"] if f.get("kind") != "feature"]
        for i in old["inspections"]:
            i.pop("qa", None)
            i.pop("assessment", None)
        for f in old["findings"]:
            for key in ["kind", "discipline", "component", "tag"]:
                f.pop(key, None)
        for image in old["photos"]:
            image.pop("evidenceType", None)
        old_path = OUTPUT / "legacy.json"
        old_path.write_text(json.dumps(legacy))
        recipient.on("dialog", lambda d: d.accept())
        recipient.locator("#restore-input").set_input_files(old_path)
        wait_page(recipient, "Inspection overview.")
        expect(recipient.locator("#feedback")).to_contain_text("Backup restored")
        recipient.goto(ORIGIN + "/shared.html#/geometry")
        expect(recipient.locator("#geometry-distance")).to_have_text("2.0000 m")

        # A features-only inspection still requires explicit no-defects confirmation.
        page.goto(ORIGIN + "/AssetInspect.html#/inspections")
        page.get_by_role("button", name="New inspection", exact=True).click()
        page.get_by_label("Inspection reference", exact=True).fill("FEATURES-ONLY-QA")
        page.get_by_label("Inspection scope", exact=True).fill(
            "Synthetic process feature identification exercise."
        )
        page.get_by_role("button", name="Save inspection", exact=True).click()
        wait_page(page, "FEATURES-ONLY-QA.")
        feature_workspace = page.url
        page.get_by_role("button", name="Add synthetic P&ID", exact=True).click()
        page.locator(".photo-card a").first.click()
        page.get_by_label("Record type", exact=True).select_option("feature")
        page.get_by_label("Engineering discipline", exact=True).select_option(
            "mechanical"
        )
        page.get_by_label("Feature / component", exact=True).select_option("pump")
        page.locator(".coordinate-help summary").click()
        for key, value in {"x": 0.2, "y": 0.3, "width": 0.2, "height": 0.2}.items():
            page.get_by_label("Rectangle " + key).fill(str(value))
        page.get_by_label("Observation", exact=True).fill(
            "Synthetic pump symbol identified."
        )
        page.get_by_label("Recommended follow-up", exact=True).fill(
            "Verify against source drawing."
        )
        page.get_by_role("button", name="Save finding", exact=True).click()
        expect(page.locator("[data-action=select-finding]")).to_have_count(1)
        page.goto(feature_workspace)
        complete_qa(page, "inspector")
        page.get_by_role("button", name="Submit for review", exact=True).click()
        expect(page.locator("#feedback")).to_contain_text(
            "Confirm that no visible defects"
        )
        page.get_by_label(
            "No visible defects observed in the supplied photographs", exact=True
        ).check()
        page.get_by_role("button", name="Submit for review", exact=True).click()
        expect(page.locator(".status-heading .badge")).to_have_text("Submitted")
        # Reclassifying a feature as a defect removes a previous no-defects statement.
        role(page, "reviewer")
        page.goto(feature_workspace)
        page.get_by_label("Decision", exact=True).select_option("changes")
        page.get_by_label("Review comment", exact=True).fill(
            "Synthetic exercise: reclassify a visible indication."
        )
        page.get_by_role("button", name="Save review decision", exact=True).click()
        expect(page.locator(".status-heading .badge")).to_have_text("Changes Requested")
        role(page, "inspector")
        page.goto(feature_workspace)
        page.locator(".photo-card a").first.click()
        page.locator("[data-action=select-finding]").click()
        page.get_by_label("Record type", exact=True).select_option("defect")
        page.get_by_label("Defect category", exact=True).select_option("other")
        page.get_by_label("Preliminary severity", exact=True).select_option("low")
        page.get_by_role("button", name="Save finding", exact=True).click()
        expect(page.locator(".annotation-rect.low")).to_have_count(1)
        page.goto(feature_workspace.replace("#/inspection/", "#/report/"))
        expect(page.locator(".report-paper")).not_to_contain_text(
            "No visible defects observed"
        )
        # Multiple worklist pages and overlapping annotations from a restored batch.
        batch = json.loads(json.dumps(legacy))
        source = batch["state"]["findings"][0]
        for k in range(55):
            row = dict(source, id=f"batch-record-{k}", reference=f"F-{1000+k}")
            batch["state"]["findings"].append(row)
        batch_path = OUTPUT / "batch.json"
        batch_path.write_text(json.dumps(batch))
        recipient.locator("#restore-input").set_input_files(batch_path)
        wait_page(recipient, "Inspection overview.")
        expect(recipient.locator("#feedback")).to_contain_text("Backup restored")
        recipient.goto(ORIGIN + "/shared.html#/analytics")
        expect(recipient.locator(".stat-value").first).to_have_text(
            str(len(batch["state"]["findings"]))
        )
        worklist = recipient.locator("section.panel").last
        expect(worklist.locator("tbody tr")).to_have_count(25)
        first_page = worklist.locator("tbody").inner_text()
        recipient.get_by_role("button", name="Next", exact=True).click()
        expect(recipient.locator("section.panel").last).to_contain_text("Page 2")
        expect(
            recipient.locator("section.panel").last.locator("tbody tr")
        ).to_have_count(25)
        assert (
            recipient.locator("section.panel").last.locator("tbody").inner_text()
            != first_page
        )
        recipient.goto(ORIGIN + "/shared.html#/inspection/" + source["inspectionId"])
        expect(recipient.locator(".qa-panel")).to_contain_text("Potential overlaps")
        recipient.goto(ORIGIN + "/shared.html#/geometry")
        recipient.get_by_label("XYZ/CSV, ASCII PLY or OBJ", exact=True).set_input_files(
            {"name": "bad.xyz", "mimeType": "text/plain", "buffer": b"0 0 0\nNaN 1 2"}
        )
        recipient.get_by_label(
            "Coordinate units from source", exact=True
        ).select_option("mm")
        recipient.get_by_role("button", name="Import geometry", exact=True).click()
        expect(recipient.locator("#feedback")).to_contain_text(
            "Coordinates must be finite"
        )
        expect(recipient.locator("#geometry-distance")).to_have_text("2.0000 m")
        assert not errors, errors
        assert not network, network
        browser.close()
        print(
            "PASS: Feature / discipline / component / tags, drawing evidence, manual assessment validation, inspector/reviewer QA gates and invalidation, features-only flow."
        )
        print(
            "PASS: Offline 3D rotation/zoom, XYZ import, exact synthetic/imported coordinate distances, PDF/CSV/Excel XML exports, shared geometry/QA/measurements, legacy backup migration."
        )
        print(
            "PASS: No unexpected HTTP requests or JavaScript errors. Direct file:// remains blocked by managed browser policy."
        )


if __name__ == "__main__":
    main()
