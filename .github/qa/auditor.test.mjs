import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CHECKOUT,parseCSV,parseReport,reconcile,priceAudit,parseDay,toCents,auditCSV,caseScripts,reminderICS,isoDay } from "../../assets/auditor.js";
const fixture=name=>readFileSync(new URL("./fixtures/"+name+".csv",import.meta.url),"utf8");
const now=parseDay("2026-11-18");
const parse=(s,n="fixture",order)=>parseReport(s,n,order,now);
const detail="Date,FNSKU,Event Type,Reason,Quantity,Reference ID";
const summary="Date,FNSKU,MSKU,Lost,Damaged,Found";
const event=(age,n,id="SKU",ref="",reason="lost")=>[isoDay(now-age),id,"Adjustment",reason,n,ref].join(",");
const audit=(...reports)=>reconcile(reports,now);
const tested=[parse(fixture("summary"),"summary"),parse(fixture("detailed"),"detail"),parse(fixture("reimbursements"),"paid")];
test("supplied row has twelve units at the illustrative $15",()=>{
 const p=priceAudit(audit(tested[0]));
 assert.equal(p.units,12);assert.equal(p.total,18000);assert.equal(p.rows[0].costSource,"Illustrative default");
});
test("reimbursement total and MSKU alias subtract three units including cash when inventory is zero",()=>{
 const a=audit(...tested), p=priceAudit(a);
 assert.equal(p.units,12);assert.equal(p.total,18000);assert.equal(p.urgent,4500);assert.equal(a.expired,2);assert.equal(a.paid,3);
 assert.equal(p.rows[0].ref,"REF-1");assert.equal(p.rows[0].found,1);assert.equal(p.rows[0].open,3);
});
test("BOM, CRLF, quoted commas, escaped quotes and multiline text retain physical row locations",()=>{
 const r=parseCSV('\uFEFFA,B\r\n"one, two","two ""quotes""\r\nnext"\r\nz,ok\r\n');
 assert.deepEqual(r[1],{line:2,fields:["one, two",'two "quotes"\nnext']});assert.equal(r[2].line,4);
});
test("bad files produce actionable errors",()=>{
 for(const [s,re] of [["",/empty/],["FNSKU,Quantity",/data row/],["Foo,Bar\nx,y",/identifier/],["FNSKU,Title\nX,Q",/Unrecognized/],[summary+"\n2026-11-10,X,S,1,4",/columns/],[summary+'\n"not closed',/Unclosed/],["Date,FNSKU,Lost,Found\n2026-11-10,X,2,0",/damaged/],[summary+"\n2026-11-10,X,S,apple,0,0",/whole number/],[summary+"\n2027-12-01,X,S,1,0,0",/future/],[summary+"\n2026-02-30,X,S,1,0,0",/Invalid calendar/],["FNSKU,Quantity\nx,-1",/reversals/]])assert.throws(()=>parse(s),re);
});
test("alternate dates, explicit locale and leap days",()=>{
 assert.equal(parseDay("11/18/2026"),now);assert.equal(parseDay("18/11/2026"),now);assert.equal(parseDay("18-Nov-2026"),now);
 assert.equal(parseDay("November 18, 2026"),now);assert.equal(parseDay("2026-11-18T03:00:00-08:00"),now);
 assert.throws(()=>parseDay("03/04/2026"),/Ambiguous/);assert.equal(isoDay(parseDay("03/04/2026","dmy")),"2026-04-03");
 assert.throws(()=>parseDay("2025-02-29"));assert.equal(isoDay(parseDay("2024-02-29")),"2024-02-29");
});
test("calendar days 45, 46, 60 and 61",()=>{
 const data=parse([detail,...[45,46,60,61].map(n=>event(n,-1,"S"+n))].join("\n"));
 const a=audit(data),p=priceAudit(a);
 assert.equal(p.units,3);assert.equal(p.urgent,3000);assert.equal(a.expired,1);assert.equal(p.rows[0].deadline,now);
});
test("warehouse damage, misplaced losses and found-only event type",()=>{
 const data=parse(detail+"\n"+[event(10,-2,"A","","misplaced"),event(9,-3,"A","","Warehouse Damaged"),event(9,-4,"A","","customer damaged"),[isoDay(now-4),"A","Found","",2,""].join(",")].join("\n"));
 assert.equal(priceAudit(audit(data)).units,3);
});
test("one SKU has an honest urgency range when payment lacks a reference",()=>{
 const data=parse([detail,event(55,-3,"A","X"),event(2,-3,"A","Y")].join("\n"));
 const p=priceAudit(audit(data,parse("FNSKU,Quantity\nA,2")));
 assert.equal(p.total,6000);assert.equal(p.urgent,1500);assert.equal(p.maxUrgent,4500);
});
test("an exact credit stays on its referenced event",()=>{
 const data=parse([detail,event(55,-3,"A","X"),event(2,-3,"A","Y")].join("\n"));
 const p=priceAudit(audit(data,parse("FNSKU,Quantity,Reference ID\nA,2,Y")));
 assert.equal(p.urgent,4500);assert.equal(p.maxUrgent,4500);
});
test("found before a loss cannot offset that later event",()=>{
 const p=priceAudit(audit(parse([detail,event(20,5,"A","","Found"),event(10,-5,"A")].join("\n"))));assert.equal(p.units,5);
});
test("duplicates count once, overlapping views and ambiguous SKU aliases fail visibly",()=>{
 assert.equal(priceAudit(audit(tested[0],tested[0])).units,12);
 assert.throws(()=>audit(tested[0],parse(detail+"\n2026-11-10,X0039ABC12,Lost,Lost,-2,R")),/Overlapping ledger/);
 assert.throws(()=>audit(parse(summary+"\n2026-11-10,X,S,3,0,0\n2026-11-10,Y,S,2,0,0"),parse("SKU,Quantity\nS,1")),/several FNSKUs/);
 assert.throws(()=>audit(tested[2]),/Add an Inventory Ledger/);
 assert.throws(()=>audit(tested[0],tested[2],parse("MSKU,Quantity\nSKU-PRO-01,1")),/Overlapping reimbursement/);
});
test("editable defaults and SKU overrides preserve exact fee differences including losses",()=>{
 const a=audit(tested[0]);assert.equal(priceAudit(a,1000,{},true).rows[0].costSource,"Entered default");
 const p=priceAudit(a,1500,{"F:X0039ABC12":500});
 assert.equal(p.total,6000);assert.equal(p.fee,1500);assert.equal(p.difference,-1400);
 assert.equal(toCents("0.10"),10);assert.throws(()=>toCents("12.345"));assert.equal(CHECKOUT.priceUSD,29);
});
test("CSV ranks earlier deadlines first, then value, and quotes spreadsheet text",()=>{
 const data=parse([detail,event(40,-1,"=A","R"),event(40,-7,"B","R2"),event(2,-20,"C","R3")].join("\n"));
 const a=audit(data),p=priceAudit(a),csv=parseCSV(auditCSV(p,a));assert.deepEqual(p.rows.map(r=>r.id),["B","=A","C"]);
 assert.equal(csv[2].fields[1],"'=A");assert.ok(csv[1].fields.includes("Illustrative default"));
});
test("case scripts cap each group at five identifiers including actual reference IDs",()=>{
 const a=audit(parse([detail,...Array.from({length:9},(_,i)=>event(5,-1,"S"+i,"R"+i))].join("\n")));
 const parts=caseScripts(priceAudit(a),a).trim().split(/\r\n\r\n/);
 assert.equal(parts.length,5);
 for(const p of parts){assert.ok([...p.matchAll(/FNSKU S\d|Reference R\d/g)].length<=5);assert.match(p,/Verify the exact current Seller Central/);assert.match(p,/No Reimbursements report/);}
});
test("calendar event spans one all-day date 30 calendar days after the audit",()=>{
 const s=reminderICS(new Date(2026,0,15,12));assert.match(s,/DTSTART;VALUE=DATE:20260214\r\nDTEND;VALUE=DATE:20260215/);
 assert.match(s,/URL:https:\/\/fba-ledger-audit.pages.dev\//);assert.ok(s.endsWith("END:VCALENDAR\r\n"));
});
