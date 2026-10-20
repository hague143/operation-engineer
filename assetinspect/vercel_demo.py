"""Prepare an instance-local copy of an explicitly built, synthetic demo.

The deployment bundle is read-only; only its /tmp copy receives user changes.
The bundled database is identical across instances so seeded login hashes work
with signed cookie sessions. This is deliberately not persistent hosting.
"""

import json
import os
import shutil
import tempfile
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

TEMPLATE_NAME = ".vercel-demo-template"
MANIFEST_NAME = "demo-manifest.json"
READY_NAME = ".assetinspect-ready"


def prepare_demo_state():
    if not settings.VERCEL_DEMO:
        return
    target = Path(settings.STATE_ROOT)
    if (target / READY_NAME).is_file():
        return
    template = settings.BASE_DIR / TEMPLATE_NAME
    if (
        not (template / MANIFEST_NAME).is_file()
        or not (template / "db.sqlite3").is_file()
    ):
        raise ImproperlyConfigured(
            "The Vercel demo template is missing. Use the repository's vercel.json "
            "Build Command (python scripts/build_vercel.py) and redeploy."
        )
    manifest = json.loads((template / MANIFEST_NAME).read_text())
    if manifest.get("format") != 1 or not (template / "media").is_dir():
        raise ImproperlyConfigured(
            "The Vercel demo template is incomplete. Rebuild the deployment."
        )
    if target.exists():
        if (target / READY_NAME).is_file():
            return
        raise ImproperlyConfigured(
            "Refusing to overwrite incomplete demo state. Use a new temporary state directory."
        )
    target.parent.mkdir(parents=True, exist_ok=True)
    staged = Path(tempfile.mkdtemp(prefix=target.name + "-", dir=target.parent))
    try:
        shutil.copytree(template, staged, dirs_exist_ok=True)
        (staged / READY_NAME).write_text("1\n")
        try:
            # Publish a complete directory atomically. Concurrent workers may
            # each prepare a copy, but only one needs to win this rename.
            os.rename(staged, target)
        except OSError:
            if not (target / READY_NAME).is_file():
                raise
    finally:
        if staged.exists():
            shutil.rmtree(staged)
