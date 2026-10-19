from django.core.exceptions import PermissionDenied
from django.db.models import Q

from .models import Inspection


def has_role(user, role):
    return user.is_authenticated and (
        user.is_superuser or user.groups.filter(name=role).exists()
    )


def require_role(user, role):
    if not has_role(user, role):
        raise PermissionDenied("Your account does not have the required role.")


def visible_inspections(user):
    qs = Inspection.objects.select_related("asset", "inspector")
    if user.is_superuser:
        return qs
    query = Q(pk__in=[])
    if has_role(user, "Inspector"):
        query |= Q(inspector=user)
    if has_role(user, "Reviewer"):
        query |= ~Q(status=Inspection.Status.DRAFT)
    return qs.filter(query)


def can_edit(user, inspection):
    return (
        has_role(user, "Inspector")
        and inspection.inspector_id == user.pk
        and inspection.status in (Inspection.Status.DRAFT, Inspection.Status.CHANGES)
    )


def require_edit(user, inspection):
    if not can_edit(user, inspection):
        raise PermissionDenied(
            "Only the assigned inspector can edit a Draft or Changes Requested inspection."
        )


def can_review(user, inspection):
    return (
        has_role(user, "Reviewer")
        and inspection.inspector_id != user.pk
        and inspection.status == Inspection.Status.SUBMITTED
    )
