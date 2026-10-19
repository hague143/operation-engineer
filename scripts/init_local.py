"""Create a local development .env with a fresh secret; preserve existing files."""

import secrets
from pathlib import Path

target = Path(__file__).resolve().parent.parent / ".env"
try:
    with target.open("x", encoding="utf-8") as output:
        output.write(
            "# Local development only. Never commit this file.\n"
            f"DJANGO_SECRET_KEY={secrets.token_urlsafe(64)}\n"
            "DJANGO_DEBUG=True\n"
            "DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1,[::1]\n"
        )
except FileExistsError:
    print("Existing .env preserved.")
else:
    print(
        "Created local .env with a random secret. No demo accounts or passwords were created."
    )
