const fs=require('fs');
const {createRequire}=require('module');
const req=createRequire(process.cwd()+'/apps/be-wms/package.json');
const {initializeApp,cert}=req('firebase-admin/app');
const {getFirestore}=req('firebase-admin/firestore');
const env=fs.readFileSync('.env.local','utf8');
const vars={}; for(const l of env.split(/\r?\n/)){const m=l.match(/^([A-Z_0-9]+)=(.*)$/);if(m) vars[m[1]]=m[2].trim().replace(/^(['"])(.*)\1$/,'$2');}
(async()=>{ const projects=new Map();for(const k of ['PROD_FIREBASE_SERVICE_ACCOUNT_BASE64','FIREBASE_SERVICE_ACCOUNT_BASE64','TEST_FIREBASE_SERVICE_ACCOUNT_BASE64']){if(!vars[k])continue;let sa; try {sa=JSON.parse(Buffer.from(vars[k],'base64').toString());} catch {console.log('Skipping invalid credential '+k);continue;}if(projects.has(sa.project_id))continue;projects.set(sa.project_id,sa);}const output=[];for(const [id,sa] of projects){const app=initializeApp({credential:cert(sa)},id);const snap=await getFirestore(app).collection('roles').get();output.push({project:id,read_time:new Date().toISOString(),roles:snap.docs.map(d=>({...d.data(),id:d.id}))});}fs.mkdirSync('outputs/firebase-roles-report',{recursive:true});fs.writeFileSync('outputs/firebase-roles-report/roles-snapshot.json',JSON.stringify(output,null,2));console.log(JSON.stringify(output.map(p=>({project:p.project,read_time:p.read_time,roles:p.roles.map(r=>({id:r.id,name:r.name,parent_id:r.parent_id,is_deleted:r.is_deleted,enabled:Object.values(r.permissions||{}).filter(v=>v===true).length,disabled:Object.values(r.permissions||{}).filter(v=>v===false).length}))})),null,2));})().catch(e=>{console.error(e.message);process.exit(1)});

