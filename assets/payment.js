const UNLOCK = "fba_audit_unlocked";
const SNAPSHOT = "fba_audit_checkout_v2";
function read(storageName, key) {
  try { return window[storageName].getItem(key); } catch { return null; }
}
export function clearSnapshot() {
  try { sessionStorage.removeItem(SNAPSHOT); } catch { /* Storage may be disabled. */ }
}
export function takeSnapshot() {
  const value = read("sessionStorage", SNAPSHOT);
  if (!value) return null;
  try { return JSON.parse(value); } catch { clearSnapshot(); return null; }
}
export function paymentFlow(config, onAccess) {
  const status = document.getElementById("paymentStatus");
  let unlocked = read("localStorage", UNLOCK) === "true";
  function message(text) { status.hidden = false; status.textContent = text; }
  function publish() { onAccess(unlocked); }
  window.addEventListener("storage", event => {
    if (event.key === UNLOCK && event.newValue === "true") { unlocked = true; publish(); }
  });
  async function verify() {
    const url = new URL(location.href);
    const id = url.searchParams.get("session_id");
    if (!id) { publish(); return; }
    message("Checking your payment…");
    try {
      const response = await fetch("/api/verify?session_id=" + encodeURIComponent(id), { cache: "no-store", credentials: "same-origin", referrerPolicy: "no-referrer" });
      if (!response.ok) throw new Error("Verification unavailable");
      const data = await response.json();
      if (data.paid !== true) {
        message("Payment has not been confirmed. If you just paid, refresh this page to check again.");
        publish(); return;
      }
      unlocked = true;
      let saved = true;
      try { localStorage.setItem("fba_audit_unlocked", "true"); } catch { saved = false; }
      message(saved ? "Payment verified. Your exports are unlocked in this browser." : "Payment verified for this tab. Browser storage is unavailable. Keep your checkout return URL to restore access.");
      if (saved) { url.searchParams.delete("session_id"); history.replaceState(null, "", url.pathname + url.search + url.hash); }
    } catch {
      message("Payment verification is unavailable. Keep this return page and refresh it to retry. You can still use the free audit.");
    }
    publish();
  }
  function checkout(snapshot) {
    try { sessionStorage.setItem(SNAPSHOT, JSON.stringify(snapshot)); }
    catch {
      message("This browser could not save the audit for checkout. Payment opens in another tab. Keep this tab open or reselect your CSVs after payment.");
      window.open(config.paymentLink, "_blank", "noopener,noreferrer");
      return;
    }
    location.assign(config.paymentLink);
  }
  return { verify, checkout, get unlocked() { return unlocked; } };
}
