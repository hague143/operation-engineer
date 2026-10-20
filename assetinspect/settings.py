import hashlib
import os
import tempfile
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
IS_VERCEL = os.getenv("VERCEL") == "1"
VERCEL_DEMO = os.getenv("ASSETINSPECT_VERCEL_DEMO") == "1"
if not IS_VERCEL:
    load_dotenv(BASE_DIR / ".env")
# Never allow a local development flag to expose debug pages on Vercel.
DEBUG = not (IS_VERCEL or VERCEL_DEMO) and os.getenv(
    "DJANGO_DEBUG", "False"
).lower() in ("true", "1")
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "")
if not SECRET_KEY:
    from django.core.exceptions import ImproperlyConfigured

    raise ImproperlyConfigured(
        "Set DJANGO_SECRET_KEY in Vercel Project Settings > Environment Variables "
        "for Preview and Production, then redeploy. For local development use .env. "
        "See DEPLOYMENT.md and .env.example."
    )
if IS_VERCEL or VERCEL_DEMO:
    from django.core.exceptions import ImproperlyConfigured

    if len(SECRET_KEY) < 50:
        raise ImproperlyConfigured(
            "Use a randomly generated DJANGO_SECRET_KEY of at least 50 characters on Vercel."
        )
    if not VERCEL_DEMO:
        raise ImproperlyConfigured(
            "Set ASSETINSPECT_VERCEL_DEMO=1 for disposable Vercel testing. "
            "The local SQLite/media configuration cannot provide persistent Vercel storage. See DEPLOYMENT.md."
        )
ALLOWED_HOSTS = [
    host.strip()
    for host in os.getenv("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1]").split(
        ","
    )
    if host.strip()
]
CSRF_TRUSTED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("DJANGO_CSRF_TRUSTED_ORIGINS", "").split(",")
    if origin.strip()
]
if IS_VERCEL or VERCEL_DEMO:
    # Trust exact deployment/branch/production names supplied by Vercel, never
    # every tenant under *.vercel.app. Add custom domains explicitly in settings.
    from urllib.parse import urlsplit

    for name in ("VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
        value = os.getenv(name, "").strip()
        if value:
            parsed = urlsplit(value if "://" in value else "https://" + value)
            if (
                parsed.hostname
                and not parsed.username
                and not parsed.password
                and parsed.path in ("", "/")
            ):
                ALLOWED_HOSTS.append(parsed.hostname)
                CSRF_TRUSTED_ORIGINS.append("https://" + parsed.hostname)
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SECURE_SSL_REDIRECT = True
ALLOWED_HOSTS = list(dict.fromkeys(ALLOWED_HOSTS))
CSRF_TRUSTED_ORIGINS = list(dict.fromkeys(CSRF_TRUSTED_ORIGINS))
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "inspections.apps.InspectionsConfig",
]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]
ROOT_URLCONF = "assetinspect.urls"
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
                "inspections.context_processors.navigation",
            ]
        },
    }
]
WSGI_APPLICATION = "assetinspect.wsgi.application"
STATE_ROOT = BASE_DIR
if VERCEL_DEMO:
    deployment = (
        os.getenv("VERCEL_DEPLOYMENT_ID")
        or os.getenv("VERCEL_URL")
        or "local-vercel-simulation"
    )
    deployment_id = hashlib.sha256(deployment.encode()).hexdigest()[:16]
    STATE_ROOT = Path(
        os.getenv(
            "ASSETINSPECT_STATE_DIR",
            str(Path(tempfile.gettempdir()) / ("assetinspect-" + deployment_id)),
        )
    )
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": STATE_ROOT / "db.sqlite3",
        "OPTIONS": {"timeout": 20},
    }
}
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
# There is deliberately no public media URL. Photographs require object permissions.
MEDIA_ROOT = STATE_ROOT / "media"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
LOGIN_URL = "login"
LOGIN_REDIRECT_URL = "dashboard"
LOGOUT_REDIRECT_URL = "login"
FILE_UPLOAD_MAX_MEMORY_SIZE = 2 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = 90 * 1024 * 1024
DATA_UPLOAD_MAX_NUMBER_FILES = 8
PHOTO_MAX_BYTES = (3 if VERCEL_DEMO else 10) * 1024 * 1024
PHOTO_MAX_BATCH_BYTES = (3 if VERCEL_DEMO else 80) * 1024 * 1024
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = "DENY"
if not DEBUG:
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
if VERCEL_DEMO:
    # Seeded users have identical IDs/password hashes in each instance. Signed
    # sessions survive instance changes without requiring a shared session DB.
    # New findings/uploads are still instance-local and explicitly disposable.
    SESSION_ENGINE = "django.contrib.sessions.backends.signed_cookies"
    SESSION_COOKIE_AGE = 3600
