"""Apply the website's exact logo mark and wordmark to a chat screenshot.

Source of the mark: ../dist/logo.svg (64x64 viewBox). Keep this geometry and
the wordmark in sync with the site's header when the site branding changes.
The watermark always occupies 66% of the screenshot width and is centered.
"""

from pathlib import Path
import sys
from PIL import Image, ImageDraw, ImageFont

if len(sys.argv) != 3:
    raise SystemExit("Usage: watermark_chat.py INPUT OUTPUT")

source = Path(sys.argv[1])
destination = Path(sys.argv[2])
root = Path(__file__).resolve().parent.parent
logo_svg = (root / "dist" / "logo.svg").read_text(encoding="utf-8")
for token in ('viewBox="0 0 64 64"', '#102a43', '#78e3d2', 'm15 22 9-7 9 3 15-9'):
    if token not in logo_svg:
        raise RuntimeError("The site logo changed; update watermark_chat.py first")

photo = Image.open(source).convert("RGBA")
factor = 4
# Work at four times the final watermark resolution for clean edges.
mark_w = round(photo.width * 0.66)
mark_h = round(mark_w * 68 / 245)
layer = Image.new("RGBA", (mark_w * factor, mark_h * factor), (0, 0, 0, 0))
draw = ImageDraw.Draw(layer)

icon = round(mark_h * 0.92)
scale = icon * factor / 64
def pt(x, y): return (round(x * scale), round(y * scale))
def stroke(points, color, width):
    draw.line([pt(*xy) for xy in points], fill=color, width=max(1, round(width * scale)), joint="curve")
    radius = max(1, round(width * scale / 2))
    for x, y in (points[0], points[-1]):
        cx, cy = pt(x, y)
        draw.ellipse((cx-radius, cy-radius, cx+radius, cy+radius), fill=color)

draw.rounded_rectangle((0, 0, icon*factor, icon*factor), radius=round(15*scale), fill="#102a43")
stroke([(13,47),(51,47)], "#9fded4", 2)
for left, top in ((16,34),(28,27),(40,19)):
    stroke([(left,43),(left,top),(left+9,top),(left+9,43)], "#78e3d2", 4)
stroke([(15,22),(24,15),(33,18),(48,9)], "#ffffff", 3)
cx, cy = pt(48,9)
r = round(3*scale)
draw.ellipse((cx-r,cy-r,cx+r,cy+r), fill="#ffffff")

font_path = r"C:\Windows\Fonts\NotoSansKR-VF.ttf"
title = ImageFont.truetype(font_path, round(31 * mark_h / 68 * factor))
title.set_variation_by_axes([900])
subtitle = ImageFont.truetype(font_path, round(9 * mark_h / 68 * factor))
subtitle.set_variation_by_axes([700])
text_x = icon*factor + round(12 * mark_h / 68 * factor)
draw.text((text_x, round(1 * mark_h / 68 * factor)), "정수멘토", font=title, fill="#102a43")
draw.text((text_x+round(1*factor), round(48 * mark_h / 68 * factor)), "JUNGSOO MENTOR", font=subtitle, fill="#102a43")

layer = layer.resize((mark_w, mark_h), Image.Resampling.LANCZOS)
layer.putalpha(layer.getchannel("A").point(lambda alpha: round(alpha * 0.29)))
x = (photo.width - mark_w) // 2
y = (photo.height - mark_h) // 2
photo.alpha_composite(layer, (x, y))
destination.parent.mkdir(parents=True, exist_ok=True)
photo.convert("RGB").save(destination, optimize=True)
print(f"{destination} ({photo.width}x{photo.height}; watermark {mark_w}x{mark_h} at {x},{y})")

