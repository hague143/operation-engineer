"""Exercise Vercel configuration/build/cold starts in isolated project copies."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, override_settings

from inspections.forms import MultipleImageField, UploadForm


class VercelDeploymentTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.temporary = tempfile.TemporaryDirectory(prefix="assetinspect-vercel-test-")
        cls.root = Path(cls.temporary.name) / "project"
        cls.root.mkdir()
        for name in ("assetinspect", "inspections", "scripts"):
            shutil.copytree(
                settings.BASE_DIR / name,
                cls.root / name,
                ignore=shutil.ignore_patterns("__pycache__"),
            )
        shutil.copy2(settings.BASE_DIR / "manage.py", cls.root / "manage.py")
        # A local .env must never supply missing secrets to a Vercel deployment.
        (cls.root / ".env").write_text(
            "DJANGO_SECRET_KEY=local-file-must-not-be-loaded\nDJANGO_DEBUG=True\n"
        )
        result = cls.run_python(["scripts/build_vercel.py"])
        if result.returncode:
            cls.temporary.cleanup()
            raise AssertionError(result.stderr or result.stdout)

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()
        super().tearDownClass()

    @classmethod
    def run_python(cls, arguments, **overrides):
        env = {
            key: value
            for key, value in os.environ.items()
            if not key.startswith(("DJANGO_", "ASSETINSPECT_", "VERCEL", "DEMO_"))
        }
        env.update(
            {
                "VERCEL": "1",
                "ASSETINSPECT_VERCEL_DEMO": "1",
                "DJANGO_SECRET_KEY": "isolated-disposable-vercel-test-secret-" * 3,
                "DEMO_INSPECTOR_PASSWORD": "isolated-inspector-test-password",
                "DEMO_REVIEWER_PASSWORD": "isolated-reviewer-test-password",
                "VERCEL_URL": "preview-assetinspect.vercel.app",
                "VERCEL_BRANCH_URL": "branch-assetinspect.vercel.app",
                "VERCEL_PROJECT_PRODUCTION_URL": "assetinspect.vercel.app",
                "ASSETINSPECT_STATE_DIR": str(cls.root.parent / "unused-state"),
                "PYTHONPATH": str(cls.root),
            }
        )
        for key, value in overrides.items():
            if value is None:
                env.pop(key, None)
            else:
                env[key] = str(value)
        return subprocess.run(
            [sys.executable, *arguments],
            cwd=cls.root,
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )

    def run_code(self, code, **environment):
        result = self.run_python(["-c", code], **environment)
        self.assertEqual(result.returncode, 0, result.stderr or result.stdout)
        return result

    def test_missing_secret_is_actionable_and_never_uses_local_env(self):
        result = self.run_python(
            ["-c", "import assetinspect.settings"], DJANGO_SECRET_KEY=None
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Environment Variables", result.stderr)
        self.assertNotIn("local-file-must-not-be-loaded", result.stderr)

    def test_short_secret_and_missing_demo_opt_in_fail_closed(self):
        for options, message in [
            ({"DJANGO_SECRET_KEY": "too-short"}, "at least 50"),
            ({"ASSETINSPECT_VERCEL_DEMO": None}, "ASSETINSPECT_VERCEL_DEMO=1"),
        ]:
            result = self.run_python(["-c", "import assetinspect.settings"], **options)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn(message, result.stderr)

    def test_exact_hosts_proxy_https_and_signed_sessions(self):
        self.run_code(
            """
from assetinspect import settings as s
assert not s.DEBUG
assert 'preview-assetinspect.vercel.app' in s.ALLOWED_HOSTS
assert 'branch-assetinspect.vercel.app' in s.ALLOWED_HOSTS
assert 'assetinspect.vercel.app' in s.ALLOWED_HOSTS
assert '.vercel.app' not in s.ALLOWED_HOSTS and '*' not in s.ALLOWED_HOSTS
assert 'https://preview-assetinspect.vercel.app' in s.CSRF_TRUSTED_ORIGINS
assert s.SECURE_PROXY_SSL_HEADER == ('HTTP_X_FORWARDED_PROTO', 'https')
assert s.SESSION_COOKIE_SECURE and s.CSRF_COOKIE_SECURE
assert s.SESSION_ENGINE.endswith('signed_cookies')
assert s.PHOTO_MAX_BATCH_BYTES == 3 * 1024 * 1024
""",
            DJANGO_DEBUG="True",
        )

    def test_build_refuses_missing_or_reused_demo_passwords(self):
        for options in [
            {"DEMO_INSPECTOR_PASSWORD": None},
            {"DEMO_REVIEWER_PASSWORD": "isolated-inspector-test-password"},
        ]:
            result = self.run_python(["scripts/build_vercel.py"], **options)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("distinct DEMO_INSPECTOR_PASSWORD", result.stderr)

    def test_build_creates_only_synthetic_snapshot_and_collected_static(self):
        self.assertFalse((self.root / "db.sqlite3").exists())
        self.assertFalse((self.root / "media").exists())
        template = self.root / ".vercel-demo-template"
        self.assertTrue((template / "db.sqlite3").is_file())
        self.assertEqual(len(list((template / "media").rglob("*.jpg"))), 6)
        self.assertTrue(
            json.loads((template / "demo-manifest.json").read_text())["synthetic"]
        )
        self.assertTrue((self.root / "staticfiles/inspections/app.css").is_file())
        self.assertTrue((self.root / "staticfiles/inspections/editor.js").is_file())

    def test_https_login_media_and_exports_after_cold_start(self):
        with tempfile.TemporaryDirectory() as state:
            self.run_code(
                """
import os
from assetinspect.wsgi import application
from django.test import Client
from inspections.models import Inspection
client = Client(enforce_csrf_checks=True)
headers = {'HTTP_HOST': 'preview-assetinspect.vercel.app', 'HTTP_X_FORWARDED_PROTO': 'https'}
login = client.get('/login/', **headers)
assert login.status_code == 200 and b'Temporary Vercel demo' in login.content
token = client.cookies['csrftoken'].value
response = client.post('/login/', {'username': 'demo.inspector', 'password': os.environ['DEMO_INSPECTOR_PASSWORD'], 'csrfmiddlewaretoken': token}, HTTP_ORIGIN='https://preview-assetinspect.vercel.app', **headers)
assert response.status_code == 302
assert client.get('/', **headers).status_code == 200
inspection = Inspection.objects.first()
photo = inspection.photos.first()
assert client.get(f'/photos/{photo.pk}/image/', **headers).status_code == 200
assert client.get(f'/inspections/{inspection.pk}/report/pdf/', **headers).content.startswith(b'%PDF-')
assert client.get(f'/inspections/{inspection.pk}/report/csv/', **headers).status_code == 200
assert client.get('/.vercel-demo-template/db.sqlite3', **headers).status_code == 404
assert client.get('/.env', **headers).status_code == 404
""",
                ASSETINSPECT_STATE_DIR=Path(state) / "runtime",
            )

    def test_warm_state_survives_and_separate_instances_reset_to_seed(self):
        with tempfile.TemporaryDirectory() as directory:
            first, second = Path(directory) / "first", Path(directory) / "second"
            self.run_code(
                """
from assetinspect.wsgi import application
from inspections.models import Asset
assert Asset.objects.count() == 3
Asset.objects.create(identifier='INSTANCE-ONLY', name='Synthetic test', asset_type='other', location='Demo')
""",
                ASSETINSPECT_STATE_DIR=first,
            )
            self.run_code(
                """
from assetinspect.wsgi import application
from assetinspect.vercel_demo import prepare_demo_state
from inspections.models import Asset
prepare_demo_state()
assert Asset.objects.filter(identifier='INSTANCE-ONLY').exists()
""",
                ASSETINSPECT_STATE_DIR=first,
            )
            self.run_code(
                """
from assetinspect.wsgi import application
from inspections.models import Asset
assert Asset.objects.count() == 3
assert not Asset.objects.filter(identifier='INSTANCE-ONLY').exists()
""",
                ASSETINSPECT_STATE_DIR=second,
            )

    def test_incomplete_runtime_directory_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "incomplete"
            target.mkdir()
            (target / "preserve.txt").write_text("preserve this file")
            result = self.run_python(
                ["-c", "from assetinspect.wsgi import application"],
                ASSETINSPECT_STATE_DIR=target,
            )
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Refusing to overwrite", result.stderr)
            self.assertEqual(
                (target / "preserve.txt").read_text(), "preserve this file"
            )

    def test_parallel_cold_starts_share_one_complete_instance_copy(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "shared"
            code = "from assetinspect.wsgi import application; from inspections.models import Asset; assert Asset.objects.count() == 3"
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(
                    pool.map(
                        lambda _: self.run_python(
                            ["-c", code], ASSETINSPECT_STATE_DIR=state
                        ),
                        range(2),
                    )
                )
            for result in results:
                self.assertEqual(result.returncode, 0, result.stderr)


class VercelUploadTests(SimpleTestCase):
    @override_settings(
        PHOTO_MAX_BYTES=3 * 1024 * 1024, PHOTO_MAX_BATCH_BYTES=3 * 1024 * 1024
    )
    def test_server_and_browser_form_share_gateway_safe_batch_limit(self):
        uploads = [
            SimpleUploadedFile("synthetic.png", b"x" * (2 * 1024 * 1024))
            for _ in range(2)
        ]
        with self.assertRaisesMessage(ValidationError, "at most 3 MB"):
            MultipleImageField().clean(uploads)
        self.assertEqual(
            UploadForm().fields["images"].widget.attrs["data-max-total-bytes"],
            3 * 1024 * 1024,
        )
