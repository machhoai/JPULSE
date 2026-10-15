import assert from "node:assert/strict";
import test, { mock, after } from "node:test";
import express from "express";
import { createRequire } from "node:module";
import { once } from "node:events";
import { simpleParser } from "mailparser";
import { db, scenario, accessFor, smtp, resetSmtp, jobs, prepare, worker } from "./emulatorHarness.mjs";
const requireFe = createRequire(new URL("../../../fe-wms/package.json",import.meta.url));
const JSZip = requireFe("jszip");
mock.module(new URL("../../dist/api/middlewares/authMiddleware.js",import.meta.url).href,{ namedExports:{
  requireAuth:(req,res,next)=>{
    if(req.header("authorization")!=="Bearer qa-actor")return res.status(401).json({success:false,messages:{vi:"QA chưa đăng nhập",zh:"QA 未登录"}});
    const actor=req.header("x-qa-actor"),facility=req.header("x-qa-facility");
    req.user={id:actor};req.accessContext=accessFor(actor,facility,JSON.parse(req.header("x-qa-permissions"))).context;next();
  },
} });
const {default:routes}=await import("../../dist/api/routes/payrollEmailRoutes.js");
const app=express();app.use(express.json());app.use("/payroll",routes);
const server=app.listen(0,"127.0.0.1");await once(server,"listening");
const base="http://127.0.0.1:"+server.address().port+"/payroll";
after(()=>new Promise(resolve=>server.close(resolve)));
async function request(s,path,method="GET",body,rights) {
  return fetch(base+path,{method,headers:{"authorization":"Bearer qa-actor","x-qa-actor":s.actor,
    "x-qa-facility":s.facility,"x-qa-permissions":JSON.stringify(rights || ["compose","send","download","history.read","templates.manage"].map(x=>"notifications.payroll."+x)),
    "content-type":"application/json"},body:body===undefined?undefined:JSON.stringify(body)});
}
test("PAY-11 API: unauthenticated and missing store permission denied, malformed IDs rejected",async()=>{
  const s=await scenario();
  assert.equal((await fetch(base+"/catalog")).status,401);
  assert.equal((await request(s,"/drafts/"+s.draft,"GET",undefined,["notifications.payroll.history.read"])).status,403);
  assert.equal((await request(s,"/drafts/invalid.id")).status,400);
  const other={...s,actor:"other-actor"};assert.equal((await request(other,"/drafts/"+s.draft)).status,403);
});

test("PAY-CUSTOM API: template/draft persistence, registered source data, preview, ZIP and encrypted history",async()=>{
 resetSmtp();const s=await scenario();
 const ids={roster:'custom_roster_'+'1'.repeat(32),salary:'custom_salary_'+'2'.repeat(32),attendance:'custom_attendance_'+'3'.repeat(32)};
 const composer={...s.content,custom_fields:Object.entries(ids).map(([source,id])=>({source,id,label:'Bổ sung '+source})),field_order:{},fields:structuredClone(s.content.fields),mappings:{}};
 for(const [source,block] of Object.entries({roster:'employee-info',salary:'payslip',attendance:'attendance'})){
  composer.fields[block]=[ids[source],...composer.fields[block]];composer.field_order[block]=composer.fields[block];
  composer.mappings[source]={sheet:'QA '+source,start_row:2,columns:{[ids[source]]:'CW'}};
 }
 const bad=await request(s,'/templates/'+s.template,'PUT',{name:'Mẫu tùy chỉnh',facility_id:s.facility,composer:{...composer,custom_fields:composer.custom_fields.map(field=>field.source==='salary'?{...field,label:'Thực nhận'}:field)},revision:1});assert.equal(bad.status,400);assert.match((await bad.json()).messages.vi,/không trùng/);
 const template=await request(s,'/templates/'+s.template,'PUT',{name:'Mẫu tùy chỉnh',facility_id:s.facility,composer,revision:1});assert.equal(template.status,200);
 const catalog=(await(await request(s,'/catalog')).json()).data;assert.deepEqual(catalog.templates.find(t=>t.id===s.template).composer.custom_fields,composer.custom_fields);
 const body={template_id:s.template,name:'Custom draft',composer,clock:'2026-10-09T03:00:00.000Z',revision:s.meta.revision,recipient_ids:s.people.map(p=>p.id)};
 const saved=await request(s,'/drafts/'+s.draft,'PUT',body);assert.equal(saved.status,200);const meta=(await saved.json()).data;
 const person={...s.people[0],values:{...s.people[0].values,[ids.roster]:'Dữ liệu riêng',[ids.salary]:250.567},attendance:[{date:'01/09/2026',[ids.attendance]:'Theo ngày'}],draft_revision:meta.revision};
 assert.equal((await request(s,'/drafts/'+s.draft+'/recipients/'+person.id,'PUT',{...person,values:{...person.values,['custom_salary_'+'f'.repeat(32)]:'Chưa khai báo'}})).status,400);
 assert.equal((await request(s,'/drafts/'+s.draft+'/recipients/'+person.id,'PUT',person)).status,200);
 const opened=(await(await request(s,'/drafts/'+s.draft)).json()).data;assert.deepEqual(opened.content.composer.field_order,composer.field_order);
 const preview=(await(await request(s,'/drafts/'+s.draft+'/preview','POST',{person_id:person.id})).json()).data;
 assert.ok(preview.html.includes('Dữ liệu riêng'));assert.ok(preview.html.includes('250,57'));assert.ok(preview.html.includes('Theo ngày'));assert.ok(preview.html.indexOf('Bổ sung roster')<preview.html.indexOf('Họ tên'));
 const exported=await request(s,'/drafts/'+s.draft+'/export','POST',{recipient_ids:[person.id]});assert.equal(exported.status,200);
 const zip=await JSZip.loadAsync(await exported.arrayBuffer());const mail=await simpleParser(await Object.values(zip.files).find(file=>!file.dir).async('nodebuffer'));assert.equal(mail.html,preview.html);
 const job=await jobs.createPayrollJob({...s.request,draft_revision:meta.revision},s.actor,s.access);await prepare(job);await worker.processPayrollJob(job.id);assert.equal(smtp.calls[0].htmlContent,preview.html);
 const history=await db.collection('payroll_email_sent_records').where('job_id','==',job.id).get();assert.equal(history.size,1);assert.ok(!JSON.stringify(history.docs[0].data()).includes('Dữ liệu riêng'));
 const detail=(await(await request(s,'/history/'+history.docs[0].id)).json()).data;assert.equal(detail.snapshot.html,preview.html);
});
test("PAY-12 API: real ZIP contains only selected employees and parseable personal MIME, no history",async()=>{
  resetSmtp();const s=await scenario(3);
  const response=await request(s,"/drafts/"+s.draft+"/export","POST",{recipient_ids:[s.people[0].id,s.people[2].id]});
  assert.equal(response.status,200);assert.match(response.headers.get("content-disposition"),/zip/);
  const zip=await JSZip.loadAsync(await response.arrayBuffer());const files=Object.values(zip.files).filter(f=>!f.dir);assert.equal(files.length,2);
  const addresses=[];for(const file of files){const mail=await simpleParser(await file.async("nodebuffer"));addresses.push(mail.to.value[0].address);
    assert.equal(mail.to.value.length,1);assert.equal((mail.html.match(/QA default signature/g)||[]).length,1);
    assert.ok(!mail.html.includes(s.people[1].email));}
  assert.deepEqual(addresses.sort(),[s.people[0].email,s.people[2].email].sort());
  const hist=await db.collection("payroll_email_sent_records").where("created_by","==",s.actor).get();assert.equal(hist.size,0);assert.equal(smtp.calls.length,0);
});
test("PAY-05/09 API: preview and test-send identical content; test recipient overridden with mock only",async()=>{
  resetSmtp();const s=await scenario();
  const preview=await request(s,"/drafts/"+s.draft+"/preview","POST",{person_id:s.people[0].id});assert.equal(preview.status,200);
  const data=(await preview.json()).data;
  const response=await request(s,"/drafts/"+s.draft+"/test","POST",{person_id:s.people[0].id,email:"qa-inbox@example.invalid"});assert.equal(response.status,200);
  assert.equal(smtp.calls.length,1);assert.deepEqual(smtp.calls[0].to,["qa-inbox@example.invalid"]);
  assert.equal(smtp.calls[0].htmlContent,data.html);assert.equal(smtp.calls[0].signature,false);
  assert.equal((await db.collection("payroll_email_sent_records").where("created_by","==",s.actor).get()).size,0);
});
test("PAY-11 API: test-send/download privileges independent",async()=>{
  const s=await scenario();const composeOnly=["notifications.payroll.compose"];
  assert.equal((await request(s,"/drafts/"+s.draft+"/test","POST",{person_id:s.people[0].id,email:"qa@example.invalid"},composeOnly)).status,403);
  assert.equal((await request(s,"/drafts/"+s.draft+"/export","POST",{recipient_ids:[s.people[0].id]},composeOnly)).status,403);
});

test("PAY-ROUTING API: save, preview, safe test-send, export, worker, history and resend preserve headers",async()=>{
 resetSmtp(); const s=await scenario();
 const composer={...s.content,reply_to:"reply@example.invalid",cc:["copy@example.invalid"],bcc:["hidden@example.invalid"]};
 const body={template_id:s.template,name:"Routing QA",composer,clock:"2026-10-09T03:00:00.000Z",revision:s.meta.revision,recipient_ids:s.people.map(p=>p.id)};
 const bad=await request(s,"/drafts/"+s.draft,"PUT",{...body,composer:{...composer,cc:["wrong"]}});
 assert.equal(bad.status,400);assert.match((await bad.json()).messages.vi,/CC #1/);
 const saved=await request(s,"/drafts/"+s.draft,"PUT",body);assert.equal(saved.status,200);const meta=(await saved.json()).data;
 for(const person of s.people) assert.equal((await request(s,"/drafts/"+s.draft+"/recipients/"+person.id,"PUT",{...person,draft_revision:meta.revision})).status,200);
 const preview=await request(s,"/drafts/"+s.draft+"/preview","POST",{person_id:s.people[0].id});assert.equal(preview.status,200);
 const snapshot=(await preview.json()).data;assert.equal(snapshot.reply_to,composer.reply_to);assert.deepEqual(snapshot.cc,composer.cc);assert.deepEqual(snapshot.bcc,composer.bcc);
 const tested=await request(s,"/drafts/"+s.draft+"/test","POST",{person_id:s.people[0].id,email:"qa@example.invalid"});assert.equal(tested.status,200);
 assert.equal(smtp.calls[0].replyTo,composer.reply_to);assert.equal(smtp.calls[0].cc,undefined);assert.equal(smtp.calls[0].bcc,undefined);
 const exported=await request(s,"/drafts/"+s.draft+"/export","POST",{recipient_ids:[s.people[0].id]});assert.equal(exported.status,200);
 const zip=await JSZip.loadAsync(await exported.arrayBuffer());const file=Object.values(zip.files).find(f=>!f.dir);const mail=await simpleParser(await file.async("nodebuffer"));
 assert.equal(mail.replyTo.value[0].address,composer.reply_to);assert.equal(mail.cc.value[0].address,composer.cc[0]);assert.equal(mail.bcc.value[0].address,composer.bcc[0]);
 resetSmtp();const job=await jobs.createPayrollJob({...s.request,draft_revision:meta.revision},s.actor,s.access);await prepare(job);await worker.processPayrollJob(job.id);
 assert.equal(smtp.calls.length,1);assert.equal(smtp.calls[0].replyTo,composer.reply_to);assert.deepEqual(smtp.calls[0].cc,composer.cc);assert.deepEqual(smtp.calls[0].bcc,composer.bcc);
 const records=await db.collection("payroll_email_sent_records").where("job_id","==",job.id).get();const record=records.docs[0];
 const detail=(await(await request(s,"/history/"+record.id)).json()).data;assert.deepEqual(detail.snapshot.bcc,composer.bcc);
 const copyEvent=await webhookRequest({event:"hard_bounce",email:composer.cc[0],"X-Mailin-custom":"payroll_history:"+record.id,ts_event:Math.floor(Date.now()/1000)});
 assert.equal(copyEvent.status,200);assert.equal((await record.ref.get()).get("delivery_status"),"PENDING");
 await record.ref.update({delivery_status:"DELIVERED"});
 const resent=await request(s,"/history/"+record.id+"/resend","POST",{email:"other@example.invalid",request_id:"routing-resend",confirmed:true});assert.equal(resent.status,202);
 const resendJob=(await resent.json()).data;await prepare(resendJob);await worker.processPayrollJob(resendJob.id);
 assert.equal(smtp.calls.length,2);assert.equal(smtp.calls[1].replyTo,composer.reply_to);assert.deepEqual(smtp.calls[1].cc,composer.cc);assert.deepEqual(smtp.calls[1].bcc,composer.bcc);
});
test("PAY-14 API: internal worker requires dedicated identity, ordinary sender cannot bypass auth",async()=>{
  const response=await fetch(base+"/internal/jobs/qa-job",{method:"POST",headers:{authorization:"Bearer qa-actor"}});
  assert.equal(response.status,401);
});

process.env.PAYROLL_BREVO_WEBHOOK_SECRET="qa-webhook-secret-only-local-32-characters";
const webhookRequest=body=>fetch(base+"/webhooks/brevo",{method:"POST",headers:{authorization:"Bearer "+process.env.PAYROLL_BREVO_WEBHOOK_SECRET,"content-type":"application/json"},body:JSON.stringify(body)});
async function sentScenario(count=1){resetSmtp();const s=await scenario(count);const job=await jobs.createPayrollJob(s.request,s.actor,s.access);await prepare(job);await worker.processPayrollJob(job.id);const history=await db.collection("payroll_email_sent_records").where("job_id","==",job.id).get();return{...s,job,history};}

test("PAY-EDITOR API: saved Quill formats and mailto query preserved through preview and SMTP mock",async()=>{
 resetSmtp();const s=await scenario();const link='mailto:qa@example.invalid?subject='+encodeURIComponent('Phản hồi lương')+'&body='+encodeURIComponent('Chào kế toán');
 const composer={...s.content,ops:[{insert:'Liên hệ',attributes:{link,font:'serif',size:'large',color:'#ff0000'}},{insert:'\n',attributes:{align:'center'}},{insert:'Một'},{insert:'\n',attributes:{list:'ordered'}}]};
 const saved=await request(s,'/drafts/'+s.draft,'PUT',{template_id:s.template,name:'QA formats',composer,clock:'2026-10-13T00:00:00Z',revision:s.meta.revision,recipient_ids:s.people.map(p=>p.id)});assert.equal(saved.status,200);const meta=(await saved.json()).data;
 assert.equal((await request(s,'/drafts/'+s.draft+'/recipients/'+s.people[0].id,'PUT',{...s.people[0],draft_revision:meta.revision})).status,200);
 const preview=await request(s,'/drafts/'+s.draft+'/preview','POST',{person_id:s.people[0].id});assert.equal(preview.status,200);const email=(await preview.json()).data;
 assert.ok(email.html.includes(link.replace(/&/g,'&amp;')));assert.ok(email.html.includes('font-size:1.5em'));assert.ok(email.html.includes('text-align:center'));assert.ok(email.html.includes('<ol'));assert.ok(email.text.includes(link));
 const sent=await request(s,'/drafts/'+s.draft+'/test','POST',{person_id:s.people[0].id,email:'qa@example.invalid'});assert.equal(sent.status,200);assert.equal(smtp.calls.length,1);assert.equal(smtp.calls[0].htmlContent,email.html);assert.equal(smtp.calls[0].textContent,email.text);
});

test("PAY-RESEND legacy: missing attempt uses exact history ID, completed recipient can resend, real newer attempts still blocked",async()=>{
 const s=await sentScenario();const r=s.history.docs[0];const {FieldValue}=await import('firebase-admin/firestore');
 await r.ref.update({attempt:FieldValue.delete(),submission_status:FieldValue.delete(),delivery_status:"DELIVERED"});
 const detail=(await(await request(s,"/history/"+r.id)).json()).data;assert.equal(detail.attempt,1);
 const item=db.collection("payroll_email_jobs").doc(s.job.id).collection("items").doc(s.people[0].id);
 const input={email:"corrected@example.invalid",request_id:"legacy-resend",confirmed:true},path="/history/"+r.id+"/resend";
 await item.update({attempt:2});assert.equal((await request(s,path,"POST",input)).status,409);
 await item.update({attempt:1,status:"QUEUED"});assert.equal((await request(s,path,"POST",input)).status,409);
 await item.update({status:"SENT"});const response=await request(s,path,"POST",input);assert.equal(response.status,202);
 assert.equal(smtp.calls.length,1);assert.equal((await r.ref.get()).get("attempt"),undefined);
});

test("PAY-RESEND API: pending blocked, permissions scoped, hard bounce requires another email and confirmation",async()=>{
 const s=await sentScenario();const r=s.history.docs[0];const path="/history/"+r.id+"/resend";
 const input={email:s.people[0].email,request_id:"resend-policy-1",confirmed:true};
 assert.equal((await request(s,path,"POST",input)).status,409);
 await r.ref.update({delivery_status:"HARD_BOUNCE"});
 assert.equal((await request(s,path,"POST",input,["notifications.payroll.history.read"])).status,403);
 assert.equal((await request({...s,facility:"other-store"},path,"POST",input)).status,403);
 assert.equal((await request(s,path,"POST",input)).status,400);
 assert.equal((await request(s,path,"POST",{...input,email:"alternate@example.invalid",confirmed:false})).status,409);
 assert.equal((await request(s,path,"POST",{...input,email:"invalid"})).status,400);
 assert.equal(smtp.calls.length,1);
});

test("PAY-RESEND API: soft bounce alternate address preserves original content and history, idempotent and background only",async()=>{
 const s=await sentScenario();const r=s.history.docs[0];await r.ref.update({delivery_status:"SOFT_BOUNCE"});
 const original=(await(await request(s,"/history/"+r.id)).json()).data.snapshot;
 const path="/history/"+r.id+"/resend",input={email:"alternate@example.invalid",request_id:"resend-content-1",confirmed:true};
 const response=await request(s,path,"POST",input);assert.equal(response.status,202);const job=(await response.json()).data;
 assert.equal(smtp.calls.length,1);assert.equal(job.resend_source_id,r.id);
 assert.equal((await(await request(s,path,"POST",input)).json()).data.id,job.id);
 assert.equal((await request(s,path,"POST",{...input,email:"other@example.invalid"})).status,409);
 await prepare(job);await worker.processPayrollJob(job.id);
 assert.deepEqual(smtp.calls[1].to,[input.email]);assert.equal(smtp.calls[1].htmlContent,original.html);assert.equal(smtp.calls[1].textContent,original.text);assert.equal(smtp.calls[1].subject,original.subject);
 const history=await db.collection("payroll_email_sent_records").where("job_id","==",job.id).get();assert.equal(history.size,1);assert.equal(history.docs[0].get("resend_source_id"),r.id);
 assert.equal((await r.ref.get()).get("delivery_status"),"SOFT_BOUNCE");
 const old=(await(await request(s,"/history/"+r.id)).json()).data;assert.equal(old.snapshot.email,original.email);
 const pending=await request(s,path,"POST",{...input,request_id:"new-request"});assert.equal(pending.status,409);
});

test("PAY-RESEND API: delivered same address confirmed, concurrent tabs create only one background job",async()=>{
 const s=await sentScenario();const r=s.history.docs[0];await r.ref.update({delivery_status:"DELIVERED"});
 const path="/history/"+r.id+"/resend",input={email:s.people[0].email,request_id:"resend-delivered-1",confirmed:true};
 assert.equal((await request(s,path,"POST",{...input,confirmed:false})).status,409);
 const responses=await Promise.all([request(s,path,"POST",input),request(s,path,"POST",{...input,request_id:"resend-delivered-2"})]);
 assert.deepEqual(responses.map(r=>r.status).sort(),[202,409]);
 const job=(await responses.find(r=>r.status===202).json()).data;await prepare(job);await worker.processPayrollJob(job.id);
 assert.equal(smtp.calls.length,2);assert.deepEqual(smtp.calls[1].to,[s.people[0].email]);
 const pending=await request(s,path,"POST",{...input,request_id:"resend-delivered-3"});assert.equal(pending.status,409);
});

test("PAY-RESEND API: SMTP failure eligible, automatic retry in progress blocks manual duplicate",async()=>{
 const s=await sentScenario();const r=s.history.docs[0];await r.ref.update({submission_status:"FAILED",delivery_status:"PENDING"});
 await db.collection("payroll_email_jobs").doc(s.job.id).collection("items").doc(s.people[0].id).update({status:"QUEUED"});
 const path="/history/"+r.id+"/resend",input={email:s.people[0].email,request_id:"resend-smtp-1",confirmed:true};
 assert.equal((await request(s,path,"POST",input)).status,409);
 await db.collection("payroll_email_jobs").doc(s.job.id).collection("items").doc(s.people[0].id).update({status:"FAILED"});
 assert.equal((await request(s,path,"POST",input)).status,202);assert.equal(smtp.calls.length,1);
});

test("PAY-HISTORY API: store/date/status filters and read-only detail without download privilege",async()=>{
 const s=await sentScenario(3);const records=s.history.docs;
 await records[0].ref.update({delivery_status:"DELIVERED",created_at:new Date("2026-10-11T17:30:00Z")});
 await records[1].ref.update({submission_status:"FAILED",error:{vi:"QA SMTP lỗi",zh:"QA SMTP 失败"},created_at:new Date("2026-10-12T17:00:00Z")});
 await records[2].ref.update({created_at:new Date("2026-10-11T17:00:00Z")});
 const response=await request(s,"/history?facility_id="+s.facility+"&from=2026-10-12&to=2026-10-12&status=SUCCESS");assert.equal(response.status,200);
 const page=(await response.json()).data;assert.equal(page.records.length,1);assert.equal(page.records[0].id,records[0].id);
 const rights=["notifications.payroll.history.read"];
 const detail=await request(s,"/history/"+records[0].id,"GET",undefined,rights);assert.equal(detail.status,200);assert.ok((await detail.json()).data.snapshot.html);
 assert.equal((await request({...s,facility:"other-store"},"/history/"+records[0].id)).status,403);
 assert.equal((await request(s,"/history?facility_id="+s.facility+"&from=2026-10-13&to=2026-10-12")).status,400);
 assert.equal((await request(s,"/history?facility_id="+s.facility+"&from=2026-02-30")).status,400);
 const failed=(await(await request(s,"/history?facility_id="+s.facility+"&status=ERROR")).json()).data;assert.equal(failed.records.length,1);assert.equal(failed.records[0].error.vi,"QA SMTP lỗi");
});

test("PAY-HISTORY API: filter searches beyond first 25 records and supports legacy pending rows",async()=>{
 const s=await sentScenario();const original=s.history.docs[0].data();
 const batch=db.batch();for(let i=0;i<31;i++)batch.set(db.collection("payroll_email_sent_records").doc(s.job.id+"_copy_"+i),{...original,delivery_status:i===30?"DELIVERED":"PENDING",created_at:new Date(Date.now()-i*1000)});await batch.commit();
 const success=(await(await request(s,"/history?facility_id="+s.facility+"&status=SUCCESS")).json()).data;assert.equal(success.records.length,1);assert.equal(success.records[0].id,s.job.id+"_copy_30");
 await s.history.docs[0].ref.update({delivery_status:(await import('firebase-admin/firestore')).FieldValue.delete(),submission_status:(await import('firebase-admin/firestore')).FieldValue.delete()});
 const pending=(await(await request(s,"/history?facility_id="+s.facility+"&status=PENDING")).json()).data;assert.equal(pending.records.length,25);assert.ok(pending.cursor);
 const next=(await(await request(s,"/history?facility_id="+s.facility+"&status=PENDING&after="+pending.cursor)).json()).data;assert.equal(next.records.length,6);
});

test("PAY-HISTORY webhook: bounce reason encrypted, duplicate/out-of-order events ignored, recipient/auth checked",async()=>{
 const s=await sentScenario();const record=s.history.docs[0];const t=Math.floor(Date.now()/1000);
 const bounce={event:"soft_bounce",email:s.people[0].email,"X-Mailin-custom":"payroll_history:"+record.id,ts_event:t,reason:"452 4.2.2 The recipient's inbox is out of storage space. OverQuotaTemp"};
 assert.equal((await fetch(base+"/webhooks/brevo",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(bounce)})).status,401);
 assert.equal((await webhookRequest({...bounce,email:"other@example.invalid"})).status,200);assert.equal((await record.ref.get()).get("delivery_status"),"PENDING");
 assert.equal((await webhookRequest(bounce)).status,200);const meta=(await record.ref.get()).data();assert.equal(meta.delivery_status,"SOFT_BOUNCE");assert.ok(!JSON.stringify(meta).includes("OverQuotaTemp"));
 const detail=(await(await request(s,"/history/"+record.id)).json()).data;assert.ok(detail.delivery_reason.includes("OverQuotaTemp"));assert.equal(detail.snapshot.html,smtp.calls[0].htmlContent);
 await webhookRequest(bounce);const events=await db.collection("payroll_delivery_events").where("record_id","==",record.id).get();assert.equal(events.size,1);
 await webhookRequest({...bounce,event:"delivered",ts_event:t+1,reason:""});await webhookRequest({...bounce,ts_event:t-1});assert.equal((await record.ref.get()).get("delivery_status"),"DELIVERED");
 assert.equal(smtp.calls.length,1);
});

test("PAY-HISTORY: delivery webhook arriving before SMTP result is preserved",async()=>{
 resetSmtp();const s=await scenario();const t=Math.floor(Date.now()/1000);
 smtp.handler=async input=>{assert.ok(input.payrollHistoryId);await webhookRequest({event:"delivered",email:input.to[0],"X-Mailin-custom":"payroll_history:"+input.payrollHistoryId,ts_event:t});return{messageId:"<early@example.invalid>"};};
 const job=await jobs.createPayrollJob(s.request,s.actor,s.access);await prepare(job);await worker.processPayrollJob(job.id);
 const history=await db.collection("payroll_email_sent_records").where("job_id","==",job.id).get();assert.equal(history.size,1);assert.equal(history.docs[0].get("delivery_status"),"DELIVERED");assert.equal(history.docs[0].get("submission_status"),"SENT");
});

test("PAY-HISTORY: failed SMTP remains visible with immutable content and error",async()=>{
 resetSmtp();const s=await scenario();smtp.handler=async()=>{throw{code:"EAUTH",responseCode:535};};
 const job=await jobs.createPayrollJob(s.request,s.actor,s.access);await prepare(job);await worker.processPayrollJob(job.id);
 const response=await request(s,"/history?facility_id="+s.facility+"&status=ERROR");assert.equal(response.status,200);const page=(await response.json()).data;
 assert.equal(page.records.length,1);assert.equal(page.records[0].submission_status,"FAILED");assert.ok(page.records[0].error.vi.includes("535"));assert.ok(page.records[0].snapshot.html);resetSmtp();
});

test("PAY-TRACKING: sent/delivered/opened timestamps, duplicate and out-of-order opens, bounce stays visible",async()=>{
 const s=await sentScenario();const record=s.history.docs[0];const t=Math.floor(Date.now()/1000);
 const event={email:s.people[0].email,"X-Mailin-custom":"payroll_history:"+record.id};
 for(const [type,stamp] of [["request",t],["delivered",t+1],["opened",t+5],["unique_opened",t+2],["opened",t+5]])assert.equal((await webhookRequest({...event,event:type,ts_event:stamp})).status,200);
 const detail=(await(await request(s,"/history/"+record.id)).json()).data;
 assert.equal(detail.delivery_status,"DELIVERED");assert.equal(detail.tracking.sent_at,new Date(t*1000).toISOString());
 assert.equal(detail.tracking.delivered_at,new Date((t+1)*1000).toISOString());assert.equal(detail.tracking.first_opened_at,new Date((t+2)*1000).toISOString());assert.equal(detail.tracking.last_opened_at,new Date((t+5)*1000).toISOString());
 const events=await db.collection("payroll_delivery_events").where("record_id","==",record.id).get();assert.equal(events.size,4);
 await webhookRequest({...event,event:"soft_bounce",ts_event:t+6,reason:"452 4.2.2 mailbox full"});await webhookRequest({...event,event:"opened",ts_event:t+7});
 const after=(await(await request(s,"/history/"+record.id)).json()).data;assert.equal(after.delivery_status,"SOFT_BOUNCE");assert.equal(after.delivery_reason,"452 4.2.2 mailbox full");assert.equal(after.tracking.last_opened_at,new Date((t+7)*1000).toISOString());
 assert.equal(smtp.calls.length,1);
});

test("PAY-TRACKING: proxy opens do not count as actual opens or delivered, wrong recipient ignored",async()=>{
 const s=await sentScenario();const record=s.history.docs[0];const t=Math.floor(Date.now()/1000);
 const event={email:s.people[0].email,"X-Mailin-custom":"payroll_history:"+record.id};
 await webhookRequest({...event,event:"proxy_open",ts_epoch:(t+5)*1000});await webhookRequest({...event,event:"unique_proxy_open",ts_event:t+2});
 await webhookRequest({...event,event:"opened",email:"other@example.invalid",ts_event:t+6});
 const detail=(await(await request(s,"/history/"+record.id)).json()).data;assert.equal(detail.delivery_status,"PENDING");assert.equal(detail.tracking.first_opened_at,undefined);
 assert.equal(detail.tracking.first_proxy_opened_at,new Date((t+2)*1000).toISOString());assert.equal(detail.tracking.last_proxy_opened_at,new Date((t+5)*1000).toISOString());assert.equal(smtp.calls.length,1);
});
