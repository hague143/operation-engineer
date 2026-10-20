"""Validate the standalone file offline, including a shareable copy and PDF.

Run: CHROMIUM_EXECUTABLE=/usr/bin/chromium python scripts/browser_standalone.py
Requires requirements-dev.txt. Does not use or modify the Django database.
"""

import csv
import argparse
import io
import os
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright, expect
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "test-results/standalone"
OUTPUT.mkdir(parents=True, exist_ok=True)
FILE = ROOT / "standalone/AssetInspect.html"


def wait_page(page, title):
    page.get_by_role("heading", name=title, exact=True).wait_for()


def role(page, name):
    page.get_by_label("Demo account").select_option(name)
    wait_page(page, "Inspection overview.")


def alignment(page, expected, width):
    page.set_viewport_size({"width": width, "height": 1000})
    page.locator("#evidence-image").evaluate("img => img.decode()")
    image = page.locator("#evidence-image").bounding_box()
    rect = page.locator(".annotation-rect").first.evaluate("""rect => {
      const b = rect.getBBox(), m = rect.getScreenCTM();
      const a = new DOMPoint(b.x,b.y).matrixTransform(m);
      const z = new DOMPoint(b.x+b.width,b.y+b.height).matrixTransform(m);
      return {x:a.x,y:a.y,width:z.x-a.x,height:z.y-a.y};
    }""")
    actual = [
        (rect["x"] - image["x"]) / image["width"],
        (rect["y"] - image["y"]) / image["height"],
        rect["width"] / image["width"],
        rect["height"] / image["height"],
    ]
    assert all(abs(a - b) < 0.006 for a, b in zip(actual, expected)), (
        width,
        actual,
        expected,
    )
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), width


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--virtual-origin",
        action="store_true",
        help="Test exact file bytes at an intercepted loopback origin when managed Chromium blocks file:// URLs; no server/network is used.",
    )
    args = parser.parse_args()
    origin = "http://127.0.0.1:8769"
    main_url = origin + "/AssetInspect.html" if args.virtual_origin else FILE.as_uri()
    with sync_playwright() as p:
        browser = p.chromium.launch(
            executable_path=os.getenv("CHROMIUM_EXECUTABLE") or None
        )
        errors, network = [], []

        def new_context(**kwargs):
            c = browser.new_context(offline=True, **kwargs)

            def capture(req):
                if req.url.startswith(("https://", "http://")) and not (
                    args.virtual_origin
                    and req.url in (main_url, origin + "/shared-portfolio.html")
                ):
                    network.append(req.url)

            c.on("request", capture)
            if args.virtual_origin:

                def serve(route):
                    paths = {
                        origin + "/AssetInspect.html": FILE,
                        origin
                        + "/shared-portfolio.html": OUTPUT / "shared-portfolio.html",
                    }
                    path = paths.get(route.request.url)
                    if path and path.exists():
                        route.fulfill(
                            body=path.read_bytes(),
                            content_type="text/html; charset=utf-8",
                        )
                    else:
                        route.abort()

                c.route(origin + "/**", serve)
            return c

        context = new_context(
            viewport={"width": 1440, "height": 1100},
            has_touch=True,
            accept_downloads=True,
        )
        page = context.new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda dialog: dialog.accept())
        page.goto(main_url)
        wait_page(page, "Inspection overview.")
        assert (
            "Changes save in this browser"
            in page.locator(".offline-ribbon").inner_text()
        )
        page.screenshot(path=str(OUTPUT / "overview.png"), full_page=True)

        page.get_by_role("link", name="Asset register", exact=True).click()
        page.get_by_role("button", name="Register asset").click()
        page.get_by_label("Asset identifier", exact=True).fill("OFFLINE-PL-001")
        page.get_by_label("Asset name", exact=True).fill("Offline acceptance pipeline")
        page.get_by_label("Location", exact=True).fill("Synthetic offline test site")
        page.get_by_label("Description", exact=True).fill(
            "SYNTHETIC DEMO: Created offline for portfolio acceptance testing."
        )
        page.get_by_role("button", name="Save asset", exact=True).click()
        wait_page(page, "Offline acceptance pipeline.")
        page.get_by_role("button", name="New inspection", exact=True).click()
        page.get_by_label("Inspection reference", exact=True).fill("OFFLINE-QA-001")
        page.get_by_label("Inspection scope", exact=True).fill(
            "SYNTHETIC DEMO: <script>window.__unsafe=true</script> Record visible indications only."
        )
        page.get_by_role("button", name="Save inspection", exact=True).click()
        wait_page(page, "OFFLINE-QA-001.")
        workspace_url = page.url
        page.get_by_role("button", name="Submit for review", exact=True).click()
        page.locator("#feedback").get_by_text(
            "Add at least one photograph before submitting.", exact=False
        ).wait_for()

        page.get_by_label("Inspection photographs", exact=True).set_input_files(
            {
                "name": "invalid.jpg",
                "mimeType": "image/jpeg",
                "buffer": b"<html>not an image</html>",
            }
        )
        page.get_by_role("button", name="Upload photographs", exact=True).click()
        page.locator("#feedback").get_by_text(
            "only actual JPEG or PNG images are supported", exact=False
        ).wait_for()
        data = io.BytesIO()
        image = Image.new("RGB", (1200, 800), "#c0d3d7")
        image.save(data, "PNG")
        page.get_by_label("Inspection photographs", exact=True).set_input_files(
            {
                "name": "synthetic-test.png",
                "mimeType": "image/png",
                "buffer": data.getvalue(),
            }
        )
        page.get_by_label("Caption (optional)", exact=True).fill(
            "SYNTHETIC DEMO: offline browser image"
        )
        page.get_by_role("button", name="Upload photographs", exact=True).click()
        page.locator(".photo-card a").first.wait_for()
        page.locator(".photo-card a").first.click()
        wait_page(page, "Annotation workspace.")
        editor_url = page.url
        page.locator("#evidence-image").evaluate("img => img.decode()")
        overlay = page.locator("#annotation-overlay")
        box = overlay.bounding_box()
        page.mouse.move(box["x"] + box["width"] * 0.2, box["y"] + box["height"] * 0.3)
        page.mouse.down()
        page.mouse.move(
            box["x"] + box["width"] * 0.5, box["y"] + box["height"] * 0.55, steps=12
        )
        page.mouse.up()
        page.get_by_label("Defect category", exact=True).select_option("corrosion")
        page.get_by_label("Preliminary severity", exact=True).select_option("medium")
        page.get_by_label("Observation", exact=True).fill(
            "SYNTHETIC DEMO: An illustrative surface indication."
        )
        page.get_by_label("Recommended follow-up", exact=True).fill(
            "Request qualified engineering verification."
        )
        page.get_by_role("button", name="Save finding", exact=True).click()
        page.locator("[data-action=select-finding]").first.wait_for()
        page.reload()
        wait_page(page, "Annotation workspace.")
        for width in (1440, 768, 390):
            alignment(page, [0.2, 0.3, 0.3, 0.25], width)
        page.screenshot(path=str(OUTPUT / "editor-mobile.png"), full_page=True)

        page.locator("[data-action=select-finding]").first.click()
        page.get_by_role("button", name="Redraw rectangle", exact=True).click()
        overlay.scroll_into_view_if_needed()
        box = overlay.bounding_box()
        session = context.new_cdp_session(page)
        session.send(
            "Input.dispatchTouchEvent",
            {
                "type": "touchStart",
                "touchPoints": [
                    {
                        "x": box["x"] + box["width"] * 0.22,
                        "y": box["y"] + box["height"] * 0.32,
                    }
                ],
            },
        )
        session.send(
            "Input.dispatchTouchEvent",
            {
                "type": "touchMove",
                "touchPoints": [
                    {
                        "x": box["x"] + box["width"] * 0.52,
                        "y": box["y"] + box["height"] * 0.57,
                    }
                ],
            },
        )
        session.send(
            "Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}
        )
        page.get_by_label("Observation", exact=True).fill(
            "SYNTHETIC DEMO: Touch-redrawn visible indication."
        )
        page.get_by_role("button", name="Save finding", exact=True).click()
        page.locator("[data-action=select-finding]").first.wait_for()
        alignment(page, [0.22, 0.32, 0.3, 0.25], 390)

        page.get_by_role("button", name="+ New", exact=True).click()
        page.locator(".coordinate-help summary").click()
        for key, value in [("x", ".1"), ("y", ".1"), ("width", ".2"), ("height", ".2")]:
            page.get_by_label("Rectangle " + key, exact=True).fill(value)
        page.get_by_label("Defect category", exact=True).select_option("coating")
        page.get_by_label("Preliminary severity", exact=True).select_option("low")
        page.get_by_label("Observation", exact=True).fill(
            "SYNTHETIC DEMO: second finding."
        )
        page.get_by_label("Recommended follow-up", exact=True).fill(
            "Verify the coating indication."
        )
        page.get_by_role("button", name="Save finding", exact=True).click()
        expect(page.locator("[data-action=select-finding]")).to_have_count(2)
        page.locator("[data-action=select-finding]").nth(1).click()
        page.get_by_role("button", name="Delete selected finding", exact=True).click()
        expect(page.locator("[data-action=select-finding]")).to_have_count(1)
        page.set_viewport_size({"width": 1440, "height": 1100})
        page.goto(workspace_url)
        page.get_by_role("button", name="Submit for review", exact=True).click()
        page.locator(".status-heading .badge").get_by_text(
            "Submitted", exact=True
        ).wait_for()
        assert page.get_by_role("button", name="Edit details", exact=True).count() == 0
        assert not page.evaluate("window.__unsafe || false")

        role(page, "reviewer")
        page.goto(workspace_url)
        page.get_by_label("Decision", exact=True).select_option("changes")
        page.get_by_role("button", name="Save review decision", exact=True).click()
        page.locator("#feedback").get_by_text(
            "Explain the changes the inspector needs to make.", exact=False
        ).wait_for()
        page.get_by_label("Review comment", exact=True).fill(
            "DEMO: Clarify the surface location and engineering follow-up."
        )
        page.get_by_role("button", name="Save review decision", exact=True).click()
        page.locator(".status-heading .badge").get_by_text(
            "Changes Requested", exact=True
        ).wait_for()
        role(page, "inspector")
        page.goto(editor_url)
        page.locator("[data-action=select-finding]").first.click()
        page.get_by_label("Observation", exact=True).fill(
            "SYNTHETIC DEMO: Clarified surface location after reviewer comments."
        )
        page.get_by_label("Recommended follow-up", exact=True).fill(
            "=SYNTHETIC_FORMULA_TEST"
        )
        page.get_by_role("button", name="Save finding", exact=True).click()
        page.locator("[data-action=select-finding]").first.wait_for()
        page.goto(workspace_url)
        assert (
            "Clarify the surface location" in page.locator(".audit-list").inner_text()
        )
        page.get_by_role("button", name="Submit for review", exact=True).click()
        page.locator(".status-heading .badge").get_by_text(
            "Submitted", exact=True
        ).wait_for()
        role(page, "reviewer")
        page.goto(workspace_url)
        page.get_by_label("Decision", exact=True).select_option("approve")
        page.get_by_label("Review comment", exact=True).fill(
            "DEMO: Reviewed the clarified synthetic evidence."
        )
        page.get_by_role("button", name="Save review decision", exact=True).click()
        page.locator(".status-heading .badge").get_by_text(
            "Approved", exact=True
        ).wait_for()
        page.get_by_role("link", name="View report", exact=True).click()
        wait_page(page, "Inspection report.")
        assert page.locator(".draft-warning").count() == 0
        assert page.locator(".report-image rect").count() == 1
        page.evaluate("window.print=()=>{window.__printRequested=true}")
        page.get_by_role("button", name="Print / Save PDF", exact=True).click()
        assert page.evaluate("window.__printRequested===true")
        await_images = 'Promise.all([...document.querySelectorAll(".report-paper img")].map(img=>img.decode()))'
        page.evaluate(await_images)
        page.pdf(
            path=str(OUTPUT / "approved-report.pdf"),
            print_background=True,
            prefer_css_page_size=True,
        )
        reader = PdfReader(OUTPUT / "approved-report.pdf")
        text = "\n".join(p.extract_text() for p in reader.pages)
        assert "OFFLINE-QA-001" in text and "DRAFT" not in text
        assert "Clarify the surface location" in text and "Approved" in text
        assert "Independent portfolio demonstration" in text
        with page.expect_download() as downloaded:
            page.get_by_role("button", name="Export findings CSV", exact=True).click()
        downloaded.value.save_as(OUTPUT / "findings.csv")
        rows = list(
            csv.reader(
                io.StringIO((OUTPUT / "findings.csv").read_text(encoding="utf-8-sig"))
            )
        )
        assert rows[1][-1].startswith("'=SYNTHETIC_FORMULA_TEST")
        page.screenshot(path=str(OUTPUT / "report.png"), full_page=True)

        with page.expect_download() as downloaded:
            page.get_by_role(
                "button", name="Download shareable HTML", exact=True
            ).click()
        portable = OUTPUT / "shared-portfolio.html"
        downloaded.value.save_as(portable)
        with page.expect_download() as downloaded:
            page.get_by_role("button", name="Export backup", exact=True).click()
        backup = OUTPUT / "backup.json"
        downloaded.value.save_as(backup)
        recipient = new_context(
            viewport={"width": 1440, "height": 1000}, accept_downloads=True
        )
        other = recipient.new_page()
        other.on("pageerror", lambda e: errors.append(str(e)))
        other.goto(
            origin + "/shared-portfolio.html"
            if args.virtual_origin
            else portable.as_uri()
        )
        wait_page(other, "Inspection overview.")
        other.get_by_role("link", name="Inspections", exact=True).click()
        other.get_by_role("link", name="OFFLINE-QA-001", exact=True).click()
        other.get_by_role("link", name="View report", exact=True).click()
        assert (
            "Clarified surface location" in other.locator(".report-paper").inner_text()
        )
        assert other.locator(".report-image img").evaluate(
            "(img)=>img.complete && img.naturalWidth===1200"
        )

        # A second independent recipient starts with the default examples and
        # can restore a backup without a server or API.
        restore_context = new_context(viewport={"width": 1440, "height": 1000})
        restored = restore_context.new_page()
        restored.on("dialog", lambda dialog: dialog.accept())
        restored.on("pageerror", lambda e: errors.append(str(e)))
        restored.goto(main_url)
        wait_page(restored, "Inspection overview.")
        restored.locator("#restore-input").set_input_files(backup)
        restored.get_by_text("Backup restored.", exact=False).wait_for()
        restored.get_by_role("link", name="Inspections", exact=True).click()
        assert (
            restored.get_by_role("link", name="OFFLINE-QA-001", exact=True).count() == 1
        )

        # Explicit no-defect flow, including the mandatory limited-scope statement.
        restored.get_by_role("button", name="New inspection", exact=True).click()
        restored.get_by_label("Inspection reference", exact=True).fill(
            "OFFLINE-NO-DEFECTS"
        )
        restored.get_by_label("Inspection scope", exact=True).fill(
            "SYNTHETIC DEMO: No observed indications in supplied schematic."
        )
        restored.get_by_role("button", name="Save inspection", exact=True).click()
        wait_page(restored, "OFFLINE-NO-DEFECTS.")
        restored.get_by_role("button", name="Add synthetic example", exact=True).click()
        restored.locator(".photo-card a").first.wait_for()
        restored.get_by_role("button", name="Submit for review", exact=True).click()
        restored.locator("#feedback").get_by_text(
            "Confirm that no visible defects were observed", exact=False
        ).wait_for()
        restored.get_by_label(
            "No visible defects observed in the supplied photographs", exact=True
        ).check()
        restored.get_by_role("button", name="Submit for review", exact=True).click()
        restored.locator(".status-heading .badge").get_by_text(
            "Submitted", exact=True
        ).wait_for()
        restored.get_by_role("link", name="View report", exact=True).click()
        assert restored.locator(".draft-warning").count() == 1
        assert (
            "does not imply the entire asset is defect-free"
            in restored.locator(".report-paper").inner_text()
        )
        restored.evaluate(
            'Promise.all([...document.querySelectorAll(".report-paper img")].map(img=>img.decode()))'
        )
        restored.pdf(
            path=str(OUTPUT / "unapproved-report.pdf"),
            print_background=True,
            prefer_css_page_size=True,
        )
        assert "NOT APPROVED" in "\n".join(
            p.extract_text() for p in PdfReader(OUTPUT / "unapproved-report.pdf").pages
        )

        # Storage-disabled browsers receive an honest session-only warning.
        blocked = new_context()
        blocked.add_init_script(
            'Object.defineProperty(window,"indexedDB",{value:{open(){throw new Error("Blocked storage for test")}}})'
        )
        transient = blocked.new_page()
        transient.on("pageerror", lambda e: errors.append(str(e)))
        transient.goto(main_url)
        wait_page(transient, "Inspection overview.")
        assert (
            "temporary session"
            in transient.locator(".offline-storage-warning").inner_text().lower()
        )
        assert not errors, errors
        assert not network, network
        browser.close()
        print(
            "PASS: Standalone HTML ran offline; no external HTTP requests or JavaScript errors."
        )
        if args.virtual_origin:
            print(
                "LIMITATION: Managed Chromium blocks file://; exact HTML bytes were fulfilled at a loopback origin with network offline, without a server. Direct-file opening remains unverified in this runner."
            )
        print(
            "PASS: Asset/inspection creation, invalid/valid upload, mouse/touch/keyboard rectangles, reload persistence, mobile alignment, finding deletion, and locked review flow."
        )
        print(
            "PASS: Changes requested → edit/resubmit → approve; saved history; approved/draft PDF and formula-safe CSV."
        )
        print(
            "PASS: Shareable HTML in a fresh recipient browser; backup/restore; explicit no-defect flow; storage-blocked fallback."
        )
        print("Artifacts: test-results/standalone/")


if __name__ == "__main__":
    main()
