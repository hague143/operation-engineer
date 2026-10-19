from django.urls import path
from . import views

urlpatterns = [
    path("", views.dashboard, name="dashboard"),
    path("assets/", views.asset_list, name="asset_list"),
    path("assets/new/", views.asset_form, name="asset_create"),
    path("assets/<int:pk>/", views.asset_detail, name="asset_detail"),
    path("assets/<int:pk>/edit/", views.asset_form, name="asset_edit"),
    path("inspections/", views.inspection_list, name="inspection_list"),
    path("inspections/new/", views.inspection_form, name="inspection_create"),
    path("inspections/<int:pk>/", views.workspace, name="workspace"),
    path("inspections/<int:pk>/edit/", views.inspection_form, name="inspection_edit"),
    path("inspections/<int:pk>/upload/", views.upload_photos, name="upload_photos"),
    path("inspections/<int:pk>/submit/", views.submit, name="submit"),
    path("inspections/<int:pk>/review/", views.review, name="review"),
    path("photos/<int:pk>/image/", views.photo_image, name="photo_image"),
    path(
        "photos/<int:pk>/annotate/", views.annotation_editor, name="annotation_editor"
    ),
    path("photos/<int:pk>/delete/", views.delete_photo, name="delete_photo"),
    path(
        "findings/<int:pk>/delete/", views.delete_annotation, name="delete_annotation"
    ),
    path("reviews/", views.review_queue, name="review_queue"),
    path("reports/", views.report_list, name="report_list"),
    path("inspections/<int:pk>/report/", views.report, name="report"),
    path(
        "inspections/<int:pk>/report/pdf/",
        views.report,
        {"kind": "pdf"},
        name="report_pdf",
    ),
    path(
        "inspections/<int:pk>/report/csv/",
        views.report,
        {"kind": "csv"},
        name="report_csv",
    ),
]
