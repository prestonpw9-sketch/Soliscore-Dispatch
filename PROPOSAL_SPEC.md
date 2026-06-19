# Proposal & Change Order Generator Spec — ITDG Plumbing

Build an OWNER-ONLY feature that turns a Full Bid Takeoff into a polished, printable
PDF proposal on ITDG letterhead, plus a Change Order generator. Match the company's
exact existing format (samples reproduced below). Use jsPDF (client-side).

## Access
- OWNERS ONLY (Preston/Greg). Gate behind useAuth().isOwner. Crew/office never see it.
- Live inside the Full Bid Takeoff (Bidestimator.tsx) as a "Generate Proposal" button
  (teal) near Save Bid, AND a separate "Change Order" action.

## Letterhead (top of every PDF)
- Logo image at /itdg-logo.png (top-left, ~width 180px).
- Right-aligned license block (small ~7pt):
  Arizona General Contractor License # B1-303364
  Arizona Electrical License # CR11-303365
  Arizona HVAC License # CR39-311534
  Arizona Plumbing License # CR37-317290
  California General Contractor License # 1025041
  Oregon General Contractor License # 227953
  Omaha, NE General Contractors License # 2101173
  Utah General Contractor License # B100-10601619-5501
  Utah Electrical Contractor License # B200-10601619-5501
  Washington General Contractor License # 604-274-684
  South Carolina Electrical Contractor License # CLM.116673
  North Carolina Electrical Contractor License # I.35329
- Footer (centered, every page):
  Innovative Technology Development Group, LLC
  12441 E Camino del Garanon, Tucson, Arizona  85747
  Phone: (520) 647-3862    Email: Dave@itgdconstruction.com
  ITDGConstruction.com

## PROPOSAL layout (match Drenkhahn sample exactly)
1. Date (today, editable)
2. Recipient block: GC/Owner name, company, address, email (from a form the owner fills;
   prefill GC/Owner + project from the bid's project/gcOwner fields)
3. "Re:  <Project name> – <address>"
4. "Dear <first name>:"
5. Body: "We propose to furnish the necessary labor and material to install the Plumbing
   on the above referenced project in accordance with the plan by <architect/plan ref,
   editable> dated <date, editable>, and this proposal is for the sum of:"
6. The bid amount — BIG, both numeric ($ 37,200.00) AND written out
   (Thirty Seven Thousand Two Hundred Dollars). Pull from the bid's FINAL BID
   (calcSummary finalBid) but allow the owner to override the displayed proposal amount.
   Include a helper to convert number -> words.
7. Top exclusion bullets (project-specific, editable list), e.g.:
   * Please note exclusions below
   * Septic system by others
   * All plumbing fixtures to be determined ...
8. Price-guarantee note (standard, editable):
   "Because of several recent price increases and the threat of more to come we cannot
   guarantee these prices for more than 30 days."
9. MATERIALS section (editable text fields): DWV piping, Water piping, Condensate piping,
   Gas piping, Insulation.
10. FIXTURES list (editable multiline).
11. Page 2: "Excluding the following:" + Sales tax note (e.g. "Sales tax – add $X or
    provide form AZ 5005") + the STANDARD EXCLUSIONS paragraph (pre-filled, editable):
    "After-hours work, sterilization, prevailing wages, engineering, gas pressure
    regulator, sales tax, permits, meters & fees, sewer taps, cutting, coring, removal &
    patching, backfill, import and export of fill material, shading or bedding of waste
    lines, trenching and installations over 5 ft. depth, barricades or flagging, trenching
    for Southwest Gas hpg to mtr., backflow prevention devices testing and certification.
    Fireproof caulking material or labor.  Excavation requiring jackhammer and/or removal
    of large rock will be considered extra and charged accordingly."
12. Warranty (standard, editable): "One year warranty on materials and two year warranty
    on workmanship."
13. Terms (standard, editable): "Net 30 days. Rough plumbing 40%; Top-out plumbing 40%,
    and; Trim plumbing 20%"
14. Closing: "Thank you for the opportunity of presenting this proposal. We look forward
    to working with you on this project." + "Sincerely," + DEFAULT SIGNER "Greg Williamson"
    (editable; allow Preston Watson).
15. Acceptance block: "This proposal is accepted this ___ day of ___ 20__, as tendered..."
    with By/Signature/Title/Name/Company signature lines.

## CHANGE ORDER layout (match Govt Complex sample)
Header "JOB SITE CHANGE ORDER" + ITDG letterhead.
Fields (form): Company, Project, Change Order #, Date.
1. Description of Change (multiline)
2. Impact on Schedule: checkbox "No change to completion date" / "extended by ___ days"
3. Financial Adjustment (note: "Includes sales tax and freight") — table:
   Additional Materials $___, Additional Labor $___, Total Change Order Amount (auto-sum)
4. Authorization paragraph + Client Signature/Date line + "Innovative Technology
   Development Group LLC. Rep: <Preston Watson default, editable>"

## Saving (PDF + saved to the job)
- After generating, also upload the PDF to Supabase Storage. Check existing storage
  buckets used in the repo (blueprints, site-photos). Create/use a 'proposals' bucket
  (if bucket creation isn't possible from client, save the PDF blob and ALSO trigger a
  browser download so nothing is lost; note this in the report).
- Record a row linking the proposal to the bid: store in project_bids (e.g. add the
  proposal metadata to takeoff_data JSON, or a new column) OR a new 'proposals' table.
  Keep it simple; if adding a table needs a migration, write the SQL file under
  supabase/migrations/ but DO NOT run it — report it.
- At minimum: the PDF must download reliably. Saving-to-record is a bonus; degrade
  gracefully.

## UX
- A modal/drawer "Generate Proposal" with all the editable fields pre-filled from the
  bid + standard boilerplate. Buttons: "Download PDF" (teal), "Cancel" (slate).
- Same pattern for "New Change Order".
- Use the app's color language: teal/indigo = generate/save, red = remove an exclusion row.
- Dark-mode friendly.

## Constraints
- '@/' alias = ./src/*. If importing lucide Map icon, alias as MapIcon.
- Install jspdf (npm i jspdf). MUST pass `npx tsc --noEmit` AND `npm run build`.
- Do NOT modify auth/roles/RLS, the estimator calc formulas, blueprints, or SMS code
  beyond adding the proposal entry points.
- Do NOT commit or push. Report files changed + how saving works + any migration written.
