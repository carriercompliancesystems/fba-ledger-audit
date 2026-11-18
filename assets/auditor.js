// Stripe checkout configuration
export const CHECKOUT = Object.freeze({
  paymentLink: "https://buy.stripe.com/5kQeVc9ty6Mg8NSevtbwk02",
  priceUSD: 29
});
import { paymentFlow, takeSnapshot } from "./payment.js";

let isUnlocked = false;
let currentAudit = null;
let currentFindings = [];
const payment = paymentFlow(CHECKOUT, access => {
  isUnlocked = access;
  if (currentAudit) renderResults(currentAudit);
});
function parseCSV(text) {
      const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim().length > 0);
      if (lines.length < 2) return [];
      const splitLine = (line) => {
        const out = []; let cur = "", inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQ = !inQ; }
          else if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ""; }
          else { cur += ch; }
        }
        out.push(cur.trim());
        return out;
      };
      const headers = splitLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
      return lines.slice(1).map(line => {
        const vals = splitLine(line);
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = vals[idx] || ""; });
        return obj;
      });
    }

    function daysAgo(dateStr) {
      if (!dateStr) return NaN;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return NaN;
      return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
    }

    function auditData(ledgerRows, reimbRows, unitCost) {
      const reimbBySku = {};
      reimbRows.forEach(r => {
        const sku = r.fnsku || r.msku || r.sku || "";
        const qty = Math.abs(parseFloat(r.quantityreimbursedinventory || r.quantityreimbursedtotal || r.quantity || 0)) || 0;
        if (sku) reimbBySku[sku] = (reimbBySku[sku] || 0) + qty;
      });

      const skuMap = {};
      let expiredUnits = 0;

      ledgerRows.forEach(r => {
        const sku = r.fnsku || r.msku || r.asin || "UNKNOWN-SKU";
        const title = r.title || r.productname || "FBA Item";
        const dateVal = r.date || r.snapshotdate || "";
        const age = daysAgo(dateVal);
        if (!Number.isFinite(age) || age < 0) return;

        // Handles both Summary View columns and Detailed View Event Type rows
        let lost = Math.abs(parseFloat(r.lost || 0)) || 0;
        let damaged = Math.abs(parseFloat(r.damaged || r.warehousedamaged || 0)) || 0;
        let found = Math.abs(parseFloat(r.found || 0)) || 0;

        const eventType = (r.eventtype || "").toLowerCase();
        const reason = (r.reason || "").toLowerCase();
        const qty = parseFloat(r.quantity || 0) || 0;

        if (eventType.includes("adjust") || eventType.includes("lost") || eventType.includes("damage")) {
          if (qty < 0 && (reason.includes("lost") || reason.includes("misplaced") || eventType.includes("lost"))) {
            lost += Math.abs(qty);
          } else if (qty < 0 && (reason.includes("damage") || eventType.includes("damage"))) {
            damaged += Math.abs(qty);
          } else if (qty > 0 && (reason.includes("found") || eventType.includes("found"))) {
            found += qty;
          }
        }

        const grossLoss = lost + damaged;
        if (grossLoss === 0 && found === 0) return;

        if (age > 60) {
          expiredUnits += Math.max(0, grossLoss - found);
          return;
        }

        if (!skuMap[sku]) {
          skuMap[sku] = { sku, title, date: dateVal || "Recent (<60d)", lost: 0, damaged: 0, found: 0, refIds: new Set() };
        }
        skuMap[sku].lost += lost;
        skuMap[sku].damaged += damaged;
        skuMap[sku].found += found;
        if (r.referenceid) skuMap[sku].refIds.add(r.referenceid);
      });

      const results = [];
      Object.values(skuMap).forEach(item => {
        const alreadyReimb = reimbBySku[item.sku] || 0;
        const gross = item.lost + item.damaged;
        const recovered = item.found + alreadyReimb;
        const net = Math.max(0, gross - recovered);
        if (net > 0) {
          results.push({
            sku: item.sku,
            title: item.title,
            date: item.date,
            gross,
            recovered,
            net,
            value: +(net * unitCost).toFixed(2),
            refs: Array.from(item.refIds).join("; ") || "See Inventory Ledger"
          });
        }
      });

      results.sort((a, b) => b.value - a.value);
      return { results, expiredUnits };
    }

    function renderResults(audit) {
      currentAudit = audit;
      currentFindings = audit.results;
      const totalUnits = currentFindings.reduce((s, r) => s + r.net, 0);
      const totalDollars = currentFindings.reduce((s, r) => s + r.value, 0);

      document.getElementById("statDollars").textContent = "$" + totalDollars.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      document.getElementById("statUnits").textContent = totalUnits;
      document.getElementById("statSkus").textContent = currentFindings.length;
      document.getElementById("statExpired").textContent = audit.expiredUnits;
      document.getElementById("lockedCount").textContent = currentFindings.length;

      if (isUnlocked) {
        document.getElementById("paywallBox").classList.add("hidden");
        document.getElementById("unlockedBanner").classList.remove("hidden");
      }

      const tbody = document.getElementById("rowsBody");
      tbody.innerHTML = "";
      currentFindings.forEach((row, idx) => {
        const tr = document.createElement("tr");
        if (!isUnlocked && idx >= 2) return;
        for (const value of [row.sku, row.date, row.gross, row.recovered, row.net, "$" + row.value.toFixed(2)]) {
          const cell = document.createElement("td");
          cell.textContent = value;
          tr.append(cell);
        }
        tbody.appendChild(tr);
      });

      document.getElementById("resultsBox").classList.remove("hidden");
    }

    document.getElementById("runBtn").addEventListener("click", async () => {
      const f1 = document.getElementById("ledgerFile").files[0];
      if (!f1) { alert("Please select your Inventory Ledger CSV file first, or click Load Sample Ledger CSV."); return; }
      const f2 = document.getElementById("reimbFile").files[0];
      const cost = parseFloat(document.getElementById("defaultCost").value) || 15;
      const t1 = await f1.text();
      const t2 = f2 ? await f2.text() : "";
      renderResults(auditData(parseCSV(t1), parseCSV(t2), cost));
    });

    document.getElementById("sampleBtn").addEventListener("click", () => {
      const today = new Date().toISOString().slice(0, 10);
      const sampleCSV = [
        "Date,FNSKU,MSKU,Title,Disposition,Starting Warehouse Balance,Receipts,Customer Shipments,Customer Returns,Found,Lost,Damaged,Ending Warehouse Balance",
        `${today},X0039ABC12,SKU-PRO-01,Stainless Insulated Tumbler 32oz,SELLABLE,400,200,-180,5,1,9,4,421`,
        `${today},X0039DEF34,SKU-PRO-02,Silicone Baking Mat 2-Pack,SELLABLE,250,0,-90,2,0,6,2,154`,
        `${today},X0039GHI56,SKU-PRO-03,Heavy Duty Garage Hook Set,SELLABLE,120,100,-80,0,0,5,1,134`,
        `${today},X0039JKL78,SKU-PRO-04,Magnetic Cable Organizer 6pk,SELLABLE,500,0,-210,4,2,8,0,288`
      ].join("\n");
      const cost = parseFloat(document.getElementById("defaultCost").value) || 15;
      renderResults(auditData(parseCSV(sampleCSV), [], cost));
    });

    document.getElementById("checkoutBtn").addEventListener("click", () => {
      if (currentAudit) payment.checkout({ legacy: currentAudit });
    });

    document.getElementById("downloadCsvBtn").addEventListener("click", () => {
      if (!payment.unlocked) return;
      const header = "FNSKU,Title,Date,Gross_Lost_Damaged,Found_Or_Reimbursed,Net_Claimable_Units,Est_Recovery_USD,Reference_IDs\n";
      const body = currentFindings.map(r => `"${r.sku}","${r.title.replace(/"/g, '""')}","${r.date}",${r.gross},${r.recovered},${r.net},${r.value},"${r.refs}"`).join("\n");
      const blob = new Blob([header + body], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "Claimable_Audit_Packet.csv";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    document.getElementById("downloadCasesBtn").addEventListener("click", () => {
      if (!payment.unlocked) return;
      const text = currentFindings.map((r, i) =>
        `=== CASE #${i + 1}: FNSKU ${r.sku} (${r.net} Units / Est. $${r.value}) ===\n` +
        `Subject: FBA Inventory Ledger Discrepancy Reimbursement Request - FNSKU ${r.sku}\n` +
        `Message:\nHello Seller Support,\nPer our FBA Inventory Ledger report (Reference IDs: ${r.refs}), FNSKU ${r.sku} ("${r.title}") reflects ${r.gross} lost/warehouse-damaged units within the last 60 days, with only ${r.recovered} units found or reimbursed. Please investigate and issue reimbursement for the remaining ${r.net} unreconciled units under the applicable policy. Confirm the current Seller Central support category before submitting.\n`
      ).join("\n\n");
      const blob = new Blob([text], { type: "text/plain" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "Seller_Central_Case_Scripts.txt";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  
document.getElementById("heroSample").addEventListener("click", () => {
  document.getElementById("sampleBtn").click();
  document.getElementById("resultsBox").scrollIntoView({block:"start"});
});
const prior = takeSnapshot();
if (prior?.legacy && Array.isArray(prior.legacy.results)) renderResults(prior.legacy);
payment.verify();
