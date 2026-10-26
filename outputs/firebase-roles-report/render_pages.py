from pathlib import Path
import pymupdf
from PIL import Image,ImageOps,ImageDraw
r=Path('outputs/firebase-roles-report/render');d=pymupdf.open(r/'report.pdf');print('Pages',len(d))
for i,p in enumerate(d):
 p.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2)).save(r/f'page-{i+1}.png')
 print(i+1,len(p.get_text()),p.get_text().splitlines()[:2])
for start in range(0,len(d),6):
 sheet=Image.new('RGB',(1200,1700),'#bbb');draw=ImageDraw.Draw(sheet)
 for j in range(start,min(start+6,len(d))):
  im=Image.open(r/f'page-{j+1}.png');im.thumbnail((390,800));x=(j-start)%3*400;y=(j-start)//3*850;sheet.paste(im,(x,y+25));draw.text((x+10,y+6),str(j+1),fill='black')
 sheet.save(r/f'contact-{start//6+1}.png')
