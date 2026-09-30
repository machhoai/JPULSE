import re
from pathlib import Path

import pymupdf


path = Path(r"D:\Github\bduck-system\.tmp\architecture-doc\SAD-JPULSE-Chuong-4-all-sd.pdf")
pdf = pymupdf.open(path)
issues = []
figure_pages = []
for page_number, page in enumerate(pdf, 1):
    images = sorted(
        [tuple(info["bbox"]) for info in page.get_image_info(xrefs=True) if info["bbox"][1] > 70],
        key=lambda box: box[1],
    )
    captions = sorted(
        [(match.group(0), tuple(block[:4]))
         for block in page.get_text("blocks")
         for match in re.finditer(r"Hình 4-\d+:", block[4])],
        key=lambda item: item[1][1],
    )
    if not captions:
        continue
    figure_pages.append(page_number)
    if len(images) != len(captions):
        issues.append((page_number, "count", len(images), len(captions)))
        continue
    for image, (caption, box) in zip(images, captions):
        if box[1] < image[3] - 1:
            issues.append((page_number, caption, "caption_above", round(image[3], 1), round(box[1], 1)))
        if image[0] < 30 or image[2] > page.rect.width - 30 or image[3] > page.rect.height - 55:
            issues.append((page_number, caption, "image_near_page_edge", image))
print("pages", len(pdf), "pages_with_figures", len(figure_pages), "issues", issues[:40], "issue_count", len(issues))
