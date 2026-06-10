"""Generate procedural rune textures for the rune-monk character."""
import math
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(77)

GOLD = (235, 185, 80)
BLUE = (80, 130, 255)
RED = (255, 70, 50)


def draw_glyph(d, x, y, size, color):
    """Draw one angular rune glyph inside a cell at (x, y)."""
    s = size
    strokes = []
    # spine
    strokes.append((x, y - s, x, y + s))
    n = random.randint(1, 3)
    for _ in range(n):
        ay = y + random.uniform(-s, s * 0.6)
        dx = random.choice([-1, 1]) * s * random.uniform(0.5, 1.0)
        dy = random.choice([-1, 0, 1]) * s * random.uniform(0.3, 0.8)
        strokes.append((x, ay, x + dx, ay + dy))
    if random.random() < 0.4:
        ay = y + random.uniform(-s * 0.5, s * 0.5)
        strokes.append((x - s * 0.6, ay, x + s * 0.6, ay))
    w = max(2, int(s * 0.22))
    glow = tuple(int(c * 0.45) for c in color)
    for (x1, y1, x2, y2) in strokes:
        d.line((x1, y1, x2, y2), fill=glow, width=w + 4)
    for (x1, y1, x2, y2) in strokes:
        d.line((x1, y1, x2, y2), fill=color, width=w)


def make_cloth(path, size=1024):
    img = Image.new("RGB", (size, size), (8, 8, 10))
    d = ImageDraw.Draw(img)
    # faint weave noise
    for _ in range(900):
        x, y = random.randrange(size), random.randrange(size)
        v = random.randint(10, 18)
        d.rectangle((x, y, x + random.randint(4, 18), y + 1), fill=(v, v, v + 2))
    # scattered runes, mostly gold with blue/red accents
    margin = 40
    for _ in range(60):
        x = random.randint(margin, size - margin)
        y = random.randint(margin, size - margin)
        s = random.randint(14, 34)
        r = random.random()
        color = GOLD if r < 0.62 else (BLUE if r < 0.84 else RED)
        draw_glyph(d, x, y, s, color)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(path)


def make_trim(path, w=1024, h=128):
    img = Image.new("RGB", (w, h), (24, 14, 8))
    d = ImageDraw.Draw(img)
    # border lines
    d.rectangle((0, 4, w, 9), fill=(120, 80, 30))
    d.rectangle((0, h - 10, w, h - 5), fill=(120, 80, 30))
    # row of gold runes
    n = 16
    for i in range(n):
        x = int((i + 0.5) * w / n)
        y = h // 2 + random.randint(-4, 4)
        draw_glyph(d, x, y, random.randint(22, 30), GOLD)
    img = img.filter(ImageFilter.GaussianBlur(0.5))
    img.save(path)


def make_circuit(path, size=512):
    """Circuit-trace pattern for the hood, like the reference back view."""
    img = Image.new("RGB", (size, size), (10, 10, 13))
    d = ImageDraw.Draw(img)
    for _ in range(40):
        x, y = random.randrange(size), random.randrange(size)
        color = random.choice([GOLD, BLUE, RED])
        glow = tuple(int(c * 0.4) for c in color)
        pts = [(x, y)]
        for _ in range(random.randint(2, 5)):
            axis = random.random() < 0.5
            step = random.choice([-1, 1]) * random.randint(20, 70)
            x, y = (x + step, y) if axis else (x, y + step)
            pts.append((x, y))
        d.line(pts, fill=glow, width=6)
        d.line(pts, fill=color, width=2)
        ex, ey = pts[-1]
        d.ellipse((ex - 4, ey - 4, ex + 4, ey + 4), outline=color, width=2)
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(path)


if __name__ == "__main__":
    import sys
    out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/charbuild"
    make_cloth(out + "/runes_cloth.png")
    make_trim(out + "/runes_trim.png")
    make_circuit(out + "/runes_circuit.png")
    print("textures done")
