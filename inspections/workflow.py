from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import F
from django.utils import timezone

from .models import AuditEvent, Inspection
from .permissions import can_review, require_edit


def record(inspection, user, action, comment="", previous="", new=""):
    return AuditEvent.objects.create(
        inspection=inspection,
        actor=user,
        action=action,
        comment=comment,
        previous_status=previous,
        new_status=new,
    )


def touch(inspection):
    Inspection.objects.filter(pk=inspection.pk).update(
        version=F("version") + 1, updated_at=timezone.now()
    )


@transaction.atomic
def submit_inspection(pk, user, version, no_defects):
    inspection = Inspection.objects.select_for_update().get(pk=pk)
    require_edit(user, inspection)
    if not inspection.photos.exists():
        raise ValidationError("Upload at least one photograph before submitting.")
    if not inspection.findings.exists() and not no_defects:
        raise ValidationError(
            "Confirm that no visible defects were observed in the supplied photographs, or add a finding."
        )
    previous = inspection.status
    updated = Inspection.objects.filter(pk=pk, version=version, status=previous).update(
        status=Inspection.Status.SUBMITTED,
        version=F("version") + 1,
        no_visible_defects=not inspection.findings.exists() and no_defects,
        updated_at=timezone.now(),
    )
    if not updated:
        raise ValidationError(
            "This inspection changed in another tab. Reload and review the latest version."
        )
    record(
        inspection,
        user,
        "Submitted for review",
        previous=previous,
        new=Inspection.Status.SUBMITTED,
    )


@transaction.atomic
def review_inspection(pk, user, version, decision, comment):
    inspection = Inspection.objects.select_for_update().get(pk=pk)
    if not can_review(user, inspection):
        raise PermissionDenied(
            "Only another reviewer can decide a submitted inspection."
        )
    if decision not in ("approve", "changes"):
        raise ValidationError("Choose a valid review decision.")
    if decision == "changes" and not comment.strip():
        raise ValidationError("A change request requires an explanation.")
    status = (
        Inspection.Status.APPROVED
        if decision == "approve"
        else Inspection.Status.CHANGES
    )
    updated = Inspection.objects.filter(
        pk=pk, version=version, status=Inspection.Status.SUBMITTED
    ).update(status=status, version=F("version") + 1, updated_at=timezone.now())
    if not updated:
        raise ValidationError(
            "This inspection changed in another tab. Reload before deciding."
        )
    record(
        inspection,
        user,
        "Approved" if decision == "approve" else "Changes requested",
        comment=comment,
        previous=Inspection.Status.SUBMITTED,
        new=status,
    )
