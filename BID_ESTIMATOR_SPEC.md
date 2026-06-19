# Bid Estimator Rebuild Spec — Soliscore Dispatch

Goal: Rebuild the bid estimator to replicate the company's 25-year-old 4-page Excel
takeoff system EXACTLY in formula logic, with a modern UI. Calc runs in the browser
(React/TS). Bids persist to Supabase `project_bids`. Do NOT change unrelated files.

## Color language (use consistently)
- RED (`red-600`/`red-500`) = delete / remove / trash actions.
- TEAL/INDIGO (`teal-600`, `indigo-600`, `blue-600`) = commit / save / confirm / add.
- Neutral slate for structure. Support dark mode (`dark:` variants) like the rest of the app.

## Source of truth = the real Excel formulas below. Replicate these precisely.

### PAGE 1 + 1a — Material / DWV takeoff
Each line row: `total = qty (A) * price (F) * mult (G)`.  (Page 1 col H; default mult=1)
Section subtotals (Page 1):
- H68 = SUM(H7:H67) * 1        (DWV fittings section subtotal)
- H75 = SUM(H69:H74)           (second section)
- H80 = H79 + H77              (roof jacks group)
- H81 (PAGE 1 TOTAL) = (H68 + H75 + H77 + H78 + H79) * 1.15
Page 1a mirrors with col I, line total = qty * price * mult:
- I53 = SUM(I7:I52)
- I60 = SUM(I54:I59)
- I68 = SUM(I61:I67)
- I75 = SUM(I69:I74)
- I79 (PAGE 1a TOTAL) = (I53 + I60 + I68 + I75 + I77) * 1.05
Page 1 combined total used downstream (see Page 4):
  Pg1 = 'Page 1'!H81 + 'Page 1a'!I79

### PAGE 2 — Copper / Black Pipe / Scotch Kote / CPVC / PEX
Each line: `total (F) = qty (A) * price (D) * mult (E)`  (note: D=price, E=mult here)
Sections & their roll-ups (replicate the % fittings and 1.03 tier markups):
- Copper lines F9:F27.
  - Fittings F28 = E28 * SUM(F9:F27), where E28 is the fittings % (e.g. 0.43;
    rule label: "Use 35% if M, 25% if L + Hgrs"). E28 is an editable input.
  - Copper subtotal F29 = SUM(F9:F28) * 1.03
- Black Pipe lines F31:F38.
  - Malleable fittings F39 = SUM(F30:F38) * E39  (E39 default 0.5)
  - Black subtotal F40 = SUM(F31:F39) * 1.03
- Scotch Kote lines F44:F49.
  - Fittings F50 = SUM(F44:F49) * E50 (default 0.5)
  - Subtotal F51 = SUM(F44:F50) * 1.03
- CPVC lines F55:F60 (note mult E default 1.05).
  - Fittings F61 = SUM(F55:F60) * E61 (default 0.5)
  - Subtotal F62 = SUM(F55:F61) * 1.03
- PEX lines F65:F70 (mult E default 1.05).
  - Fittings F71 = SUM(F66:F70) * E71 (default 0.6, "PEX Fittings = 60%")
  - PEX subtotal F72 = SUM(F65:F71)
- PAGE 2 TOTAL F74 = (F29 + F40 + F51 + F62 + F72) * 1.03

### PAGE 3 — Fixture takeoff
Columns: A=qty, B=item, F=fixture price, I=trim price, L=trim2 price, O=misc/supply price, P=row total.
Each row: `P = A * (O + L + I + F)`  (sum the price columns, times qty)
Grouped sections (just visual headers): Master Bath / Equip. Hookups / Appliances.
Hookup rows (B39:B54) use `P = A * F` (only fixture price col).
- PAGE 3 TOTAL P58 = SUM(P7:P57) * 1.03

### PAGE 4 — Summary / Final Bid (the brain)
Two columns in Excel: I = "Initial", J = "Review". Build ONE working column
(use the Initial logic; show review as optional). Pull-throughs:
- Pg1 (I10) = Page1.H81 + Page1a.I79
- Pg2 (I11) = Page2.F74
- Pg3 (I12) = Page3.P58
- (Pg4 has no material total of its own.)
- TOTAL MATERIAL I14 = Pg1 + Pg2 + Pg3   (I13 demo is 0/blank)
- LABOR: hours E15 = SUM of the labor-hour breakdown rows (Reserve, Demo, Rough, TO,
  Gas, Condensate, Water, Trim, MISC&DRIVE...). Default rate H15 = $65/hr.
  Labor cost I15 = H15 * E15.
- I16 = I15 + I14   (material + labor)
- OVERHEAD H17 = 0.10 (editable). I17 = I16 * H17.
- I18 = I17 + I16
- PROFIT H19 = 0.10 (editable, "use decimal"). I19 = I18 * H19.
- I20 = I19 + I18
- SITE WORK subs (Sterilization, Excavation, Welding) — each a SUB input.
  Sub total I25 = SUM(subs) * 1.15
- BASE BID I26 = I20 + I21(sitework line) + I25
- PRE-LIEN I27 (default 50). I28 = I26 + I27
- Travel I29, Engineering I30 (inputs). I31 = I28 + I30 + I29
- SALES TAX I32 = J14 * 0.087   (8.7% on the review-material base J14; if only one
  column is built, use TOTAL MATERIAL * 0.087). Make the tax base + rate editable.
- I33 = SUM(I31:I32)  -> this is effectively the final bid before the optional divide.
- FINAL BID PRICE: Excel had J36 = J14 / I36 (a margin-divisor cell that was blank ->
  #DIV/0!). Treat I36/H36 as an optional "bid factor" that defaults to 1 (no-op) so we
  never divide by zero. FINAL BID = I33 (or I33 / bidFactor when bidFactor != 1).

NOTE: floating point — Excel shows values like 2011.3539... Keep full precision in
state; round only for display (`.toFixed(2)`). Currency display `$#,##0.00`.

## Data model (suggest)
```ts
interface LineItem { id: string; qty: number; size?: string; item: string; price: number; mult: number; } // total derived
interface FixtureRow { id: string; qty: number; item: string; fixture: number; trim: number; trim2: number; misc: number; } // total = qty*(sum)
interface Page2Section { key: string; title: string; lines: LineItem[]; fittingsPct: number; tier: number; } // tier=1.03
interface SummaryInputs { laborHours: {label:string; hours:number}[]; laborRate: number; overheadPct: number; profitPct: number;
  subs: {label:string; amount:number}[]; preLien: number; travel: number; engineering: number; salesTaxPct: number; bidFactor: number; }
interface BidDocument { id?: string; project: string; gcOwner: string; date: string;
  page1: LineItem[]; page1a: LineItem[]; page2: Page2Section[]; page3: FixtureRow[]; summary: SummaryInputs; }
```

## UI requirements
- Tabbed: Page 1 / Page 2 / Page 3 / Summary (Page 4).
- Each page: editable qty/price cells, live row totals, live section subtotals, live page total.
- Summary page shows the full waterfall (material -> labor -> overhead -> profit -> subs ->
  pre-lien -> tax -> FINAL BID) with each editable input clearly labeled.
- Add Row (teal), Delete Row (red trash). Save Bid (teal, persists to Supabase). 
- tabular-nums on all money. Modern card layout, rounded-xl, subtle borders, dark mode.

## Persistence
- Table `project_bids` already exists. Store the whole BidDocument as JSON in a column
  (e.g. `data jsonb`) keyed by project. Provide Save + Load. Confirm table columns first
  via the existing supabase client usage in the repo; if schema unknown, store to a
  `data` jsonb column and create a migration if needed.

## Seed data
Pre-fill Page 1/1a/2/3 line item LABELS and default unit PRICES from the Excel (the item
names + price columns), qty defaulting to 0, so the team sees their familiar list. The
extracted item rows are in BID_ITEMS_SEED.json (parent will generate it).
