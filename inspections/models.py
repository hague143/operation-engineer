import math
import uuid
from pathlib import Path

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


def photo_path(instance, filename):
    return f"inspections/{instance.inspection_id}/{uuid.uuid4().hex}{Path(filename).suffix.lower()}"


class Asset(models.Model):
    class Type(models.TextChoices):
        PIPELINE = "pipeline", "Pipeline"
        TANK = "tank", "Tank"
        STEEL = "steel", "Steel structure"
        MARINE = "marine", "Marine structure"
        OTHER = "other", "Other"

    identifier = models.CharField(max_length=40, unique=True)
    name = models.CharField(max_length=140)
    asset_type = models.CharField(max_length=20, choices=Type.choices)
    location = models.CharField(max_length=240)
    description = models.TextField(blank=True, max_length=10000)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["identifier"]

    def __str__(self):
        return f"{self.identifier} · {self.name}"


class Inspection(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        SUBMITTED = "submitted", "Submitted"
        CHANGES = "changes", "Changes Requested"
        APPROVED = "approved", "Approved"

    reference = models.CharField(max_length=40, unique=True)
    asset = models.ForeignKey(
        Asset, on_delete=models.PROTECT, related_name="inspections"
    )
    inspection_date = models.DateField(default=timezone.localdate)
    inspector = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="inspections"
    )
    scope = models.TextField(max_length=10000)
    general_notes = models.TextField(blank=True, max_length=20000)
    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT
    )
    no_visible_defects = models.BooleanField(default=False)
    version = models.PositiveIntegerField(default=0)
    next_finding_number = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "-pk"]

    def __str__(self):
        return self.reference


class Photograph(models.Model):
    inspection = models.ForeignKey(
        Inspection, on_delete=models.CASCADE, related_name="photos"
    )
    image = models.ImageField(upload_to=photo_path)
    original_filename = models.CharField(max_length=255)
    caption = models.CharField(max_length=300, blank=True)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["pk"]

    def __str__(self):
        return self.caption or self.original_filename


class Annotation(models.Model):
    class Category(models.TextChoices):
        CORROSION = "corrosion", "Corrosion signs"
        COATING = "coating", "Coating damage"
        CRACK = "crack", "Visible crack indication"
        LEAKAGE = "leakage", "Leakage signs"
        DEFORMATION = "deformation", "Deformation"
        OTHER = "other", "Other"

    class Severity(models.TextChoices):
        LOW = "low", "Low"
        MEDIUM = "medium", "Medium"
        HIGH = "high", "High"

    inspection = models.ForeignKey(
        Inspection, on_delete=models.CASCADE, related_name="findings"
    )
    photo = models.ForeignKey(
        Photograph, on_delete=models.CASCADE, related_name="annotations"
    )
    reference = models.CharField(max_length=20)
    x = models.FloatField()
    y = models.FloatField()
    width = models.FloatField()
    height = models.FloatField()
    category = models.CharField(max_length=20, choices=Category.choices)
    severity = models.CharField(max_length=10, choices=Severity.choices)
    observation = models.TextField(max_length=10000)
    recommendation = models.TextField(max_length=10000)
    creator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["pk"]
        constraints = [
            models.UniqueConstraint(
                fields=["inspection", "reference"], name="unique_finding_in_inspection"
            ),
            models.CheckConstraint(
                condition=models.Q(
                    x__gte=0,
                    y__gte=0,
                    width__gt=0,
                    height__gt=0,
                    x__lte=1,
                    y__lte=1,
                    width__lte=1,
                    height__lte=1,
                ),
                name="normalized_rectangle",
            ),
        ]

    def clean(self):
        super().clean()
        values = [self.x, self.y, self.width, self.height]
        if any(v is None or not math.isfinite(v) for v in values):
            raise ValidationError("Rectangle coordinates must be finite numbers.")
        if (
            self.x < 0
            or self.y < 0
            or self.width <= 0
            or self.height <= 0
            or self.x + self.width > 1
            or self.y + self.height > 1
        ):
            raise ValidationError(
                "Draw a non-zero rectangle entirely inside the photograph."
            )
        if (
            self.photo_id
            and self.inspection_id
            and self.photo.inspection_id != self.inspection_id
        ):
            raise ValidationError("The photograph must belong to this inspection.")


class AuditEvent(models.Model):
    inspection = models.ForeignKey(
        Inspection, on_delete=models.PROTECT, related_name="events"
    )
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT)
    action = models.CharField(max_length=80)
    comment = models.TextField(blank=True, max_length=20000)
    previous_status = models.CharField(max_length=16, blank=True)
    new_status = models.CharField(max_length=16, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at", "-pk"]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Audit history is append-only.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Audit history is append-only.")
