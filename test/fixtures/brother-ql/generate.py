"""Regenerate the Brother QL golden files with brother_ql, the reference implementation.

    uv run --with brother_ql_next test/fixtures/brother-ql/generate.py
"""

import logging
from pathlib import Path

from brother_ql.conversion import convert
from brother_ql.raster import BrotherQLRaster
from PIL import Image

logging.disable(logging.WARNING)  # brother_ql warns about commands a model doesn't use

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
    "62x29.bin": ("QL-700", "62x29", [pattern(696, 271)]),
    "62x29-two-pages.bin": ("QL-700", "62x29", [pattern(696, 271), pattern(696, 271, shift=5)]),
    "62-continuous.bin": ("QL-700", "62", [pattern(696, 150)]),
    # Switches to raster mode and flushes 400 bytes.
    "ql-820nwb-62x29.bin": ("QL-820NWB", "62x29", [pattern(696, 271)]),
    # Has no cutter.
    "ql-500-62x100.bin": ("QL-500", "62x100", [pattern(696, 1109)]),
    # Wide print head with an extra offset.
    "ql-1100-102-continuous.bin": ("QL-1100", "102", [pattern(1164, 301)]),
}

for filename, (model, label, pages) in JOBS.items():
    data = convert(BrotherQLRaster(model), pages, label, rotate="0", threshold=70, cut=True)
    (HERE / filename).write_bytes(data)
    print(f"{filename}: {len(data)} bytes")
