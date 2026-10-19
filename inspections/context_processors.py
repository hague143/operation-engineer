from .permissions import has_role, visible_inspections


def navigation(request):
    user = request.user
    return {
        "is_inspector": has_role(user, "Inspector"),
        "is_reviewer": has_role(user, "Reviewer"),
        "queue_count": (
            visible_inspections(user).filter(status="submitted").count()
            if has_role(user, "Reviewer")
            else 0
        ),
    }
