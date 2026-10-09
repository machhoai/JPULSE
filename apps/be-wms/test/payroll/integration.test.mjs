import assert from "node:assert/strict";
import test from "node:test";
import { db, management, jobs, worker, repo, workerRepo, jobRepo, crypto, blobStore, smtp, scenario, prepare, resetSmtp, accessFor, snapshotService, queryService } from "./emulatorHarness.mjs";
import { mailSafety } from "./noMailGuard.mjs";
const rejectsStatus = (fn,status) => assert.rejects(fn,e=>e.statusCode===status);
test("PAY-10: real AES-GCM round trip, unique nonce, tampering/AAD/key rejected, no salary plaintext",async()=>{
  const data={name:"QA sensitive name",bank_account:"001234567890",net:1400000};
  const path=await crypto.storePayrollPayload("ctx-a",data);
  assert.deepEqual(await crypto.readPayrollPayload(path,"ctx-a"),data);
  const raw=blobStore.get(path).toString();assert.ok(!raw.includes(data.name));assert.ok(!raw.includes(data.bank_account));assert.ok(!raw.includes("1400000"));
  const other=await crypto.storePayrollPayload("ctx-a",data);assert.notEqual(JSON.parse(raw).iv,JSON.parse(blobStore.get(other)).iv);
  await rejectsStatus(()=>crypto.readPayrollPayload(path,"wrong-context"),409);
  const envelope=JSON.parse(raw);envelope.tag=Buffer.alloc(16).toString("base64");blobStore.set(path,Buffer.from(JSON.stringify(envelope)));
  await rejectsStatus(()=>crypto.readPayrollPayload(path,"ctx-a"),409);
});
test("PAY-10/11: own/store access, draft version conflicts, unchanged financial payload and audit encryption",async()=>{
  const s=await scenario(2);
  await rejectsStatus(()=>management.readPayrollDraft(s.draft,"other",s.access),403);
  await rejectsStatus(()=>management.readPayrollDraft(s.draft,s.actor,accessFor(s.actor,"different-store")),403);
  await rejectsStatus(()=>management.savePayrollDraft(s.draft,{template_id:s.template,name:"QA",composer:s.content,clock:new Date().toISOString(),revision:0},s.actor,s.access),409);
  const read=await management.readPayrollDraft(s.draft,s.actor,s.access);assert.equal(read.content.recipient_ids.length,2);
  const p=await management.readPayrollRecipient(read.meta,s.people[0].id);assert.equal(p.values.net,1400000);
  const audits=await db.collection("audit_logs").where("user_id","==",s.actor).get();
  const raw=JSON.stringify(audits.docs.map(d=>d.data()));assert.ok(!raw.includes("001234567890"));assert.ok(!raw.includes("1400000"));
});
test("PAY-10: updated draft ignores stale recipients and refuses incomplete uploads",async()=>{
  const s=await scenario(2);
  const next=await management.savePayrollDraft(s.draft,{template_id:s.template,name:"updated",composer:s.content,clock:new Date().toISOString(),
    revision:1,recipient_ids:[s.people[0].id]},s.actor,s.access);
  await rejectsStatus(()=>management.readPayrollRecipient(next,s.people[0].id),409);
  await management.savePayrollRecipient(s.draft,s.people[0].id,{...s.people[0],draft_revision:next.revision},s.actor,s.access);
  const page=await management.listPayrollRecipients(s.draft,s.actor,s.access);
  assert.equal(page.people.length,1);assert.equal(page.people[0].id,s.people[0].id);
  await rejectsStatus(()=>management.savePayrollRecipient(s.draft,s.people[1].id,{...s.people[1],draft_revision:1},s.actor,s.access),409);
});
test("PAY-09: custom signature is fixed, default occurs once and soft-deleted signature blocks preview",async()=>{
  const s=await scenario();
  const signatureId="sig-"+s.actor;
  await management.savePayrollSignature(signatureId,{name:"QA custom",html:"<p>QA custom signature</p>",revision:0},s.actor,s.access);
  const content={...s.content,signature_id:signatureId};
  const meta=await management.savePayrollDraft(s.draft,{template_id:s.template,name:"custom",composer:content,clock:new Date().toISOString(),revision:1,
    recipient_ids:[s.people[0].id]},s.actor,s.access);
  await management.savePayrollRecipient(s.draft,s.people[0].id,{...s.people[0],draft_revision:meta.revision},s.actor,s.access);
  const r=await snapshotService.buildPayrollSnapshot(s.draft,s.people[0].id,s.actor,s.access,"notifications.payroll.compose");
  assert.equal((r.html.match(/QA custom signature/g)||[]).length,1);assert.ok(!r.html.includes("QA default signature"));
  await management.removePayrollCatalog("signatures",signatureId,s.actor,s.access);
  await rejectsStatus(()=>snapshotService.buildPayrollSnapshot(s.draft,s.people[0].id,s.actor,s.access,"notifications.payroll.compose"),409);
});
test("PAY-13/14/17: 100 recipients, four logical chunks, concurrency <=3, task replay and per-person success history",async()=>{
  resetSmtp();smtp.handler=async input=>{await new Promise(r=>setTimeout(r,4));return{messageId:"<"+input.to[0]+">"};};
  const s=await scenario(100);const job=await jobs.createPayrollJob(s.request,s.actor,s.access);
  const replay=await jobs.createPayrollJob(s.request,s.actor,s.access);assert.equal(replay.id,job.id);
  await prepare(job);const initial=await repo.payrollRef("jobs",job.id).collection("items").get();
  assert.deepEqual([0,1,2,3].map(chunk=>initial.docs.filter(d=>d.get("chunk")===chunk).length),[25,25,25,25]);
  for(let i=0;i<4;i++)await worker.processPayrollJob(job.id);
  const final=await repo.getPayrollRecord("jobs",job.id);
  assert.equal(final.status,"COMPLETED");assert.equal(final.sent,100);assert.equal(final.failed,0);assert.equal(smtp.calls.length,100);assert.ok(smtp.maxActive<=3);
  assert.equal(new Set(smtp.calls.map(c=>c.to[0])).size,100);
  await worker.processPayrollJob(job.id);assert.equal(smtp.calls.length,100);
  const history=await db.collection("payroll_email_sent_records").where("job_id","==",job.id).get();assert.equal(history.size,100);
  const forbidden=JSON.stringify(history.docs.map(d=>d.data()));assert.ok(!forbidden.includes("001234567890"));
});
test("PAY-14: concurrent claims fenced; expired processing is UNKNOWN and never resent blindly",async()=>{
  resetSmtp();const s=await scenario(2);const job=await jobs.createPayrollJob(s.request,s.actor,s.access);await prepare(job);
  const results=await Promise.all([workerRepo.claimPayrollItems(job.id),workerRepo.claimPayrollItems(job.id)]);
  assert.equal(results.filter(Boolean).length,1);const c=results.find(Boolean),item=c.items[0];
  const snapshot=await crypto.readPayrollPayload(item.payload_path,"snapshot:"+job.id+":"+item.id+":"+s.facility);
  assert.ok(await workerRepo.beginPayrollItem(c,item,snapshot));
  await repo.payrollRef("jobs",job.id).update({lease_until:new Date(0)});
  const fresh=await workerRepo.claimPayrollItems(job.id);assert.ok(fresh);
  assert.equal((await repo.payrollRef("jobs",job.id).collection("items").doc(item.id).get()).get("status"),"UNKNOWN");
  assert.equal(await workerRepo.beginPayrollItem(c,c.items[1],snapshot),false);
  assert.equal(smtp.calls.length,0);
  const receipt=await jobRepo.findPayrollReceipt(s.actor,s.request.session_id,snapshot.email);assert.equal(receipt.get("status"),"UNKNOWN");
});
test("PAY-15: definite failure retry only failed; successful recipients remain untouched",async()=>{
  resetSmtp();const s=await scenario(2);let fail=true;
  smtp.handler=async input=>{if(fail&&input.to[0]===s.people[0].email)throw {responseCode:550,code:"EENVELOPE"};return{messageId:"<qa>"};};
  const job=await jobs.createPayrollJob(s.request,s.actor,s.access);await prepare(job);await worker.processPayrollJob(job.id);
  let j=await repo.getPayrollRecord("jobs",job.id);assert.equal(j.failed,1);assert.equal(j.sent,1);
  await rejectsStatus(()=>jobs.retryPayrollItems(job.id,[s.people[1].id],s.actor,s.access),409);
  fail=false;await jobs.retryPayrollItems(job.id,[s.people[0].id],s.actor,s.access);await worker.processPayrollJob(job.id);
  j=await repo.getPayrollRecord("jobs",job.id);assert.equal(j.sent,2);assert.equal(j.failed,0);
  assert.equal(smtp.calls.filter(c=>c.to[0]===s.people[1].email).length,1);
});
test("PAY-15: transient response backoff and attempt limit; future retry not sent early",async()=>{
  resetSmtp();smtp.handler=async()=>{throw{responseCode:451};};
  const s=await scenario(),job=await jobs.createPayrollJob(s.request,s.actor,s.access);await prepare(job);
  await worker.processPayrollJob(job.id);assert.equal(smtp.calls.length,1);
  let item=await repo.payrollRef("jobs",job.id).collection("items").doc(s.people[0].id).get();
  assert.equal(item.get("status"),"QUEUED");assert.equal(item.get("attempt"),2);
  await worker.processPayrollJob(job.id);assert.equal(smtp.calls.length,1);
  for(let n=0;n<2;n++){await item.ref.update({next_retry_at:new Date(0)});await worker.processPayrollJob(job.id);}
  item=await item.ref.get();assert.equal(item.get("status"),"FAILED");assert.equal(smtp.calls.length,3);
});
test("PAY-16: SMTP accepted, result DB fails twice: only one SMTP invocation",async()=>{
  resetSmtp();const s=await scenario(),job=await jobs.createPayrollJob(s.request,s.actor,s.access);await prepare(job);
  const original=db.runTransaction.bind(db);let failures=0,armed=false;
  smtp.handler=async()=>{armed=true;return{messageId:"<accepted-qa>"};};
  db.runTransaction=async(...args)=>{if(armed&&failures<2){failures++;throw new Error("SIMULATED_RESULT_WRITE_FAILURE");}return original(...args);};
  try{await worker.processPayrollJob(job.id);}finally{db.runTransaction=original;}
  assert.equal(failures,2);assert.equal(smtp.calls.length,1);assert.equal((await repo.getPayrollRecord("jobs",job.id)).sent,1);
});
test("PAY-15: duplicate send warning names/email, signed confirmation and changed signature rejection",async()=>{
  resetSmtp();const s=await scenario(),job=await jobs.createPayrollJob(s.request,s.actor,s.access);await prepare(job);await worker.processPayrollJob(job.id);
  const request={...s.request,request_id:"repeat-"+s.actor};let conflict;
  try{await jobs.createPayrollJob(request,s.actor,s.access);}catch(e){conflict=e;}
  assert.equal(conflict.statusCode,409);assert.ok(conflict.messages.vi.includes(s.people[0].name));assert.ok(conflict.messages.vi.includes(s.people[0].email));
  await rejectsStatus(()=>jobs.createPayrollJob({...request,confirmation:"wrong"},s.actor,s.access),409);
  const repeated=await jobs.createPayrollJob({...request,confirmation:conflict.data.confirmation},s.actor,s.access);assert.notEqual(repeated.id,job.id);
  await rejectsStatus(()=>jobs.createPayrollJob({...request,request_id:"changed-"+s.actor,signature_fingerprint:"0".repeat(64)},s.actor,s.access),409);
});
test("PAY-11/17: store history scope and download independently enforced",async()=>{
  resetSmtp();const s=await scenario(),job=await jobs.createPayrollJob(s.request,s.actor,s.access);await prepare(job);await worker.processPayrollJob(job.id);
  await rejectsStatus(()=>queryService.fetchPayrollHistory(s.facility,undefined,accessFor("other","different-store")),403);
  const page=await queryService.fetchPayrollHistory(s.facility,undefined,s.access);assert.equal(page.records.length,1);
  await rejectsStatus(()=>queryService.fetchPayrollHistorySnapshot(page.records[0].id,accessFor(s.actor,s.facility,["notifications.payroll.history.read"])),403);
  const read=await queryService.fetchPayrollHistorySnapshot(page.records[0].id,s.access);assert.equal(read.snapshot.email,s.people[0].email);
});
test("SAFETY: integration used mock transport and no real SMTP factory",()=>{
  assert.equal(mailSafety.realSmtpCreated,0);assert.equal(mailSafety.blockedNetwork,0);
});
