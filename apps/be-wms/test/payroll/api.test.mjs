import assert from "node:assert/strict";
import test, { mock, after } from "node:test";
import express from "express";
import { createRequire } from "node:module";
import { once } from "node:events";
import { simpleParser } from "mailparser";
import { db, scenario, accessFor, smtp, resetSmtp } from "./emulatorHarness.mjs";
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
