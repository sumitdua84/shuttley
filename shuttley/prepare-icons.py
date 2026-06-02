"""
Prepares logo-source.png and all PWA icons from Logo.png
Run: python prepare-icons.py
"""
from PIL import Image, ImageEnhance
import os

PUBLIC = r"G:\Shared drives\Shuttley\App\shuttley\public"
SRC    = os.path.join(PUBLIC, "Logo.png")

# App background colour (used as solid base for PWA icons)
APP_BG = (255, 255, 255)   # #ffffff

# How much to darken the logo colours (0.0 = black, 1.0 = original, lower = darker)
LOGO_BRIGHTNESS = 1.0

def remove_white_bg(img, threshold=245):
    """Replace near-white pixels with transparency."""
    img = img.convert("RGBA")
    data = img.getdata()
    new_data = []
    for r, g, b, a in data:
        if r > threshold and g > threshold and b > threshold:
            new_data.append((r, g, b, 0))
        else:
            new_data.append((r, g, b, a))
    img.putdata(new_data)
    return img

def darken_logo(img, factor=LOGO_BRIGHTNESS):
    """Darken only the non-transparent (coloured) pixels."""
    img = img.convert("RGBA")
    r, g, b, a = img.split()
    rgb = Image.merge("RGB", (r, g, b))
    darkened = ImageEnhance.Brightness(rgb).enhance(factor)
    dr, dg, db = darkened.split()
    return Image.merge("RGBA", (dr, dg, db, a))

base = Image.open(SRC).convert("RGBA")
W, H = base.size   # 1536 x 1024

# ── 1. logo-source.png ── transparent bg, square-padded, darkened ────────────
pad = (W - H) // 2
square = Image.new("RGBA", (W, W), (0, 0, 0, 0))
square.paste(base, (0, pad))
logo_sq = square.resize((1000, 1000), Image.LANCZOS)
logo_transparent = remove_white_bg(logo_sq)
logo_dark = darken_logo(logo_transparent)
logo_dark.save(os.path.join(PUBLIC, "logo-source.png"))
print("Saved: logo-source.png  (1000x1000, transparent + darkened)")

# ── 2. icon-source.png ── full badge crop, transparent bg, darkened ──────────
padded_full = Image.new("RGBA", (W, W), (0, 0, 0, 0))
padded_full.paste(base, (0, pad))
icon_crop = padded_full.crop((80, 80, 1456, 1456))    # full badge + breathing room
icon_512_raw = icon_crop.resize((512, 512), Image.LANCZOS)
icon_512 = darken_logo(remove_white_bg(icon_512_raw))
icon_512.save(os.path.join(PUBLIC, "icon-source.png"))
print("Saved: icon-source.png  (512x512, transparent + darkened)")

# ── 3. PWA icon sizes ── solid #6ea6b4 background ────────────────────────────
sizes = {
    "pwa-64x64.png":             64,
    "pwa-192x192.png":          192,
    "pwa-512x512.png":          512,
    "maskable-icon-512x512.png": 512,
    "apple-touch-icon-180x180.png": 180,
}

for fname, sz in sizes.items():
    bg = Image.new("RGBA", (sz, sz), (*APP_BG, 255))
    icon_resized = icon_512.resize((sz, sz), Image.LANCZOS)
    bg.paste(icon_resized, (0, 0), icon_resized)
    bg.convert("RGB").save(os.path.join(PUBLIC, fname), quality=100)
    print(f"Saved: {fname}  ({sz}x{sz})")

# ── 4. favicon.ico ───────────────────────────────────────────────────────────
bg_fav = Image.new("RGBA", (32, 32), (*APP_BG, 255))
fav = icon_512.resize((32, 32), Image.LANCZOS)
bg_fav.paste(fav, (0, 0), fav)
bg_fav.convert("RGB").save(os.path.join(PUBLIC, "favicon.ico"))
print("Saved: favicon.ico  (32x32)")

print("\nAll done. Files in public/:")
for f in sorted(os.listdir(PUBLIC)):
    print(f"  {f}")
