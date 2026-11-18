const GROUPS = [
  [
    "Filing windows",
    [
      [
        "60-day deadline",
        "fba-60-day-deadline-checker"
      ],
      [
        "Inbound shipment shortage",
        "fba-inbound-shipment-discrepancy-calculator"
      ]
    ]
  ],
  [
    "Inventory & fees",
    [
      [
        "Lost or damaged payout",
        "fba-lost-inventory-reimbursement-calculator"
      ],
      [
        "Dimensional weight",
        "fba-dim-weight-fee-overcharge-calculator"
      ],
      [
        "Storage surcharge",
        "fba-aged-inventory-surcharge-calculator"
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
