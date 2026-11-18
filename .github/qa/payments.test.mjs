import { test } from "node:test";
import assert from "node:assert/strict";
import { paymentFlow,takeSnapshot,clearSnapshot } from "../../assets/payment.js";
import { CHECKOUT } from "../../assets/auditor.js";
import { onRequestGet } from "../../functions/api/verify.js";
function storage(){const data=new Map();return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};}
function setup(url="https://example.invalid/?session_id=cs_fixture") {
  const status={},access=[];
  globalThis.window=globalThis;globalThis.addEventListener=()=>{};
  globalThis.document={getElementById:()=>status};globalThis.localStorage=storage();globalThis.sessionStorage=storage();
  globalThis.location={href:url,assign(next){this.href=next;}};
  globalThis.history={replaceState(_s,_t,next){this.next=next;}};
  return {flow:paymentFlow(CHECKOUT,v=>access.push(v)),status,access};
}
test("paid return calls the verifier, persists unlock and removes the token from the URL",async()=>{
 const {flow,access}=setup("https://example.invalid/?source=organic&session_id=cs_fixture#results");
 globalThis.fetch=async(url,opts)=>{assert.equal(url,"/api/verify?session_id=cs_fixture");assert.equal(opts.cache,"no-store");return {ok:true,json:async()=>({paid:true})};};
 await flow.verify();assert.equal(localStorage.getItem("fba_audit_unlocked"),"true");assert.deepEqual(access,[true]);assert.equal(history.next,"/?source=organic#results");
});
test("unpaid and unavailable verifications leave a new visitor locked and permit retry",async()=>{
 for(const simulate of [async()=>({ok:true,json:async()=>({paid:false})}),async()=>{throw Error("network");}]){
  const {flow,status}=setup();globalThis.fetch=simulate;await flow.verify();assert.equal(flow.unlocked,false);assert.equal(localStorage.getItem("fba_audit_unlocked"),null);assert.ok(status.textContent);assert.equal(history.next,undefined);
 }
});
test("checkout saves only the supplied derived audit and routes to the live link",()=>{
 const {flow}=setup("https://example.invalid/");const snapshot={version:2,audit:{events:[]},defaultValue:"15.00"};
 flow.checkout(snapshot);assert.deepEqual(takeSnapshot(),snapshot);assert.equal(location.href,CHECKOUT.paymentLink);clearSnapshot();assert.equal(takeSnapshot(),null);
});
test("previous purchases persist in the same browser profile without a checkout query",async()=>{
 setup("https://example.invalid/");localStorage.setItem("fba_audit_unlocked","true");const marks=[];
 const flow=paymentFlow(CHECKOUT,v=>marks.push(v));await flow.verify();assert.deepEqual(marks,[true]);
});
test("existing Cloudflare verifier handles absent IDs and mocked Stripe payment states",async()=>{
 const context=id=>({request:new Request("https://example.invalid/api/verify"+(id?"?session_id="+id:"")),env:{STRIPE_SECRET_KEY:"test-only"}});
 assert.equal((await onRequestGet(context(""))).status,400);
 for(const state of ["paid","unpaid"]){
  globalThis.fetch=async(url)=>{assert.equal(url,"https://api.stripe.com/v1/checkout/sessions/cs_fixture");return new Response(JSON.stringify({payment_status:state}));};
  assert.deepEqual(await (await onRequestGet(context("cs_fixture"))).json(),{paid:state==="paid"});
 }
});
