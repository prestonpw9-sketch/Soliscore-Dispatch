import type { Page, Route, WebSocketRoute } from '@playwright/test';

export type RoleName = 'owner' | 'crew' | 'office';

export const USERS: Record<RoleName, string> = {
  owner: '11111111-1111-4111-8111-111111111111',
  crew: '22222222-2222-4222-8222-222222222222',
  office: '33333333-3333-4333-8333-333333333333',
};

export const TECHS = {
  gabe: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
  rita: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
  owen: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc3',
};

export const JOBS = {
  mesa: 'job-mesa-rough',
  aliasRough: 'job-alias-rough',
  blank: 'job-blank',
  canyon: 'job-canyon-top',
  inspected: 'job-inspected-top',
  trim: 'job-blocked-trim',
  final: 'job-final',
  punch: 'job-punch',
  service: 'job-angle-stop',
  aliasService: 'job-alias-service',
  tm: 'job-tm',
  warranty: 'job-warranty',
};

type Row = Record<string, unknown>;

export type CapturedWrite = {
  method: string;
  table: string;
  body: unknown;
  query: string;
};

export type MockHandle = {
  role: RoleName;
  range: { start: string; end: string; today: string };
  writes: CapturedWrite[];
  leaks: string[];
  intercepted: number;
  realtimeSends: number;
  jobChannelCount: () => number;
  pushJobInsert: (row: Row) => Row;
};

type JoinedChannel = {
  ws: WebSocketRoute;
  topic: string;
  joinRef: string | null;
  jobsBindingId: string | null;
};

const RESERVED_QUERY = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'apikey']);

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, (d ?? 1) + n));
  return dt.toISOString().slice(0, 10);
}

export function dispatchRange(at = new Date()): { start: string; end: string; today: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const pick = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  let today = `${pick('year')}-${pick('month')}-${pick('day')}`;
  const hour = Number(pick('hour'));
  if (hour >= 17) today = addDays(today, 1);
  const [y, m] = today.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  return {
    today,
    start: `${y}-${mm}-01`,
    end: `${y}-${mm}-${String(last).padStart(2, '0')}`,
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function supabaseHost(): string {
  const raw = process.env.VITE_SUPABASE_URL;
  if (!raw) throw new Error('VITE_SUPABASE_URL is missing; refusing to boot the mock.');
  return new URL(raw).host;
}

function parseFilter(raw: string): { op: string; value: string } | null {
  const match = /^(eq|neq|gt|gte|lt|lte|like|ilike|is|in|not)\.(.*)$/s.exec(raw);
  if (!match) return null;
  return { op: match[1], value: match[2] };
}

function matches(row: Row, column: string, op: string, value: string): boolean {
  const cell = row[column];
  if (op === 'is') {
    if (value === 'null') return cell == null;
    if (value === 'true') return cell === true;
    if (value === 'false') return cell === false;
    return String(cell) === value;
  }
  if (op === 'in') {
    const inner = value.replace(/^\(|\)$/g, '');
    const options = inner.split(',').map(part => part.trim().replace(/^"|"$/g, ''));
    return options.includes(String(cell));
  }
  const text = cell == null ? '' : String(cell);
  if (op === 'eq') return text === value;
  if (op === 'neq') return text !== value;
  if (op === 'gt') return text > value;
  if (op === 'gte') return text >= value;
  if (op === 'lt') return text < value;
  if (op === 'lte') return text <= value;
  if (op === 'like' || op === 'ilike') {
    const needle = value.replace(/%/g, '').toLowerCase();
    return text.toLowerCase().includes(needle);
  }
  return true;
}

function project(row: Row, select: string | null): Row {
  if (!select || select === '*' || select.includes('(')) return clone(row);
  const out: Row = {};
  for (const col of select.split(',').map(part => part.trim()).filter(Boolean)) {
    if (col in row) out[col] = row[col];
  }
  return out;
}

function sortRows(rows: Row[], orderParams: string[]): Row[] {
  if (!orderParams.length) return rows;
  const specs = orderParams.map(param => {
    const [column, direction] = param.split('.');
    return { column, desc: direction === 'desc' };
  });
  return [...rows].sort((a, b) => {
    for (const spec of specs) {
      const av = a[spec.column] == null ? '' : String(a[spec.column]);
      const bv = b[spec.column] == null ? '' : String(b[spec.column]);
      const cmp = av.localeCompare(bv);
      if (cmp !== 0) return spec.desc ? -cmp : cmp;
    }
    return 0;
  });
}

function corsHeaders(route: Route): Record<string, string> {
  const headers = route.request().headers();
  return {
    'access-control-allow-origin': headers.origin ?? '*',
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
    'access-control-allow-headers': headers['access-control-request-headers']
      ?? 'apikey, authorization, content-type, prefer, accept, accept-profile, content-profile, x-client-info',
    'access-control-expose-headers': 'content-range, content-length, x-total-count, location',
    'content-type': 'application/json',
  };
}

async function fulfill(route: Route, status: number, body: unknown, extra: Record<string, string> = {}) {
  await route.fulfill({
    status,
    headers: { ...corsHeaders(route), ...extra },
    body: body == null ? '' : JSON.stringify(body),
  });
}

function seed(range: { start: string; end: string }, role: RoleName): Record<string, Row[]> {
  const job = (row: Row): Row => ({
    description: '',
    inspection_passed: false,
    status: 'scheduled',
    date: range.start,
    end_date: range.end,
    service_type: 'Repair',
    startTime: '08:00',
    endTime: '17:00',
    technician_id: null,
    technician_ids: [],
    customer_id: null,
    project_id: null,
    tm_enabled: false,
    tm_approved_by: null,
    tm_work_description: null,
    tm_hours: null,
    location: 'Tucson, AZ',
    ...row,
  });
  const task = (row: Row): Row => ({
    task: '',
    status: 'not_started',
    percent_complete: 0,
    start_date: range.start,
    end_date: range.end,
    created_at: '2026-01-01T00:00:00.000Z',
    ...row,
  });

  return {
    jobs: [
      job({ id: JOBS.mesa, title: 'Mesa Rough House', location: '100 Mesa Dr', phase: 'Rough-In', description: 'Underground copper', technician_id: TECHS.gabe, technician_ids: [TECHS.gabe] }),
      job({ id: JOBS.aliasRough, title: 'Alias Rough House', location: '12 Alias Ave', phase: 'Rough In' }),
      job({ id: JOBS.blank, title: 'Blank Phase House', location: '4 Blank St', phase: '' }),
      job({ id: JOBS.canyon, title: 'Canyon Top Out', location: '8600 E Rockcliff Rd', phase: 'Top-Out', inspection_passed: false }),
      job({ id: JOBS.inspected, title: 'Inspected Top Out', location: '18 Passed Ln', phase: 'Top-Out', inspection_passed: true }),
      job({ id: JOBS.trim, title: 'Blocked Trim House', location: '7 Trim Ct', phase: 'Trim' }),
      job({ id: JOBS.final, title: 'Final Walk House', location: '3 Final Way', phase: 'Final' }),
      job({ id: JOBS.punch, title: 'Punch List House', location: '5 Punch Pl', phase: 'Punch' }),
      job({ id: JOBS.service, title: 'Angle Stop Call', location: '9 Oak St', phase: 'Service Call', technician_id: TECHS.rita, technician_ids: [TECHS.rita] }),
      job({ id: JOBS.aliasService, title: 'Alias Service House', location: '2 Service Rd', phase: 'Service Calls' }),
      job({ id: JOBS.tm, title: 'Materials Extra', location: '6 Time Ln', phase: 'T&M', tm_enabled: true }),
      job({ id: JOBS.warranty, title: 'Warranty Hold', location: '77 Unknown Ln', phase: 'Warranty' }),
    ],
    job_tasks: [
      task({ id: 'task-mesa-gabe', job_id: JOBS.mesa, technician_id: TECHS.gabe, task: 'run copper' }),
      task({ id: 'task-angle-rita', job_id: JOBS.service, technician_id: TECHS.rita, task: 'replace angle stop' }),
    ],
    technicians: [
      { id: TECHS.gabe, name: 'Gabe', role: 'Plumber', color: '#0d9488', skills: [], phone: '5205550101', emergency_contact: false },
      { id: TECHS.rita, name: 'Rita', role: 'Plumber', color: '#2563eb', skills: [], phone: null, emergency_contact: false },
      { id: TECHS.owen, name: 'Off Owen', role: 'Plumber', color: '#db2777', skills: [], phone: null, emergency_contact: false },
    ],
    tech_time_off: [
      { id: 'off-owen', technician_id: TECHS.owen, start_date: '2020-01-01', end_date: '2035-12-31', note: 'Leave', created_at: '2026-01-01T00:00:00.000Z' },
    ],
    customers: [
      { id: 'cust-mesa', name: 'Mesa Builder', phone: '5205550199', email: 'builder@example.com', address: '100 Mesa Dr', city: 'Mesa', notes: '', created_at: '2026-01-01T00:00:00.000Z' },
    ],
    builders: [],
    projects: [],
    tech_daily_priorities: [],
    dispatch_announcements: [{ id: 1, message: '', updated_at: '2026-01-01T00:00:00.000Z' }],
    dispatch_messages: [],
    dispatch_schedule_alerts: [],
    dispatch_inbox_state: (Object.values(USERS)).map(userId => ({
      user_id: userId,
      messages_seen_at: '2026-10-01T00:00:00.000Z',
      alerts_seen_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
    })),
    task_updates: [],
    schedule_history: [],
    submittals: [],
    user_roles: (Object.entries(USERS) as [RoleName, string][]).map(([name, userId]) => ({
      user_id: userId,
      role: name,
    })),
  };
  void role;
}

function readBody(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return raw; }
}

export async function installSupabaseMock(
  page: Page,
  opts: { role: RoleName; extraJobs?: Row[] },
): Promise<MockHandle> {
  const host = supabaseHost();
  const range = dispatchRange();
  const db = seed(range, opts.role);
  for (const extra of opts.extraJobs ?? []) {
    db.jobs.push({ ...clone(db.jobs[0]), technician_id: null, technician_ids: [], description: '', ...clone(extra) });
  }
  const writes: CapturedWrite[] = [];
  const leaks: string[] = [];
  const joined: JoinedChannel[] = [];
  let intercepted = 0;
  let realtimeSends = 0;
  let seq = 1;

  const user = {
    id: USERS[opts.role],
    aud: 'authenticated',
    role: 'authenticated',
    email: `${opts.role}@dispatch.test`,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  };
  const storageKey = `sb-${host.split('.')[0]}-auth-token`;
  const session = {
    access_token: `test-access-${opts.role}`,
    refresh_token: `test-refresh-${opts.role}`,
    expires_in: 86_400,
    expires_at: Math.floor(Date.now() / 1000) + 86_400,
    token_type: 'bearer',
    user,
  };

  await page.addInitScript(({ key, value }) => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, { key: storageKey, value: session });

  await page.routeWebSocket((url: URL) => url.host === host, ws => {
    intercepted += 1;
    ws.onMessage(message => {
      const text = typeof message === 'string' ? message : message.toString();
      let frame: unknown[];
      try { frame = JSON.parse(text) as unknown[]; } catch { return; }
      const [joinRef, ref, topic, event, payload] = frame as [string | null, string | null, string, string, Record<string, unknown>];
      const reply = (response: unknown) => {
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]));
      };
      if (event === 'heartbeat' || event === 'phx_heartbeat') {
        reply({});
        return;
      }
      if (event === 'phx_join') {
        const config = (payload?.config ?? {}) as { postgres_changes?: Array<Record<string, unknown>> };
        const changes = config.postgres_changes ?? [];
        const serverChanges = changes.map((change, index) => ({
          id: `pc-${index}`,
          event: change.event,
          schema: change.schema,
          table: change.table,
          filter: change.filter,
        }));
        const jobsBinding = serverChanges.find(change => change.table === 'jobs');
        joined.push({
          ws,
          topic: String(topic),
          joinRef: joinRef ?? null,
          jobsBindingId: jobsBinding ? String(jobsBinding.id) : null,
        });
        reply({ postgres_changes: serverChanges });
        return;
      }
      if (event === 'access_token' || event === 'phx_leave') reply({});
    });
    ws.onClose(() => {
      for (let i = joined.length - 1; i >= 0; i -= 1) {
        if (joined[i].ws === ws) joined.splice(i, 1);
      }
    });
  });

  await page.route('**/*', async route => {
    const request = route.request();
    let url: URL;
    try { url = new URL(request.url()); } catch { await route.abort(); return; }

    if (url.host !== host) {
      if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') {
        await route.continue();
        return;
      }
      leaks.push(`${request.method()} ${url.href}`);
      await route.abort('blockedbyclient');
      return;
    }

    intercepted += 1;
    if (request.method() === 'OPTIONS') {
      await fulfill(route, 204, null);
      return;
    }

    if (url.pathname.startsWith('/auth/v1/')) {
      if (url.pathname.endsWith('/user')) {
        await fulfill(route, 200, user);
        return;
      }
      if (url.pathname.endsWith('/token')) {
        await fulfill(route, 200, session);
        return;
      }
      await fulfill(route, 200, {});
      return;
    }

    if (url.pathname.startsWith('/storage/v1/')) {
      await fulfill(route, 200, []);
      return;
    }

    const rest = url.pathname.match(/^\/rest\/v1\/([^/]+)/);
    if (!rest) {
      console.log(`[supabase-mock] unhandled ${request.method()} ${url.pathname}`);
      await fulfill(route, 200, []);
      return;
    }

    const table = decodeURIComponent(rest[1]);
    if (!db[table]) db[table] = [];
    const rows = db[table];
    const params = url.searchParams;
    const select = params.get('select');
    const order = params.getAll('order');
    const limit = params.get('limit');
    const offset = Number(params.get('offset') ?? '0') || 0;
    const accept = request.headers().accept ?? '';
    const prefer = request.headers().prefer ?? '';
    const wantsObject = accept.includes('application/vnd.pgrst.object+json');

    const filtered = rows.filter(row => {
      for (const [key, raw] of params.entries()) {
        if (RESERVED_QUERY.has(key)) continue;
        const filter = parseFilter(raw);
        if (!filter) continue;
        if (!matches(row, key, filter.op, filter.value)) return false;
      }
      return true;
    });

    if (request.method() === 'HEAD' || request.method() === 'GET') {
      const ordered = sortRows(filtered, order);
      const limited = ordered.slice(offset, limit ? offset + Number(limit) : undefined);
      const projected = limited.map(row => project(row, select));
      const count = filtered.length;
      const rangeHeader = count === 0 ? '*/0' : `${offset}-${offset + projected.length - 1}/${count}`;
      if (request.method() === 'HEAD') {
        await fulfill(route, 200, null, { 'content-range': `*/${count}` });
        return;
      }
      if (wantsObject) {
        if (projected.length !== 1) {
          await fulfill(route, 406, {
            code: 'PGRST116',
            message: 'JSON object requested, multiple (or no) rows returned',
            details: null,
            hint: null,
          });
          return;
        }
        await fulfill(route, 200, projected[0], { 'content-range': rangeHeader });
        return;
      }
      await fulfill(route, 200, projected, { 'content-range': rangeHeader });
      return;
    }

    const rawBody = readBody(request.postData());
    writes.push({
      method: request.method(),
      table,
      body: rawBody,
      query: url.search,
    });

    if (request.method() === 'POST') {
      const incoming = Array.isArray(rawBody) ? rawBody : [rawBody ?? {}];
      const conflict = params.get('on_conflict');
      const saved: Row[] = [];
      for (const item of incoming) {
        const record = clone((item ?? {}) as Row);
        if (prefer.includes('resolution=merge-duplicates') && conflict && record[conflict] != null) {
          const idx = rows.findIndex(row => String(row[conflict]) === String(record[conflict]));
          if (idx >= 0) {
            rows[idx] = { ...rows[idx], ...record };
            saved.push(rows[idx]);
            continue;
          }
        }
        if (record.id == null) record.id = `${table}-${seq++}`;
        rows.push(record);
        saved.push(record);
      }
      const projected = saved.map(row => project(row, select));
      if (wantsObject) {
        await fulfill(route, projected.length === 1 ? 201 : 406, projected.length === 1 ? projected[0] : {
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
        });
        return;
      }
      await fulfill(route, 201, projected);
      return;
    }

    if (request.method() === 'PATCH' || request.method() === 'PUT') {
      const patch = (rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody)) ? rawBody as Row : {};
      const updated: Row[] = [];
      for (const row of rows) {
        if (!filtered.includes(row)) continue;
        Object.assign(row, clone(patch));
        updated.push(row);
      }
      const projected = updated.map(row => project(row, select));
      if (wantsObject) {
        await fulfill(route, projected.length === 1 ? 200 : 406, projected.length === 1 ? projected[0] : {
          code: 'PGRST116',
          message: 'JSON object requested, multiple (or no) rows returned',
        });
        return;
      }
      await fulfill(route, 200, projected);
      return;
    }

    if (request.method() === 'DELETE') {
      const removed: Row[] = [];
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (!filtered.includes(rows[i])) continue;
        removed.unshift(rows[i]);
        rows.splice(i, 1);
      }
      await fulfill(route, 200, removed.map(row => project(row, select)));
      return;
    }

    await fulfill(route, 200, []);
  });

  return {
    role: opts.role,
    range,
    writes,
    leaks,
    get intercepted() { return intercepted; },
    get realtimeSends() { return realtimeSends; },
    jobChannelCount: () => joined.filter(channel => channel.jobsBindingId && channel.topic.includes('jobs_live_board')).length,
    pushJobInsert: (partial: Row) => {
      const row: Row = {
        description: '',
        inspection_passed: false,
        status: 'scheduled',
        date: range.start,
        end_date: range.end,
        service_type: 'Repair',
        startTime: '08:00',
        endTime: '17:00',
        technician_id: null,
        technician_ids: [],
        customer_id: null,
        project_id: null,
        tm_enabled: false,
        tm_approved_by: null,
        tm_work_description: null,
        tm_hours: null,
        location: 'Tucson, AZ',
        phase: 'Punch',
        ...partial,
      };
      if (row.id == null) row.id = `job-live-${seq++}`;
      db.jobs.push(row);
      const payload = {
        ids: [] as string[],
        data: {
          type: 'INSERT',
          schema: 'public',
          table: 'jobs',
          commit_timestamp: new Date().toISOString(),
          columns: [],
          record: row,
          old_record: null,
          errors: null,
        },
      };
      for (const channel of joined) {
        if (!channel.jobsBindingId || !channel.topic.includes('jobs_live_board')) continue;
        payload.ids = [channel.jobsBindingId];
        try {
          channel.ws.send(JSON.stringify([
            channel.joinRef,
            null,
            channel.topic,
            'postgres_changes',
            payload,
          ]));
          realtimeSends += 1;
        } catch (err) {
          console.log('[supabase-mock] realtime send failed', err);
        }
      }
      return row;
    },
  };
}
