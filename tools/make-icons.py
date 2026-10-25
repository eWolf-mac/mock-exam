"""生成应用图标（Pillow）。运行：python tools/make-icons.py"""
from PIL import Image, ImageDraw
import math
import os

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web", "icons")
os.makedirs(OUT, exist_ok=True)

SS = 4  # 超采样倍数
BASE = 1024
S = BASE * SS

BG = (11, 15, 20)
GREEN = (61, 220, 151)
INK = (232, 238, 245)
RED = (255, 92, 92)
DIM = (94, 107, 122)


def pt(cx, cy, r, deg):
    a = math.radians(deg - 90)  # 0 度指向 12 点
    return (cx + r * math.cos(a), cy + r * math.sin(a))


def hand(draw, cx, cy, deg, length, width, color):
    x, y = pt(cx, cy, length, deg)
    draw.line([(cx, cy), (x, y)], fill=color, width=width)
    draw.ellipse([x - width / 2, y - width / 2, x + width / 2, y + width / 2], fill=color)


img = Image.new("RGB", (S, S), BG)
d = ImageDraw.Draw(img)

cx = cy = S / 2
# 背景微光
glow = Image.new("L", (S, S), 0)
gd = ImageDraw.Draw(glow)
gd.ellipse([cx - S * 0.52, cy - S * 0.52, cx + S * 0.52, cy + S * 0.52], fill=40)
img.paste(Image.new("RGB", (S, S), (20, 60, 46)), (0, 0), glow)

d = ImageDraw.Draw(img)
ring = S * 0.40
d.ellipse([cx - ring, cy - ring, cx + ring, cy + ring], outline=GREEN, width=int(S * 0.022))

# 12 个刻度
for i in range(12):
    major = i % 3 == 0
    r1 = ring * (0.80 if major else 0.855)
    r2 = ring * 0.925
    x1, y1 = pt(cx, cy, r1, i * 30)
    x2, y2 = pt(cx, cy, r2, i * 30)
    d.line([(x1, y1), (x2, y2)], fill=INK if major else DIM, width=int(S * (0.016 if major else 0.009)))

# 指针：9:00（时针指向左，分针指向 12）
hand(d, cx, cy, 270, ring * 0.48, int(S * 0.030), INK)
hand(d, cx, cy, 0, ring * 0.70, int(S * 0.022), INK)
d.ellipse([cx - S * 0.019, cy - S * 0.019, cx + S * 0.019, cy + S * 0.019], fill=GREEN)

for size, name in [
    (1024, "icon-1024.png"),
    (512, "icon-512.png"),
    (192, "icon-192.png"),
    (180, "apple-touch-icon-180.png"),
    (32, "favicon-32.png"),
]:
    icon = img.resize((size, size), Image.LANCZOS)
    icon.save(os.path.join(OUT, name), "PNG", optimize=True)
    print("wrote", name, size)
