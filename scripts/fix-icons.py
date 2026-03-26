#!/usr/bin/env python3
"""
Fix Android adaptive icon assets so they work correctly on all device shapes
(Samsung square, Pixel circle, rounded square, etc.)

Problems found:
  1. icon-background.png has ~49% transparent pixels → shows black on circle-masked devices
  2. Foreground content may need more conservative safe-zone padding

Outputs (saved alongside originals with suffix _fixed):
  assets/icon-background-fixed.png  — fully opaque, safe on any mask shape
  assets/icon-foreground-fixed.png  — content in conservative 60% safe zone
  assets/icon-monocrhome-fixed.png  — monochrome version (same padding fix)
  assets/icon-fixed.png             — solid-bg square icon for app.json "icon" field
"""

from PIL import Image, ImageDraw
import numpy as np
import os, sys

ASSETS = os.path.join(os.path.dirname(__file__), '..', 'assets')
SIZE   = 1024   # output canvas size

def path(name):
    return os.path.join(ASSETS, name)

# ── 1. Fix background: fill transparent areas with dominant background color ──
print("🖼️  Fixing icon-background.png …")
bg_orig = Image.open(path('icon-background.png')).convert('RGBA')
bg_arr  = np.array(bg_orig)

# Dominant opaque color: sample the four corners (they're opaque per our check)
corner_colors = [
    bg_arr[0, 0, :3],
    bg_arr[0, -1, :3],
    bg_arr[-1, 0, :3],
    bg_arr[-1, -1, :3],
]
fill_color = tuple(int(c) for c in np.mean(corner_colors, axis=0).astype(int)) + (255,)
print(f"   Fill color (from corners): RGBA{fill_color}")

# Create solid background then paste the original on top
bg_fixed = Image.new('RGBA', (SIZE, SIZE), fill_color)
bg_fixed.paste(bg_orig, (0, 0), bg_orig)  # use original alpha as mask
bg_fixed = bg_fixed.convert('RGB')  # background must be opaque (no alpha)
bg_fixed.save(path('icon-background-fixed.png'))
print(f"   ✅  Saved icon-background-fixed.png (fully opaque)")

# ── 2. Fix foreground: ensure content stays within conservative safe zone ─────
# Android safe zone = inner 66.6% of the canvas (72/108 dp)
# We use 60% to be safe across all Expo/device versions
print("\n🖼️  Fixing icon-foreground.png …")
fg_orig = Image.open(path('icon-foreground.png')).convert('RGBA')
fg_arr  = np.array(fg_orig)

# Find tight bounding box of non-transparent content
alpha = fg_arr[:, :, 3]
rows  = np.any(alpha > 10, axis=1)
cols  = np.any(alpha > 10, axis=0)
rmin, rmax = int(np.where(rows)[0][0]),  int(np.where(rows)[0][-1])
cmin, cmax = int(np.where(cols)[0][0]),  int(np.where(cols)[0][-1])

content_w = cmax - cmin
content_h = rmax - rmin
print(f"   Content bounding box: {content_w}×{content_h} px  (was at {cmin},{rmin}→{cmax},{rmax})")

# Target: content fits inside 60% of canvas = 614 px
target_pct = 0.60
target_px   = int(SIZE * target_pct)
scale       = min(target_px / content_w, target_px / content_h)
new_w       = int(content_w * scale)
new_h       = int(content_h * scale)
print(f"   Scaling content to {new_w}×{new_h} (fits in {target_px}px safe zone)")

# Crop to content, resize, center on transparent canvas
content_crop = fg_orig.crop((cmin, rmin, cmax, rmax))
content_scaled = content_crop.resize((new_w, new_h), Image.LANCZOS)

fg_fixed = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
x_off = (SIZE - new_w) // 2
y_off = (SIZE - new_h) // 2
fg_fixed.paste(content_scaled, (x_off, y_off), content_scaled)
fg_fixed.save(path('icon-foreground-fixed.png'))
print(f"   ✅  Saved icon-foreground-fixed.png  (content at {x_off},{y_off}, {scale:.2f}× scale)")

# ── 3. Fix monochrome icon (same padding treatment) ────────────────────────────
print("\n🖼️  Fixing icon-monocrhome.png …")
mono_orig = Image.open(path('icon-monocrhome.png')).convert('RGBA')
mono_arr  = np.array(mono_orig)
alpha_m   = mono_arr[:, :, 3]
rows_m    = np.any(alpha_m > 10, axis=1)
cols_m    = np.any(alpha_m > 10, axis=0)
rmin_m, rmax_m = int(np.where(rows_m)[0][0]), int(np.where(rows_m)[0][-1])
cmin_m, cmax_m = int(np.where(cols_m)[0][0]), int(np.where(cols_m)[0][-1])

cw_m = cmax_m - cmin_m
ch_m = rmax_m - rmin_m
scale_m = min(target_px / cw_m, target_px / ch_m)
nw_m    = int(cw_m * scale_m)
nh_m    = int(ch_m * scale_m)

crop_m   = mono_orig.crop((cmin_m, rmin_m, cmax_m, rmax_m))
scaled_m = crop_m.resize((nw_m, nh_m), Image.LANCZOS)
mono_fixed = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
mono_fixed.paste(scaled_m, ((SIZE - nw_m) // 2, (SIZE - nh_m) // 2), scaled_m)
mono_fixed.save(path('icon-monocrhome-fixed.png'))
print(f"   ✅  Saved icon-monocrhome-fixed.png")

# ── 4. Create solid app icon (for app.json "icon" field) ─────────────────────
# This is shown in notification trays and app stores — needs solid background
print("\n🖼️  Creating icon-fixed.png (solid background + centered logo) …")
icon_solid = Image.new('RGBA', (SIZE, SIZE), fill_color)
icon_solid.paste(content_scaled, (x_off, y_off), content_scaled)
icon_solid = icon_solid.convert('RGB')
icon_solid.save(path('icon-fixed.png'))
print(f"   ✅  Saved icon-fixed.png")

# ── 5. Preview: show safe-zone overlay on foreground ──────────────────────────
print("\n📐  Safe-zone diagram:")
print(f"   Canvas:         {SIZE}×{SIZE} px")
print(f"   Android safe zone (66.6%): {int(SIZE*0.666)}×{int(SIZE*0.666)} px (inner)")
print(f"   Our safe zone   (60%):     {target_px}×{target_px} px (inner)")
print(f"   Content placed: {new_w}×{new_h} px at offset ({x_off}, {y_off})")
padding_side = x_off
print(f"   Side padding:   {padding_side}px = {padding_side/SIZE*100:.1f}% of canvas")
print()
print("✅  All done! Update app.json to use the *-fixed.png versions:")
print('   "icon": "./assets/icon-fixed.png"')
print('   "foregroundImage": "./assets/icon-foreground-fixed.png"')
print('   "backgroundImage": "./assets/icon-background-fixed.png"')
print('   "monochromeImage": "./assets/icon-monocrhome-fixed.png"')
