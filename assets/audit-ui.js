import { CHECKOUT, money, todayDay, isoDay, toCents, parseReport, reconcile, priceAudit, auditCSV, caseScripts, reminderICS } from "./auditor.js";
import { paymentFlow, takeSnapshot, clearSnapshot } from "./payment.js";

const get = id => document.getElementById(id);
function node(tag, text, cls) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function notice(el, text) { el.textContent=text; el.hidden=!text; }
function download(name,content,type) {
  const url=URL.createObjectURL(new Blob([content],{type}));
  const a=node("a"); a.href=url; a.download=name; document.body.append(a); a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function readCSV(file) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(new Error(file.name+" could not be read. Reselect the file."));
    reader.onabort=()=>reject(new Error("File reading was cancelled."));
    reader.readAsText(file,"UTF-8");
  });
}
let selected=[], audit=null, priced=null, costs=Object.create(null), confirmed=false, demo=false, generation=0;
let available=[], latestNotes=[];
const pay=paymentFlow(CHECKOUT,()=>{if(audit) updatePrices();});
const clearButton=get("clearBtn");
const summaryHeader="Date,FNSKU,MSKU,Title,Disposition,Starting Warehouse Balance,Receipts,Customer Shipments,Customer Returns,Found,Lost,Damaged,Ending Warehouse Balance";
function examples(day) {
  const d=age=>isoDay(day-age);
  return [
    {name:"Sample summary.csv",text:summaryHeader+"\n"+d(51)+",X0039ABC12,SKU-PRO-01,Stainless Insulated Tumbler 32oz,SELLABLE,400,200,-180,5,1,9,4,421"},
    {name:"Sample events.csv",text:"Date,FNSKU,MSKU,Title,Event Type,Reason,Quantity,Reference ID\n"+
      [[d(60),"X-DEMO-MAT","MAT-02","Baking mat","Adjustment","Warehouse-damaged",-4,"DEMO-204"],[d(10),"X-DEMO-MAT","MAT-02","Baking mat","Found","Found",1,"DEMO-204"],[d(10),"X-DEMO-HOOK","HOOK-03","Garage hook","Lost","Misplaced",-5,"DEMO-301"],[d(61),"X-DEMO-OLD","OLD-04","Storage sleeve","Lost","Lost",-2,"DEMO-401"]].map(r=>r.join(",")).join("\n")},
    {name:"Sample reimbursements.csv",text:"MSKU,Quantity Reimbursed Total\nSKU-PRO-01,3"}
  ];
}
function displayFiles(labels=[]) {
  const holder=get("fileList");holder.replaceChildren();
  selected.forEach((file,index)=>{
    const chip=node("span",file.name+(labels[index]?" · "+labels[index]:""),"file-chip");
    const remove=node("button","Remove");remove.type="button";remove.setAttribute("aria-label","Remove "+file.name);
    remove.addEventListener("click",()=>{selected.splice(index,1); auditFiles();});
    chip.append(remove);holder.append(chip);
  });
  clearButton.hidden=!(selected.length || audit || demo);
}
function noResults(text="") {
  audit=null;priced=null;get("resultsBox").classList.add("hidden");clearSnapshot();
  notice(get("auditError"),text);
}
async function auditFiles() {
  const run=++generation;
  demo=false; noResults(); displayFiles();
  if(!selected.length) return;
  notice(get("auditError"),"Reading reports on this device…");
  try {
    const day=todayDay(), order=get("dateOrder").value, files=[...selected];
    const reports=await Promise.all(files.map(async file=>parseReport(await readCSV(file),file.name,order,day)));
    if(run!==generation) return;
    const next=reconcile(reports,day);
    available=reports.map(r=>r.type);latestNotes=next.notes;displayFiles(available);
    showAudit(next);
  } catch(e) { if(run===generation) noResults(e.message); }
}
function add(files) {
  if (!files.length) return;
  if(demo) { get("defaultCost").value="15.00"; confirmed=false; }
  if(demo || (!selected.length && audit)){costs=Object.create(null);}
  selected.push(...files);auditFiles();
}
function runDemo(scroll=false) {
  generation++; selected=[]; costs=Object.create(null);demo=true; clearSnapshot();displayFiles();
  try {
    const day=todayDay();const reports=examples(day).map(r=>parseReport(r.text,r.name,"auto",day));
    available=reports.map(r=>r.type); latestNotes=[];showAudit(reconcile(reports,day));
    if(scroll) get("resultsBox").scrollIntoView({block:"start"});
  } catch(e) { noResults(e.message); }
}
function costEditor() {
  const host=get("costEditor");host.replaceChildren();
  const ids=new Map(audit.events.map(r=>[r.key,r.id]));
  if(!ids.size) return;
  const details=node("details",undefined,"costs"),summary=node("summary","Edit manufacturing cost by SKU ("+ids.size+")");
  const fields=node("div",undefined,"fields");
  for(const [key,id] of ids) {
    const label=node("label",id+" · USD/unit"), input=node("input");
    input.type="number";input.min="0";input.step="0.01";input.placeholder="Use default";
    if(Object.hasOwn(costs,key)) input.value=(costs[key]/100).toFixed(2);
    input.addEventListener("input",()=>{
      try {
        if(input.validity.badInput) throw new Error("Enter a valid unit cost.");
        if(input.value==="") delete costs[key]; else costs[key]=toCents(input.value);
        input.setCustomValidity("");updatePrices();
      } catch(e) { input.setCustomValidity(e.message);invalidate(e.message); }
    });
    label.append(input);fields.append(label);
  }
  details.append(summary,node("p","Blank fields use the default above. Enter the cost per unit for each SKU that differs.","hint"),fields);
  host.append(details);
}
function invalidate(text) {
  priced=null;notice(get("auditError"),text);get("statDollars").textContent="Check costs";
  get("checkoutBtn").disabled=true;get("downloadCsvBtn").disabled=true;get("downloadCasesBtn").disabled=true;
  notice(get("urgency"),"Correct the cost to update the estimate.");get("feeComparison").textContent="";get("rowsBody").replaceChildren();
}
function updatePrices() {
  if(!audit) return;
  try {
    if(get("costEditor").querySelector("input:invalid")) throw new Error("Correct the highlighted SKU cost.");
    priced=priceAudit(audit,toCents(get("defaultCost").value),costs,confirmed);
  } catch(e) { invalidate(e.message);return; }
  notice(get("auditError"),"");
  const {rows,total,units,urgent,maxUrgent,fee,difference}=priced;
  get("statDollars").textContent=money(total); get("statUnits").textContent=units;
  get("statSkus").textContent=new Set(rows.map(r=>r.key)).size;get("statExpired").textContent=audit.expired;
  const illustrative=rows.some(r=>r.costSource==="Illustrative default");
  const notes=[demo?"Sample audit using fictional source files and relative dates.":"",audit.hasReimbursements?"Reimbursements CSV included.":"No Reimbursements CSV supplied. Check prior payments before filing.",illustrative?"Some estimates use the illustrative $"+(Number(get("defaultCost").value)).toFixed(2)+" default. Replace it with sourced manufacturing costs.":"",audit.gross+" in-window lost/damaged units − "+audit.found+" found − "+audit.paid+" reimbursed = "+units+" unresolved.",...latestNotes];
  notice(get("resultNotes"),notes.filter(Boolean).join("\n"));
  const urgency=get("urgency");const near=rows.some(r=>r.deadline-audit.asOf<=14);
  urgency.dataset.active=String(near || maxUrgent>0);
  notice(urgency,(near || maxUrgent>0?money(urgent)+" estimated value closes within 14 days.":"No priced exposure closes within 14 days.")+" Includes event ages 46–60, with day 60 due today."+(maxUrgent>urgent?" SKU-level credits have no unique event match. The possible expiring value is "+money(urgent)+"–"+money(maxUrgent)+". The alert uses the lower estimate.":""));
  get("auditSource").textContent=demo?"Sample audit":"Your reports";
  const tbody=get("rowsBody");tbody.replaceChildren();
  for (const r of (pay.unlocked ? rows : rows.slice(0,3))) {
    const tr=node("tr"),id=node("td",r.id);id.append(node("small",isoDay(r.day)+(r.ref?" · "+r.ref:" · "+r.reportType)));tr.append(id);
    const days=r.deadline-audit.asOf;
    for(const v of [isoDay(r.deadline)+(days===0?" · today":" · "+days+"d"),r.lost+r.damaged,r.found+" / "+r.paid,r.open,money(r.value)]) tr.append(node("td",String(v)));
    tbody.append(tr);
  }
  get("findingsTable").querySelector("caption").textContent=rows.length?(pay.unlocked?"Event-level findings":"Free preview · "+Math.min(3,rows.length)+" of "+rows.length+" event rows"):"No unresolved in-window events";
  get("paywallBox").classList.toggle("hidden",pay.unlocked || !rows.length);
  get("unlockedBanner").classList.toggle("hidden",!pay.unlocked);
  get("checkoutBtn").disabled=!rows.length;
  get("checkoutBtn").textContent=demo?"Choose your own CSVs →":"Unlock exports · $29 →";
  get("downloadCsvBtn").disabled=!rows.length;get("downloadCasesBtn").disabled=!rows.length;
  const sample=get("samplePacket");
  sample.hidden=!demo || !rows.length;
  if(!sample.hidden) sample.querySelector("pre").textContent=caseScripts({...priced,rows:rows.slice(0,1)},audit);
  else { sample.open=false; sample.querySelector("pre").textContent=""; }
  const comparison=get("feeComparison");comparison.replaceChildren(node("strong","25% comparison · illustrative; agency rates vary"));
  comparison.append(node("p","If "+money(total)+" is recovered in full, the illustrative agency fee is "+money(fee)+" and the flat fee is "+money(CHECKOUT.priceUSD*100)+". "+(difference>0?"You keep "+money(difference)+" more after the flat fee.":difference<0?"You keep "+money(-difference)+" less after the flat fee.":"You keep the same amount under either fee.")));
  if(!rows.length) notice(urgency,urgency.textContent+" There is no packet to purchase for these reports.");
}
function showAudit(value) {
  audit=value;get("resultsBox").classList.remove("hidden");clearButton.hidden=false;
  costEditor();updatePrices();
}
function clearAll() {
  generation++;selected=[];demo=false;costs=Object.create(null);confirmed=false;available=[];latestNotes=[];
  get("defaultCost").value="15.00";get("reportFiles").value="";get("dateOrder").value="auto";
  noResults();displayFiles();
}
function fresh() {
  if(audit && audit.asOf!==todayDay()) {
    if(demo) runDemo(); else if(selected.length) auditFiles(); else noResults("The audit date changed. Reselect your ledger to refresh deadlines.");
    return false;
  }
  return Boolean(priced);
}
const drop=get("dropzone");
for (const name of ["dragenter","dragover"]) drop.addEventListener(name,e=>{e.preventDefault();drop.dataset.over="true";});
drop.addEventListener("dragleave",e=>{if(!drop.contains(e.relatedTarget))drop.dataset.over="false";});
drop.addEventListener("drop",e=>{e.preventDefault();drop.dataset.over="false";add([...e.dataTransfer.files]);});
get("reportFiles").addEventListener("change",e=>{add([...e.target.files]);e.target.value="";});
get("dateOrder").addEventListener("change",()=>{if(selected.length)auditFiles();});
get("defaultCost").addEventListener("input",()=>{confirmed=true;updatePrices();});
get("sampleBtn").addEventListener("click",()=>runDemo());
get("heroSample").addEventListener("click",()=>runDemo(true));
clearButton.addEventListener("click",clearAll);
get("checkoutBtn").addEventListener("click",()=>{
  if (demo) { get("reportFiles").click(); return; }
  if (fresh() && priced.rows.length) pay.checkout({version:2,audit,costs,confirmed,defaultValue:get("defaultCost").value,available});
});
get("downloadCsvBtn").addEventListener("click",()=>{if(pay.unlocked && fresh())download("Claimable_Audit_Packet.csv",auditCSV(priced,audit),"text/csv;charset=utf-8");});
get("downloadCasesBtn").addEventListener("click",()=>{if(pay.unlocked && fresh())download("Seller_Central_Case_Scripts.txt",caseScripts(priced,audit),"text/plain;charset=utf-8");});
const reminder=node("button","Download 30-day reminder","button");
reminder.addEventListener("click",()=>download("FBA_Audit_Reminder.ics",reminderICS(),"text/calendar;charset=utf-8"));
get("retention").append(reminder,node("span","Add your next inventory review to your calendar.","retention-note"));
document.addEventListener("visibilitychange",()=>{if(!document.hidden && audit)fresh();});
const restored=takeSnapshot();
if(restored?.version===2 && restored.audit?.asOf===todayDay() && Array.isArray(restored.audit.events)) {
  try {
    costs=Object.assign(Object.create(null),restored.costs);confirmed=Boolean(restored.confirmed);
    get("defaultCost").value=restored.defaultValue;available=restored.available||[];latestNotes=restored.audit.notes||[];
    showAudit(restored.audit);
  } catch { noResults("Please reselect your CSVs to restore the audit."); }
} else if(restored) { noResults("Please reselect your CSVs to refresh this audit with current filing dates."); }
pay.verify();
