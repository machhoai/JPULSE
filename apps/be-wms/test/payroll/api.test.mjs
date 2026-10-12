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
test("PAY-14 API: internal worker requires dedicated identity, ordinary sender cannot bypass auth",async()=>{
  const response=await fetch(base+"/internal/jobs/qa-job",{method:"POST",headers:{authorization:"Bearer qa-actor"}});
  assert.equal(response.status,401);
});

process.env.PAYROLL_BREVO_WEBHOOK_SECRET="qa-webhook-secret-only-local-32-characters";
const webhookRequest=body=>fetch(base+"/webhooks/brevo",{method:"POST",headers:{authorization:"Bearer "+process.env.PAYROLL_BREVO_WEBHOOK_SECRET,"content-type":"application/json"},body:JSON.stringify(body)});
async function sentScenario(count=1){resetSmtp();const s=await scenario(count);const job=await jobs.createPayrollJob(s.request,s.actor,s.access);await prepare(job);await worker.processPayrollJob(job.id);const history=await db.collection("payroll_email_sent_records").where("job_id","==",job.id).get();return{...s,job,history};}

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
