import "./noMailGuard.mjs";
import assert from "node:assert/strict";
import test,{mock,after} from "node:test";
import {initializeApp,cert,deleteApp} from "firebase-admin/app";
import {getFirestore} from "firebase-admin/firestore";
import {generateKeyPairSync,randomUUID} from "node:crypto";
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8485")throw new Error("DISPATCHER_REQUIRES_LOCAL_EMULATOR");
const key=generateKeyPairSync("rsa",{modulusLength:2048}).privateKey.export({type:"pkcs8",format:"pem"});
const app=initializeApp({projectId:"demo-payroll-qa",credential:cert({projectId:"demo-payroll-qa",clientEmail:"qa@example.invalid",privateKey:key})},"dispatch-"+randomUUID()),db=getFirestore(app);
after(async()=>{await db.terminate();await deleteApp(app);});
process.env.NODE_ENV="production";
Object.assign(process.env,{GOOGLE_CLOUD_PROJECT:"demo-payroll-qa",PAYROLL_TASK_LOCATION:"asia-southeast1",PAYROLL_TASK_QUEUE:"qa-only",
 PAYROLL_WORKER_BASE_URL:"https://worker.example.invalid",PAYROLL_WORKER_SERVICE_ACCOUNT:"worker@example.invalid"});
const tasks=[];let fail=false;const verified=[];
mock.module(new URL("../../dist/config/firebase.js",import.meta.url).href,{namedExports:{db,defaultLocalFirebaseTarget:"test-jw-system",isLocalFirebaseTargetConfigured:()=>false}});
mock.module("@google-cloud/tasks",{namedExports:{CloudTasksClient:class{
 queuePath(...p){return p.join("/");}taskPath(...p){return p.join("/");}
 async createTask(input){if(fail)throw Object.assign(new Error("QA enqueue failure"),{code:7});tasks.push(input);}
}}});
mock.module("google-auth-library",{namedExports:{OAuth2Client:class{
 async verifyIdToken(input){verified.push(input);if(input.idToken==="expired")throw new Error("expired");
  return{getPayload:()=>({email:input.idToken==="other"?"other@example.invalid":"worker@example.invalid",
   email_verified:input.idToken!=="unverified",iss:input.idToken==="badissuer"?"evil.invalid":"https://accounts.google.com"})};}
}}});
const dispatcher=await import("../../dist/services/payroll/payrollTaskDispatcher.js");
const queries=await import("../../dist/repositories/payrollQueryRepository.js");
const ref=id=>db.collection("payroll_email_jobs").doc(id);
const state=id=>({id,revision:1,status:"QUEUED",enqueue_pending:true,lease_until:null,wake_at:null,is_deleted:false});
test("PAY-14 production config absent fails before enqueue",()=>{
 const old=process.env.PAYROLL_TASK_QUEUE;delete process.env.PAYROLL_TASK_QUEUE;
 try{assert.throws(()=>dispatcher.assertPayrollDispatcherConfigured(),e=>e.statusCode===503);}finally{process.env.PAYROLL_TASK_QUEUE=old;}
});
test("PAY-14 OIDC validates audience/identity/issuer/verified email with SDK mock",async()=>{
 const req=token=>({header:()=>token?"Bearer "+token:undefined});
 await dispatcher.authenticatePayrollWorker(req("valid"));
 assert.equal(verified[0].audience,"https://worker.example.invalid");
 for(const token of ["other","unverified","badissuer"])await assert.rejects(dispatcher.authenticatePayrollWorker(req(token)),e=>e.statusCode===403);
 await assert.rejects(dispatcher.authenticatePayrollWorker(req("expired")),e=>e.statusCode===401);
 await assert.rejects(dispatcher.authenticatePayrollWorker(req("")),e=>e.statusCode===401);
});
test("PAY-14 enqueue delay and task identity recorded, no external Cloud Tasks API",async()=>{
 const id="dispatcher-"+randomUUID();await ref(id).set(state(id));
 await dispatcher.dispatchPayrollJob(id,1,30);const task=tasks.at(-1).task;
 assert.ok(task.name.endsWith("payroll-"+id+"-r1"));assert.ok(Number(task.scheduleTime.seconds)>=Math.floor(Date.now()/1000)+29);
 assert.equal(task.httpRequest.oidcToken.serviceAccountEmail,"worker@example.invalid");
 assert.equal((await ref(id).get()).get("enqueue_pending"),false);
});
test("PAY-14 outbox survives enqueue failure and recovery bumps revision atomically",async()=>{
 const id="outbox-"+randomUUID();await ref(id).set(state(id));fail=true;
 await assert.rejects(dispatcher.dispatchPayrollJob(id,1));assert.equal((await ref(id).get()).get("enqueue_pending"),true);fail=false;
 const version=await queries.bumpPayrollDispatchRevision(id);assert.equal(version,2);
 await dispatcher.dispatchPayrollJob(id,version);assert.equal((await ref(id).get()).get("enqueue_pending"),false);
});
test("PAY-14 late enqueue ack cannot clear newer pending revision; active lease/future wake ignored",async()=>{
 const id="late-"+randomUUID();await ref(id).set({...state(id),revision:2});
 await queries.markPayrollDispatch(id,1);assert.equal((await ref(id).get()).get("enqueue_pending"),true);
 await ref(id).update({lease_until:new Date(Date.now()+60000)});assert.equal(await queries.bumpPayrollDispatchRevision(id),null);
 await ref(id).update({lease_until:null,wake_at:new Date(Date.now()+60000)});assert.equal(await queries.bumpPayrollDispatchRevision(id),null);
});
