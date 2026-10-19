import io
import os
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageDraw, ImageFont

from inspections.models import Annotation, Asset, Inspection, Photograph
from inspections.workflow import record


def synthetic_photo(kind):
    image = Image.new("RGB", (1400, 900), "#dbe4e7")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 24)
        title = ImageFont.truetype("DejaVuSans.ttf", 36)
    except OSError:
        font = ImageFont.load_default(size=24)
        title = ImageFont.load_default(size=36)
    for x in range(0, 1400, 50):
        draw.line((x, 0, x, 900), fill="#c9d8dc")
    for y in range(0, 900, 50):
        draw.line((0, y, 1400, y), fill="#c9d8dc")
    if kind == "pipeline":
        for offset in range(170):
            shade = 130 + int(65 * (1 - abs(offset - 85) / 85))
            draw.line(
                (100, 320 + offset, 1300, 320 + offset),
                fill=(shade, shade + 10, shade + 11),
            )
        for x in (330, 740, 1110):
            draw.rounded_rectangle(
                (x, 302, x + 45, 510),
                radius=6,
                fill="#627780",
                outline="#374e5a",
                width=3,
            )
            for y in (318, 478):
                draw.ellipse(
                    (x + 13, y, x + 30, y + 17), fill="#b0c5c9", outline="#435c69"
                )
        draw.rectangle((470, 640, 930, 675), fill="#738d97")
        draw.line((510, 490, 510, 640), fill="#738d97", width=23)
        draw.line((880, 490, 880, 640), fill="#738d97", width=23)
    elif kind == "tank":
        draw.rectangle(
            (350, 240, 1060, 670), fill="#b4c4c6", outline="#66828e", width=4
        )
        draw.ellipse((350, 140, 1060, 345), fill="#c9d7da", outline="#66828e", width=4)
        draw.arc((350, 570, 1060, 775), 0, 180, fill="#66828e", width=4)
        for y in (390, 530):
            draw.line((350, y, 1060, y), fill="#8fa8b0", width=3)
        draw.rectangle((1075, 240, 1100, 710), outline="#496a78", width=4)
        for y in range(250, 700, 36):
            draw.line((1075, y, 1100, y), fill="#496a78", width=4)
    else:
        for x in (240, 660, 1080):
            draw.rectangle(
                (x, 210, x + 60, 700), fill="#79939d", outline="#4f6d7a", width=4
            )
        for y in (240, 650):
            draw.rectangle(
                (200, y, 1170, y + 40), fill="#8ba4ac", outline="#4f6d7a", width=4
            )
        draw.line((270, 280, 690, 650), fill="#7d97a1", width=25)
        draw.line((690, 280, 1110, 650), fill="#7d97a1", width=25)
    for dx, dy, radius in ((0, 0, 18), (30, 8, 12), (15, 27, 9), (-11, 26, 13)):
        draw.ellipse(
            (
                550 + dx - radius,
                380 + dy - radius,
                550 + dx + radius,
                380 + dy + radius,
            ),
            fill="#9f653d",
            outline="#b98253",
            width=3,
        )
    draw.line((495, 470, 575, 484, 620, 466), fill="#eee9d7", width=10)
    draw.rounded_rectangle((38, 35, 1362, 127), radius=12, fill="#143b43")
    draw.text((65, 52), "SYNTHETIC DEMONSTRATION IMAGE", font=title, fill="#a0e4d7")
    draw.text(
        (65, 99),
        "AssetInspect  /  Schematic evidence only  /  No real asset assessment",
        font=font,
        fill="#d4e9e8",
    )
    draw.rectangle((0, 817, 1400, 900), fill="#143b43")
    draw.text(
        (45, 843),
        "DEMO DATA · Drawn locally · Not an actual inspection photograph",
        font=font,
        fill="#a0c8c9",
    )
    output = io.BytesIO()
    image.save(output, "JPEG", quality=90)
    return ContentFile(output.getvalue(), name="synthetic-demo.jpg")


class Command(BaseCommand):
    help = "Create an idempotent synthetic demo dataset. Account creation requires --create-demo-users."

    def add_arguments(self, parser):
        parser.add_argument(
            "--create-demo-users",
            action="store_true",
            help="Explicitly create local demo accounts; never for production.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        for role in ("Inspector", "Reviewer"):
            Group.objects.get_or_create(name=role)
        users = {}
        for role, first, last in [
            ("Inspector", "Alex", "Morgan"),
            ("Reviewer", "Jordan", "Lee"),
        ]:
            username = f"demo.{role.lower()}"
            user = User.objects.filter(username=username).first()
            if user is None:
                if not options["create_demo_users"]:
                    raise CommandError(
                        "Run seed_demo --create-demo-users for explicit local account creation, then set passwords with changepassword."
                    )
                password = os.getenv(f"DEMO_{role.upper()}_PASSWORD", "")
                if password and len(password) < 12:
                    raise CommandError(
                        "Demo passwords must be at least 12 characters. Set values securely in your local .env."
                    )
                other = os.getenv(
                    (
                        "DEMO_REVIEWER_PASSWORD"
                        if role == "Inspector"
                        else "DEMO_INSPECTOR_PASSWORD"
                    ),
                    "",
                )
                if password and other == password:
                    raise CommandError("Use distinct inspector and reviewer passwords.")
                user = User(username=username, first_name=first, last_name=last)
                if password:
                    user.set_password(password)
                else:
                    user.set_unusable_password()
                user.save()
                user.groups.add(Group.objects.get(name=role))
            users[role] = user
        assets = []
        for identifier, name, kind, location in [
            (
                "DEMO-PL-001",
                "North transfer pipeline",
                "pipeline",
                "Demonstration site · North process area",
            ),
            (
                "DEMO-TK-002",
                "Water storage tank",
                "tank",
                "Demonstration site · Utility compound",
            ),
            (
                "DEMO-ST-003",
                "Jetty support structure",
                "marine",
                "Demonstration site · East waterfront",
            ),
        ]:
            asset, _ = Asset.objects.get_or_create(
                identifier=identifier,
                defaults={
                    "name": name,
                    "asset_type": kind,
                    "location": location,
                    "description": "SYNTHETIC DEMO ASSET. Illustrative portfolio data; no real infrastructure is represented.",
                },
            )
            assets.append(asset)
        for index, status in enumerate(
            ["draft", "submitted", "changes", "approved", "submitted", "draft"]
        ):
            asset = assets[index % 3]
            inspection, created = Inspection.objects.get_or_create(
                reference=f"DEMO-INSP-{index + 1:03d}",
                defaults={
                    "asset": asset,
                    "inspection_date": timezone.localdate() - timedelta(days=index + 1),
                    "inspector": users["Inspector"],
                    "status": status,
                    "scope": "SYNTHETIC DEMO: Review the supplied schematic for visible surface indications. Record manual observations only.",
                    "general_notes": "Portfolio demonstration using locally generated images. All findings are synthetic and require no real engineering action.",
                    "next_finding_number": 3,
                },
            )
            if not created:
                continue
            photo = Photograph(
                inspection=inspection,
                original_filename="synthetic-demo.jpg",
                caption="SYNTHETIC DEMO · Illustrative surface condition",
                width=1400,
                height=900,
            )
            photo.image.save("synthetic-demo.jpg", synthetic_photo(asset.asset_type))
            for number, category, severity, rect in [
                (
                    1,
                    "corrosion",
                    "high" if index in (1, 4) else "medium",
                    (0.36, 0.38, 0.1, 0.13),
                ),
                (2, "coating", "low", (0.34, 0.5, 0.12, 0.06)),
            ]:
                Annotation.objects.create(
                    inspection=inspection,
                    photo=photo,
                    reference=f"F-{number:03d}",
                    x=rect[0],
                    y=rect[1],
                    width=rect[2],
                    height=rect[3],
                    category=category,
                    severity=severity,
                    observation="SYNTHETIC DEMO FINDING: Illustrative discoloration or surface coating loss in a drawn schematic. This is not a real asset assessment.",
                    recommendation="DEMO ONLY: In an actual inspection, request qualified engineering verification of the observed surface condition.",
                    creator=users["Inspector"],
                )
            record(
                inspection,
                users["Inspector"],
                "Inspection created",
                "Synthetic demonstration dataset.",
                new="draft",
            )
            record(
                inspection,
                users["Inspector"],
                "Photograph and findings added",
                "Synthetic demonstration evidence.",
            )
            if status != "draft":
                record(
                    inspection,
                    users["Inspector"],
                    "Submitted for review",
                    previous="draft",
                    new="submitted",
                )
            if status == "changes":
                record(
                    inspection,
                    users["Reviewer"],
                    "Changes requested",
                    "DEMO: Please clarify the location of the coating indication and add a more specific follow-up recommendation.",
                    previous="submitted",
                    new="changes",
                )
            if status == "approved":
                record(
                    inspection,
                    users["Reviewer"],
                    "Approved",
                    "DEMO: Saved observations match the supplied synthetic evidence. This approval is part of a portfolio workflow only.",
                    previous="submitted",
                    new="approved",
                )
        self.stdout.write(
            self.style.SUCCESS(
                "Synthetic demo dataset available. Existing records and passwords were preserved."
            )
        )
        self.stdout.write(
            "Accounts: demo.inspector / demo.reviewer. Set passwords locally with manage.py changepassword if needed."
        )
