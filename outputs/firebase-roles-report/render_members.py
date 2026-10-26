import pymupdf
from pathlib import Path
from PIL import Image,ImageDraw
r=Path('outputs/firebase-roles-report/render');out=r/'members';out.mkdir(exist_ok=True);d=pymupdf.open(r/'members.pdf');print('Pages:',len(d))
for i,p in enumerate(d):
 p.get_pixmap(matrix=pymupdf.Matrix(1.2,1.2)).save(out/f'page-{i+1}.png')
 print(i+1,len(p.get_text()),p.get_text().splitlines()[:2])
for start in range(0,len(d),6):
 sheet=Image.new('RGB',(1200,1700),'#bbb');draw=ImageDraw.Draw(sheet)
 for j in range(start,min(start+6,len(d))):
  im=Image.open(out/f'page-{j+1}.png');im.thumbnail((390,800));x=(j-start)%3*400;y=(j-start)//3*850;sheet.paste(im,(x,y+25));draw.text((x+10,y+6),str(j+1),fill='black')
 sheet.save(out/f'contact-{start//6+1}.png')

