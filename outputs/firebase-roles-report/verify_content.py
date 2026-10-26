import json
from pathlib import Path
from zipfile import ZipFile
from lxml import etree
r=Path('outputs/firebase-roles-report')
ps=json.loads((r/'roles-snapshot.json').read_text(encoding='utf-8'));reg=json.loads((r/'registry.json').read_text(encoding='utf-8'))
with ZipFile(r/'So-do-phan-quyen-Firebase-Bduck.docx') as z: txt='\n'.join(etree.fromstring(z.read('word/document.xml')).itertext())
for p in ps:
 for role in p['roles']:
  assert role['id'] in txt
  for k,v in role['permissions'].items():assert k in txt
for key in [x['key'] for x in reg['permissions']]:assert key in txt
assert len({p['key'] for p in reg['permissions']})==146
for project in ps:
 roles={x['id']:x for x in project['roles'] if x.get('is_deleted') is False}
 for r0 in roles.values():
  seen=set();cur=r0
  while cur.get('parent_id'):
   assert cur['id'] not in seen
   seen.add(cur['id']);assert cur['parent_id'] in roles;cur=roles[cur['parent_id']]
print('Verified all role IDs, permission keys, active parents and acyclic hierarchy')

