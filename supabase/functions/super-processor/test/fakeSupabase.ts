/**
 * In-memory stand-in for the slice of supabase-js that super-processor uses.
 * Test-only; never imported by index.ts / handler.ts.
 */
// deno-lint-ignore-file no-explicit-any
type Row = Record<string, any>;
type Filter = { kind: "eq" | "neq" | "is" | "in"; col: string; val: any };
export type FailRule = { table: string; op: "select" | "insert" | "update" | "upsert"; message?: string };
export type OpLog = { table: string; op: string; values?: any; filters: Filter[] };

export class FakeDb {
  tables: Record<string, Row[]>;
  ops: OpLog[] = [];
  fail: FailRule[] = [];
  private seq = 1000;
  private clock = Date.parse("2026-11-12T19:00:00Z");

  constructor(seed: Record<string, Row[]> = {}) {
    this.tables = {};
    for (const [k, v] of Object.entries(seed)) this.tables[k] = v.map((r) => ({ ...r }));
  }
  table(name: string): Row[] {
    return (this.tables[name] ??= []);
  }
  writes(table?: string): OpLog[] {
    return this.ops.filter((o) => o.op !== "select" && (!table || o.table === table));
  }
  nextId(table: string): number | string {
    this.seq++;
    return table === "jobs" ? this.seq : `${table}-${this.seq}`;
  }
  now(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }
  from(table: string) {
    return new Query(this, table);
  }
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const v = row[f.col];
    if (f.kind === "eq") return v === f.val || (v != null && f.val != null && String(v) === String(f.val));
    if (f.kind === "neq") return v != null && String(v) !== String(f.val);
    if (f.kind === "is") return f.val === null ? v == null : v === f.val;
    if (f.kind === "in") return (f.val as any[]).map(String).includes(String(v));
    return true;
  });
}

class Query implements PromiseLike<{ data: any; error: any }> {
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private values: any = null;
  private filters: Filter[] = [];
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private returning = false;
  constructor(private db: FakeDb, private name: string) {}

  select(_cols?: string) { if (this.op === "select") this.op = "select"; else this.returning = true; return this; }
  insert(v: any) { this.op = "insert"; this.values = Array.isArray(v) ? v : [v]; return this; }
  update(v: any) { this.op = "update"; this.values = v; return this; }
  upsert(v: any) { this.op = "upsert"; this.values = Array.isArray(v) ? v : [v]; return this; }
  eq(col: string, val: any) { this.filters.push({ kind: "eq", col, val }); return this; }
  neq(col: string, val: any) { this.filters.push({ kind: "neq", col, val }); return this; }
  is(col: string, val: any) { this.filters.push({ kind: "is", col, val }); return this; }
  in(col: string, val: any[]) { this.filters.push({ kind: "in", col, val }); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orderBy = { col, asc: opts?.ascending !== false }; return this; }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.mode = "single"; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }

  then<A = { data: any; error: any }, B = never>(ok?: ((v: { data: any; error: any }) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.exec()).then(ok, bad);
  }

  private shape(rows: Row[]): { data: any; error: any } {
    if (this.mode === "single") return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: `expected 1 row, got ${rows.length}` } };
    if (this.mode === "maybe") return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }

  private exec(): { data: any; error: any } {
    const db = this.db;
    db.ops.push({ table: this.name, op: this.op, values: this.values, filters: [...this.filters] });
    const rule = db.fail.find((f) => f.table === this.name && f.op === this.op);
    if (rule) return { data: null, error: { message: rule.message ?? `fake ${this.op} failure on ${this.name}` } };
    const t = db.table(this.name);

    if (this.op === "select") {
      let rows = t.filter((r) => matches(r, this.filters)).map((r) => ({ ...r }));
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        rows.sort((a, b) => (a[col] < b[col] ? -1 : a[col] > b[col] ? 1 : 0) * (asc ? 1 : -1));
      }
      if (this.limitN != null) rows = rows.slice(0, this.limitN);
      return this.shape(rows);
    }
    if (this.op === "insert") {
      const added = (this.values as Row[]).map((v) => ({ id: v.id ?? db.nextId(this.name), created_at: db.now(), ...v }));
      t.push(...added);
      return this.returning || this.mode !== "many" ? this.shape(added.map((r) => ({ ...r }))) : { data: null, error: null };
    }
    if (this.op === "upsert") {
      for (const v of this.values as Row[]) {
        const i = t.findIndex((r) => r.phone_number === v.phone_number);
        if (i >= 0) t[i] = { ...t[i], ...v }; else t.push({ ...v });
      }
      return { data: null, error: null };
    }
    // update
    const hit = t.filter((r) => matches(r, this.filters));
    for (const r of hit) Object.assign(r, this.values);
    return this.returning || this.mode !== "many" ? this.shape(hit.map((r) => ({ ...r }))) : { data: null, error: null };
  }
}
