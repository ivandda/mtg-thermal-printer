"""Regenerate the Brother QL golden files with brother_ql, the reference implementation.

    uv run --with brother_ql_next test/fixtures/brother-ql/generate.py
"""

import logging
from pathlib import Path

from brother_ql.conversion import convert
from brother_ql.raster import BrotherQLRaster
from PIL import Image

logging.disable(logging.WARNING)  # brother_ql warns about a mode command the QL-700 doesn't use

HERE = Path(__file__).parent


def pattern(width, height, shift=0):
    """Same asymmetric pattern as test/brother-ql/raster.test.js, so mirroring or offset bugs change bytes."""
    image = Image.new("L", (width, height), 255)
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            if x < 4 or y < 4 or (x * 7 + y * 13 + shift) % 17 < 5:
                pixels[x, y] = 0
    return image


JOBS = {
    "62x29.bin": ("62x29", [pattern(696, 271)]),
    "62x29-two-pages.bin": ("62x29", [pattern(696, 271), pattern(696, 271, shift=5)]),
    "62-continuous.bin": ("62", [pattern(696, 150)]),
}

for filename, (label, pages) in JOBS.items():
    data = convert(BrotherQLRaster("QL-700"), pages, label, rotate="0", threshold=70, cut=True)
    (HERE / filename).write_bytes(data)
    print(f"{filename}: {len(data)} bytes")
