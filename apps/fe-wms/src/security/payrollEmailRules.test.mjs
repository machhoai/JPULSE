import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { before, after } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, query, collection, where, setDoc } from "firebase/firestore";
if(process.env.FIRESTORE_EMULATOR_HOST!=="127.0.0.1:8485")throw new Error("RULES_TEST_REQUIRES_LOCAL_PAYROLL_EMULATOR");
let env;
before(async()=>{
 env=await initializeTestEnvironment({projectId:"demo-payroll-rules",firestore:{host:"127.0.0.1",port:8485,rules:await readFile(new URL("../../../../firestore.rules",import.meta.url),"utf8")}});
 await env.withSecurityRulesDisabled(async ctx=>{
  const db=ctx.firestore();
  for(const [id,rights]of [["sender",{"notifications.payroll.send":true}],["reader",{"notifications.payroll.history.read":true}],["ordinary",{"notifications.read":true}],["downloader",{"notifications.payroll.download":true}]]){
    await setDoc(doc(db,"users",id),{status:"ACTIVE",is_deleted:false,workplace_facility_id:"store-a"});
    await setDoc(doc(db,"user_access",id),{active_version_id:"v1",access_version:1,is_global_admin:false,is_deleted:false});
    await setDoc(doc(db,"user_access",id,"versions","v1","facilities","store-a"),{user_id:id,facility_id:"store-a",access_version_id:"v1",access_version:1,is_deleted:false,permissions:rights});
  }
  for(const [id,facility,owner]of [["job-a","store-a","sender"],["job-b","store-b","sender"],["job-other","store-a","other"]])
   await setDoc(doc(db,"payroll_email_jobs",id),{facility_id:facility,created_by:owner,is_deleted:false});
  await setDoc(doc(db,"payroll_email_jobs","job-a","items","person-a"),{payload_path:"private"});
  for(const [id,facility]of [["sent-a","store-a"],["sent-b","store-b"]])
   await setDoc(doc(db,"payroll_email_sent_records",id),{facility_id:facility,is_deleted:false});
  await setDoc(doc(db,"payroll_email_drafts","private"),{facility_id:"store-a",created_by:"sender",payload_path:"private"});
  await setDoc(doc(db,"payroll_email_templates","common"),{facility_id:"store-a",is_deleted:false});
  await setDoc(doc(db,"payroll_catalog","version"),{revision:1});
 });
});
after(async()=>await env?.cleanup());
test("PAY-11 rules: sender can read own job within allowed store only",async()=>{
 const db=env.authenticatedContext("sender").firestore();
 await assertSucceeds(getDoc(doc(db,"payroll_email_jobs","job-a")));
 await assertFails(getDoc(doc(db,"payroll_email_jobs","job-b")));
 await assertFails(getDoc(doc(db,"payroll_email_jobs","job-other")));
 await assertFails(getDoc(doc(db,"payroll_email_jobs","job-a","items","person-a")));
});
test("PAY-11 rules: history permission scoped, ordinary notification/read/download not payroll history",async()=>{
 const db=env.authenticatedContext("reader").firestore();
 await assertSucceeds(getDoc(doc(db,"payroll_email_sent_records","sent-a")));
 await assertFails(getDoc(doc(db,"payroll_email_sent_records","sent-b")));
 await assertSucceeds(getDocs(query(collection(db,"payroll_email_sent_records"),where("facility_id","==","store-a"))));
 await assertFails(getDocs(collection(db,"payroll_email_sent_records")));
 for(const user of ["ordinary","downloader","sender"])await assertFails(getDoc(doc(env.authenticatedContext(user).firestore(),"payroll_email_sent_records","sent-a")));
});
test("PAY-11 rules: clients cannot write payroll state or fetch private drafts/templates",async()=>{
 const db=env.authenticatedContext("sender").firestore();
 await assertFails(setDoc(doc(db,"payroll_email_jobs","forged"),{facility_id:"store-a",created_by:"sender"}));
 await assertFails(setDoc(doc(db,"payroll_email_sent_records","forged"),{facility_id:"store-a"}));
 await assertFails(getDoc(doc(db,"payroll_email_drafts","private")));
 await assertFails(getDoc(doc(db,"payroll_email_templates","common")));
 await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),"payroll_catalog","version")));
 await assertSucceeds(getDoc(doc(db,"payroll_catalog","version")));
});
