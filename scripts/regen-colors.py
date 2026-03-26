#!/usr/bin/env python3
"""Regenerate color swatch images WITHOUT text labels and re-upload to GCS."""

import os, json
from PIL import Image, ImageDraw

# ── Config ────────────────────────────────────────────────────────────────────
GCS_BUCKET      = os.environ.get('GCS_BUCKET', 'study-room-images')
GCS_CREDS_PATH  = os.environ.get('GCS_CREDENTIALS_PATH')
OUTPUT_DIR      = '/tmp/color_swatches_plain'
IMG_W, IMG_H    = 400, 300

os.makedirs(OUTPUT_DIR, exist_ok=True)

COLOR_MAP = {
    'red':        '#E53935',
    'blue':       '#1E88E5',
    'green':      '#43A047',
    'yellow':     '#FDD835',
    'orange':     '#FB8C00',
    'purple':     '#8E24AA',
    'pink':       '#E91E8C',
    'brown':      '#6D4C41',
    'black':      '#212121',
    'white':      '#F5F5F5',
    'gray':       '#757575',
    'gold':       '#FFB300',
    'silver':     '#90A4AE',
    'turquoise':  '#00897B',
    'crimson':    '#C62828',
    'magenta':    '#AD1457',
    'chartreuse': '#7CB342',
}

def generate_swatch(color_name: str, hex_color: str) -> str:
    """Create a plain solid color rectangle, no text. Returns file path."""
    img = Image.new('RGB', (IMG_W, IMG_H), hex_color)

    # Add a subtle rounded feel via a thin border in a slightly darker shade
    draw = ImageDraw.Draw(img)
    r, g, b = img.getpixel((IMG_W // 2, IMG_H // 2))
    border_color = (max(0, r - 30), max(0, g - 30), max(0, b - 30))
    draw.rectangle([0, 0, IMG_W - 1, IMG_H - 1], outline=border_color, width=6)

    path = os.path.join(OUTPUT_DIR, f'{color_name}.jpg')
    img.save(path, 'JPEG', quality=90)
    print(f'  ✅ Generated {color_name}.jpg  ({hex_color})')
    return path

def upload_to_gcs(local_path: str, color_name: str):
    from google.cloud import storage
    client = storage.Client.from_service_account_json(GCS_CREDS_PATH)
    bucket = client.bucket(GCS_BUCKET)
    blob = bucket.blob(f'generated/colors/{color_name}.jpg')
    blob.upload_from_filename(local_path, content_type='image/jpeg')
    print(f'  ☁️  Uploaded {color_name}.jpg → gs://{GCS_BUCKET}/generated/colors/{color_name}.jpg')

# ── Main ──────────────────────────────────────────────────────────────────────
print(f'🎨 Generating {len(COLOR_MAP)} plain color swatches (no text)…')
for name, hex_col in COLOR_MAP.items():
    path = generate_swatch(name, hex_col)
    if GCS_CREDS_PATH:
        upload_to_gcs(path, name)
    else:
        print(f'  ⚠️  GCS_CREDENTIALS_PATH not set — skipping upload for {name}')

print('\n✅ All done! Color swatches regenerated without text labels.')
print(f'   Files saved to: {OUTPUT_DIR}')
