"""Package the independent, network-free recruiter demo as one HTML file + ZIP."""

import argparse
import io
import re
import zipfile
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "standalone"


def outputs():
    template = (TARGET / "src/shell.html").read_text(encoding="utf-8")
    base = (ROOT / "inspections/templates/inspections/base.html").read_text(
        encoding="utf-8"
    )
    icons = re.search(r'<svg class="svg-library"[\s\S]*?</svg>', base).group()
    mark = (ROOT / "inspections/static/inspections/mark.svg").read_text(
        encoding="utf-8"
    )
    css = (ROOT / "inspections/static/inspections/app.css").read_text(encoding="utf-8")
    css += "\n" + (TARGET / "src/offline.css").read_text(encoding="utf-8")
    script = (TARGET / "src/offline.js").read_text(encoding="utf-8")
    for token, content in {
        "@@CSS@@": css,
        "@@ICONS@@": icons,
        "@@MARK@@": "data:image/svg+xml," + quote(mark, safe=""),
        "@@SCRIPT@@": script,
    }.items():
        template = template.replace(token, content)
    assert not re.search(r"@@\w+@@", template), "Unresolved build token"
    html = template.encode("utf-8")
    archive = io.BytesIO()
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
        for name, content in [
            ("AssetInspect.html", html),
            ("README.txt", (TARGET / "README.txt").read_bytes()),
        ]:
            entry = zipfile.ZipInfo(name, date_time=(2026, 10, 20, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            bundle.writestr(entry, content)
    return {"AssetInspect.html": html, "AssetInspect-demo.zip": archive.getvalue()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail when committed downloads need rebuilding.",
    )
    args = parser.parse_args()
    for name, content in outputs().items():
        path = TARGET / name
        if args.check:
            if not path.exists() or path.read_bytes() != content:
                raise SystemExit(f"Rebuild {name}: python scripts/build_standalone.py")
        else:
            path.write_bytes(content)
        print(
            f'{"Checked" if args.check else "Built"} standalone/{name} ({len(content):,} bytes)'
        )


if __name__ == "__main__":
    main()
