"""Explicit local browser acceptance test. Creates persistent E2E-labelled demo records.

Run from the repository root after seed_demo and starting the server:
  python scripts/browser_smoke.py
Requires requirements-dev.txt and Chromium. Never run against production.
"""

import io
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")
OUTPUT = ROOT / "test-results"
OUTPUT.mkdir(exist_ok=True)
BASE = os.getenv("ASSETINSPECT_TEST_URL", "http://127.0.0.1:8000")
suffix = uuid.uuid4().hex[:8].upper()
reference = f"E2E-{suffix}"


def password(role):
    value = os.getenv(f"DEMO_{role.upper()}_PASSWORD")
    if not value:
        raise RuntimeError(
            "Set DEMO_INSPECTOR_PASSWORD and DEMO_REVIEWER_PASSWORD securely in the local .env, matching your demo accounts."
        )
    return value


def login(page, role):
    page.goto(BASE + "/login/")
    page.get_by_label("Username:").fill("demo." + role)
    page.get_by_label("Password:").fill(password(role))
    page.get_by_role("button", name="Sign in").click()
    page.wait_for_url(BASE + "/")


def logout(page):
    page.get_by_role("button", name="Sign out").click()
    page.wait_for_url("**/login/")


def assert_alignment(page, expected, width):
    page.set_viewport_size({"width": width, "height": 1000})
    page.locator("#evidence-image").wait_for(state="visible")
    page.wait_for_function('document.querySelector("#evidence-image").complete')
    image = page.locator("#evidence-image").bounding_box()
    # getBoundingClientRect includes the non-scaling stroke; measure its geometric
    # centerline instead so a 2.5 px border does not look like coordinate drift.
    rect = page.locator(".annotation-rect").first.evaluate("""rect => {
      const b = rect.getBBox(), m = rect.getScreenCTM();
      const a = new DOMPoint(b.x, b.y).matrixTransform(m);
      const z = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(m);
      return {x:a.x, y:a.y, width:z.x-a.x, height:z.y-a.y};
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
    assert page.evaluate(
        "document.documentElement.scrollWidth <= window.innerWidth"
    ), f"Horizontal page overflow at {width}px"


def main():
    with sync_playwright() as p:
        launch_options = {"headless": True}
        if os.getenv("CHROMIUM_EXECUTABLE"):
            launch_options["executable_path"] = os.environ["CHROMIUM_EXECUTABLE"]
        browser = p.chromium.launch(**launch_options)
        context = browser.new_context(
            viewport={"width": 1440, "height": 1100},
            accept_downloads=True,
            has_touch=True,
        )
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE + "/login/")
        page.screenshot(path=str(OUTPUT / "login.png"), full_page=True)
        login(page, "inspector")
        page.screenshot(path=str(OUTPUT / "dashboard-desktop.png"), full_page=True)
        page.goto(BASE + "/assets/new/")
        page.get_by_label("Identifier:").fill("E2E-ASSET-" + suffix)
        page.get_by_label("Name:").fill("Synthetic browser acceptance pipeline")
        page.get_by_label("Asset type:").select_option("pipeline")
        page.get_by_label("Location:").fill("Synthetic test site")
        page.get_by_label("Description:").fill(
            "SYNTHETIC DEMO: Created by the local browser acceptance test."
        )
        page.get_by_role("button", name="Save asset").click()
        page.get_by_role("link", name="New inspection").click()
        page.get_by_label("Reference:").fill(reference)
        page.get_by_label("Inspection date:").fill("2026-10-19")
        page.get_by_label("Scope:").fill(
            "SYNTHETIC DEMO: Browser acceptance test of supplied visual evidence."
        )
        page.get_by_role("button", name="Save inspection").click()
        workspace_url = page.url
        image = Image.new("RGB", (1200, 800), "#b5c7cc")
        draw = ImageDraw.Draw(image)
        draw.rectangle((0, 280, 1200, 480), fill="#66808a")
        draw.ellipse((240, 310, 460, 450), fill="#9d653e")
        draw.text(
            (35, 35),
            "SYNTHETIC DEMONSTRATION IMAGE - BROWSER TEST",
            fill="#153c43",
            font_size=30,
        )
        data = io.BytesIO()
        image.save(data, "PNG")
        page.get_by_label("Inspection photographs:").set_input_files(
            {
                "name": "synthetic-browser.png",
                "mimeType": "image/png",
                "buffer": data.getvalue(),
            }
        )
        page.get_by_label("Caption:").fill("SYNTHETIC DEMO · Browser evidence")
        page.get_by_role("button", name="Upload photographs").click()
        page.locator(".photo-card a").first.click()
        editor_url = page.url
        page.wait_for_function(
            'document.querySelector("#evidence-image").complete && document.querySelector("#evidence-image").naturalWidth > 0'
        )
        overlay = page.locator("#annotation-overlay")
        box = overlay.bounding_box()
        page.mouse.move(box["x"] + box["width"] * 0.19, box["y"] + box["height"] * 0.35)
        page.mouse.down()
        page.mouse.move(
            box["x"] + box["width"] * 0.4, box["y"] + box["height"] * 0.59, steps=10
        )
        page.mouse.up()
        page.get_by_label("Category:").select_option("corrosion")
        page.get_by_label("Severity:").select_option("medium")
        page.get_by_label("Observation:").fill(
            "SYNTHETIC DEMO: Visible discoloration in the generated test image."
        )
        page.get_by_label("Recommendation:").fill(
            "DEMO: Request independent engineering verification."
        )
        page.get_by_role("button", name="Save finding").click()
        page.wait_for_url(editor_url)
        page.reload()
        assert page.locator(".annotation-rect").count() == 1
        for width in (1440, 768, 390):
            assert_alignment(page, [0.19, 0.35, 0.21, 0.24], width)
        page.screenshot(path=str(OUTPUT / "annotation-mobile.png"), full_page=True)
        # Touch/pointer support: redraw an existing rectangle with a touch pointer.
        page.locator("[data-select]").first.click()
        page.get_by_role("button", name="Redraw rectangle").click()
        overlay.scroll_into_view_if_needed()
        box = overlay.bounding_box()
        session = context.new_cdp_session(page)
        session.send(
            "Input.dispatchTouchEvent",
            {
                "type": "touchStart",
                "touchPoints": [
                    {
                        "x": box["x"] + box["width"] * 0.2,
                        "y": box["y"] + box["height"] * 0.36,
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
                        "x": box["x"] + box["width"] * 0.42,
                        "y": box["y"] + box["height"] * 0.6,
                    }
                ],
            },
        )
        session.send(
            "Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}
        )
        page.get_by_label("Observation:").fill(
            "SYNTHETIC DEMO: Updated after touch redraw."
        )
        page.get_by_role("button", name="Save finding").click()
        assert_alignment(page, [0.2, 0.36, 0.22, 0.24], 390)
        page.set_viewport_size({"width": 1440, "height": 1100})
        page.screenshot(path=str(OUTPUT / "annotation-desktop.png"), full_page=True)
        page.goto(workspace_url)
        # Verify an actual unapproved PDF, not just its HTML preview.
        page.get_by_role("link", name="View report").click()
        with page.expect_download() as download:
            page.get_by_role("link", name="Download PDF").click()
        draft_path = OUTPUT / "draft-report.pdf"
        download.value.save_as(draft_path)
        draft_text = "\n".join(p.extract_text() for p in PdfReader(draft_path).pages)
        assert "DRAFT" in draft_text and "NOT APPROVED" in draft_text
        page.goto(workspace_url)
        page.get_by_role("button", name="Submit for review").click()
        assert page.locator(".page-heading .badge").inner_text() == "Submitted"
        logout(page)
        login(page, "reviewer")
        page.goto(workspace_url)
        page.get_by_label("Decision:").select_option("changes")
        page.get_by_label("Comment:").fill(
            "DEMO: Please clarify the observed discoloration and follow-up."
        )
        page.get_by_role("button", name="Save review decision").click()
        assert page.locator(".page-heading .badge").inner_text() == "Changes Requested"
        logout(page)
        login(page, "inspector")
        page.goto(editor_url)
        page.locator("[data-select]").first.click()
        page.get_by_label("Observation:").fill(
            "SYNTHETIC DEMO: Discoloration near the center-left of the schematic pipe; clarified after review."
        )
        page.get_by_role("button", name="Save finding").click()
        page.goto(workspace_url)
        assert "Please clarify" in page.locator(".audit-list").inner_text()
        page.get_by_role("button", name="Submit for review").click()
        logout(page)
        login(page, "reviewer")
        page.goto(workspace_url)
        page.get_by_label("Decision:").select_option("approve")
        page.get_by_label("Comment:").fill(
            "DEMO: Reviewed all synthetic evidence and clarified findings."
        )
        page.get_by_role("button", name="Save review decision").click()
        assert page.locator(".page-heading .badge").inner_text() == "Approved"
        page.screenshot(path=str(OUTPUT / "approved-workspace.png"), full_page=True)
        page.get_by_role("link", name="View report").click()
        report_url = page.url
        page.screenshot(path=str(OUTPUT / "report-preview.png"), full_page=True)
        with page.expect_download() as download:
            page.get_by_role("link", name="Download PDF").click()
        pdf_path = OUTPUT / "approved-report.pdf"
        download.value.save_as(pdf_path)
        reader = PdfReader(pdf_path)
        text = "\n".join(page.extract_text() for page in reader.pages)
        assert reference in text
        assert "DRAFT" not in text
        assert "Approved" in text and "Please clarify" in text
        assert "SYNTHETIC DEMO" in text
        assert "Independent portfolio demonstration" in text
        with page.expect_download() as download:
            page.get_by_role("link", name="Export findings CSV").click()
        download.value.save_as(OUTPUT / "findings.csv")
        # Inspect dashboard/navigation at mobile width.
        logout(page)
        login(page, "inspector")
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_function(
            'getComputedStyle(document.querySelector(".sidebar")).transform === "matrix(1, 0, 0, 1, -240, 0)"'
        )
        page.screenshot(path=str(OUTPUT / "dashboard-mobile.png"), full_page=True)
        assert page.evaluate(
            "document.documentElement.scrollWidth <= window.innerWidth"
        )
        assert not errors, errors
        browser.close()
        print(
            f"PASS: {reference} create asset → inspection → upload → mouse/touch annotation → reload/resize → submit → request changes → resubmit → approve → PDF/CSV."
        )
        print(
            f"PASS: Alignment at 1440/768/390 px; PDF has {len(reader.pages)} pages with saved evidence, review history, and disclaimer; no browser JavaScript errors."
        )
        print("Artifacts: test-results/ (ignored by Git).")


if __name__ == "__main__":
    main()
