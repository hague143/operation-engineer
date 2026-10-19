from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Count, Q
from django.http import FileResponse, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.urls import reverse
from django.views.decorators.http import require_POST

from .exports import DISCLAIMER, csv_response, pdf_response
from .forms import (
    AnnotationForm,
    AssetForm,
    InspectionForm,
    ReviewForm,
    SubmitForm,
    UploadForm,
)
from .models import Annotation, Asset, AuditEvent, Inspection, Photograph
from .permissions import (
    can_edit,
    can_review,
    has_role,
    require_edit,
    require_role,
    visible_inspections,
)
from .workflow import record, review_inspection, submit_inspection, touch


def inspection_for(request, pk):
    return get_object_or_404(visible_inspections(request.user), pk=pk)


def require_member(user):
    if not (has_role(user, "Inspector") or has_role(user, "Reviewer")):
        raise PermissionDenied(
            "Ask an administrator to assign the Inspector or Reviewer group."
        )


@login_required
def dashboard(request):
    require_member(request.user)
    inspections = visible_inspections(request.user)
    findings = Annotation.objects.filter(inspection__in=inspections)
    return render(
        request,
        "inspections/dashboard.html",
        {
            "page": "dashboard",
            "asset_count": Asset.objects.count(),
            "inspection_count": inspections.count(),
            "submitted_count": inspections.filter(status="submitted").count(),
            "approved_count": inspections.filter(status="approved").count(),
            "recent": inspections.annotate(
                photo_count=Count("photos", distinct=True),
                finding_count=Count("findings", distinct=True),
            )[:6],
            "severity_stats": [
                {
                    "label": label,
                    "key": key,
                    "count": findings.filter(severity=key).count(),
                }
                for key, label in Annotation.Severity.choices
            ],
            "category_stats": [
                {"label": label, "count": findings.filter(category=key).count()}
                for key, label in Annotation.Category.choices
            ],
            "recent_events": AuditEvent.objects.filter(
                inspection__in=inspections
            ).select_related("actor", "inspection")[:5],
        },
    )


@login_required
def asset_list(request):
    require_member(request.user)
    query = request.GET.get("q", "").strip()
    assets = Asset.objects.all()
    if query:
        assets = assets.filter(
            Q(identifier__icontains=query)
            | Q(name__icontains=query)
            | Q(location__icontains=query)
        )
    return render(
        request,
        "inspections/assets.html",
        {"page": "assets", "assets": assets, "query": query},
    )


@login_required
def asset_detail(request, pk):
    require_member(request.user)
    asset = get_object_or_404(Asset, pk=pk)
    return render(
        request,
        "inspections/asset_detail.html",
        {
            "page": "assets",
            "asset": asset,
            "inspections": visible_inspections(request.user).filter(asset=asset),
        },
    )


@login_required
def asset_form(request, pk=None):
    require_role(request.user, "Inspector")
    asset = get_object_or_404(Asset, pk=pk) if pk else None
    if (
        asset
        and asset.inspections.filter(status__in=["submitted", "approved"]).exists()
    ):
        raise PermissionDenied(
            "Asset details are locked while an associated inspection is Submitted or Approved, to preserve report content."
        )
    form = AssetForm(request.POST or None, instance=asset)
    if request.method == "POST" and form.is_valid():
        with transaction.atomic():
            asset = form.save()
            for inspection in asset.inspections.all():
                record(
                    inspection,
                    request.user,
                    "Asset details updated",
                    comment=f"Asset {asset.identifier} metadata updated.",
                )
        messages.success(request, "Asset saved.")
        return redirect("asset_detail", pk=asset.pk)
    return render(
        request,
        "inspections/form.html",
        {
            "page": "assets",
            "form": form,
            "title": "Edit asset" if pk else "Register an asset",
            "eyebrow": "ASSET REGISTER",
            "description": "Give your infrastructure a clear, consistent identity.",
            "cancel_url": (
                reverse("asset_detail", args=[pk]) if pk else reverse("asset_list")
            ),
        },
    )


@login_required
def inspection_list(request):
    inspections = visible_inspections(request.user)
    require_member(request.user)
    query = request.GET.get("q", "").strip()
    status = request.GET.get("status", "")
    if query:
        inspections = inspections.filter(
            Q(reference__icontains=query)
            | Q(asset__name__icontains=query)
            | Q(asset__identifier__icontains=query)
        )
    if status in dict(Inspection.Status.choices):
        inspections = inspections.filter(status=status)
    return render(
        request,
        "inspections/inspection_list.html",
        {
            "page": "inspections",
            "inspections": inspections.annotate(
                photo_count=Count("photos", distinct=True),
                finding_count=Count("findings", distinct=True),
            ),
            "query": query,
            "status": status,
            "statuses": Inspection.Status.choices,
        },
    )


@login_required
def inspection_form(request, pk=None):
    require_role(request.user, "Inspector")
    inspection = inspection_for(request, pk) if pk else None
    if inspection:
        require_edit(request.user, inspection)
    form = InspectionForm(
        request.POST or None,
        instance=inspection,
        initial={"asset": request.GET.get("asset")},
    )
    if request.method == "POST" and form.is_valid():
        with transaction.atomic():
            if pk:
                current = Inspection.objects.select_for_update().get(pk=pk)
                require_edit(request.user, current)
                if request.POST.get("version") != str(current.version):
                    form.add_error(
                        None,
                        "This inspection changed in another tab. Reload before editing.",
                    )
                else:
                    inspection = form.save(commit=False)
                    inspection.version = current.version + 1
                    inspection.save()
                    record(inspection, request.user, "Inspection details updated")
            else:
                inspection = form.save(commit=False)
                inspection.inspector = request.user
                inspection.save()
                record(inspection, request.user, "Inspection created", new="draft")
        if not form.errors:
            messages.success(request, "Inspection saved.")
            return redirect("workspace", pk=inspection.pk)
    return render(
        request,
        "inspections/form.html",
        {
            "page": "inspections",
            "form": form,
            "inspection": inspection,
            "title": "Edit inspection" if pk else "Create an inspection",
            "eyebrow": "INSPECTION PLANNING",
            "description": "Define the asset, scope, and evidence to be reviewed.",
            "cancel_url": (
                reverse("workspace", args=[pk]) if pk else reverse("inspection_list")
            ),
        },
    )


def workspace_context(request, inspection, **extra):
    context = {
        "page": "reviews" if can_review(request.user, inspection) else "inspections",
        "inspection": inspection,
        "editable": can_edit(request.user, inspection),
        "reviewable": can_review(request.user, inspection),
        "photos": inspection.photos.prefetch_related("annotations"),
        "findings": inspection.findings.select_related("photo"),
        "events": inspection.events.select_related("actor"),
        "upload_form": UploadForm(),
        "submit_form": SubmitForm(initial={"version": inspection.version}),
        "review_form": ReviewForm(initial={"version": inspection.version}),
    }
    context.update(extra)
    return context


@login_required
def workspace(request, pk):
    inspection = inspection_for(request, pk)
    return render(
        request, "inspections/workspace.html", workspace_context(request, inspection)
    )


@login_required
@require_POST
def upload_photos(request, pk):
    inspection = inspection_for(request, pk)
    require_edit(request.user, inspection)
    form = UploadForm(request.POST, request.FILES)
    if form.is_valid():
        created = []
        try:
            with transaction.atomic():
                inspection = Inspection.objects.select_for_update().get(pk=pk)
                require_edit(request.user, inspection)
                for image in form.cleaned_data["images"]:
                    photo = Photograph(
                        inspection=inspection,
                        original_filename=image["name"],
                        caption=form.cleaned_data["caption"],
                        width=image["width"],
                        height=image["height"],
                    )
                    photo.image.save(image["file"].name, image["file"], save=True)
                    created.append(photo)
                touch(inspection)
                record(
                    inspection,
                    request.user,
                    "Photographs uploaded",
                    comment=f"{len(created)} photograph(s) added.",
                )
        except Exception:
            for photo in created:
                photo.image.storage.delete(photo.image.name)
            raise
        messages.success(
            request,
            f"{len(created)} photograph(s) uploaded. Open a photograph to annotate.",
        )
        return redirect("workspace", pk=pk)
    return render(
        request,
        "inspections/workspace.html",
        workspace_context(request, inspection, upload_form=form),
        status=400,
    )


@login_required
@require_POST
@transaction.atomic
def delete_photo(request, pk):
    photo = get_object_or_404(
        Photograph, pk=pk, inspection__in=visible_inspections(request.user)
    )
    inspection = Inspection.objects.select_for_update().get(pk=photo.inspection_id)
    require_edit(request.user, inspection)
    name, storage = photo.image.name, photo.image.storage
    record(
        inspection,
        request.user,
        "Photograph deleted",
        comment=f"{photo.original_filename}; removed {photo.annotations.count()} finding(s).",
    )
    photo.delete()
    touch(inspection)
    transaction.on_commit(lambda: storage.delete(name))
    messages.success(request, "Photograph and its annotations deleted.")
    return redirect("workspace", pk=inspection.pk)


@login_required
def photo_image(request, pk):
    photo = get_object_or_404(
        Photograph, pk=pk, inspection__in=visible_inspections(request.user)
    )
    try:
        response = FileResponse(photo.image.open("rb"), content_type="image/jpeg")
    except FileNotFoundError:
        return HttpResponse(
            "Photograph file is missing. Contact the administrator.", status=404
        )
    response["Cache-Control"] = "private, no-store"
    response["Content-Security-Policy"] = "default-src 'none'"
    return response


def serialized_annotations(photo):
    return [
        {
            key: getattr(a, key)
            for key in (
                "id",
                "reference",
                "x",
                "y",
                "width",
                "height",
                "category",
                "severity",
                "observation",
                "recommendation",
            )
        }
        for a in photo.annotations.all()
    ]


@login_required
def annotation_editor(request, pk):
    photo = get_object_or_404(
        Photograph.objects.select_related("inspection", "inspection__asset"),
        pk=pk,
        inspection__in=visible_inspections(request.user),
    )
    inspection = photo.inspection
    form = AnnotationForm()
    selected_id = None
    if request.method == "POST":
        require_edit(request.user, inspection)
        with transaction.atomic():
            inspection = Inspection.objects.select_for_update().get(pk=inspection.pk)
            require_edit(request.user, inspection)
            selected_id = request.POST.get("annotation_id") or None
            instance = (
                get_object_or_404(Annotation, pk=selected_id, photo=photo)
                if selected_id
                else Annotation(
                    photo=photo,
                    inspection=inspection,
                    creator=request.user,
                    reference="pending",
                )
            )
            form = AnnotationForm(request.POST, instance=instance)
            if form.is_valid():
                annotation = form.save(commit=False)
                if not selected_id:
                    annotation.reference = f"F-{inspection.next_finding_number:03d}"
                    inspection.next_finding_number += 1
                    inspection.no_visible_defects = False
                    inspection.save(
                        update_fields=["next_finding_number", "no_visible_defects"]
                    )
                annotation.save()
                touch(inspection)
                record(
                    inspection,
                    request.user,
                    "Finding updated" if selected_id else "Finding created",
                    comment=f"{annotation.reference}: {annotation.get_category_display()} · {annotation.get_severity_display()}",
                )
                messages.success(request, f"{annotation.reference} saved.")
                return redirect("annotation_editor", pk=pk)
    return render(
        request,
        "inspections/editor.html",
        {
            "page": "inspections",
            "photo": photo,
            "inspection": inspection,
            "form": form,
            "annotations_data": serialized_annotations(photo),
            "editable": can_edit(request.user, inspection),
            "selected_id": selected_id or "",
            "form_failed": bool(form.errors),
        },
        status=400 if form.errors else 200,
    )


@login_required
@require_POST
@transaction.atomic
def delete_annotation(request, pk):
    annotation = get_object_or_404(
        Annotation.objects.select_related("photo"),
        pk=pk,
        inspection__in=visible_inspections(request.user),
    )
    inspection = Inspection.objects.select_for_update().get(pk=annotation.inspection_id)
    require_edit(request.user, inspection)
    photo_id = annotation.photo_id
    record(
        inspection,
        request.user,
        "Finding deleted",
        comment=f"{annotation.reference}: {annotation.observation}",
    )
    annotation.delete()
    touch(inspection)
    messages.success(request, "Finding deleted.")
    return redirect("annotation_editor", pk=photo_id)


@login_required
@require_POST
def submit(request, pk):
    inspection = inspection_for(request, pk)
    require_edit(request.user, inspection)
    form = SubmitForm(request.POST)
    if form.is_valid():
        try:
            submit_inspection(
                pk,
                request.user,
                form.cleaned_data["version"],
                form.cleaned_data["no_visible_defects"],
            )
        except ValidationError as exc:
            form.add_error(None, exc)
        else:
            messages.success(
                request, "Inspection submitted. Evidence is now locked for review."
            )
            return redirect("workspace", pk=pk)
    inspection.refresh_from_db()
    return render(
        request,
        "inspections/workspace.html",
        workspace_context(request, inspection, submit_form=form),
        status=400,
    )


@login_required
def review_queue(request):
    require_role(request.user, "Reviewer")
    return render(
        request,
        "inspections/review_queue.html",
        {
            "page": "reviews",
            "inspections": visible_inspections(request.user)
            .filter(status="submitted")
            .exclude(inspector=request.user),
        },
    )


@login_required
@require_POST
def review(request, pk):
    inspection = inspection_for(request, pk)
    if not can_review(request.user, inspection):
        raise PermissionDenied(
            "You cannot review this inspection. It must be submitted and assigned to a different inspector."
        )
    form = ReviewForm(request.POST)
    if form.is_valid():
        try:
            review_inspection(pk, request.user, **form.cleaned_data)
        except ValidationError as exc:
            form.add_error(None, exc)
        else:
            messages.success(request, "Review decision recorded.")
            return redirect("workspace", pk=pk)
    return render(
        request,
        "inspections/workspace.html",
        workspace_context(request, inspection, review_form=form),
        status=400,
    )


@login_required
def report(request, pk, kind="preview"):
    inspection = inspection_for(request, pk)
    if kind == "pdf":
        response = pdf_response(inspection)
    elif kind == "csv":
        response = csv_response(inspection)
    else:
        return render(
            request,
            "inspections/report.html",
            {
                "page": "reports",
                "inspection": inspection,
                "photos": inspection.photos.prefetch_related("annotations"),
                "findings": inspection.findings.select_related("photo"),
                "events": inspection.events.select_related("actor"),
                "disclaimer": DISCLAIMER,
            },
        )
    response["Cache-Control"] = "private, no-store"
    return response


@login_required
def report_list(request):
    require_member(request.user)
    return render(
        request,
        "inspections/reports.html",
        {"page": "reports", "inspections": visible_inspections(request.user)},
    )
