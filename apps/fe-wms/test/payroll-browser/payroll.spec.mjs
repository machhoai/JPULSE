import {test,expect} from "@playwright/test";
import {workbookFixture} from "../../../be-wms/test/payroll/fixtures.mjs";
import {createPayrollComposer} from "@bduck/shared-types";
async function setup(page,{count=3,missingEmail=-1,mismatchedProfile=false,realApi=false,bankAccount}={}) {
 const requests=[],drafts=new Map(),people=new Map();
 const baseComposer=createPayrollComposer();
 const template={id:"qa-template",name:"Mẫu cửa hàng QA",facility_id:"store-a",revision:1,composer:baseComposer};
 const state={templates:[template],signatures:[],default_signature:{html:"<p>QA default signature</p>",text:"QA default signature"}};
 let job=null;
 await page.route("**/*",async route=>{
  const url=new URL(route.request().url());
  if(url.origin==="http://127.0.0.1:4407")return route.continue();
  if(url.hostname!=="api.wms.localhost"||!url.pathname.startsWith("/api/notifications/payroll/"))return route.abort("blockedbyclient");
  const path=url.pathname.replace("/api/notifications/payroll",""),method=route.request().method();
  const body=route.request().postDataJSON();
  let data=null;
  if(method==="OPTIONS")return route.fulfill({status:204,headers:{"Access-Control-Allow-Origin":"http://127.0.0.1:4407","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Credentials":"true","Access-Control-Allow-Methods":"GET,POST,PUT,DELETE,OPTIONS"}});
  requests.push({path,method,body});
  if(realApi){
   const response=await route.fetch({url:"http://127.0.0.1:4408/payroll"+path+url.search});
   const result=await response.json();if(path==="/jobs"&&result.success)await page.evaluate(j=>window.__payrollQa.publishJob(j),result.data);
   return route.fulfill({response,headers:{...response.headers(),"Access-Control-Allow-Origin":"http://127.0.0.1:4407","Access-Control-Allow-Credentials":"true"}});
  }
  if(path==="/catalog")data=state;
  else if(path==="/drafts")data=[...drafts.values()].map(d=>d.meta);
  else if(path==="/history")data={records:[],cursor:null};
  else if(method==="PUT"&&/^\/drafts\/[^/]+$/.test(path)){
   const id=path.split("/")[2],old=drafts.get(id);const meta={id,revision:(old?.meta.revision||0)+1,facility_id:"store-a",template_id:"qa-template",name:body.name,created_by:"qa-browser"};
   drafts.set(id,{meta,content:body});data=meta;
  } else if(method==="PUT"&&path.includes("/recipients/")){const parts=path.split("/");people.set(parts[2]+":"+parts[4],body);data={id:parts[4]};}
  else if(method==="GET"&&/^\/drafts\/[^/]+$/.test(path))data=drafts.get(path.split("/")[2]);
  else if(method==="GET"&&path.endsWith("/recipients")){
   const id=path.split("/")[2];data={people:[...people.entries()].filter(([key])=>key.startsWith(id+":")).map(([,p])=>p),cursor:null};
  } else if(path==="/jobs"&&method==="POST"){
   job={id:"qa-job",facility_id:"store-a",created_by:"qa-browser",draft_id:body.draft_id,status:"COMPLETED",total:body.recipient_ids.length,sent:body.recipient_ids.length,failed:0,unknown:0};
   await page.evaluate(j=>window.__payrollQa.publishJob(j),job);data=job;
  } else if(path==="/jobs/qa-job")data={job,people:[...people.values()].filter(p=>p.selected).map(p=>({id:p.id,name:p.name,email:p.email,status:"SENT",error:null}))};
  else if(path.endsWith("/test"))data={messageId:"<mock-test@example.invalid>"};
  else if(method==="PUT"&&path.startsWith("/signatures/")){
   const id=path.split("/")[2];state.signatures.push({id,name:body.name,html:body.html,text:body.html.replace(/<[^>]*>/g,""),revision:1});data=state.signatures.at(-1);
  } else if(method==="PUT"&&path.startsWith("/templates/")){
   const id=path.split("/")[2];const index=state.templates.findIndex(t=>t.id===id);const value={id,...body,revision:(state.templates[index]?.revision||0)+1};
   if(index>=0)state.templates[index]=value;else state.templates.push(value);data=value;
  } else return route.fulfill({status:500,body:JSON.stringify({success:false,messages:{vi:"QA endpoint missing "+path,zh:"QA missing"}})});
  await route.fulfill({status:200,contentType:"application/json",headers:{"Access-Control-Allow-Origin":"http://127.0.0.1:4407","Access-Control-Allow-Credentials":"true"},body:JSON.stringify({success:true,data,messages:{vi:"QA",zh:"QA"}})});
 });
 const errors=[];page.on("pageerror",error=>errors.push(error.message));
 await page.goto("/");await page.getByRole("combobox",{name:"Mẫu nội dung",exact:true}).selectOption("qa-template");
 const fixture=await workbookFixture({count,missingEmail,mismatchedProfile,bankAccount});const bytes=Buffer.from(await fixture.file.arrayBuffer());
 return{requests,errors,state,drafts,people,bytes};
}
async function importData(page,qa){
 await page.locator('input[type="file"]').first().setInputFiles({name:"qa-payroll.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:qa.bytes});
 await expect(page.getByRole("group",{name:"Bảng kê lương",exact:true}).getByRole("combobox").first()).toHaveValue("0");
 await page.getByRole("group",{name:"Bảng lương",exact:true}).getByRole("combobox").first().selectOption("0");
 await page.getByRole("group",{name:"Bảng công",exact:true}).getByRole("combobox").first().selectOption("0");
 await page.getByRole("button",{name:"Đọc và đối chiếu",exact:true}).click();
 await expect(page.getByRole("dialog")).toBeVisible();
 await page.getByRole("button",{name:"Xác nhận",exact:true}).click();
 await expect(page.getByRole("heading",{name:/Người nhận/})).toBeVisible();
}
test("PAY-18 desktop: source mapping, all employees and responsive personal preview",async({page})=>{
 const qa=await setup(page);await importData(page,qa);
 await expect(page.getByRole("heading",{name:"Người nhận (3)"})).toBeVisible();
 await expect(page.getByLabel("Email: Nhân viên QA 0",{exact:true})).toHaveValue("person-0@example.invalid");
 const frame=page.frameLocator('iframe[title="Xem trước"]');
 await expect(frame.getByText("Nhân viên QA 0",{exact:true}).first()).toBeVisible();
 await expect(frame.getByText("QA default signature")).toBeVisible();
 await expect(frame.getByText("person-1@example.invalid")).toHaveCount(0);
 expect(qa.errors).toEqual([]);
 await page.locator('iframe[title="Xem trước"]').scrollIntoViewIfNeeded();await page.screenshot({path:"../../.tmp/payroll-desktop.png",fullPage:true});
});

test("PAY-02 new unsaved template: clicking file input opens chooser and mappings survive save",async({page})=>{
 const qa=await setup(page);
 await page.getByRole("button",{name:"Tạo mẫu mới",exact:true}).click();
 await page.getByLabel("Tên",{exact:true}).first().fill("Mẫu mới QA");
 await page.getByRole("combobox",{name:"Cửa hàng",exact:true}).selectOption("store-a");
 await expect(page.getByText(/Mẫu chưa lưu/)).toBeVisible();
 const input=page.locator('input[type="file"]').first();
 await expect(input).toBeEnabled();
 const chooserPromise=page.waitForEvent("filechooser");
 await input.click();
 const chooser=await chooserPromise;
 await chooser.setFiles({name:"qa-new-payroll.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:qa.bytes});
 const roster=page.getByRole("group",{name:"Bảng kê lương",exact:true});
 await expect(roster.getByRole("combobox").first()).toHaveValue("0");
 await expect(roster.getByRole("combobox",{name:"Sheet",exact:true})).toHaveValue("Bảng kê lương");
 await page.getByRole("button",{name:"Lưu mẫu",exact:true}).click();
 await expect(page.getByText(/Mẫu chưa lưu/)).toHaveCount(0);
 expect(qa.state.templates.find(t=>t.name==="Mẫu mới QA").composer.mappings.roster.sheet).toBe("Bảng kê lương");
 // Saved templates also open the native chooser; setInputFiles alone would bypass this regression.
 const savedChooserPromise=page.waitForEvent("filechooser");
 await input.click();
 const savedChooser=await savedChooserPromise;
 await savedChooser.setFiles({name:"qa-another.xlsx",mimeType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",buffer:qa.bytes});
 await expect(roster.getByRole("combobox").first()).toHaveValue("1");
 expect(qa.requests.some(r=>r.path.endsWith("/test")||r.path==="/jobs")).toBe(false);
 expect(qa.errors).toEqual([]);
});

test("PAY-06 missing bank account: source warning and urgent reminder without blocking eligible email",async({page})=>{
 const qa=await setup(page,{bankAccount:null});await importData(page,qa);
 await expect(page.getByText(/Thiếu STK tại dòng 10 trong sheet Bảng kê lương/)).toBeVisible();
 const frame=page.frameLocator('iframe[title="Xem trước"]');
 const accountRow=frame.getByRole("row").filter({has:frame.getByRole("rowheader",{name:"STK ngân hàng",exact:true})});
 await expect(accountRow.getByRole("cell")).toHaveText("Cần bổ sung gấp");
 await expect(page.getByRole("button",{name:"Gửi ở nền (3)",exact:true})).toBeEnabled();
 await page.locator('iframe[title="Xem trước"]').screenshot({path:"../../.tmp/payroll-bank-account-reminder.png"});
 expect(qa.requests.some(r=>r.path.endsWith("/test")||r.path==="/jobs")).toBe(false);
 expect(qa.errors).toEqual([]);
});
test("PAY-08: hide nonempty field requires confirmation, cancel retains and accept hides",async({page})=>{
 const qa=await setup(page);await importData(page,qa);
 const settings=page.locator("details").filter({has:page.locator('summary',{hasText:"Trường dữ liệu"})}).last();await settings.locator("summary").click();
 const net=settings.getByLabel("Thực nhận",{exact:true});await net.click();
 await expect(page.getByRole("dialog")).toContainText("Thực nhận");
 await page.getByRole("button",{name:"Hủy",exact:true}).click();await expect(net).toBeChecked();
 await net.click();await page.getByRole("button",{name:"Xác nhận",exact:true}).click();await expect(net).not.toBeChecked();
 await expect(page.frameLocator('iframe[title="Xem trước"]').getByText("Thực nhận",{exact:true})).toHaveCount(0);
});
test("PAY-08 Quill: text entry stable, cut/remove fixed table guarded, reject restores",async({page})=>{
 const qa=await setup(page);await importData(page,qa);
 const editor=page.locator(".ql-editor");await expect(editor).toBeVisible();
 await editor.locator("p").first().click();await page.keyboard.press("Control+Home");await page.keyboard.type("QA typed ");
 await expect(editor).toContainText("QA typed");
 await expect(editor.locator(".payroll-fixed-table")).toHaveCount(3);
 await editor.locator("p").first().click();await page.keyboard.press("Control+A");await page.keyboard.press("Backspace");
 await expect(page.getByRole("dialog")).toBeVisible();
 await page.getByRole("button",{name:"Hủy",exact:true}).click();
 await expect(editor.locator(".payroll-fixed-table")).toHaveCount(3);
 await editor.locator("p").first().click();await page.keyboard.press("Control+A");await page.keyboard.press("Backspace");
 await page.getByRole("button",{name:"Xác nhận",exact:true}).click();
 await expect(editor.locator(".payroll-fixed-table")).toHaveCount(0);
});
test("PAY-04: missing email blocks send, editing or deselecting resolves",async({page})=>{
 const qa=await setup(page,{missingEmail:1});await importData(page,qa);
 await expect(page.getByText(/Thiếu email tại dòng 11/)).toBeVisible();
 await expect(page.getByRole("button",{name:/Gửi ở nền/})).toBeDisabled();
 await page.getByLabel("Email: Nhân viên QA 1",{exact:true}).fill("fixed@example.invalid");
 await expect(page.getByRole("button",{name:/Gửi ở nền/})).toBeEnabled();
});
test("PAY-10/17: draft save/reopen, test-send and background request through mocks",async({page})=>{
 const qa=await setup(page);await importData(page,qa);
 await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();
 await expect.poll(()=>qa.drafts.size).toBe(1);const id=[...qa.drafts.keys()][0];
 await expect.poll(()=>qa.people.size).toBe(3);
 await page.getByLabel("Mở bản nháp",{exact:true}).selectOption(id);
 await expect(page.getByRole("heading",{name:"Người nhận (3)"})).toBeVisible();
 await page.getByLabel("Email nhận mẫu",{exact:true}).fill("qa-inbox@example.invalid");
 await page.getByRole("button",{name:"Gửi email này cho tôi",exact:true}).click();
 await expect.poll(()=>qa.requests.filter(r=>r.path.endsWith("/test")).length).toBe(1);
 expect(qa.requests.find(r=>r.path.endsWith("/test")).body.email).toBe("qa-inbox@example.invalid");
 await page.getByRole("button",{name:/Gửi ở nền/}).click();
 await expect(page.getByRole("heading",{name:"Tiến độ đợt gửi",exact:true})).toBeVisible();
 await expect.poll(()=>qa.requests.filter(r=>r.path==="/jobs").length).toBe(1);
 expect(qa.requests.find(r=>r.path==="/jobs").body.recipient_ids).toHaveLength(3);
});
test("PAY-18 mobile: four-step wizard, cards and no page horizontal overflow",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const qa=await setup(page);await importData(page,qa);
 const nav=page.getByRole("navigation",{name:"Bảng công & lương"});
 await expect(nav).toBeVisible();await nav.getByRole("button",{name:"Xem trước",exact:true}).click();
 await expect(page.locator('iframe[title="Xem trước"]')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
 const frame=page.frameLocator('iframe[title="Xem trước"]');await expect(frame.getByText("QA default signature")).toBeVisible();
 await page.screenshot({path:"../../.tmp/payroll-mobile.png",fullPage:true});
});
test("PAY-10: logout clears device ciphertext and keys after leaving notifications page",async({page})=>{
 const qa=await setup(page);await importData(page,qa);await page.waitForTimeout(900);
 await page.evaluate(()=>window.__payrollQa.logout());await page.waitForTimeout(250);
 const counts=await page.evaluate(()=>new Promise(resolve=>{
  const req=indexedDB.open("payroll-private-v1");req.onsuccess=()=>{const db=req.result,tx=db.transaction(["keys","drafts"]);const keys=tx.objectStore("keys").count(),drafts=tx.objectStore("drafts").count();tx.oncomplete=()=>{resolve([keys.result,drafts.result]);db.close();};};
 }));
 expect(counts).toEqual([0,0]);
});

test("PAY-03 manual match preserves roster employee profile and canonical amounts",async({page})=>{
 const qa=await setup(page,{count:1,mismatchedProfile:true});await importData(page,qa);
 await expect(page.getByRole("button",{name:/Gửi ở nền/})).toBeDisabled();
 const table=page.locator("table").first();
 await table.getByRole("combobox",{name:"Bảng lương",exact:true}).selectOption("0");
 await table.getByRole("combobox",{name:"Bảng công",exact:true}).selectOption("0");
 await table.getByRole("button",{name:"Xác nhận ghép",exact:true}).click();
 await expect(page.getByRole("button",{name:/Gửi ở nền/})).toBeEnabled();
 const frame=page.frameLocator('iframe[title="Xem trước"]');
 await expect(frame.getByText("Vận hành",{exact:true})).toBeVisible();
 await expect(frame.getByText("KHÔNG DÙNG CHỨC VỤ TỪ BẢNG LƯƠNG")).toHaveCount(0);
});
test("PAY-08 Quill undo/redo restores text without duplicating tables",async({page})=>{
 const qa=await setup(page);await importData(page,qa);
 const editor=page.locator(".ql-editor");await editor.locator("p").first().click();await page.keyboard.press("Control+Home");
 await page.keyboard.type("UNDO_QA ");await expect(editor).toContainText("UNDO_QA");
 await page.keyboard.press("Control+z");await expect(editor).not.toContainText("UNDO_QA");
 await page.keyboard.press("Control+Shift+z");await expect(editor).toContainText("UNDO_QA");
 await expect(editor.locator(".payroll-fixed-table")).toHaveCount(3);
});
test("PAY-10 offline keeps encrypted device draft, emits no send/save HTTP requests",async({page,context})=>{
 const qa=await setup(page);await importData(page,qa);
 await context.setOffline(true);await expect(page.getByText(/Đang offline:/)).toBeVisible();
 const before=qa.requests.filter(r=>r.method==="PUT"||r.path==="/jobs").length;
 await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();await page.waitForTimeout(800);
 expect(qa.requests.filter(r=>r.method==="PUT"||r.path==="/jobs").length).toBe(before);
 await expect(page.getByRole("button",{name:/Gửi ở nền/})).toBeDisabled();
 const saved=await page.evaluate(()=>new Promise(resolve=>{
  const req=indexedDB.open("payroll-private-v1");req.onsuccess=()=>{const db=req.result,tx=db.transaction(["keys","drafts"]);const keys=tx.objectStore("keys").getAll(),values=tx.objectStore("drafts").getAll();
   tx.oncomplete=()=>{resolve({extractable:keys.result[0]?.extractable,raw:JSON.stringify(values.result),count:values.result.length});db.close();};};
 }));
 expect(saved.count).toBe(1);expect(saved.extractable).toBe(false);expect(saved.raw).not.toContain("001234567890");expect(saved.raw).not.toContain("Nhân viên QA");
});
test("PAY-09 UI custom named signature selectable and rendered exactly once",async({page})=>{
 const qa=await setup(page);await importData(page,qa);
 await page.getByRole("button",{name:"Quản lý chữ ký",exact:true}).click();
 const manager=page.getByRole("dialog",{name:"Quản lý chữ ký",exact:true});
 await expect(manager).toBeVisible();await manager.getByLabel("Tên",{exact:true}).fill("Chữ ký QA");
 await manager.getByLabel("Nội dung HTML",{exact:true}).fill("<p>QA chữ ký riêng</p>");
 await manager.getByRole("button",{name:"Lưu",exact:true}).click();
 await expect.poll(()=>qa.state.signatures.length).toBe(1);
 await expect(manager.getByLabel("Tên",{exact:true})).toHaveValue("");
 await manager.getByRole("button",{name:"Đóng",exact:true}).last().click();
 await page.getByRole("combobox",{name:"Chữ ký",exact:true}).first().selectOption(qa.state.signatures[0].id);
 const frame=page.frameLocator('iframe[title="Xem trước"]');
 await expect(frame.getByText("QA chữ ký riêng",{exact:true})).toHaveCount(1);
 await expect(frame.getByText("QA default signature")).toHaveCount(0);
});

test("PAY-09 signature manager: header modal, Escape/focus, mobile width and revoked access",async({page})=>{
 await setup(page);
 const trigger=page.getByRole("button",{name:"Quản lý chữ ký",exact:true});
 await expect(page.getByRole("banner").getByRole("button",{name:"Quản lý chữ ký",exact:true})).toBeVisible();
 await expect(page.getByRole("region",{name:"Payroll workspace"}).getByRole("button",{name:"Quản lý chữ ký",exact:true})).toHaveCount(0);
 await trigger.click();
 const manager=page.getByRole("dialog",{name:"Quản lý chữ ký",exact:true});
 await expect(manager).toBeVisible();
 await page.keyboard.press("Escape");await expect(manager).toHaveCount(0);await expect(trigger).toBeFocused();
 await page.setViewportSize({width:390,height:844});
 await trigger.click();await expect(manager).toBeVisible();
 await expect(manager.getByLabel("Tên",{exact:true})).toBeVisible();
 const bounds=await manager.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(390);
 expect(await manager.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 await page.screenshot({path:"../../.tmp/email-signatures-mobile.png"});
 await page.evaluate(()=>window.__payrollQa.restrictSignatures());
 await expect(manager).toHaveCount(0);await expect(trigger).toHaveCount(0);
});

test("PAY-18 E2E real API/emulator: import, encrypted draft, background worker mock, success history",async({page})=>{
 const qa=await setup(page,{realApi:true});await importData(page,qa);
 await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();
 await expect(page.getByRole("button",{name:"Lưu bản nháp",exact:true})).toBeEnabled();
 await page.getByRole("button",{name:/Gửi ở nền/}).click();
 await expect(page.getByRole("heading",{name:"Tiến độ đợt gửi",exact:true})).toBeVisible();
 const last=qa.requests.findLast(r=>r.path==="/jobs");
 const response=await page.request.get("http://127.0.0.1:4408/payroll/drafts/"+last.body.draft_id);
 const draft=await response.json();expect(draft.data.meta.created_by).toBe("qa-browser");expect(draft.data.meta.payload_path).toMatch(/^payroll-private/);
 const jobId=await page.evaluate(()=>document.body.textContent.includes("Tiến độ")&&window.__lastPayrollJobId);
 // Obtain actual job id from the request fingerprint and the service actor identity.
 const crypto=await import("node:crypto");const id=crypto.createHash("sha256").update("qa-browser:"+last.body.request_id).digest("hex");
 const processed=await page.request.post("http://127.0.0.1:4408/__qa/process",{data:{id}});expect(processed.ok()).toBeTruthy();
 const job=await processed.json();expect(job.sent).toBe(3);expect(job.status).toBe("COMPLETED");
 await page.evaluate(j=>window.__payrollQa.publishJob(j),job);
 await expect(page.getByText("Đã gửi: 3/3",{exact:false})).toBeVisible();
 const metrics=await(await page.request.get("http://127.0.0.1:4408/__qa/metrics")).json();
 expect(metrics.mockOnly).toBe(true);expect(metrics.smtpCalls).toBe(3);expect(metrics.recipientCounts).toEqual([1,1,1]);
});

test("PAY-11 UI: permission revoked during pending draft load cannot restore salary data",async({page})=>{
 const qa=await setup(page);await importData(page,qa);
 await page.getByRole("button",{name:"Lưu bản nháp",exact:true}).click();
 await expect.poll(()=>qa.people.size).toBe(3);
 const id=[...qa.drafts.keys()][0];let held;
 const ready=new Promise(resolve=>{page.route("**/drafts/"+id,route=>{held=route;resolve();});});
 await page.getByLabel("Mở bản nháp",{exact:true}).selectOption(id);await ready;
 await page.evaluate(()=>window.__payrollQa.restrictCompose());
 await held.fulfill({status:200,contentType:"application/json",headers:{"Access-Control-Allow-Origin":"http://127.0.0.1:4407","Access-Control-Allow-Credentials":"true"},
   body:JSON.stringify({success:true,data:qa.drafts.get(id),messages:{vi:"QA",zh:"QA"}})});
 await expect(page.getByRole("alert").filter({hasText:"Bạn chưa được cấp quyền"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Người nhận (3)"})).toHaveCount(0);
});
