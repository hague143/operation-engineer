"""Build only synthetic, disposable Vercel demo state. Never migrate local data."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / ".vercel-demo-template"
MANIFEST = "demo-manifest.json"


def build():
    if os.getenv("ASSETINSPECT_VERCEL_DEMO") != "1":
        raise SystemExit(
            "Set ASSETINSPECT_VERCEL_DEMO=1 in Vercel's Preview/Production environment variables. See DEPLOYMENT.md."
        )
    secret = os.getenv("DJANGO_SECRET_KEY", "")
    if len(secret) < 50:
        raise SystemExit(
            "Set a random DJANGO_SECRET_KEY of at least 50 characters in Vercel Environment Variables, then redeploy. Never commit it."
        )
    passwords = [
        os.getenv("DEMO_INSPECTOR_PASSWORD", ""),
        os.getenv("DEMO_REVIEWER_PASSWORD", ""),
    ]
    if (
        any(len(password) < 12 for password in passwords)
        or passwords[0] == passwords[1]
    ):
        raise SystemExit(
            "Set distinct DEMO_INSPECTOR_PASSWORD and DEMO_REVIEWER_PASSWORD values (at least 12 characters each) in Vercel Environment Variables."
        )
    if TEMPLATE.exists() and not (TEMPLATE / MANIFEST).is_file():
        raise SystemExit(
            "Refusing to replace an unrecognized .vercel-demo-template directory."
        )
    # This target is unrelated to the local development database and media.
    with tempfile.TemporaryDirectory(prefix="assetinspect-build-") as directory:
        staged = Path(directory) / "template"
        staged.mkdir()
        env = os.environ.copy()
        env.update(
            {
                "ASSETINSPECT_STATE_DIR": str(staged),
                "VERCEL": "1",
                "DJANGO_DEBUG": "False",
            }
        )

        def manage(*arguments):
            subprocess.run(
                [sys.executable, str(ROOT / "manage.py"), *arguments],
                cwd=ROOT,
                env=env,
                check=True,
            )

        manage("migrate", "--noinput")
        manage("seed_demo", "--create-demo-users")
        manage("collectstatic", "--noinput")
        manage("check")
        (staged / MANIFEST).write_text(
            json.dumps({"format": 1, "synthetic": True}) + "\n"
        )
        if TEMPLATE.exists():
            shutil.rmtree(TEMPLATE)
        shutil.copytree(staged, TEMPLATE)
    print(
        "Vercel synthetic demo prepared. Runtime changes are temporary and instance-local. No secret values were printed."
    )


if __name__ == "__main__":
    build()
