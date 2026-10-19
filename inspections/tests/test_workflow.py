import csv
import io
import tempfile
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.test import Client, TestCase, override_settings
from django.urls import reverse
from PIL import Image

from inspections.forms import MAX_FILE_BYTES, MultipleImageField
from inspections.exports import safe_csv
from inspections.models import Annotation, Asset, AuditEvent, Inspection, Photograph


def image_upload(name="test.png", size=(240, 160), orientation=None):
    output = io.BytesIO()
    image = Image.new("RGB", size, "#aacccc")
    if orientation:
        exif = image.getexif()
        exif[274] = orientation
        image.save(output, "JPEG", exif=exif)
    else:
        image.save(output, "PNG")
    return SimpleUploadedFile(name, output.getvalue(), content_type="image/png")


class WorkflowTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.owner = User.objects.create_user(
            "inspector", password="unit-test-only-password"
        )
        cls.other = User.objects.create_user(
            "other", password="unit-test-only-password"
        )
        cls.reviewer = User.objects.create_user(
            "reviewer", password="unit-test-only-password"
        )
        cls.outsider = User.objects.create_user(
            "outsider", password="unit-test-only-password"
        )
        inspector_group, _ = Group.objects.get_or_create(name="Inspector")
        reviewer_group, _ = Group.objects.get_or_create(name="Reviewer")
        cls.owner.groups.add(inspector_group)
        cls.other.groups.add(inspector_group)
        cls.reviewer.groups.add(reviewer_group)
        cls.asset = Asset.objects.create(
            identifier="PL-1",
            name="Test pipeline",
            asset_type="pipeline",
            location="Test site",
        )
        cls.inspection = Inspection.objects.create(
            reference="INSP-1",
            asset=cls.asset,
            inspector=cls.owner,
            scope="Inspect supplied visual evidence.",
        )

    def setUp(self):
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.override = override_settings(MEDIA_ROOT=self.media.name)
        self.override.enable()
        self.addCleanup(self.override.disable)
        self.client.force_login(self.owner)

    def url(self, name, pk=None):
        return reverse(name, args=[pk or self.inspection.pk])

    def upload(self):
        response = self.client.post(
            self.url("upload_photos"),
            {"images": [image_upload()], "caption": "Synthetic test image"},
        )
        self.assertEqual(response.status_code, 302)
        return self.inspection.photos.latest("pk")

    def finding(self, photo=None, **updates):
        photo = photo or self.upload()
        data = {
            "x": 0.2,
            "y": 0.25,
            "width": 0.3,
            "height": 0.25,
            "category": "corrosion",
            "severity": "medium",
            "observation": "Synthetic visible discoloration.",
            "recommendation": "Request engineering verification.",
        }
        data.update(updates)
        response = self.client.post(self.url("annotation_editor", photo.pk), data)
        self.assertEqual(response.status_code, 302, response.content[:1000])
        return photo.annotations.latest("pk")

    def submit(self, no_defects=False, version=None):
        self.inspection.refresh_from_db()
        return self.client.post(
            self.url("submit"),
            {
                "version": self.inspection.version if version is None else version,
                "no_visible_defects": "on" if no_defects else "",
            },
        )

    def review(self, decision="approve", comment="", version=None):
        self.client.force_login(self.reviewer)
        self.inspection.refresh_from_db()
        return self.client.post(
            self.url("review"),
            {
                "version": self.inspection.version if version is None else version,
                "decision": decision,
                "comment": comment,
            },
        )

    def test_authentication_required_for_pages_media_and_exports(self):
        photo = self.upload()
        self.client.logout()
        for name, pk in [
            ("dashboard", None),
            ("asset_list", None),
            ("workspace", self.inspection.pk),
            ("photo_image", photo.pk),
            ("report_pdf", self.inspection.pk),
            ("report_csv", self.inspection.pk),
        ]:
            url = reverse(name) if pk is None else reverse(name, args=[pk])
            self.assertEqual(self.client.get(url).status_code, 302)

    def test_account_without_group_has_no_access(self):
        self.client.force_login(self.outsider)
        self.assertEqual(self.client.get(reverse("dashboard")).status_code, 403)
        self.assertEqual(self.client.get(reverse("asset_list")).status_code, 403)
        self.assertEqual(self.client.get(reverse("inspection_create")).status_code, 403)

    def test_other_inspector_cannot_read_or_mutate_inspection_or_media(self):
        photo = self.upload()
        self.client.force_login(self.other)
        for name in [
            "workspace",
            "inspection_edit",
            "report",
            "report_pdf",
            "report_csv",
        ]:
            self.assertEqual(self.client.get(self.url(name)).status_code, 404)
        for name in ["photo_image", "annotation_editor"]:
            self.assertEqual(self.client.get(self.url(name, photo.pk)).status_code, 404)
        self.assertEqual(
            self.client.post(
                self.url("upload_photos"), {"images": [image_upload()]}
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.post(self.url("delete_photo", photo.pk)).status_code, 404
        )

    def test_reviewer_cannot_access_drafts_or_create_assets_or_inspections(self):
        photo = self.upload()
        self.client.force_login(self.reviewer)
        self.assertEqual(self.client.get(self.url("workspace")).status_code, 404)
        self.assertEqual(
            self.client.get(self.url("photo_image", photo.pk)).status_code, 404
        )
        self.assertEqual(self.client.get(self.url("report_pdf")).status_code, 404)
        self.assertEqual(self.client.get(self.url("report_csv")).status_code, 404)
        self.assertEqual(self.client.get(reverse("inspection_create")).status_code, 403)
        self.assertEqual(self.client.post(reverse("asset_create"), {}).status_code, 403)

    def test_create_asset_and_inspection_assigns_current_user(self):
        response = self.client.post(
            reverse("asset_create"),
            {
                "identifier": "TK-2",
                "name": "Tank",
                "asset_type": "tank",
                "location": "West",
                "description": "Demo",
            },
        )
        self.assertEqual(response.status_code, 302)
        response = self.client.post(
            reverse("inspection_create"),
            {
                "reference": "INSP-2",
                "asset": Asset.objects.get(identifier="TK-2").pk,
                "inspection_date": "2026-10-19",
                "scope": "Visual review",
                "inspector": self.other.pk,
            },
        )
        self.assertEqual(response.status_code, 302)
        created = Inspection.objects.get(reference="INSP-2")
        self.assertEqual(created.inspector, self.owner)
        self.assertEqual(created.events.get().action, "Inspection created")

    def test_stale_inspection_edit_does_not_overwrite(self):
        self.upload()
        response = self.client.post(
            self.url("inspection_edit"),
            {
                "version": 0,
                "reference": "INSP-1",
                "asset": self.asset.pk,
                "inspection_date": "2026-10-19",
                "scope": "Stale scope",
            },
        )
        self.assertContains(response, "changed in another tab")
        self.inspection.refresh_from_db()
        self.assertEqual(self.inspection.scope, "Inspect supplied visual evidence.")

    def test_multiple_uploads_are_persisted_with_generated_filenames(self):
        response = self.client.post(
            self.url("upload_photos"),
            {"images": [image_upload("../../bad.png"), image_upload("second.png")]},
        )
        self.assertEqual(response.status_code, 302)
        self.assertEqual(self.inspection.photos.count(), 2)
        for photo in self.inspection.photos.all():
            self.assertTrue(photo.image.name.endswith(".jpg"))
            self.assertNotIn("bad", photo.image.name)
            with photo.image.open("rb") as data:
                self.assertEqual(Image.open(data).format, "JPEG")

    def test_invalid_upload_rejects_entire_batch(self):
        response = self.client.post(
            self.url("upload_photos"),
            {
                "images": [
                    image_upload(),
                    SimpleUploadedFile(
                        "evil.jpg", b"<script>bad</script>", content_type="image/jpeg"
                    ),
                ]
            },
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.inspection.photos.count(), 0)

    def test_upload_dimension_and_size_limits(self):
        field = MultipleImageField()
        with self.assertRaises(ValidationError):
            field.clean(image_upload(size=(20, 20)))
        oversized = SimpleUploadedFile("large.png", b"")
        oversized.size = MAX_FILE_BYTES + 1
        with self.assertRaises(ValidationError):
            field.clean(oversized)
        with self.assertRaises(ValidationError):
            field.clean([image_upload() for _ in range(9)])

    def test_orientation_is_normalized_and_metadata_stripped(self):
        cleaned = MultipleImageField().clean(
            image_upload("rotated.jpg", (100, 200), orientation=6)
        )[0]
        self.assertEqual((cleaned["width"], cleaned["height"]), (200, 100))
        self.assertFalse(Image.open(cleaned["file"]).getexif())

    def test_annotation_save_and_retrieve_normalized_coordinates(self):
        finding = self.finding()
        self.assertEqual(finding.reference, "F-001")
        self.assertAlmostEqual(finding.x, 0.2)
        response = self.client.get(self.url("annotation_editor", finding.photo_id))
        self.assertContains(response, "annotations-data")
        self.assertEqual(response.context["annotations_data"][0]["width"], 0.3)

    def test_invalid_coordinates_and_missing_text_rejected(self):
        photo = self.upload()
        for bad in [
            {"width": 0},
            {"x": -0.1},
            {"x": 0.9, "width": 0.3},
            {"y": 0.9, "height": 0.3},
            {"x": "nan"},
            {"width": "inf"},
            {"observation": ""},
            {"category": "fake"},
        ]:
            data = {
                "x": 0.1,
                "y": 0.1,
                "width": 0.2,
                "height": 0.2,
                "category": "crack",
                "severity": "high",
                "observation": "Visible indication",
                "recommendation": "Verify",
            }
            data.update(bad)
            response = self.client.post(self.url("annotation_editor", photo.pk), data)
            self.assertEqual(response.status_code, 400, str(bad))
        self.assertEqual(Annotation.objects.count(), 0)

    def test_annotation_update_redraw_delete_and_nonreused_reference(self):
        finding = self.finding()
        response = self.client.post(
            self.url("annotation_editor", finding.photo_id),
            {
                "annotation_id": finding.pk,
                "x": 0.4,
                "y": 0.2,
                "width": 0.1,
                "height": 0.3,
                "category": "coating",
                "severity": "low",
                "observation": "Updated text",
                "recommendation": "Updated follow-up",
            },
        )
        self.assertEqual(response.status_code, 302)
        finding.refresh_from_db()
        self.assertEqual((finding.x, finding.observation), (0.4, "Updated text"))
        self.assertEqual(
            self.client.post(self.url("delete_annotation", finding.pk)).status_code, 302
        )
        replacement = self.finding(Photograph.objects.get(pk=finding.photo_id))
        self.assertEqual(replacement.reference, "F-002")
        self.assertTrue(
            self.inspection.events.filter(action="Finding deleted").exists()
        )

    def test_annotation_cannot_be_moved_to_another_photo(self):
        finding = self.finding()
        other_photo = self.upload()
        response = self.client.post(
            self.url("annotation_editor", other_photo.pk), {"annotation_id": finding.pk}
        )
        self.assertEqual(response.status_code, 404)

    def test_submit_requires_photograph(self):
        self.assertEqual(self.submit(no_defects=True).status_code, 400)
        self.inspection.refresh_from_db()
        self.assertEqual(self.inspection.status, "draft")

    def test_explicit_no_defect_confirmation(self):
        self.upload()
        self.assertEqual(self.submit().status_code, 400)
        self.assertEqual(self.submit(no_defects=True).status_code, 302)
        self.inspection.refresh_from_db()
        self.assertTrue(self.inspection.no_visible_defects)
        self.assertContains(
            self.client.get(self.url("report")),
            "does not imply the entire asset is defect-free",
        )

    def test_submit_locks_inspection_and_records_history(self):
        finding = self.finding()
        self.assertEqual(self.submit().status_code, 302)
        self.inspection.refresh_from_db()
        self.assertEqual(self.inspection.status, "submitted")
        self.assertTrue(
            self.inspection.events.filter(action="Submitted for review").exists()
        )
        for name in ["inspection_edit", "upload_photos", "submit"]:
            self.assertEqual(self.client.post(self.url(name), {}).status_code, 403)
        self.assertEqual(
            self.client.post(
                self.url("annotation_editor", finding.photo_id), {}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(self.url("delete_annotation", finding.pk)).status_code, 403
        )
        self.assertEqual(
            self.client.post(self.url("delete_photo", finding.photo_id)).status_code,
            403,
        )
        self.assertEqual(
            self.client.post(self.url("asset_edit", self.asset.pk), {}).status_code, 403
        )

    def test_stale_submission_rejected(self):
        self.finding()
        self.assertEqual(self.submit(version=0).status_code, 400)
        self.inspection.refresh_from_db()
        self.assertEqual(self.inspection.status, "draft")

    def test_reviewer_views_all_submitted_evidence(self):
        finding = self.finding()
        self.submit()
        self.client.force_login(self.reviewer)
        self.assertContains(self.client.get(self.url("workspace")), finding.observation)
        self.assertEqual(
            self.client.get(self.url("photo_image", finding.photo_id)).status_code, 200
        )
        self.assertContains(self.client.get(reverse("review_queue")), "INSP-1")
        self.assertEqual(
            self.client.post(self.url("delete_annotation", finding.pk)).status_code, 403
        )

    def test_inspector_cannot_review(self):
        self.finding()
        self.submit()
        self.assertEqual(
            self.client.post(
                self.url("review"), {"decision": "approve", "version": 2}
            ).status_code,
            403,
        )

    def test_self_approval_blocked_even_with_both_roles(self):
        self.owner.groups.add(Group.objects.get(name="Reviewer"))
        self.finding()
        self.submit()
        self.assertEqual(
            self.client.post(
                self.url("review"), {"decision": "approve", "version": 2}
            ).status_code,
            403,
        )

    def test_change_request_requires_nonblank_explanation(self):
        self.finding()
        self.submit()
        self.assertEqual(self.review("changes", "   ").status_code, 400)
        self.inspection.refresh_from_db()
        self.assertEqual(self.inspection.status, "submitted")

    def test_resubmission_preserves_review_history_then_approval(self):
        finding = self.finding()
        self.submit()
        self.assertEqual(
            self.review("changes", "Clarify this indication.").status_code, 302
        )
        self.inspection.refresh_from_db()
        self.assertEqual(self.inspection.status, "changes")
        self.client.force_login(self.owner)
        self.finding(
            Photograph.objects.get(pk=finding.photo_id),
            observation="Additional explanation",
        )
        self.assertEqual(self.submit().status_code, 302)
        self.assertEqual(
            self.review("approve", "Reviewed all evidence.").status_code, 302
        )
        self.inspection.refresh_from_db()
        self.assertEqual(self.inspection.status, "approved")
        self.assertTrue(
            self.inspection.events.filter(comment="Clarify this indication.").exists()
        )
        self.assertEqual(
            self.inspection.events.filter(action="Submitted for review").count(), 2
        )
        self.client.force_login(self.owner)
        self.assertEqual(
            self.client.post(self.url("delete_photo", finding.photo_id)).status_code,
            403,
        )
        self.assertEqual(self.client.get(self.url("inspection_edit")).status_code, 403)

    def test_duplicate_and_stale_review_decisions(self):
        self.finding()
        self.submit()
        self.assertEqual(self.review(version=0).status_code, 400)
        self.assertFalse(self.inspection.events.filter(action="Approved").exists())
        self.assertEqual(self.review().status_code, 302)
        self.assertEqual(self.review().status_code, 403)
        self.assertEqual(self.inspection.events.filter(action="Approved").count(), 1)

    def test_no_defect_confirmation_cleared_when_finding_added(self):
        photo = self.upload()
        self.submit(no_defects=True)
        self.review("changes", "Review again.")
        self.client.force_login(self.owner)
        self.finding(photo)
        self.inspection.refresh_from_db()
        self.assertFalse(self.inspection.no_visible_defects)

    def test_pdf_and_csv_exports_use_saved_records_and_escape_formulas(self):
        finding = self.finding(
            observation='  =HYPERLINK("https://example.invalid")',
            recommendation="+SUM(1,2)",
        )
        pdf = self.client.get(self.url("report_pdf"))
        self.assertEqual(pdf.status_code, 200)
        self.assertEqual(pdf["Content-Type"], "application/pdf")
        self.assertTrue(pdf.content.startswith(b"%PDF-"))
        self.assertGreater(len(pdf.content), 5000)
        response = self.client.get(self.url("report_csv"))
        rows = list(csv.reader(io.StringIO(response.content.decode())))
        self.assertEqual(rows[1][0], self.inspection.reference)
        self.assertEqual(rows[1][1], finding.reference)
        self.assertTrue(rows[1][5].startswith("'"))
        self.assertTrue(rows[1][6].startswith("'"))
        self.assertEqual(response["Cache-Control"], "private, no-store")

    def test_draft_report_warning_and_approved_preview(self):
        self.finding()
        self.assertContains(self.client.get(self.url("report")), "DRAFT — NOT APPROVED")
        self.submit()
        self.review()
        self.assertNotContains(
            self.client.get(self.url("report")), "DRAFT — NOT APPROVED"
        )

    def test_long_pdf_and_escaped_user_text(self):
        self.finding(
            observation="<script>alert(1)</script> "
            + "Long synthetic observation. " * 250
        )
        self.assertEqual(self.client.get(self.url("report_pdf")).status_code, 200)
        response = self.client.get(self.url("workspace"))
        self.assertNotContains(response, "<script>alert(1)</script>")
        self.assertContains(response, "&lt;script&gt;alert(1)&lt;/script&gt;")

    def test_csrf_and_post_only_deletion(self):
        photo = self.upload()
        strict = Client(enforce_csrf_checks=True)
        strict.force_login(self.owner)
        self.assertEqual(
            strict.post(self.url("delete_photo", photo.pk)).status_code, 403
        )
        self.assertEqual(
            self.client.get(self.url("delete_photo", photo.pk)).status_code, 405
        )

    def test_audit_events_are_append_only(self):
        self.upload()
        event = self.inspection.events.first()
        with self.assertRaises(ValidationError):
            event.save()
        with self.assertRaises(ValidationError):
            event.delete()

    def test_delete_photo_removes_private_file_but_keeps_audit(self):
        photo = self.upload()
        self.finding(photo)
        storage, name = photo.image.storage, photo.image.name
        self.assertTrue(storage.exists(name))
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(
                self.client.post(self.url("delete_photo", photo.pk)).status_code, 302
            )
        self.assertFalse(storage.exists(name))
        self.assertEqual(self.inspection.findings.count(), 0)
        self.assertTrue(
            self.inspection.events.filter(action="Photograph deleted").exists()
        )

    def test_csv_formula_prefixes_and_control_characters(self):
        for value in [
            "=1+2",
            "+SUM(1,2)",
            "-1+1",
            "@SUM(A1)",
            "  =1",
            "\tformula",
            "\rformula",
            "\nformula",
        ]:
            self.assertEqual(safe_csv(value), "'" + value)
        self.assertEqual(
            safe_csv("Normal visual observation"), "Normal visual observation"
        )

    def test_model_rejects_annotation_from_another_inspection(self):
        photo = self.upload()
        second = Inspection.objects.create(
            reference="OTHER-INSP",
            asset=self.asset,
            inspector=self.owner,
            scope="Separate inspection",
        )
        annotation = Annotation(
            inspection=second,
            photo=photo,
            reference="F-001",
            x=0.1,
            y=0.1,
            width=0.2,
            height=0.2,
            category="other",
            severity="low",
            observation="Test",
            recommendation="Verify",
            creator=self.owner,
        )
        with self.assertRaises(ValidationError):
            annotation.full_clean()

    def test_false_no_defects_statement_not_stored_when_findings_exist(self):
        self.finding()
        self.assertEqual(self.submit(no_defects=True).status_code, 302)
        self.inspection.refresh_from_db()
        self.assertFalse(self.inspection.no_visible_defects)

    def test_dashboard_uses_visible_database_counts(self):
        self.finding()
        response = self.client.get(reverse("dashboard"))
        self.assertEqual(response.context["inspection_count"], 1)
        self.assertEqual(response.context["severity_stats"][1]["count"], 1)
        self.client.force_login(self.other)
        self.assertEqual(
            self.client.get(reverse("dashboard")).context["inspection_count"], 0
        )

    def test_template_pages_render_for_each_role(self):
        for name in [
            "dashboard",
            "asset_list",
            "inspection_list",
            "report_list",
            "inspection_create",
            "asset_create",
        ]:
            self.assertEqual(self.client.get(reverse(name)).status_code, 200, name)
        self.assertEqual(
            self.client.get(self.url("asset_detail", self.asset.pk)).status_code, 200
        )
        self.client.force_login(self.reviewer)
        self.assertEqual(self.client.get(reverse("review_queue")).status_code, 200)

    def test_demo_is_explicit_idempotent_and_does_not_reset_passwords(self):
        with self.assertRaises(Exception):
            call_command("seed_demo", stdout=io.StringIO())
        with patch.dict(
            "os.environ", {"DEMO_INSPECTOR_PASSWORD": "", "DEMO_REVIEWER_PASSWORD": ""}
        ):
            call_command("seed_demo", create_demo_users=True, stdout=io.StringIO())
        counts = [
            Asset.objects.count(),
            Inspection.objects.count(),
            Photograph.objects.count(),
            Annotation.objects.count(),
            AuditEvent.objects.count(),
        ]
        user = get_user_model().objects.get(username="demo.inspector")
        user.set_password("local-test-password-only")
        user.save()
        password_hash = user.password
        call_command("seed_demo", create_demo_users=True, stdout=io.StringIO())
        self.assertEqual(
            counts,
            [
                Asset.objects.count(),
                Inspection.objects.count(),
                Photograph.objects.count(),
                Annotation.objects.count(),
                AuditEvent.objects.count(),
            ],
        )
        user.refresh_from_db()
        self.assertEqual(user.password, password_hash)
