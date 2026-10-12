import "./noMailGuard.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { simpleParser } from "mailparser";
import { composer, person, clock, workbookFixture } from "./fixtures.mjs";
import { readPayrollWorkbook, detectPayrollMapping, parsePayrollRows, mergePayrollData, normalizePayrollName } from "../../../fe-wms/src/utils/payrollExcelImport.ts";
import { payrollEligibleIds, resolvePayrollMatch } from "../../../fe-wms/src/utils/payrollRecipients.ts";
import { payrollVariables, renderPayrollEmail, formatPayrollNumber, isPayrollBankAccountValid } from "@bduck/shared-types";
import { composerSchema, recipientSchema, payrollId } from "../../dist/services/payroll/payrollSchemas.js";
import { sanitizePayrollSignature } from "../../dist/services/payroll/payrollHtml.js";
import { createPayrollMime } from "../../dist/services/payroll/payrollMimeService.js";
import { applyBrevoEmailSignature } from "../../dist/services/brevoEmailSignature.js";
import { mailSafety } from "./noMailGuard.mjs";
async function parse(options) {
  const original = await workbookFixture(options);
  const book = await readPayrollWorkbook(original.file);
  const run = (sheet, kind) => parsePayrollRows(book, detectPayrollMapping(book,sheet),kind);
  const roster=run("Bảng kê lương","roster"),salary=run("Bảng lương Parttime AMTP","salary"),attendance=run("Bảng công","attendance");
  return { original,book,roster,salary,attendance,people:mergePayrollData(roster,salary,attendance) };
}

test("PAY-06: numeric display rounds to two decimals in HTML/text/MIME without altering source", async () => {
  const p = person();
  p.values.days = 7.1666666667;
  p.values.gross = 1234567.895;
  p.values.tax = -1.005;
  p.attendance[0].hours = 8.9999;
  p.attendance[0].missing_minutes = 0;
  const before = structuredClone(p);
  const rendered = renderPayrollEmail(composer(), p, clock);
  for (const output of [rendered.html, rendered.text]) {
    assert.ok(output.includes("7,17"));
    assert.ok(output.includes("1.234.567,9 đ"));
    assert.ok(output.includes("-1,01 đ"));
    assert.ok(!output.includes("7.1666666667"));
    assert.ok(output.includes("001234567890"));
  }
  assert.ok(rendered.html.includes(">9</td>"));
  assert.equal(formatPayrollNumber(1.005), "1,01");
  assert.equal(formatPayrollNumber(7.1666666667, "zh"), "7.17");
  assert.equal(formatPayrollNumber("001234567890"), "001234567890");
  assert.equal(formatPayrollNumber(0), "0");
  assert.deepEqual(p, before);
  const mime = await createPayrollMime({ ...rendered, name: p.name, email: p.email, clock, recipient_id: p.id });
  const parsed = await simpleParser(mime);
  assert.ok(parsed.html.includes("7,17"));
  assert.ok(parsed.text.includes("7,17"));
});
test("PAY-01/02: exact sample structure, repeated blocks, totals and unused data excluded", async () => {
  const r=await parse(); assert.equal(r.people.length,3);
  for(const p of r.people){assert.equal(p.attendance.length,2);assert.equal(p.attendance[0].date,"21/09/2026");}
  const html=renderPayrollEmail(composer(),r.people[0],clock).html;
  assert.ok(!html.includes("KHÔNG GỬI"));assert.ok(!html.includes("999999999"));assert.ok(!html.includes("NHÂN VIÊN MẪU"));
});
test("PAY-01: columns reordered and explicit first data row",async()=>{
  const r=await parse({reordered:true});assert.equal(r.people.length,3);assert.equal(r.people[0].name,person(0).name);
  const mapping=detectPayrollMapping(r.book,"Bảng kê lương");mapping.start_row=11;
  assert.equal(parsePayrollRows(r.book,mapping,"roster").rows.length,2);
});
test("PAY-03: normalize Unicode/case/whitespace while preserving diacritics",()=>{
  assert.equal(normalizePayrollName("  NGUYỄN   VĂN A "),normalizePayrollName("Nguyễn Văn A".normalize("NFD")));
  assert.notEqual(normalizePayrollName("Trần"),normalizePayrollName("Tran"));
});
test("PAY-03: duplicate names retained as unresolved with candidates",async()=>{
  const r=await parse({duplicateName:true});assert.equal(r.people.length,3);
  assert.equal(r.people.filter(p=>p.issues.some(i=>i.code==="MATCH_REQUIRED")).length,2);
  assert.equal(r.people[0].match_candidates.salary.length,2);
});
test("PAY-04: missing email reports actual row/sheet, fixed and excluded recipients eligible correctly",async()=>{
  const r=await parse({missingEmail:1});const p=r.people[1];
  assert.match(p.issues.find(i=>i.code==="MISSING_EMAIL").messages.vi,/dòng 11.*Bảng kê lương/);
  assert.ok(!payrollEligibleIds(r.people).has(p.id));p.email="fixed@example.invalid";assert.ok(payrollEligibleIds(r.people).has(p.id));
  p.email=r.people[0].email;assert.equal(payrollEligibleIds(r.people).size,1);
  p.selected=false;assert.ok(payrollEligibleIds(r.people).has(r.people[0].id));
});
test("PAY-05: gross/tax discrepancy warns and uses roster, net never recalculated",async()=>{
  const r=await parse();assert.equal(r.people[0].values.gross,1500000);assert.equal(r.people[0].values.tax,100000);
  assert.equal(r.people[0].values.net,1400000);assert.ok(r.people[0].issues.some(i=>i.code==="MONEY_MISMATCH"));
});
test("PAY-03/05: manual matching preserves profile/money, replaces shift counts and recomputes warnings",()=>{
 const p=person(),source={file:"salary.xlsx",sheet:"Lương",row:5};
 p.issues=[{code:"MATCH_REQUIRED",severity:"ERROR",source:p.source,messages:{vi:"match",zh:"match"}}];
 const r=resolvePayrollMatch(p,{name:"Other",source,issues:[],values:{job_title:"WRONG",bank_account:"WRONG",gross:99,net:88,tax:5,shifts7:9,days:10}},
  {name:"Other",source,issues:[],rows:[{date:"02/09/2026"}]});
 assert.equal(r.values.job_title,p.values.job_title);assert.equal(r.values.bank_account,p.values.bank_account);
 assert.equal(r.values.net,p.values.net);assert.equal(r.values.shifts7,9);assert.equal(r.attendance[0].date,"02/09/2026");
 assert.ok(r.issues.some(i=>i.code==="MONEY_MISMATCH"));assert.ok(!r.issues.some(i=>i.code==="MATCH_REQUIRED"));
});
test("PAY-06: cached formula read without evaluation; absent cache blocks recipient",async()=>{
  const good=await parse({formula:"cached"});assert.equal(good.people[0].values.gross,1500000);
  const bad=await parse({formula:"missing"});assert.ok(bad.people[0].issues.some(i=>i.code==="CELL_ERROR"&&i.source.column==="E"));
  assert.ok(!payrollEligibleIds(bad.people).has(bad.people[0].id));
});
test("PAY-06: account text zeroes, blank vs zero and numeric format preserved",async()=>{
  const r=await parse();assert.equal(r.people[0].values.bank_account,"001234567890");assert.equal(r.people[0].values.holiday,0);
  const sheet=r.original.workbook.getWorksheet("Bảng kê lương");sheet.getCell("H10").value=123;sheet.getCell("H10").numFmt="000000";
  const rows=parsePayrollRows(r.original,detectPayrollMapping(r.original,sheet.name),"roster");assert.equal(rows.rows[0].values.bank_account,"000123");
  sheet.getCell("H10").value=100000000000000000;assert.ok(parsePayrollRows(r.original,detectPayrollMapping(r.original,sheet.name),"roster").rows[0].issues.length);
});

test("PAY-06: missing/invalid bank accounts display urgent reminder in HTML/text/MIME",async()=>{
 for(const value of [undefined,null,"","   ","000000",0,-123,12.5,"12A345","12 345","<script>invalid</script>",1e18]) {
  assert.equal(isPayrollBankAccountValid(value),false);
  const p=person();p.values.bank_account=value;
  const rendered=renderPayrollEmail(composer(),p,clock);
  assert.ok(rendered.html.includes("Cần bổ sung gấp"));assert.ok(rendered.text.includes("Cần bổ sung gấp"));
  assert.ok(rendered.html.includes("color:#b42318"));assert.ok(!rendered.html.includes("<script>invalid"));
 }
 for(const value of ["001234567890","000123",123," 001234567890 "]) {
  assert.equal(isPayrollBankAccountValid(value),true);
  const p=person();p.values.bank_account=value;
  const rendered=renderPayrollEmail(composer(),p,clock);assert.ok(!rendered.html.includes("Cần bổ sung gấp"));assert.ok(rendered.text.includes(String(value)));
 }
 const p=person();p.values.bank_account=null;
 const rendered=renderPayrollEmail(composer(),p,clock);
 const mime=await createPayrollMime({...rendered,name:p.name,email:p.email,clock,recipient_id:p.id});
 const parsed=await simpleParser(mime);assert.ok(parsed.html.includes("Cần bổ sung gấp"));assert.ok(parsed.text.includes("Cần bổ sung gấp"));
 const c=composer();c.fields["employee-info"]=c.fields["employee-info"].filter(f=>f!=="bank_account");
 assert.ok(!renderPayrollEmail(c,p,clock).html.includes("Cần bổ sung gấp"));
});

test("PAY-06: account import warnings retain recipient eligibility and identify source",async()=>{
 const r=await parse();const sheet=r.original.workbook.getWorksheet("Bảng kê lương");
 for(const value of [null,"abc","000000",1e18,{formula:"1+1"}]) {
  sheet.getCell("H10").value=value;
  const roster=parsePayrollRows(r.original,detectPayrollMapping(r.original,sheet.name),"roster");
  const people=mergePayrollData(roster,r.salary,r.attendance);const p=people[0];
  const issue=p.issues.find(i=>i.field==="bank_account");assert.ok(issue);assert.equal(issue.severity,"WARNING");
  assert.ok(issue.messages.vi.includes("10"));assert.ok(issue.messages.vi.includes("Bảng kê lương"));assert.ok(issue.messages.vi.includes(r.original.file.name));
  assert.ok(payrollEligibleIds(people).has(p.id));
  assert.ok(renderPayrollEmail(composer(),p,clock).html.includes("Cần bổ sung gấp"));
 }
});
test("PAY-06: invalid file type/size/archive rejected",async()=>{
  await assert.rejects(readPayrollWorkbook(new File(["x"],"bad.exe")));
  await assert.rejects(readPayrollWorkbook(new File(["not zip"],"bad.xlsx")));
  await assert.rejects(readPayrollWorkbook(new File([new Uint8Array(10*1024*1024+1)],"large.xlsx")));
});
test("PAY-07: January month/year offsets independent, Saigon boundary",()=>{
  const jan="2026-12-31T17:01:00Z";
  assert.equal(payrollVariables("@(tMonth-1)@/@tYear@","A",jan),"12/2027");
  assert.equal(payrollVariables("@(tMonth-1)@/@(tYear-1)@","A",jan),"12/2026");
  assert.equal(payrollVariables("@(tMonth-1)@/@tYear@","A",clock),"09/2026");
});
test("PAY-07: split Quill variable, formatting and unknown/prototype variables",()=>{
  const c=composer();c.ops=[{insert:"Chào @na",attributes:{bold:true}},{insert:"me@,\n"}];
  const r=renderPayrollEmail(c,person(),clock);assert.ok(r.html.includes(person().name));assert.ok(!r.html.includes("@na"));
  assert.throws(()=>payrollVariables("@constructor@","A",clock));
  assert.throws(()=>payrollVariables("@(tMonth+1)@","A",clock));
});
test("PAY-07: employee data escaped, CRLF subject sanitized, malicious links excluded",()=>{
  const p=person(0,{name:'<img src=x onerror=alert(1)>\r\nBcc: evil@example.invalid'});const c=composer();
  c.ops.push({insert:"attack",attributes:{link:"javascript:alert(1)"}});
  const r=renderPayrollEmail(c,p,clock);assert.ok(!r.html.includes("<img src=x"));assert.ok(!r.html.includes('href="javascript:'));
  assert.ok(!/[\r\n]/.test(r.subject));
});
test("PAY-09: sanitize signature strips scripts/events/style URL while preserving table formatting",()=>{
  const h=sanitizePayrollSignature('<script>alert(1)</script><table cellpadding="0"><tr><td style="color:#123456;padding:8px;background-image:url(https://evil.invalid)"><a href="javascript:alert(1)" onclick="x()">QA</a></td></tr></table>');
  assert.ok(!h.includes("script"));assert.ok(!h.includes("onclick"));assert.ok(!h.includes("javascript:"));assert.ok(!h.includes("background-image"));assert.ok(h.includes("padding:8px"));
});
test("PAY-09/12: one signature, UTF-8 MIME parsed, one To and isolated employee content",async()=>{
  const r=renderPayrollEmail(composer(),person(),clock,"<p>QA unique signature</p>","QA unique signature");
  const mime=await createPayrollMime({...r,name:person().name,email:person().email,clock,recipient_id:person().id});
  const parsed=await simpleParser(mime);
  assert.equal(parsed.to.value.length,1);assert.equal(parsed.to.value[0].address,person().email);assert.equal(parsed.subject,r.subject);
  assert.equal((parsed.html.match(/QA unique signature/g)||[]).length,1);assert.ok(parsed.html.includes("001234567890"));
  assert.ok(!parsed.html.includes(person(1).email));assert.ok(parsed.text.includes("QA unique signature"));
});
test("PAY-09/19: legacy env signature slot and default append remain compatible",()=>{
  assert.equal(applyBrevoEmailSignature("Body","Text","SIGN","SIGTXT").htmlContent,"BodySIGN");
  assert.equal(applyBrevoEmailSignature("A<!-- BREVO_EMAIL_SIGNATURE -->B","T","S","s").htmlContent,"ASB");
});
test("PAY-11: schema rejects path traversal/prototype keys/duplicate blocks and accepts partial maps",()=>{
  assert.ok(!payrollId.safeParse("../../secrets").success);
  assert.ok(composerSchema.safeParse({...composer(),mappings:{roster:{sheet:"A",start_row:10,columns:{name:"B",email:"C"}}}}).success);
  const c=composer();c.ops.push({insert:{payroll:"payslip"}});assert.ok(!composerSchema.safeParse(c).success);
  assert.ok(!recipientSchema.safeParse({...person(),values:JSON.parse('{"__proto__":"bad"}')}).success);
});
test("PAY-13: 100 people parsed with unique identities, no artificial row limit",async()=>{
  const r=await parse({count:100});assert.equal(r.people.length,100);assert.equal(payrollEligibleIds(r.people).size,100);
});
test("SAFETY: real SMTP transport blocked even when service invoked accidentally",async()=>{
  const {sendBrevoEmail}=await import("../../dist/services/brevoEmailService.js");
  await assert.rejects(sendBrevoEmail({to:["blocked@example.invalid"],subject:"QA",htmlContent:"QA",textContent:"QA"}),/REAL_SMTP_BLOCKED/);
  assert.equal(mailSafety.realSmtpCreated,0);assert.equal(mailSafety.blockedSmtp,1);
});
