// lib/mtproto/tests/fake-db.ts
//
// A tiny in-memory stand-in for the supabase-js query builder, just rich
// enough for the reads/writes lib/mtproto/ makes. It is installed with
// __setMtDbForTest(); no network, no real Supabase project is ever touched.

type Row = Record<string, any>;
type Result = { data: any; error: { message: string; code?: string } | null };

export class FakeDb {
  tables: Record<string, Row[]> = {};
  /** table -> op ("select"|"insert"|"update"|"upsert") -> error to return */
  failures: Record<string, Partial<Record<string, { message: string; code?: string }>>> = {};
  private seq = 0;

  seed(table: string, rows: Row[]): void {
    this.tables[table] = rows.map((r) => ({ ...r }));
  }
  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }
  fail(table: string, op: string, error: { message: string; code?: string } | null): void {
    (this.failures[table] ??= {})[op] = error ?? undefined;
  }
  nextId(): number {
    return ++this.seq;
  }
  from(table: string): FakeQuery {
    return new FakeQuery(this, table);
  }
}

class FakeQuery implements PromiseLike<Result> {
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private payload: any = null;
  private upsertKey: string | null = null;
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private lim: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private wantOne: "single" | "maybe" | null = null;
  private returning = false;

  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string) {
    if (this.op !== "select") this.returning = true;
    return this;
  }
  insert(p: any) {
    this.op = "insert";
    this.payload = p;
    return this;
  }
  update(p: any) {
    this.op = "update";
    this.payload = p;
    return this;
  }
  upsert(p: any, opts?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = p;
    this.upsertKey = opts?.onConflict ?? (this.table === "app_settings" ? "key" : "id");
    return this;
  }
  eq(c: string, v: any) {
    this.filters.push((r) => r[c] === v);
    return this;
  }
  in(c: string, vs: any[]) {
    this.filters.push((r) => vs.includes(r[c]));
    return this;
  }
  gte(c: string, v: any) {
    this.filters.push((r) => r[c] != null && r[c] >= v);
    return this;
  }
  gt(c: string, v: any) {
    this.filters.push((r) => r[c] != null && r[c] > v);
    return this;
  }
  lte(c: string, v: any) {
    this.filters.push((r) => r[c] != null && r[c] <= v);
    return this;
  }
  not(c: string, op: string, v: any) {
    if (op === "is") this.filters.push((r) => (v === null ? r[c] != null : r[c] !== v));
    else if (op === "in") {
      const list = String(v).replace(/^\(|\)$/g, "").split(",");
      this.filters.push((r) => !list.includes(String(r[c])));
    } else throw new Error(`fake-db: not(${op}) unsupported`);
    return this;
  }
  order(c: string, o?: { ascending?: boolean }) {
    this.orders.push({ col: c, asc: o?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.lim = n;
    return this;
  }
  range(a: number, b: number) {
    this.rangeFrom = a;
    this.rangeTo = b;
    return this;
  }
  single() {
    this.wantOne = "single";
    return this;
  }
  maybeSingle() {
    this.wantOne = "maybe";
    return this;
  }

  private applyDefaults(row: Row): Row {
    const now = new Date().toISOString();
    if (this.table === "reengage_runs") {
      return { id: `00000000-0000-4000-8000-${String(this.db.nextId()).padStart(12, "0")}`, created_at: now, status: "draft", dry_run: true, confirm_live_at: null, stop_requested: false, started_at: null, finished_at: null, note: null, ...row };
    }
    if (this.table === "reengage_events") return { id: this.db.nextId(), ts: now, detail: {}, actor: "system", ...row };
    return row;
  }

  private run(): Result {
    const fail = this.db.failures[this.table]?.[this.op];
    if (fail) return { data: null, error: fail };
    const rows = this.db.rows(this.table);
    let out: Row[];
    if (this.op === "insert") {
      const items = (Array.isArray(this.payload) ? this.payload : [this.payload]).map((p: Row) => this.applyDefaults({ ...p }));
      rows.push(...items);
      out = items;
    } else if (this.op === "upsert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload];
      out = [];
      for (const p of items) {
        const existing = rows.find((r) => r[this.upsertKey!] === p[this.upsertKey!]);
        if (existing) {
          Object.assign(existing, p);
          out.push(existing);
        } else {
          rows.push({ ...p });
          out.push(rows[rows.length - 1]);
        }
      }
    } else if (this.op === "update") {
      out = rows.filter((r) => this.filters.every((f) => f(r)));
      for (const r of out) Object.assign(r, this.payload);
    } else {
      out = rows.filter((r) => this.filters.every((f) => f(r)));
    }
    if (this.op === "select") {
      for (const o of [...this.orders].reverse()) {
        out = [...out].sort((a, b) => (a[o.col] < b[o.col] ? -1 : a[o.col] > b[o.col] ? 1 : 0) * (o.asc ? 1 : -1));
      }
      if (this.rangeFrom != null) out = out.slice(this.rangeFrom, (this.rangeTo as number) + 1);
      if (this.lim != null) out = out.slice(0, this.lim);
    }
    out = out.map((r) => ({ ...r }));
    if (this.wantOne) {
      if (out.length === 0) return this.wantOne === "single" ? { data: null, error: { message: "JSON object requested, multiple (or no) rows returned" } } : { data: null, error: null };
      if (out.length > 1 && this.wantOne === "single") return { data: null, error: { message: "multiple rows returned" } };
      return { data: out[0], error: null };
    }
    if ((this.op === "insert" || this.op === "update" || this.op === "upsert") && !this.returning) return { data: null, error: null };
    return { data: out, error: null };
  }

  then<T1 = Result, T2 = never>(onf?: ((v: Result) => T1 | PromiseLike<T1>) | null, onr?: ((r: any) => T2 | PromiseLike<T2>) | null): PromiseLike<T1 | T2> {
    return Promise.resolve().then(() => this.run()).then(onf as any, onr as any);
  }
}
