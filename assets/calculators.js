import { CHECKOUT, parseDay, isoDay, todayDay } from "./auditor.js";

const numeric = new Intl.NumberFormat("en-US",{maximumFractionDigits:2});
const usd = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"});
const num = v=>numeric.format(v);
const money = v=>usd.format(v);
const bar = (label,amount,format=num)=>({label,amount,text:format(amount)});
const result = (label,value,note,bars)=>({label,value,note,bars});
const signed = value=>(value>0?"+":value<0?"−":"")+money(Math.abs(value));
function since(event,asof) {
  const age=parseDay(asof)-parseDay(event);
  if(age<0) throw new Error("The review date must be on or after the event date.");
  return age;
}
export function addMonths(day, count) {
  const d=new Date(day*86400000),y=d.getUTCFullYear(),m=d.getUTCMonth()+count;
  const last=new Date(Date.UTC(y,m+1,0)).getUTCDate();
  return Date.UTC(y,m,Math.min(d.getUTCDate(),last))/86400000;
}
export const formulas={
  dimensional(v) {
    const dim=v.length*v.width*v.height/v.divisor;
    return result("Dimensional weight",num(dim)+" lb","At your divisor of "+num(v.divisor)+", the larger of dimensional and scale weight is "+num(Math.max(dim,v.scale))+" lb. Apply your verified tier and rounding rules separately.",[bar("Scale weight (lb)",v.scale),bar("Dimensional weight (lb)",dim)]);
  },
  storage(v) {
    if(v.aged>v.units) throw new Error("Aged units cannot exceed the total units stored.");
    const volume=v.units*v.volume,base=volume*v.rate,aged=v.aged*v.volume*v.extra;
    return result("Modeled monthly charge",money(base+aged),num(volume)+" cubic feet at your base rate. The optional aged surcharge applies only to the "+num(v.aged)+" units you marked.",[bar("Base storage",base,money),bar("Optional aged surcharge",aged,money)]);
  },
  supply(v) {
    const days=v.stock/v.daily, delta=Math.max(0,Math.ceil(v.threshold*v.daily-v.stock));
    return result("Estimated supply",num(days)+" days",num(delta)+" additional units reach your "+num(v.threshold)+"-day planning target. If "+num(v.assessed)+" shipped units are subject to your entered rate, the fee scenario is "+money(v.assessed*v.rate)+".",[bar("Estimated supply (days)",days),bar("Planning target (days)",v.threshold)]);
  },
  removal(v) {
    if(v.received+v.pending>v.requested)throw new Error("Received and otherwise accounted-for units exceed the order.");
    const missing=v.requested-v.received-v.pending;
    return result("Unexplained removal shortage",num(missing)+" units","At your entered unit value, the unexplained shortage represents "+money(missing*v.cost)+". Check delivery splits and pending movements before investigating.",[bar("Received or accounted for",v.received+v.pending),bar("Still unexplained",missing)]);
  },
  referral(v) {
    const charged=v.basis*v.charged/100*v.sales,expected=v.basis*v.expected/100*v.sales;
    return result("Charged minus comparison fee",signed(charged-expected),"Modeled across "+num(v.sales)+" identical transactions with a fee basis of "+money(v.basis)+" each. A positive difference is a review item.",[bar("At charged category rate",charged,money),bar("At your comparison rate",expected,money)]);
  },
  stranded(v) {
    const tied=v.units*v.cost,carry=v.units*v.days*v.holding;
    return result("Inventory cost tied up",money(tied),"At your daily holding-cost assumption, "+num(v.days)+" days add "+money(carry)+" in carrying cost. Working capital and carrying cost measure different things.",[bar("Cost of stranded units",tied,money),bar("Modeled holding cost",carry,money)]);
  },
  returns(v) {
    if(v.assessed>v.returns)throw new Error("Fee-bearing returns cannot exceed the total returns reviewed.");
    const expected=v.assessed*v.rate;
    return result("Billed minus modeled charge",signed(v.billed-expected),num(v.assessed)+" of "+num(v.returns)+" returns are marked fee-bearing. The modeled charge at your rate is "+money(expected)+".",[bar("Amount billed",v.billed,money),bar("Modeled processing charge",expected,money)]);
  },
  deadline(v) {
    const age=since(v.event,v.asof),due=parseDay(v.event)+60,left=60-age;
    return result("Time left to file",left===0?"Due today":left<0?"Expired":num(left)+(left===1?" day":" days"),"Ledger event "+v.event+" · 60-day deadline "+isoDay(due)+". "+(left<0?num(-left)+" days past the window.":left<=14?"This event is in its final 14 days.":"Check the underlying adjustment before filing."),[bar("Days elapsed",Math.min(age,60)),bar("Days remaining",Math.max(0,left))]);
  },
  payout(v) {
    const gross=v.lost+v.damaged,credits=v.found+v.paid,open=Math.max(0,gross-credits);
    return result("Estimated unresolved value",money(open*v.cost),num(open)+" open units × "+money(v.cost)+" sourced manufacturing cost. "+(credits>gross?"Offsets exceed losses. Check that the reports cover the same period.":"Confirm the event date and actual payments before filing."),[bar("Found or reimbursed units",Math.min(gross,credits)),bar("Open units",open)]);
  },
  inbound(v) {
    since(v.delivery,v.asof);
    const missing=Math.max(0,v.shipped-v.received),end=addMonths(parseDay(v.delivery),9),left=end-parseDay(v.asof);
    return result("Shipment shortage",num(missing)+" units","At your entered unit value the gap is "+money(missing*v.cost)+". Nine-calendar-month guidance gives "+isoDay(end)+" ("+(left<0?num(-left)+" days past":left===0?"today":num(left)+" days left")+"). Confirm the live shipment eligibility in Seller Central.",[bar("Units delivered",v.shipped),bar("Units checked in",v.received)]);
  },
  refund(v) {
    const age=since(v.refund,v.asof),start=parseDay(v.refund);
    const status=age<46?"Wait "+num(46-age)+(46-age===1?" day":" days"):age>120?"Window passed":age===120?"Last day":"Review for filing";
    return result("Refund timing",status,"General guidance opens "+isoDay(start+46)+" (day 46) and ends "+isoDay(start+120)+" (day 120). Check for a physical return or reimbursement before filing.",[bar("Days since refund",age),bar("End of guidance window (days)",120)]);
  },
  manufacturing(v) {
    const each=v.batch/v.produced;
    return result("Sourced manufacturing cost per unit",money(each),"At the unrounded unit cost, "+num(v.missing)+" unresolved units have an estimated value of "+money(each*v.missing)+". Use source documents for the SKU and production batch.",[bar("Manufactured batch cost",v.batch,money),bar("Cost of unresolved units",each*v.missing,money)]);
  },
  agency(v) {
    const recovered=Math.round(v.recovery*100), fee=Math.round(recovered*v.percent/100), flat=CHECKOUT.priceUSD*100,diff=fee-flat;
    return result("Difference kept with the flat fee",signed(diff/100),"If you recover "+money(recovered/100)+", you retain "+money((recovered-flat)/100)+" after the flat fee or "+money((recovered-fee)/100)+" after the percentage fee. "+(v.percent>0?"The fees match at about "+money(flat/v.percent)+" recovered.":"At 0%, a percentage fee stays at zero.")+" Illustrative; agency rates vary.",[bar("Illustrative percentage fee",fee/100,money),bar("FBA Ledger Audit flat fee",flat/100,money)]);
  },
  variance(v) {
    const expected=v.opening+v.receipts+v.shipped+v.returns+v.found-v.lost-v.damaged+v.other,delta=v.ending-expected;
    return result("Reported minus calculated balance",(delta>0?"+":"")+num(delta)+" units","The entered movements imply "+num(expected)+" ending units. "+(delta===0?"The balances agree.":"Check omitted movements, signs and reporting periods. A balance variance alone does not establish a claim."),[bar("Calculated ending units",expected),bar("Reported ending units",v.ending)]);
  }
};
function mount(form) {
  const fields=[...form.querySelectorAll("input")],host=document.getElementById("calc-result"),error=document.getElementById("calc-error");
  const initial=todayDay();
  for(const input of fields) if(input.type==="date") {input.defaultValue=isoDay(initial+Number(input.dataset.offset||0));input.value=input.defaultValue;}
  function calculate() {
    try {
      const values={};
      for(const input of fields) {
        if(!input.value || !input.validity.valid)throw new Error("Check "+input.labels[0].textContent.trim()+". Enter a value within the displayed limits.");
        values[input.name]=input.type==="date"?input.value:Number(input.value);
      }
      const out=formulas[form.dataset.calculator](values);
      if(out.bars.some(b=>!Number.isFinite(b.amount))) throw new Error("The entered figures exceed the supported range.");
      host.hidden=false;error.hidden=true;
      document.getElementById("calc-label").textContent=out.label;document.getElementById("calc-value").textContent=out.value;document.getElementById("calc-note").textContent=out.note;
      const bars=document.getElementById("calc-bars");bars.replaceChildren();
      const max=Math.max(1,...out.bars.map(b=>Math.abs(b.amount)));
      for(const b of out.bars) {
        const line=document.createElement("div"), caption=document.createElement("div"),value=document.createElement("strong");
        caption.className="bar-caption";caption.append(document.createTextNode(b.label));value.textContent=b.text;caption.append(value);
        const track=document.createElement("div"),fill=document.createElement("i");track.className="bar-track";track.setAttribute("aria-hidden","true");
        fill.style.width=(100*Math.abs(b.amount)/max)+"%";track.append(fill);line.append(caption,track);bars.append(line);
      }
    } catch(e) {host.hidden=true;error.hidden=false;error.textContent=e.message;}
  }
  form.addEventListener("input",calculate);form.addEventListener("reset",()=>queueMicrotask(calculate));
  form.addEventListener("submit",e=>{e.preventDefault();calculate();});calculate();
}
if(typeof document!=="undefined"){const form=document.querySelector("form[data-calculator]");if(form)mount(form);}
