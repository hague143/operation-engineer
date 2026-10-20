import io
import warnings
from pathlib import PurePath

from django import forms
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError

from .models import Annotation, Asset, Inspection

MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_IMAGE_PIXELS = 20_000_000
MAX_DIMENSION = 10000
MAX_BATCH = 8


class AssetForm(forms.ModelForm):
    class Meta:
        model = Asset
        fields = ["identifier", "name", "asset_type", "location", "description"]
        widgets = {"description": forms.Textarea(attrs={"rows": 4})}


class InspectionForm(forms.ModelForm):
    class Meta:
        model = Inspection
        fields = ["reference", "asset", "inspection_date", "scope", "general_notes"]
        widgets = {
            "inspection_date": forms.DateInput(attrs={"type": "date"}),
            "scope": forms.Textarea(attrs={"rows": 4}),
            "general_notes": forms.Textarea(attrs={"rows": 4}),
        }


class MultipleFileInput(forms.ClearableFileInput):
    allow_multiple_selected = True


class MultipleImageField(forms.FileField):
    widget = MultipleFileInput

    def clean(self, data, initial=None):
        if not data:
            raise ValidationError("Choose at least one JPEG or PNG image.")
        if not isinstance(data, (list, tuple)):
            data = [data]
        if len(data) > MAX_BATCH:
            raise ValidationError(f"Upload at most {MAX_BATCH} photographs at a time.")
        if (
            sum(getattr(upload, "size", 0) or 0 for upload in data)
            > settings.PHOTO_MAX_BATCH_BYTES
        ):
            raise ValidationError(
                f"This environment allows at most {settings.PHOTO_MAX_BATCH_BYTES // (1024 * 1024)} MB of photographs per upload batch."
            )
        cleaned = []
        for upload in data:
            super().clean(upload, initial)
            if upload.size > settings.PHOTO_MAX_BYTES:
                raise ValidationError(
                    f"{upload.name}: images must be {settings.PHOTO_MAX_BYTES // (1024 * 1024)} MB or smaller."
                )
            try:
                with warnings.catch_warnings():
                    warnings.simplefilter("error", Image.DecompressionBombWarning)
                    upload.seek(0)
                    with Image.open(upload) as check:
                        if check.format not in ("JPEG", "PNG"):
                            raise ValidationError(
                                f"{upload.name}: only actual JPEG and PNG images are supported."
                            )
                        width, height = check.size
                        if (
                            min(width, height) < 64
                            or max(width, height) > MAX_DIMENSION
                            or width * height > MAX_IMAGE_PIXELS
                        ):
                            raise ValidationError(
                                f"{upload.name}: use images at least 64×64, at most 10,000 px per side and 20 megapixels."
                            )
                        if getattr(check, "n_frames", 1) != 1:
                            raise ValidationError(
                                "Animated images are not supported. Upload a single photograph."
                            )
                        check.verify()
                    upload.seek(0)
                    with Image.open(upload) as source:
                        image = ImageOps.exif_transpose(source).convert("RGB")
                        output = io.BytesIO()
                        image.save(output, format="JPEG", quality=92)
                        cleaned.append(
                            {
                                "file": ContentFile(
                                    output.getvalue(), name="photo.jpg"
                                ),
                                "name": PurePath(upload.name.replace("\\", "/")).name[
                                    :255
                                ],
                                "width": image.width,
                                "height": image.height,
                            }
                        )
            except (
                UnidentifiedImageError,
                OSError,
                ValueError,
                Image.DecompressionBombError,
                Image.DecompressionBombWarning,
            ) as exc:
                raise ValidationError(
                    f"{upload.name}: invalid or unsafe image. Upload a valid JPEG or PNG."
                ) from exc
        return cleaned


class UploadForm(forms.Form):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["images"].widget.attrs[
            "data-max-total-bytes"
        ] = settings.PHOTO_MAX_BATCH_BYTES

    images = MultipleImageField(
        label="Inspection photographs",
        widget=MultipleFileInput(attrs={"accept": "image/jpeg,image/png"}),
    )
    caption = forms.CharField(
        max_length=300,
        required=False,
        help_text="Applied to all photographs in this batch.",
    )


class AnnotationForm(forms.ModelForm):
    class Meta:
        model = Annotation
        fields = [
            "x",
            "y",
            "width",
            "height",
            "category",
            "severity",
            "observation",
            "recommendation",
        ]
        widgets = {
            "x": forms.HiddenInput(),
            "y": forms.HiddenInput(),
            "width": forms.HiddenInput(),
            "height": forms.HiddenInput(),
            "observation": forms.Textarea(
                attrs={
                    "rows": 4,
                    "placeholder": "Describe only what is visible in the photograph…",
                }
            ),
            "recommendation": forms.Textarea(
                attrs={
                    "rows": 3,
                    "placeholder": "Describe the recommended engineering follow-up…",
                }
            ),
        }


class SubmitForm(forms.Form):
    version = forms.IntegerField(min_value=0, widget=forms.HiddenInput())
    no_visible_defects = forms.BooleanField(
        required=False, label="No visible defects observed in the supplied photographs"
    )


class ReviewForm(forms.Form):
    version = forms.IntegerField(min_value=0, widget=forms.HiddenInput())
    decision = forms.ChoiceField(
        choices=[("approve", "Approve inspection"), ("changes", "Request changes")]
    )
    comment = forms.CharField(
        required=False,
        max_length=20000,
        widget=forms.Textarea(
            attrs={
                "rows": 4,
                "placeholder": "Record your review and any required changes…",
            }
        ),
    )

    def clean(self):
        cleaned = super().clean()
        if (
            cleaned.get("decision") == "changes"
            and not cleaned.get("comment", "").strip()
        ):
            self.add_error(
                "comment", "Explain the changes the inspector needs to make."
            )
        return cleaned
