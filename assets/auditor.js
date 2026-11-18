// Stripe checkout configuration
export const CHECKOUT = Object.freeze({
  paymentLink: "https://buy.stripe.com/5kQeVc9ty6Mg8NSevtbwk02",
  priceUSD: 29
});

export const DAY_MS = 86400000;
const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
export const money = cents => new Intl.NumberFormat("en-US", {style:"currency",currency:"USD"}).format(cents / 100);
export const isoDay = day => new Date(day * DAY_MS).toISOString().slice(0, 10);
export function todayDay(now = new Date()) {
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / DAY_MS;
}
function calendarDay(year, month, day) {
  const time = Date.UTC(year, month - 1, day);
  const date = new Date(time);
  if (year < 1900 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("Invalid calendar date.");
  }
  return time / DAY_MS;
}
export function parseDay(value, order = "auto") {
  const raw = String(value).trim();
  let m = /^(\d{4})([-/])(\d{1,2})\2(\d{1,2})(?:[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.exec(raw);
  if (m) return calendarDay(+m[1], +m[3], +m[4]);
  m = /^(\d{1,2})[- /]([a-z]{3,9})[- ,/]+(\d{4})$/i.exec(raw);
  if (m) return calendarDay(+m[3], MONTHS.indexOf(m[2].slice(0,3).toLowerCase()) + 1, +m[1]);
  m = /^([a-z]{3,9}) (\d{1,2}),? (\d{4})$/i.exec(raw);
  if (m) return calendarDay(+m[3], MONTHS.indexOf(m[1].slice(0,3).toLowerCase()) + 1, +m[2]);
  m = /^(\d{1,2})([-/])(\d{1,2})\2(\d{4})$/.exec(raw);
  if (m) {
    const a = +m[1], b = +m[3];
    if (order === "auto" && a <= 12 && b <= 12 && a !== b) throw new Error("Ambiguous date. Select month/day or day/month in the date format control.");
    const dayFirst = order === "dmy" || (order === "auto" && a > 12);
    return calendarDay(+m[4], dayFirst ? b : a, dayFirst ? a : b);
  }
  throw new Error("Unreadable date. Use YYYY-MM-DD, a four-digit year with numeric dates, or a named month.");
}
export function toCents(value) {
  const raw = String(value).trim();
  if (!/^(?:\d+|\d*\.\d{1,2})$/.test(raw)) throw new Error("Enter a non-negative cost with up to two decimal places.");
  const n = Math.round(Number(raw) * 100);
  if (!Number.isSafeInteger(n)) throw new Error("Cost exceeds the supported amount.");
  return n;
}

// Keep physical line numbers even when an Excel field contains a quoted newline.
export function parseCSV(input) {
  const text = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  if (!text.trim()) throw new Error("The file is empty.");
  if (/[\u0000\uFFFD]/u.test(text)) throw new Error("Save the report as a UTF-8 CSV and try again.");
  const rows = [];
  let fields = [], field = "", quoted = false, closed = false, line = 1, start = 1;
  function endField() { fields.push(field.trim()); field = ""; closed = false; }
  function endRow() {
    endField();
    if (fields.some(v => v !== "")) rows.push({ line:start, fields });
    fields = [];
  }
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; }
      } else { field += ch; if (ch === "\n") line++; }
    } else if (ch === ",") {
      endField();
    } else if (ch === "\n") {
      endRow(); line++; start = line;
    } else if (closed) {
      if (ch !== " " && ch !== "\t") throw new Error("Unexpected text after a closing quote on line " + line + ".");
    } else if (ch === '"') {
      if (field.trim()) throw new Error("Unexpected quote on line " + line + ".");
      field = ""; quoted = true;
    } else { field += ch; }
  }
  if (quoted) throw new Error("Unclosed quoted field beginning on line " + start + ".");
  endRow();
  if (rows.length < 2) throw new Error("The CSV needs a header and at least one data row.");
  return rows;
}

const SUMMARY = ["date","lost","damaged","found"];
const DETAIL = ["date","eventtype","reason","quantity","referenceid"];
const REIMB = ["quantityreimbursedtotal","quantityreimbursedinventory","quantity"];
const norm = key => key.toLowerCase().replace(/[^a-z0-9]/g,"");
function units(value, label, allowBlank = false) {
  if (allowBlank && value === "") return 0;
  if (!/^[+-]?\d+(?:\.0+)?$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(label + " must be a whole number.");
  return Number(value);
}
export function parseReport(input, name, order = "auto", asOf = todayDay()) {
  try {
    const [header,...data] = parseCSV(input);
    const keys = header.fields.map(norm);
    if (keys.some(k => !k) || new Set(keys).size !== keys.length) throw new Error("Empty or duplicate column names. Check the header row.");
    if (!["fnsku","msku","sku"].some(k => keys.includes(k))) throw new Error("Missing FNSKU, MSKU or SKU identifier column. Choose a Ledger or Reimbursements CSV.");
    let type;
    if (["eventtype","reason"].some(k => keys.includes(k)) || (keys.includes("referenceid") && keys.includes("date") && !REIMB.slice(0,2).some(k=>keys.includes(k)) && !SUMMARY.slice(1).some(k=>keys.includes(k)) && !keys.includes("quantity"))) type = "Detailed Ledger";
    else if (["lost","damaged","found","startingwarehousebalance","endingwarehousebalance"].some(k => keys.includes(k))) type = "Summary Ledger";
    else if (REIMB.some(k => keys.includes(k))) type = "Reimbursements";
    else throw new Error("Unrecognized report. Expected Ledger lost/damaged/found columns, detailed event columns, or a reimbursed quantity.");
    const missing = (type === "Summary Ledger" ? SUMMARY : type === "Detailed Ledger" ? DETAIL : []).filter(k => !keys.includes(k));
    if (missing.length) throw new Error("Missing required columns for " + type + " — " + missing.join(", ") + ".");
    const rows = [], seenLedgerRows = new Set();
    for (const record of data) {
      try {
        if (record.fields.length !== keys.length) throw new Error("Expected " + keys.length + " columns and found " + record.fields.length + ". Check delimiters and quotes.");
        if (type !== "Reimbursements") {
          const fingerprint = JSON.stringify(record.fields);
          if (seenLedgerRows.has(fingerprint)) throw new Error("Identical ledger row occurs twice. Verify the source or use a detailed export with distinct references.");
          seenLedgerRows.add(fingerprint);
        }
        const r = Object.fromEntries(keys.map((key,index) => [key,record.fields[index]]));
        const row = { fnsku:r.fnsku || "", alias:r.msku || r.sku || "", title:r.title || "", ref:r.referenceid || "", day:null, lost:0, damaged:0, found:0, paid:0, line:record.line };
        if (!row.fnsku && !row.alias) throw new Error("Missing item identifier.");
        if (type === "Reimbursements") {
          const col = REIMB.find(k => r[k] !== undefined && r[k] !== "");
          if (!col) throw new Error("Missing reimbursed quantity.");
          row.paid = units(r[col], "Reimbursed quantity");
          if (r.quantityreimbursedtotal && r.quantityreimbursedinventory && units(r.quantityreimbursedinventory,"Inventory reimbursement quantity") > row.paid) throw new Error("Inventory reimbursement quantity exceeds the reported total. Review this row.");
          if (row.paid < 0) throw new Error("Negative reimbursement adjustment. Resolve reversals before using this report.");
        } else {
          row.day = parseDay(r.date, order);
          if (row.day > asOf) throw new Error("Event date is in the future.");
          if (type === "Summary Ledger") {
            row.lost = Math.abs(units(r.lost,"Lost",true));
            row.damaged = Math.abs(units(r.damaged,"Damaged",true));
            row.found = units(r.found,"Found",true);
            if (row.found < 0) throw new Error("Negative Found adjustment. Review the detailed event before using the summary.");
          } else {
            const qty = units(r.quantity,"Quantity");
            const description = (r.eventtype + " " + r.reason).toLowerCase().replace(/[_-]/g," ");
            if (qty < 0 && /\b(lost|misplaced)\b/.test(description)) row.lost = -qty;
            else if (qty < 0 && /damag/.test(description) && /warehouse|fulfil{1,2}ment cent(?:er|re)/.test(description)) row.damaged = -qty;
            else if (qty > 0 && /\bfound\b/.test(description)) row.found = qty;
          }
        }
        rows.push(row);
      } catch (err) { throw new Error("Line " + record.line + " — " + err.message); }
    }
    return {name,type,rows,signature:input.replace(/^\uFEFF/, "").replace(/\r\n?/g,"\n").trimEnd()};
  } catch (err) { throw new Error(name + " — " + err.message); }
}

function collectGroups(reports) {
  const aliases = new Map(), knownFNSKUs = new Set(), groups = new Map(), notes = [];
  for (const {rows} of reports) for (const row of rows) {
    if (row.fnsku) knownFNSKUs.add(row.fnsku);
    if (!row.fnsku || !row.alias) continue;
    if (!aliases.has(row.alias)) aliases.set(row.alias,new Set());
    aliases.get(row.alias).add(row.fnsku);
  }
  const identities = new Set();
  let hasLedger = false, hasReimbursements = false;
  for (const report of reports) {
    const signature = report.signature;
    if (identities.has(signature)) { notes.push(report.name + " matched an already selected report and was counted once."); continue; }
    identities.add(signature);
    const isPaid = report.type === "Reimbursements";
    if (isPaid) hasReimbursements = true; else hasLedger = true;
    const cover = new Map();
    for (const row of report.rows) {
      const matches = new Set(aliases.get(row.alias));
      if (knownFNSKUs.has(row.alias)) matches.add(row.alias);
      if (!row.fnsku && matches.size > 1) throw new Error(report.name + ", line " + row.line + " — " + row.alias + " maps to several FNSKUs. Use FNSKU-level data.");
      const fnsku = row.fnsku || (matches.size ? [...matches][0] : "");
      const id = fnsku || row.alias, key = (fnsku ? "F:" : "M:") + id;
      if (!groups.has(key)) groups.set(key,{key,id,kind:fnsku?"FNSKU":"Seller SKU",title:"",losses:[],credits:[],ranges:[],paymentFile:null});
      const g = groups.get(key);
      if (row.title && !g.title) g.title = row.title;
      if (isPaid) {
        if (g.paymentFile && g.paymentFile !== report) throw new Error("Overlapping reimbursement files for " + id + ". Use one combined reimbursement export for this SKU.");
        g.paymentFile = report;
      } else {
        const range = cover.get(key) || [row.day,row.day];
        range[0] = Math.min(range[0],row.day); range[1] = Math.max(range[1],row.day); cover.set(key,range);
      }
      if (row.lost || row.damaged) g.losses.push({day:row.day,ref:row.ref,lost:row.lost,damaged:row.damaged,source:report.name,line:row.line,reportType:report.type});
      if (row.found || row.paid) g.credits.push({day:row.day,ref:row.ref,found:row.found,paid:row.paid});
    }
    for (const [key,[first,last]] of cover) {
      const g = groups.get(key);
      if (g.ranges.some(([a,b]) => first <= b && a <= last)) throw new Error("Overlapping ledger date ranges for " + g.id + " in " + report.name + ". Use one view for that SKU and period, or non-overlapping exports.");
      g.ranges.push([first,last]);
    }
  }
  if (!hasLedger) throw new Error("Add an Inventory Ledger CSV. A Reimbursements report by itself cannot identify losses.");
  const unmatched = [...groups.values()].filter(g=>g.paymentFile && !g.ranges.length).length;
  if (unmatched) notes.push(unmatched+" reimbursed item identifier(s) had no corresponding ledger identifier. Confirm the SKU mapping and coverage.");
  return {groups,notes,hasReimbursements};
}
function allocate(group, asOf, conservative) {
  const losses = group.losses.map(l=>({...l,open:l.lost+l.damaged,found:0,paid:0,pooled:false}));
  const refs = new Map();
  for (const loss of losses) if (loss.ref) { if (!refs.has(loss.ref)) refs.set(loss.ref,[]); refs.get(loss.ref).push(loss); }
  function rank(loss) {
    const age = asOf - loss.day;
    if (conservative) return age > 60 ? 2 : age >= 46 ? 0 : 1;
    return age > 60 ? 0 : age >= 46 ? 2 : 1;
  }
  const compare = (a,b)=>rank(a)-rank(b) || a.day-b.day || a.line-b.line;
  losses.sort(compare);
  for (const list of refs.values()) list.sort(compare);
  const credits = [...group.credits].sort((a,b)=>(a.day??Infinity)-(b.day??Infinity));
  const pooled = [];
  function apply(credit, left, candidates, isPooled) {
    for (const l of candidates) {
      if (!left) break;
      if (!l.open || (credit.day !== null && l.day > credit.day)) continue;
      const take=Math.min(left,l.open);
      l.open-=take; left-=take; l[credit.paid ? "paid" : "found"]+=take;
      if (isPooled) l.pooled=true;
    }
    return left;
  }
  for (const credit of credits) {
    const exact = credit.ref && refs.get(credit.ref);
    const left = exact ? apply(credit,credit.found+credit.paid,exact,false) : credit.found+credit.paid;
    if (left) pooled.push({credit,left});
  }
  for (const {credit,left} of pooled) {
    for (const l of losses) if (l.open && (credit.day === null || l.day <= credit.day)) l.pooled = true;
    apply(credit,left,losses,true);
  }
  return losses;
}
export function reconcile(reports, asOf = todayDay()) {
  const {groups,notes,hasReimbursements} = collectGroups(reports);
  const events = [], upperUrgent = [];
  let expired = 0, found = 0, paid = 0, gross = 0;
  for (const g of groups.values()) {
    const parts = allocate(g,asOf,true);
    for (const row of parts) {
      if (asOf-row.day > 60) {expired += row.open; continue;}
      gross += row.lost+row.damaged; found += row.found; paid += row.paid;
      if (row.open) events.push({...row,key:g.key,id:g.id,kind:g.kind,title:g.title,deadline:row.day+60});
    }
    const max = allocate(g,asOf,false).filter(r=>asOf-r.day>=46 && asOf-r.day<=60).reduce((s,r)=>s+r.open,0);
    if (max) upperUrgent.push({key:g.key,units:max});
  }
  return {asOf,events,upperUrgent,expired,gross,found,paid,notes,hasReimbursements};
}
export function priceAudit(audit, defaultCents = 1500, overrides = {}, defaultConfirmed = false) {
  const cost = key => Object.hasOwn(overrides,key) ? overrides[key] : defaultCents;
  const rows = audit.events.map(r=>({...r,unitCost:cost(r.key),costSource:Object.hasOwn(overrides,r.key)?"SKU cost":defaultConfirmed?"Entered default":"Illustrative default",value:r.open*cost(r.key)}))
    .sort((a,b)=>a.deadline-b.deadline || b.value-a.value || a.id.localeCompare(b.id) || a.line-b.line);
  const total = rows.reduce((sum,r)=>sum+r.value,0);
  const urgent = rows.filter(r=>r.deadline-audit.asOf<=14).reduce((sum,r)=>sum+r.value,0);
  const maxUrgent = audit.upperUrgent.reduce((s,r)=>s+r.units*cost(r.key),0);
  if (![total,urgent,maxUrgent].every(Number.isSafeInteger)) throw new Error("Estimated amounts exceed the supported precision. Check quantities and costs.");
  const fee = Math.round(total/4);
  return {rows,total,urgent,maxUrgent,fee,difference:fee-CHECKOUT.priceUSD*100,units:rows.reduce((s,r)=>s+r.open,0)};
}

const SUPPORT = "Seller Central → Help → Get Support → Selling on Amazon → Fulfillment by Amazon → Investigate an issue with FBA inventory";
const GUIDANCE = "This is general navigation guidance. Verify the exact current Seller Central menu labels and support categories, event dates, costs and prior reimbursements before submitting.";
export function auditCSV(priced,audit) {
  function quote(value) {
    let s=String(value ?? "");
    if (/^\s*[=+\-@\t\r]/.test(s)) s="'"+s;
    return '"'+s.replaceAll('"','""')+'"';
  }
  const columns=["Identifier type","Identifier","Title","Ledger date","Deadline","Days left","Reference ID","Lost","Warehouse damaged","Found allocated","Reimbursed allocated","Open units","Sourced manufacturing cost USD","Cost basis","Estimated USD","Allocation","Reimbursements supplied","Report","Source file","Source line"];
  const lines=priced.rows.map(r=>[r.kind,r.id,r.title,isoDay(r.day),isoDay(r.deadline),r.deadline-audit.asOf,r.ref,r.lost,r.damaged,r.found,r.paid,r.open,(r.unitCost/100).toFixed(2),r.costSource,(r.value/100).toFixed(2),r.pooled?"Includes SKU-level allocation":"See source row",audit.hasReimbursements?"Yes":"No — confirm payments",r.reportType,r.source,r.line]);
  return "\uFEFF"+[columns,...lines].map(line=>line.map(quote).join(",")).join("\r\n")+"\r\n";
}
function plain(value) { return String(value).replace(/[\u0000-\u001f\u007f]+/g," ").trim(); }
export function caseScripts(priced,audit) {
  const groups=[]; let current=[], ids=new Set();
  for (const r of priced.rows) {
    const keys=[r.kind+":"+r.id]; if(r.ref) keys.push("reference:"+r.ref);
    if (new Set([...ids,...keys]).size>5) { groups.push(current); current=[]; ids=new Set(); }
    current.push(r); keys.forEach(key=>ids.add(key));
  }
  if(current.length) groups.push(current);
  return groups.map((group,i)=>[
    "CASE "+(i+1)+" | Inventory Ledger investigation",
    "General filing path: "+SUPPORT, GUIDANCE,
    audit.hasReimbursements?"A Reimbursements report was cross-referenced. Confirm the coverage period.":"No Reimbursements report was supplied. Check whether these units were already paid before submitting.",
    "Subject: Please investigate fulfillment-center inventory adjustments",
    "Hello Seller Support,",
    "Please review the following unresolved inventory adjustments and confirm whether reimbursement is due.",
    ...group.map(r=>[r.kind+" "+plain(r.id),r.ref?"Reference "+plain(r.ref):"Reference ID unavailable in this row",isoDay(r.day),"lost "+r.lost,"damaged "+r.damaged,"found allocated "+r.found,"reimbursed allocated "+r.paid,"remaining "+r.open,"estimated "+money(r.value)+" ("+r.costSource+", "+money(r.unitCost)+"/unit)","filing deadline to confirm "+isoDay(r.deadline),"source "+plain(r.source)+" line "+r.line].join(" | ")),
    "I can provide the relevant ledger entries and manufacturing-cost evidence. Please advise on the next step.",
    "Seller review: replace illustrative costs and verify SKU-level allocations against the original event. The five-identifier limit is this tool’s grouping convention.",
    "Not affiliated with or endorsed by Amazon.com, Inc. or any of its affiliates."
  ].join("\r\n")).join("\r\n\r\n")+"\r\n";
}
export function reminderICS(now = new Date()) {
  const start=todayDay(now)+30, compact=d=>isoDay(d).replaceAll("-","");
  const stamp=now.toISOString().replaceAll("-","").replaceAll(":","").replace(/\.\d{3}/,"");
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//FBA Ledger Audit//Audit Reminder//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT","UID:"+crypto.randomUUID()+"@fba-ledger-audit.pages.dev","DTSTAMP:"+stamp,"DTSTART;VALUE=DATE:"+compact(start),"DTEND;VALUE=DATE:"+compact(start+1),"SUMMARY:Run your FBA inventory ledger audit","DESCRIPTION:Review new adjustments and check outstanding reimbursements.","URL:https://fba-ledger-audit.pages.dev/","END:VEVENT","END:VCALENDAR",""].join("\r\n");
}
