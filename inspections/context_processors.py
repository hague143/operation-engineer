from django.conf import settings

from .permissions import has_role, visible_inspections


def navigation(request):
    user = request.user
    return {
        "vercel_demo": settings.VERCEL_DEMO,
        "upload_file_mb": settings.PHOTO_MAX_BYTES // (1024 * 1024),
        "upload_batch_mb": settings.PHOTO_MAX_BATCH_BYTES // (1024 * 1024),
        "is_inspector": has_role(user, "Inspector"),
        "is_reviewer": has_role(user, "Reviewer"),
        "queue_count": (
            visible_inspections(user).filter(status="submitted").count()
            if has_role(user, "Reviewer")
            else 0
        ),
    }
