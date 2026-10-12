import "./noMailGuard.mjs";
import { mock, after } from "node:test";
import { randomBytes, randomUUID, generateKeyPairSync } from "node:crypto";
import { initializeApp, deleteApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createAccessContext } from "../../dist/services/authorization/accessContextFactory.js";
import { AuthorizationService } from "../../dist/services/authorization/authorizationService.js";
import { FACILITY_ACCESS_POLICY_VERSION, WarehouseType } from "@bduck/shared-types";
import { person, composer, clock } from "./fixtures.mjs";
if (!/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || "")) throw new Error("PAYROLL_TEST_REQUIRES_LOOPBACK_EMULATOR");
process.env.NODE_ENV = "test";
process.env.PAYROLL_ENCRYPTION_VERSION = "V1";
process.env.PAYROLL_ENCRYPTION_KEY_V1 = randomBytes(32).toString("base64");
process.env.BREVO_EMAIL_SIGNATURE_HTML = "<p>QA default signature</p>";
process.env.BREVO_EMAIL_SIGNATURE_TEXT = "QA default signature";
const fakeKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({type:"pkcs8",format:"pem"});
const project = process.env.PAYROLL_QA_PROJECT || "demo-payroll-qa";
if (!/^demo-payroll-(qa|browser-[a-z0-9]+)$/.test(project)) throw new Error("INVALID_QA_PROJECT");
const app = initializeApp({ projectId: project, credential: cert({projectId:project,clientEmail:"qa@example.invalid",privateKey:fakeKey}) }, "payroll-qa-" + randomUUID());
export const db = getFirestore(app);
const blobs = new Map();
export const blobStore = blobs;
export const storage = { bucket: () => ({ file: path => ({
  save: async bytes => { blobs.set(path, Buffer.from(bytes)); },
  download: async () => { if (!blobs.has(path)) throw { code: 404 }; return [Buffer.from(blobs.get(path))]; },
}) }) };
export const smtp = { calls: [], active: 0, maxActive: 0, handler: async () => ({ messageId: "<qa@example.invalid>" }) };
export const dispatched = [];
mock.module(new URL("../../dist/config/firebase.js",import.meta.url).href,{ namedExports: { db, storage,
  defaultLocalFirebaseTarget: "test-jw-system", isLocalFirebaseTargetConfigured: () => false } });
mock.module(new URL("../../dist/services/payroll/payrollTaskDispatcher.js",import.meta.url).href,{ namedExports: {
  dispatchPayrollJob: async (id,revision,delay=0) => { dispatched.push({id,revision,delay}); },
  assertPayrollDispatcherConfigured: () => {},
  recoverPayrollJobs: async () => {},
  authenticatePayrollWorker: async req => { if(req.header("authorization")!=="Bearer qa-worker") throw {statusCode:401,messages:{vi:"Worker QA không hợp lệ.",zh:"QA 工作器无效。"}}; },
} });
mock.module(new URL("../../dist/services/brevoEmailService.js",import.meta.url).href,{ namedExports: {
  sendBrevoEmail: async input => {
    if(input.to.length!==1 || !input.to[0].endsWith("@example.invalid")) throw new Error("UNSAFE_TEST_RECIPIENT");
    smtp.calls.push(structuredClone(input));smtp.active++;smtp.maxActive=Math.max(smtp.maxActive,smtp.active);
    try { return await smtp.handler(input); } finally { smtp.active--; }
  },
} });
export const permissions = ["compose","download","send","history.read","templates.manage"].map(s=>"notifications.payroll."+s).concat("notifications.email_signatures.manage");
export function accessFor(actor,facility,allowed=permissions) {
  return new AuthorizationService(createAccessContext({ actorId:actor,workplaceFacilityId:facility,
    isSystemAdmin:false,policyVersion:FACILITY_ACCESS_POLICY_VERSION,computedAt:new Date(),grants:[{
      facilityId:facility,facilityType:WarehouseType.STORE,permissions:Object.fromEntries(allowed.map(a=>[a,true])),
      sources:[{type:"DIRECT",role_id:"qa-role",assignment_id:"qa-assignment",office_id:null}],
    }] }));
}
export const management = await import("../../dist/services/payroll/payrollManagementService.js");
export const jobs = await import("../../dist/services/payroll/payrollJobService.js");
export const worker = await import("../../dist/services/payroll/payrollWorker.js");
export const repo = await import("../../dist/repositories/payrollRepository.js");
export const workerRepo = await import("../../dist/repositories/payrollWorkerRepository.js");
export const jobRepo = await import("../../dist/repositories/payrollJobRepository.js");
export const crypto = await import("../../dist/services/payroll/payrollCrypto.js");
export const snapshotService = await import("../../dist/services/payroll/payrollSnapshotService.js");
export const queryService = await import("../../dist/services/payroll/payrollQueryService.js");
export async function scenario(count=1) {
  const suffix=randomUUID();const actor="qa-"+suffix,facility="store-"+suffix,template="template-"+suffix,draft="draft-"+suffix;
  const access=accessFor(actor,facility),content=composer(),people=Array.from({length:count},(_,i)=>person(i));
  await db.collection("warehouses").doc(facility).set({id:facility,type:"STORE",is_deleted:false});
  await management.savePayrollTemplate(template,{name:"QA template",facility_id:facility,composer:content,revision:0},actor,access);
  const meta=await management.savePayrollDraft(draft,{template_id:template,name:"QA draft",composer:content,clock,revision:0,
    recipient_ids:people.map(p=>p.id)},actor,access);
  for(const p of people) await management.savePayrollRecipient(draft,p.id,{...p,draft_revision:meta.revision},actor,access);
  const {createHash}=await import("node:crypto");
  const fingerprint=createHash("sha256").update(JSON.stringify({html:process.env.BREVO_EMAIL_SIGNATURE_HTML,text:process.env.BREVO_EMAIL_SIGNATURE_TEXT})).digest("hex");
  const request={draft_id:draft,draft_revision:meta.revision,recipient_ids:people.map(p=>p.id),
    signature_fingerprint:fingerprint,session_id:"session-"+suffix,request_id:"request-"+suffix};
  return {actor,facility,template,draft,access,content,people,meta,request};
}
export async function prepare(job) {
  for(let n=0;n<10;n++){const current=await repo.getPayrollRecord("jobs",job.id);
    if(current.status!=="PREPARING")return current;await jobs.preparePayrollJob(current);}
  throw new Error("PREPARATION_DID_NOT_COMPLETE");
}
export function resetSmtp() { smtp.calls.length=0;smtp.active=0;smtp.maxActive=0;smtp.handler=async()=>({messageId:"<qa@example.invalid>"}); }
after(async()=>{ await db.terminate();await deleteApp(app); });
