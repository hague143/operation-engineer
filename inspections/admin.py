from django.contrib import admin
from .models import Annotation, Asset, AuditEvent, Inspection, Photograph


@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    list_display = ["identifier", "name", "asset_type", "location"]
    search_fields = ["identifier", "name"]

    def has_change_permission(self, request, obj=None):
        return super().has_change_permission(request, obj) and (
            obj is None or not obj.inspections.exists()
        )


class EvidenceAdmin(admin.ModelAdmin):
    """Evidence and status changes go through audited application workflows, even for admins."""

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AuditEvent)
class AuditAdmin(EvidenceAdmin):
    list_display = ["inspection", "actor", "action", "created_at"]


admin.site.register(Inspection, EvidenceAdmin)
admin.site.register(Photograph, EvidenceAdmin)
admin.site.register(Annotation, EvidenceAdmin)
admin.site.site_header = "AssetInspect administration"
