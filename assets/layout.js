const GROUPS = [
  [
    "Filing windows",
    [
      [
        "60-day deadline checker",
        "fba-60-day-deadline-checker"
      ],
      [
        "Inbound shipment shortage",
        "fba-inbound-shipment-discrepancy-calculator"
      ],
      [
        "Unreturned refund checker",
        "fba-unreturned-customer-refund-45-day-checker"
      ]
    ]
  ],
  [
    "Fees & measurements",
    [
      [
        "Dimensional weight",
        "fba-dim-weight-fee-overcharge-calculator"
      ],
      [
        "Monthly storage fee",
        "fba-monthly-cubic-foot-storage-fee-calculator"
      ],
      [
        "28-day supply fee",
        "fba-low-inventory-level-28-day-supply-fee-calculator"
      ],
      [
        "Referral fee overcharge",
        "fba-referral-fee-category-overcharge-calculator"
      ],
      [
        "Return processing fee",
        "fba-return-processing-fee-calculator"
      ]
    ]
  ],
  [
    "Inventory reconciliation",
    [
      [
        "Removal order shortage",
        "fba-removal-order-shortage-calculator"
      ],
      [
        "Stranded inventory risk",
        "fba-stranded-inventory-risk-calculator"
      ],
      [
        "Lost or damaged payout",
        "fba-lost-inventory-reimbursement-calculator"
      ],
      [
        "Manufacturing cost estimator",
        "fba-manufacturing-cost-reimbursement-estimator"
      ],
      [
        "Agency vs. flat fee",
        "fba-recovery-agency-vs-flat-fee-calculator"
      ],
      [
        "Ledger balance variance",
        "fba-inventory-ledger-balance-variance-calculator"
      ]
    ]
  ]
];

const menuHost = document.querySelector("[data-tools-menu]");
if (menuHost) {
  const menu = document.createElement("details");
  menu.className = "tools-menu";
  const toggle = document.createElement("summary");
  toggle.textContent = "Calculators";
  menu.append(toggle);
  const panel = document.createElement("div");
  panel.className = "menu-panel directory";
  for (const [name, links] of GROUPS) {
    const group = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = name;
    group.append(heading);
    for (const [title, slug] of links) {
      const link = document.createElement("a");
      link.href = "/calculators/" + slug;
      link.textContent = title;
      if (location.pathname.replace(/\.html$/, "") === link.pathname) link.setAttribute("aria-current", "page");
      group.append(link);
    }
    panel.append(group);
  }
  menu.append(panel);
  menuHost.replaceChildren(menu);
  document.addEventListener("click", event => { if (!menu.contains(event.target)) menu.open = false; });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && menu.open) { menu.open = false; toggle.focus(); }
  });
  menu.addEventListener("focusout", event => { if (event.relatedTarget && !menu.contains(event.relatedTarget)) menu.open = false; });
}

// Static fallback content in every page is also available to readers without JavaScript.
const isAuditor = Boolean(document.getElementById("auditor"));
const trustItems = isAuditor
  ? ["CSV stays on your device", "No Seller Central API keys", "Flat one-time fee"]
  : ["Runs in your browser", "No Seller Central API keys", "Free calculator"];
const trust = document.querySelector(".trust-inner");
if (trust) trust.replaceChildren(...trustItems.map(text => {
  const item = document.createElement("span");
  item.textContent = text;
  return item;
}));
const footer = document.querySelector(".foot-row");
if (footer) {
  footer.querySelector("p").textContent = "Not affiliated with or endorsed by Amazon.com, Inc. or any of its affiliates.";
  const links = [["Auditor", "/#auditor"], ["Calculator directory", "/#calculators"], ["Back to top ↑", "#top"]];
  footer.querySelector("nav").replaceChildren(...links.map(([label, href]) => {
    const link = document.createElement("a");
    link.href = href;
    link.textContent = label;
    return link;
  }));
}
