import csv
import io
from html import escape
from pathlib import Path

from django.http import HttpResponse
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Image as PDFImage,
    KeepTogether,
    PageBreak,
)
import reportlab
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# Embed the licensed fonts bundled with ReportLab so PDFs render consistently
# on machines that do not have Helvetica or a configured font substitute.
FONT_ROOT = Path(reportlab.__file__).resolve().parent / "fonts"
for name, filename in [
    ("AssetSans", "Vera.ttf"),
    ("AssetSans-Bold", "VeraBd.ttf"),
    ("AssetSans-Italic", "VeraIt.ttf"),
    ("AssetSans-BoldItalic", "VeraBI.ttf"),
]:
    pdfmetrics.registerFont(TTFont(name, str(FONT_ROOT / filename)))
pdfmetrics.registerFontFamily(
    "AssetSans",
    normal="AssetSans",
    bold="AssetSans-Bold",
    italic="AssetSans-Italic",
    boldItalic="AssetSans-BoldItalic",
)

DISCLAIMER = "Independent portfolio demonstration. Findings are based on supplied visual evidence and require appropriate engineering verification. This report does not certify structural integrity or compliance with inspection standards."
SEVERITY_COLORS = {"low": "#157d73", "medium": "#a36605", "high": "#c63541"}


def safe_csv(value):
    text = str(value)
    # Ignore leading whitespace/control characters when checking spreadsheet formulas.
    if text.lstrip(" \t\r\n\v\f").startswith(("=", "+", "-", "@")) or text.startswith(
        ("\t", "\r", "\n")
    ):
        return "'" + text
    return text


def csv_response(inspection):
    response = HttpResponse(content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = 'attachment; filename="inspection-findings.csv"'
    writer = csv.writer(response)
    writer.writerow(
        [
            "Inspection",
            "Finding",
            "Photograph",
            "Category",
            "Preliminary severity",
            "Observation",
            "Recommended follow-up",
        ]
    )
    for finding in inspection.findings.select_related("photo"):
        writer.writerow(
            [
                safe_csv(v)
                for v in [
                    inspection.reference,
                    finding.reference,
                    finding.photo.original_filename,
                    finding.get_category_display(),
                    finding.get_severity_display(),
                    finding.observation,
                    finding.recommendation,
                ]
            ]
        )
    return response


def annotated_image(photo):
    with photo.image.open("rb") as file:
        image = Image.open(file).convert("RGB")
        image.thumbnail((1800, 1800))
    draw = ImageDraw.Draw(image)
    font_size = max(14, image.width // 48)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", font_size)
    except OSError:
        font = ImageFont.load_default(size=font_size)
    for finding in photo.annotations.all():
        x, y = round(finding.x * image.width), round(finding.y * image.height)
        right = round((finding.x + finding.width) * image.width)
        bottom = round((finding.y + finding.height) * image.height)
        color = SEVERITY_COLORS[finding.severity]
        draw.rectangle(
            (x, y, right, bottom), outline=color, width=max(3, image.width // 350)
        )
        label = f"{finding.reference} · {finding.get_severity_display()}"
        box = draw.textbbox((0, 0), label, font=font)
        label_width = box[2] + 12
        label_x = max(0, min(x, image.width - label_width))
        label_y = max(0, y - font_size - 14)
        draw.rectangle(
            (label_x, label_y, label_x + label_width, label_y + font_size + 12),
            fill=color,
        )
        draw.text((label_x + 6, label_y + 3), label, font=font, fill="white")
    output = io.BytesIO()
    image.save(output, format="PNG")
    output.seek(0)
    return output, image.size


def pdf_response(inspection):
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=(595.28, 841.89),
        rightMargin=44,
        leftMargin=44,
        topMargin=48,
        bottomMargin=54,
        title=f"AssetInspect | {inspection.reference}",
        author="AssetInspect",
    )
    styles = getSampleStyleSheet()
    for style in styles.byName.values():
        if not hasattr(style, "fontName"):
            continue
        bold = "Bold" in style.fontName
        italic = "Oblique" in style.fontName or "Italic" in style.fontName
        style.fontName = "AssetSans" + (
            "-BoldItalic"
            if bold and italic
            else "-Bold" if bold else "-Italic" if italic else ""
        )
    styles.add(
        ParagraphStyle(
            name="Brand",
            fontName="AssetSans-Bold",
            fontSize=23,
            leading=30,
            textColor=colors.HexColor("#123743"),
            spaceAfter=8,
        )
    )
    styles.add(
        ParagraphStyle(
            name="Warning",
            fontName="AssetSans-Bold",
            fontSize=13,
            leading=20,
            textColor=colors.HexColor("#b63240"),
            spaceAfter=12,
        )
    )
    styles.add(
        ParagraphStyle(
            name="SmallPrint",
            fontName="AssetSans",
            fontSize=8,
            leading=12,
            textColor=colors.HexColor("#526574"),
            spaceAfter=8,
        )
    )
    styles["BodyText"].leading = 15
    styles["BodyText"].spaceAfter = 9
    styles["Heading2"].textColor = colors.HexColor("#087e76")
    styles["Heading2"].spaceBefore = 16

    def paragraph(text, style="BodyText"):
        return Paragraph(escape(str(text)).replace("\n", "<br/>"), styles[style])

    story = [
        paragraph("AssetInspect", "Brand"),
        paragraph("VISUAL INFRASTRUCTURE INSPECTION", "SmallPrint"),
    ]
    if inspection.status != "approved":
        story.append(paragraph("DRAFT — NOT APPROVED", "Warning"))
    story.extend(
        [
            paragraph(f"Inspection {inspection.reference}", "Heading1"),
            paragraph(
                f"Status: {inspection.get_status_display()} · Inspection date: {inspection.inspection_date:%d %B %Y}"
            ),
            paragraph("Asset & scope", "Heading2"),
            paragraph(f"{inspection.asset.identifier} — {inspection.asset.name}"),
            paragraph(
                f"Type: {inspection.asset.get_asset_type_display()} | Location: {inspection.asset.location}"
            ),
            paragraph(inspection.asset.description),
            paragraph(
                f"Inspector: {inspection.inspector.get_full_name() or inspection.inspector.username}"
            ),
            paragraph(inspection.scope),
            paragraph(inspection.general_notes),
            paragraph("Finding summary", "Heading2"),
            paragraph(
                f"{inspection.photos.count()} photographs · {inspection.findings.count()} manually recorded findings"
            ),
        ]
    )
    if inspection.no_visible_defects:
        story.append(
            paragraph(
                "No visible defects observed in the supplied photographs. This statement does not imply the entire asset is defect-free."
            )
        )
    for severity in ("high", "medium", "low"):
        count = inspection.findings.filter(severity=severity).count()
        story.append(paragraph(f"{severity.title()} preliminary severity: {count}"))
    story.extend(
        [paragraph("Limitations", "Heading2"), paragraph(DISCLAIMER, "SmallPrint")]
    )
    # Each photograph gets room for a legible image; long findings flow naturally across pages.
    for index, photo in enumerate(inspection.photos.prefetch_related("annotations"), 1):
        story.append(PageBreak())
        story.append(paragraph(f"Photograph {index}", "Heading2"))
        story.append(paragraph(photo.caption or photo.original_filename))
        data, (width, height) = annotated_image(photo)
        scale = min(doc.width / width, 345 / height)
        story.append(PDFImage(data, width=width * scale, height=height * scale))
        story.append(Spacer(1, 14))
        for finding in photo.annotations.all():
            story.append(
                KeepTogether(
                    [
                        paragraph(
                            f"{finding.reference} — {finding.get_category_display()}",
                            "Heading3",
                        ),
                        paragraph(
                            f"Preliminary severity: {finding.get_severity_display()}"
                        ),
                    ]
                )
            )
            story.append(paragraph(f"Observation: {finding.observation}"))
            story.append(paragraph(f"Recommended follow-up: {finding.recommendation}"))
    story.append(paragraph("Review & audit history", "Heading2"))
    for event in inspection.events.select_related("actor").order_by("created_at", "pk"):
        story.append(
            paragraph(
                f"{event.created_at:%d %b %Y %H:%M UTC} · {event.actor.get_full_name() or event.actor.username} · {event.action}",
                "Heading4",
            )
        )
        if event.previous_status or event.new_status:
            story.append(
                paragraph(
                    f"{event.previous_status} to {event.new_status}", "SmallPrint"
                )
            )
        if event.comment:
            story.append(paragraph(event.comment))
    story.append(paragraph(DISCLAIMER, "SmallPrint"))

    def footer(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#dce5e9"))
        canvas.line(44, 42, 551, 42)
        canvas.setFont("AssetSans", 8)
        canvas.setFillColor(colors.HexColor("#526574"))
        canvas.drawString(44, 28, "AssetInspect | Independent portfolio demonstration")
        canvas.drawRightString(551, 28, f"Page {document.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    response = HttpResponse(buffer.getvalue(), content_type="application/pdf")
    response["Content-Disposition"] = 'attachment; filename="inspection-report.pdf"'
    return response
