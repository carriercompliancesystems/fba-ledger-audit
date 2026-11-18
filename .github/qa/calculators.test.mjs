import { test } from "node:test";
import assert from "node:assert/strict";
import { formulas as f,addMonths } from "../../assets/calculators.js";
import { parseDay,isoDay } from "../../assets/auditor.js";
test("dimensional weight supports the 139 example and alternative divisors",()=>{
 const values={length:14,width:10,height:4,scale:2,divisor:139};
 assert.equal(f.dimensional(values).value,"4.03 lb");assert.equal(f.dimensional({...values,divisor:100}).value,"5.6 lb");
});
test("storage price separates base storage and optional aged volume",()=>{
 const v={units:120,volume:.25,rate:1,aged:20,extra:.5};
 assert.equal(f.storage(v).value,"$32.50");assert.throws(()=>f.storage({...v,aged:121}));
});
test("28-day threshold is editable and assessed fees are independent",()=>{
 const v={stock:200,daily:10,threshold:28,assessed:30,rate:.4};
 const r=f.supply(v);assert.equal(r.value,"20 days");assert.match(r.note,/80 additional units/);assert.match(r.note,/\$12\.00/);
 assert.match(f.supply({...v,threshold:20}).note,/0 additional units/);
});
test("removal shortage excludes pending units",()=>{
 assert.equal(f.removal({requested:80,received:61,pending:12,cost:15}).value,"7 units");
 assert.throws(()=>f.removal({requested:2,received:2,pending:1,cost:15}));
});
test("referral compares like fee bases and displays either sign",()=>{
 const v={basis:50,charged:15,expected:12,sales:20};assert.equal(f.referral(v).value,"+$30.00");assert.equal(f.referral({...v,charged:10}).value,"−$20.00");
});
test("stranded capital and carrying expense remain separate",()=>{
 const r=f.stranded({units:35,cost:15,days:20,holding:.05});assert.equal(r.value,"$525.00");assert.equal(r.bars[1].text,"$35.00");
});
test("return processing compares the selected subset",()=>{
 assert.equal(f.returns({returns:35,assessed:12,rate:2.5,billed:36}).value,"+$6.00");assert.throws(()=>f.returns({returns:2,assessed:3,rate:2,billed:4}));
});
test("FC deadline includes day 60 and rejects future events",()=>{
 assert.equal(f.deadline({event:"2026-11-10",asof:"2027-01-09"}).value,"Due today");assert.equal(f.deadline({event:"2026-11-10",asof:"2027-01-10"}).value,"Expired");
 assert.throws(()=>f.deadline({event:"2026-11-10",asof:"2026-11-09"}));
});
test("lost and damaged payout uses sourced unit cost",()=>{
 assert.equal(f.payout({lost:9,damaged:4,found:1,paid:3,cost:15}).value,"$135.00");
});
test("inbound guidance uses calendar months and clamps month end",()=>{
 assert.equal(isoDay(addMonths(parseDay("2026-05-31"),9)),"2027-02-28");
 assert.equal(isoDay(addMonths(parseDay("2023-05-31"),9)),"2024-02-29");
 const r=f.inbound({shipped:240,received:222,cost:10,delivery:"2026-05-31",asof:"2026-11-18"});assert.equal(r.value,"18 units");assert.match(r.note,/2027-02-28/);
});
test("refund guidance switches on days 46, 120 and 121",()=>{
 const status=asof=>f.refund({refund:"2026-11-01",asof}).value;
 assert.equal(status("2026-12-16"),"Wait 1 day");assert.equal(status("2026-12-17"),"Review for filing");assert.equal(status("2027-03-01"),"Last day");assert.equal(status("2027-03-02"),"Window passed");
});
test("manufacturing estimator retains unrounded unit basis",()=>{
 assert.equal(f.manufacturing({batch:100,produced:3,missing:3}).bars[1].text,"$100.00");
});
test("25% comparison shows break-even and the costlier flat alternative",()=>{
 assert.equal(f.agency({recovery:116,percent:25}).value,"$0.00");assert.equal(f.agency({recovery:80,percent:25}).value,"−$9.00");assert.equal(f.agency({recovery:400,percent:25}).value,"+$71.00");assert.match(f.agency({recovery:150,percent:0}).note,/stays at zero/);
});
test("signed ledger movements reproduce the supplied eight-unit variance",()=>{
 const v={opening:400,receipts:200,shipped:-180,returns:5,found:1,lost:9,damaged:4,other:0,ending:421};
 assert.equal(f.variance(v).value,"+8 units");assert.equal(f.variance({...v,other:8}).value,"0 units");
});
