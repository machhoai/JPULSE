from pathlib import Path
from zipfile import ZipFile
from lxml import etree
import json
r=Path('outputs/firebase-roles-report')
with ZipFile(r/'Bao-cao-phan-quyen-danh-cho-lanh-dao.docx') as z:
 text=' '.join(etree.fromstring(z.read('word/document.xml')).itertext())
for forbidden in ['parent_id','warehouse_id','permissions','true','false','stock_counts','employees.contracts','SUPER_ADMIN']:
 assert forbidden not in text,forbidden
p=json.loads((r/'roles-snapshot.json').read_text(encoding='utf-8'))[0]
for role in p['roles']:
 if role['is_deleted'] is False:assert ('Quản trị hệ thống' if role['name']=='SUPER_ADMIN' else role['name']) in text
print('Verified all active roles and removal of technical identifiers')
