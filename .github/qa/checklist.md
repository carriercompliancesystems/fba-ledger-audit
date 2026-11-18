# Audit release checks

Run `node --test .github/qa/*.test.mjs` from the repository root. The CSV fixtures use synthetic inventory and an as-of date of November 18, 2026. No real seller data or Stripe credentials are needed.

- Import the supplied Summary CSV. Expect 12 open units at $15.00, worth $180. Add the Reimbursements fixture and expect nine units worth $135 for that SKU.
- Include Detailed Ledger events and confirm found offsets, expired units, a due-today event, and separate deadlines for the same SKU. Exercise day 45, 46, 60 and 61.
- Test empty, header-only and unrelated files, a missing column, malformed quotes, BOM, CRLF, embedded commas, quotes and line breaks. Errors should identify the file and the offending line where applicable.
- Select multiple files and drop replacements. Repeat the same file, overlap Summary and Detailed data, and supply an ambiguous SKU alias. Confirm that overlap cannot inflate the total.
- Change the default and one SKU cost, including zero. Confirm that the estimate, urgent amount, fee comparison and exports agree. Check a flat fee that costs more than the illustrative 25% fee.
- Open the sample and verify the 14-day alert. Run a real fixture before checkout. Verify that a paid return unlocks immediately and restores the derived audit. An unpaid or unavailable verification should provide retry instructions.
- Inspect the ranked CSV, cost source, reimbursement coverage and reference IDs. Open the text file and count both FNSKUs and reference IDs toward each five-identifier case. Check the filing disclaimer in every case.
- Open the calendar file and confirm its date is 30 days ahead and the event links to the auditor.
- Confirm all production audit calculations and exports run locally and that both protected Git blobs still match their baseline IDs.
