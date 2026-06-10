"""Textures for the Nexarch medieval-cyberpunk building kit."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(42)

CYAN = (90, 240, 225)
MAGENTA = (215, 105, 255)
ORANGE = (255, 165, 80)


def jitter(c, amt):
    return tuple(max(0, min(255, v + random.randint(-amt, amt))) for v in c)


def make_stone(path, size=512):
    img = Image.new("RGB", (size, size), (58, 64, 80))
    d = ImageDraw.Draw(img)
    row_h = 40
    y = 0
    row = 0
    while y < size:
        x = -random.randint(0, 40) if row % 2 else 0
        while x < size:
            w = random.randint(52, 96)
            col = jitter((74, 82, 102), 8)
            d.rectangle((x + 2, y + 2, x + w - 2, y + row_h - 2), fill=col)
            # weathering speckle
            for _ in range(6):
                px = random.randint(x + 4, max(x + 5, x + w - 4))
                py = random.randint(y + 4, y + row_h - 4)
                if 0 <= px < size and 0 <= py < size:
                    d.point((px, py), fill=jitter(col, 14))
            x += w
        y += row_h
        row += 1
    img = img.filter(ImageFilter.GaussianBlur(0.7))
    img.save(path)


def make_roof(path, size=512):
    img = Image.new("RGB", (size, size), (36, 42, 56))
    d = ImageDraw.Draw(img)
    sh_w, sh_h = 64, 38
    y = 0
    row = 0
    while y < size + sh_h:
        x = -sh_w // 2 if row % 2 else 0
        while x < size:
            col = jitter((54, 62, 78), 6)
            d.rectangle((x + 1, y, x + sh_w - 1, y + sh_h), fill=col)
            d.line((x + 1, y + sh_h, x + sh_w - 1, y + sh_h), fill=(22, 26, 36), width=3)
            d.line((x + 1, y + sh_h - 4, x + sh_w - 1, y + sh_h - 4),
                   fill=jitter((86, 98, 118), 6), width=2)
            x += sh_w
        y += sh_h
        row += 1
    # rare teal moss
    for _ in range(10):
        x, y = random.randrange(size), random.randrange(size)
        d.ellipse((x, y, x + random.randint(8, 20), y + random.randint(5, 10)),
                  fill=(30, 52, 50))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(path)


def make_timber(path, size=256):
    img = Image.new("RGB", (size, size), (50, 40, 28))
    d = ImageDraw.Draw(img)
    for x in range(0, size, 64):
        col = jitter((64, 52, 36), 6)
        d.rectangle((x + 2, 0, x + 62, size), fill=col)
        for _ in range(5):
            gx = x + random.randint(8, 56)
            d.line((gx, 0, gx + random.randint(-6, 6), size),
                   fill=jitter((40, 32, 22), 5), width=2)
    img.save(path)


def circuit_window(path, color, w=256, h=384):
    """Arched window filled with glowing circuit traces — the signature look."""
    img = Image.new("RGB", (w, h), (4, 5, 8))
    d = ImageDraw.Draw(img)
    glow = tuple(int(c * 0.35) for c in color)
    dim = tuple(int(c * 0.7) for c in color)
    # arch outline
    m = 22
    d.arc((m, m, w - m, int(w * 0.9)), 180, 360, fill=color, width=10)
    d.line((m, int(w * 0.45) + m, m, h - m), fill=color, width=10)
    d.line((w - m, int(w * 0.45) + m, w - m, h - m), fill=color, width=10)
    d.line((m, h - m, w - m, h - m), fill=color, width=10)
    # circuit traces inside
    for _ in range(26):
        x = random.randint(m + 18, w - m - 18)
        y = random.randint(m + 30, h - m - 14)
        pts = [(x, y)]
        for _ in range(random.randint(2, 4)):
            axis = random.random() < 0.5
            step = random.choice([-1, 1]) * random.randint(14, 44)
            x, y = (x + step, y) if axis else (x, y + step)
            x = max(m + 14, min(w - m - 14, x))
            y = max(m + 26, min(h - m - 12, y))
            pts.append((x, y))
        d.line(pts, fill=glow, width=9)
        d.line(pts, fill=random.choice([color, dim]), width=3)
        ex, ey = pts[-1]
        d.ellipse((ex - 5, ey - 5, ex + 5, ey + 5), outline=color, width=3)
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    img.save(path)


def make_panel(path, size=512):
    """Neon 'data panel' roof plate — dark glass grid with glowing traces."""
    img = Image.new("RGB", (size, size), (8, 14, 24))
    d = ImageDraw.Draw(img)
    # glass cells
    for gx in range(0, size, 128):
        for gy in range(0, size, 170):
            d.rectangle((gx + 8, gy + 8, gx + 120, gy + 162), fill=(12, 22, 38))
            for _ in range(14):  # starfield speckle in the glass
                px, py = gx + random.randint(12, 116), gy + random.randint(12, 158)
                d.point((px, py), fill=(120, 200, 220))
    # grid lines
    for gx in range(0, size + 1, 128):
        d.line((gx, 0, gx, size), fill=(60, 200, 190), width=5)
    for gy in range(0, size + 1, 170):
        d.line((0, gy, size, gy), fill=(60, 200, 190), width=5)
    # magenta circuit overlay
    for _ in range(8):
        x, y = random.randrange(size), random.randrange(size)
        pts = [(x, y)]
        for _ in range(3):
            axis = random.random() < 0.5
            step = random.choice([-1, 1]) * random.randint(30, 90)
            x, y = (x + step, y) if axis else (x, y + step)
            pts.append((x, y))
        d.line(pts, fill=(150, 70, 180), width=4)
    d.rectangle((0, 0, size - 1, size - 1), outline=(70, 220, 205), width=8)
    img = img.filter(ImageFilter.GaussianBlur(0.8))
    img.save(path)


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/citybuild"
    make_stone(out + "/stone.png")
    make_roof(out + "/roof.png")
    make_timber(out + "/timber.png")
    circuit_window(out + "/win_cyan.png", CYAN)
    circuit_window(out + "/win_magenta.png", MAGENTA)
    circuit_window(out + "/win_orange.png", ORANGE)
    make_panel(out + "/panel.png")
    print("kit textures done")
