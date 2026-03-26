#!/usr/bin/env python3
"""Regenerate number card images showing large numerals (not colored circles) and upload to GCS."""

import os
from PIL import Image, ImageDraw, ImageFont

GCS_BUCKET     = os.environ.get('GCS_BUCKET', 'study-room-images')
GCS_CREDS_PATH = os.environ.get('GCS_CREDENTIALS_PATH')
OUTPUT_DIR     = '/tmp/number_cards'
IMG_W, IMG_H   = 400, 300

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Each number: (display numeral, background color, text color)
NUMBER_MAP = {
    'zero':     ('0',   '#E3F2FD', '#1565C0'),
    'one':      ('1',   '#FFF8E1', '#E65100'),
    'two':      ('2',   '#F3E5F5', '#6A1B9A'),
    'three':    ('3',   '#E8F5E9', '#2E7D32'),
    'four':     ('4',   '#FBE9E7', '#BF360C'),
    'five':     ('5',   '#E0F7FA', '#00695C'),
    'six':      ('6',   '#FFF3E0', '#E65100'),
    'seven':    ('7',   '#EDE7F6', '#4527A0'),
    'eight':    ('8',   '#FFEBEE', '#C62828'),
    'nine':     ('9',   '#F9FBE7', '#558B2F'),
    'ten':      ('10',  '#E8EAF6', '#283593'),
    'eleven':   ('11',  '#FCE4EC', '#880E4F'),
    'twelve':   ('12',  '#F1F8E9', '#33691E'),
    'twenty':   ('20',  '#FFF9C4', '#F57F17'),
    'fifty':    ('50',  '#E0F2F1', '#004D40'),
    'hundred':  ('100', '#E8F5E9', '#1B5E20'),
    'thousand': ('1K',  '#EDE7F6', '#311B92'),
}

def find_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    """Try common system font paths; fall back to default."""
    candidates = [
        '/System/Library/Fonts/Helvetica.ttc',
        '/System/Library/Fonts/Arial.ttf',
        '/Library/Fonts/Arial.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf',
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()

def generate_number_card(word: str, numeral: str, bg: str, fg: str) -> str:
    img  = Image.new('RGB', (IMG_W, IMG_H), bg)
    draw = ImageDraw.Draw(img)

    # Subtle rounded border
    r_int = tuple(max(0, c - 20) for c in img.getpixel((IMG_W // 2, IMG_H // 2)))
    draw.rectangle([0, 0, IMG_W - 1, IMG_H - 1], outline=r_int, width=5)

    # Large numeral — try big font then shrink if needed
    font_size = 160 if len(numeral) == 1 else (120 if len(numeral) == 2 else 90)
    font = find_font(font_size)

    # Center the numeral
    bbox = draw.textbbox((0, 0), numeral, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x  = (IMG_W - tw) // 2 - bbox[0]
    y  = (IMG_H - th) // 2 - bbox[1] - 20
    draw.text((x, y), numeral, font=font, fill=fg)

    # Small word label at bottom
    small_font = find_font(26)
    wbbox = draw.textbbox((0, 0), word, font=small_font)
    wx = (IMG_W - (wbbox[2] - wbbox[0])) // 2 - wbbox[0]
    draw.text((wx, IMG_H - 48), word, font=small_font, fill=fg + 'BB' if len(fg) == 7 else fg)

    path = os.path.join(OUTPUT_DIR, f'{word}.jpg')
    img.save(path, 'JPEG', quality=92)
    print(f'  ✅ {word}.jpg  →  numeral "{numeral}" on {bg}')
    return path

def upload_to_gcs(local_path: str, word: str):
    from google.cloud import storage
    client = storage.Client.from_service_account_json(GCS_CREDS_PATH)
    bucket = client.bucket(GCS_BUCKET)
    blob   = bucket.blob(f'generated/numbers/{word}.jpg')
    blob.upload_from_filename(local_path, content_type='image/jpeg')
    print(f'  ☁️  → gs://{GCS_BUCKET}/generated/numbers/{word}.jpg')

print(f'🔢 Generating {len(NUMBER_MAP)} number cards with large numerals…\n')

for name, (numeral, bg, fg) in NUMBER_MAP.items():
    path = generate_number_card(name, numeral, bg, fg)
    if GCS_CREDS_PATH:
        upload_to_gcs(path, name)
    else:
        print(f'  ⚠️  GCS_CREDENTIALS_PATH not set — skipping upload for {name}')

print(f'\n✅ All done! Number cards saved to {OUTPUT_DIR}')
