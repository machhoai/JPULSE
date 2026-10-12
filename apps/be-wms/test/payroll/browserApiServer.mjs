import express from "express";
import {mock} from "node:test";
import {randomUUID} from "node:crypto";
process.env.FIRESTORE_EMULATOR_HOST="127.0.0.1:8485";
process.env.PAYROLL_QA_PROJECT="demo-payroll-browser-"+randomUUID().replaceAll("-","").slice(0,12);
const h=await import("./emulatorHarness.mjs");
mock.module(new URL("../../dist/api/middlewares/authMiddleware.js",import.meta.url).href,{namedExports:{
 requireAuth:(req,res,next)=>{req.user={id:"qa-browser"};req.accessContext=h.accessFor("qa-browser","store-a").context;next();}
}});
await h.db.collection("warehouses").doc("store-a").set({id:"store-a",name:"QA Store",type:"STORE",is_deleted:false});
const {composer}=await import("./fixtures.mjs");
await h.management.savePayrollTemplate("qa-template",{name:"Mẫu cửa hàng QA",facility_id:"store-a",composer:composer(),revision:0},"qa-browser",h.accessFor("qa-browser","store-a"));
const {default:routes}=await import("../../dist/api/routes/payrollEmailRoutes.js");
const app=express();app.use(express.json({limit:"15mb"}));app.use("/payroll",routes);
app.get("/__qa/metrics",(_req,res)=>res.json({smtpCalls:h.smtp.calls.length,recipientCounts:h.smtp.calls.map(c=>c.to.length),mockOnly:true}));
app.post("/__qa/process",async(req,res)=>{
 try{await h.prepare(await h.repo.getPayrollRecord("jobs",req.body.id));await h.worker.processPayrollJob(req.body.id);
  res.json(await h.repo.getPayrollRecord("jobs",req.body.id));}
 catch(e){res.status(500).json({error:String(e)});}
});
app.listen(4408,"127.0.0.1",()=>process.stdout.write("PAYROLL_BROWSER_API_READY mock SMTP only\n"));
