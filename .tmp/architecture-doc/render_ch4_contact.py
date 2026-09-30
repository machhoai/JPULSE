from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw


base = Path(r"D:\Github\bduck-system\.tmp\architecture-doc")
pdf = pymupdf.open(base / "SAD-JPULSE-Chuong-4-complete.pdf")
first, last = 27, 42
cell_w, cell_h = 360, 500
columns = 3
rows = (last - first + columns - 1) // columns
sheet = Image.new("RGB", (columns * cell_w, rows * cell_h), "#dddddd")
draw = ImageDraw.Draw(sheet)
for index in range(first, last):
    page = pdf[index]
    pix = page.get_pixmap(matrix=pymupdf.Matrix(0.58, 0.58))
    image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    image.thumbnail((cell_w - 20, cell_h - 35))
    x = (index - first) % columns * cell_w + (cell_w - image.width) // 2
    y = (index - first) // columns * cell_h + 20
    sheet.paste(image, (x, y))
    draw.text((x, y - 16), str(index + 1), fill="black")
sheet.save(base / "ch4-contact.png")
print(base / "ch4-contact.png")
