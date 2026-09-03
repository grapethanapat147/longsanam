/**
 * Seed demo content into a REMOTE Supabase project.
 *
 * `supabase/seed.sql` cannot be used against a deployed database: it runs only
 * on a local `db reset`, and it hardcodes demo auth users with a throwaway
 * password. This script does the same job over the Auth Admin and PostgREST
 * APIs, against whichever project the credentials point at.
 *
 * Two deliberate differences from the local seed:
 *
 *  - Demo accounts get one strong random password, printed once, instead of a
 *    guessable one. A deployed URL is reachable by anyone.
 *  - Everything it creates is tagged so `clear-remote-demo.mjs` can remove it
 *    without touching real data.
 *
 * Usage:
 *   node scripts/seed-remote-demo.mjs --url <supabase-url> --key <service-role-key>
 *
 * Re-running is safe: existing demo rows are detected by slug or email and left
 * alone rather than duplicated.
 */

import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};

const SUPABASE_URL = (arg('url') ?? process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const SERVICE_KEY = arg('key') ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Usage: node scripts/seed-remote-demo.mjs --url <url> --key <service-role-key>');
  process.exit(1);
}

/** Marks every row this script creates, so cleanup can find them precisely. */
export const DEMO_TAG = 'longsanam-demo';
const DEMO_EMAIL_DOMAIN = 'demo.longsanam.app';

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: { ...headers, ...(prefer ? { Prefer: prefer } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

const insert = (table, rows) =>
  rest(table, { method: 'POST', body: rows, prefer: 'return=representation' });

async function listUsers() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers });
  if (!res.ok) throw new Error(`list users -> ${res.status} ${await res.text()}`);
  return (await res.json()).users ?? [];
}

async function createUser(email, displayName, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName, demo: DEMO_TAG },
    }),
  });
  if (!res.ok) throw new Error(`create user ${email} -> ${res.status} ${await res.text()}`);
  return res.json();
}

/** Bangkok wall-clock time on a day offset from today, as an absolute instant. */
function bkk(dayOffset, time) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  const iso = d.toISOString().slice(0, 10);
  return `${iso}T${time}:00+07:00`;
}

const minutesFromNow = (m) => new Date(Date.now() + m * 60_000).toISOString();

async function main() {
  console.log(`→ ${SUPABASE_URL}\n`);

  // ---- organizer: the real platform admin already on the project ----------
  const admins = await rest('profiles?select=id,display_name,role&role=eq.platform_admin');
  if (admins.length === 0) {
    throw new Error(
      'No platform_admin found. Sign up through the app and promote yourself first.',
    );
  }
  const organizer = admins[0];
  console.log(`organizer: ${organizer.display_name} (${organizer.id})`);

  // ---- demo players -------------------------------------------------------
  const password = `Lsn-${randomBytes(12).toString('base64url')}`;
  const wanted = [
    ['nan', 'แนน'],
    ['boss', 'บอส'],
    ['meen', 'มีน'],
    ['pond', 'ปอนด์'],
    ['june', 'จูน'],
    ['ice', 'ไอซ์'],
  ];

  const existing = await listUsers();
  const byEmail = new Map(existing.map((u) => [u.email, u]));
  const players = [];
  let created = 0;

  for (const [handle, name] of wanted) {
    const email = `${handle}@${DEMO_EMAIL_DOMAIN}`;
    let user = byEmail.get(email);
    if (!user) {
      user = await createUser(email, name, password);
      created += 1;
    }
    players.push({ id: user.id, name, email });
  }
  console.log(`players:   ${players.length} (${created} created, ${players.length - created} existing)`);

  // ---- venues -------------------------------------------------------------
  const venueSpecs = [
    {
      slug: 'ladprao-badminton-center',
      name: 'ลาดพร้าว แบดมินตัน เซ็นเตอร์',
      description: 'สนามแบดมินตันในร่ม 6 คอร์ต พื้นยางสังเคราะห์ มีที่จอดรถ',
      address: '1699 ถนนลาดพร้าว แขวงวังทองหลาง',
      district: 'วังทองหลาง',
      auto: true,
      lead: 60,
    },
    {
      slug: 'thonglor-football-arena',
      name: 'ทองหล่อ ฟุตบอล อารีน่า',
      description: 'สนามฟุตบอลหญ้าเทียม 7 คน 2 สนาม พร้อมไฟส่องสว่าง',
      address: '55 ซอยสุขุมวิท 55 แขวงคลองตันเหนือ',
      district: 'วัฒนา',
      auto: false,
      lead: 120,
    },
    {
      slug: 'rama9-pickleball-club',
      name: 'พระราม 9 พิคเคิลบอล คลับ',
      description: 'คอร์ตพิคเคิลบอลมาตรฐาน 4 คอร์ต ในร่ม พร้อมอุปกรณ์ให้ยืม',
      address: '9 ถนนพระราม 9 แขวงห้วยขวาง',
      district: 'ห้วยขวาง',
      auto: true,
      lead: 60,
    },
  ];

  const slugs = venueSpecs.map((v) => `"${v.slug}"`).join(',');
  const already = await rest(`venues?select=id,slug&slug=in.(${slugs})`);
  if (already.length > 0) {
    console.log(`\nDemo venues already present (${already.length}). Nothing to do.`);
    console.log('Run scripts/clear-remote-demo.mjs first if you want a clean re-seed.');
    return;
  }

  const venues = await insert(
    'venues',
    venueSpecs.map((v) => ({
      slug: v.slug,
      name: v.name,
      description: v.description,
      address: v.address,
      district: v.district,
      province: 'กรุงเทพมหานคร',
      is_active: true,
      auto_confirm_bookings: v.auto,
      booking_lead_minutes: v.lead,
      created_by: organizer.id,
    })),
  );
  const venueBySlug = Object.fromEntries(venues.map((v) => [v.slug, v]));
  console.log(`venues:    ${venues.length}`);

  await insert(
    'venue_members',
    venues.map((v) => ({ venue_id: v.id, user_id: organizer.id, role: 'owner' })),
  );

  // ---- sports lookup (reference data, shipped by migration) ---------------
  const sports = await rest('sports?select=id,slug');
  const sportBySlug = Object.fromEntries(sports.map((s) => [s.slug, s.id]));

  // ---- courts -------------------------------------------------------------
  const courtSpecs = [
    { venue: 'ladprao-badminton-center', name: 'คอร์ต 1', cap: 8, price: 220, sports: ['badminton'] },
    { venue: 'ladprao-badminton-center', name: 'คอร์ต 2', cap: 8, price: 220, sports: ['badminton'] },
    { venue: 'ladprao-badminton-center', name: 'คอร์ต 3', cap: 8, price: 200, sports: ['badminton'] },
    { venue: 'thonglor-football-arena', name: 'สนาม A (7 คน)', cap: 14, price: 1400, sports: ['football'] },
    { venue: 'thonglor-football-arena', name: 'สนาม B (7 คน)', cap: 14, price: 1200, sports: ['football'] },
    { venue: 'rama9-pickleball-club', name: 'คอร์ต P1', cap: 4, price: 300, sports: ['pickleball', 'tennis'] },
    { venue: 'rama9-pickleball-club', name: 'คอร์ต P2', cap: 4, price: 300, sports: ['pickleball'] },
  ];

  const courts = await insert(
    'courts',
    courtSpecs.map((c) => ({
      venue_id: venueBySlug[c.venue].id,
      name: c.name,
      capacity: c.cap,
      base_price_thb: c.price,
      min_booking_minutes: 60,
      is_active: true,
    })),
  );
  const courtByName = Object.fromEntries(courts.map((c) => [c.name, c]));
  console.log(`courts:    ${courts.length}`);

  await insert(
    'court_sports',
    courtSpecs.flatMap((c, i) =>
      c.sports.map((s) => ({ court_id: courts[i].id, sport_id: sportBySlug[s] })),
    ),
  );

  // Opening hours 06:00–23:00 every day, for every court.
  await insert(
    'court_availability',
    courts.flatMap((c) =>
      Array.from({ length: 7 }, (_, weekday) => ({
        court_id: c.id,
        kind: 'opening_hours',
        weekday,
        opens_at: '06:00',
        closes_at: '23:00',
      })),
    ),
  );

  // One real blackout, so the availability logic has something to trip over.
  await insert('court_availability', [
    {
      court_id: courtByName['คอร์ต 3'].id,
      kind: 'blackout',
      starts_at: bkk(5, '00:00'),
      ends_at: bkk(6, '00:00'),
      reason: 'ปิดปรับปรุงพื้นคอร์ต',
    },
  ]);

  await insert('court_price_rules', [
    ...courts.map((c) => ({
      court_id: c.id,
      name: 'ราคาช่วงเย็น (จันทร์-ศุกร์)',
      weekdays: [1, 2, 3, 4, 5],
      starts_time: '17:00',
      ends_time: '23:00',
      price_thb: Math.round(c.base_price_thb * 1.4),
      priority: 10,
    })),
    ...courts.map((c) => ({
      court_id: c.id,
      name: 'ราคาสุดสัปดาห์',
      weekdays: [0, 6],
      starts_time: '06:00',
      ends_time: '23:00',
      price_thb: Math.round(c.base_price_thb * 1.25),
      priority: 20,
    })),
  ]);
  console.log(`pricing:   peak + weekend rules on every court`);

  // ---- sessions -----------------------------------------------------------
  const sessionSpecs = [
    {
      key: 'draft',
      title: 'แบดเช้าวันเสาร์ (ร่าง)',
      description: 'ยังไม่เผยแพร่ กำลังหาสนามอยู่',
      sport: 'badminton',
      area: 'ลาดพร้าว',
      district: 'วังทองหลาง',
      day: 9,
      from: '09:00',
      to: '11:00',
      budget: 90,
      target: 8,
      min: 6,
      deadlineDay: 8,
      status: 'draft',
      prefs: [['คอร์ต 1', 1, true]],
    },
    {
      key: 'open',
      title: 'ก๊วนแบดเย็นวันพุธ',
      description: 'เล่นสนุก ๆ ไม่ซีเรียส มือใหม่ยินดีต้อนรับ',
      sport: 'badminton',
      area: 'ลาดพร้าว',
      district: 'วังทองหลาง',
      day: 4,
      from: '19:00',
      to: '21:00',
      budget: 100,
      target: 8,
      min: 6,
      deadlineDay: 3,
      status: 'open',
      prefs: [
        ['คอร์ต 1', 1, true],
        ['คอร์ต 2', 2, true],
        ['คอร์ต 3', 3, false],
      ],
      paid: 3,
      pending: 1,
    },
    {
      key: 'ready',
      title: 'พิคเคิลบอลมือใหม่ พระราม 9',
      description: 'สอนพื้นฐานให้ก่อนเริ่ม มีอุปกรณ์ให้ยืม',
      sport: 'pickleball',
      area: 'พระราม 9',
      district: 'ห้วยขวาง',
      day: 3,
      from: '18:00',
      to: '20:00',
      budget: 220,
      target: 4,
      min: 4,
      deadlineDay: 2,
      status: 'ready_to_book',
      prefs: [
        ['คอร์ต P1', 1, true],
        ['คอร์ต P2', 2, true],
      ],
      paid: 4,
      waitlist: 3,
    },
    {
      key: 'booked',
      title: 'ฟุตบอล 7 คน ทองหล่อ',
      description: 'ทีมประจำ ขาดคนอีก 2-3 คน',
      sport: 'football',
      area: 'ทองหล่อ',
      district: 'วัฒนา',
      day: 2,
      from: '20:00',
      to: '22:00',
      budget: 150,
      target: 14,
      min: 10,
      deadlineDay: 1,
      status: 'booked',
      prefs: [
        ['สนาม A (7 คน)', 1, true],
        ['สนาม B (7 คน)', 2, true],
      ],
      paid: 6,
      booking: { court: 'สนาม A (7 คน)', price: 3920 },
    },
    {
      key: 'cancelled',
      title: 'แบดวันอาทิตย์ (ยกเลิก)',
      description: 'ยกเลิกเพราะคนไม่ครบ',
      sport: 'badminton',
      area: 'ลาดพร้าว',
      district: 'วังทองหลาง',
      day: 6,
      from: '10:00',
      to: '12:00',
      budget: 120,
      target: 8,
      min: 6,
      deadlineDay: 5,
      status: 'cancelled',
      prefs: [['คอร์ต 2', 1, true]],
      refunded: 2,
    },
  ];

  const sessions = await insert(
    'sessions',
    sessionSpecs.map((s) => ({
      organizer_id: organizer.id,
      sport_id: sportBySlug[s.sport],
      title: s.title,
      description: s.description,
      area_text: s.area,
      district: s.district,
      starts_at: bkk(s.day, s.from),
      ends_at: bkk(s.day, s.to),
      budget_per_person_thb: s.budget,
      target_players: s.target,
      min_players: s.min,
      payment_deadline: bkk(s.deadlineDay, '20:00'),
      status: s.status,
      // PostgREST rejects a bulk insert whose objects have differing keys, so
      // every row carries the same shape and uses null for "not applicable".
      cancelled_at: s.status === 'cancelled' ? new Date().toISOString() : null,
      cancelled_reason: s.status === 'cancelled' ? 'ผู้เล่นไม่ครบตามจำนวนขั้นต่ำ' : null,
    })),
  );
  const sessionByKey = Object.fromEntries(sessionSpecs.map((s, i) => [s.key, sessions[i]]));
  console.log(`sessions:  ${sessions.length} (draft, open, ready_to_book, booked, cancelled)`);

  await insert(
    'session_venue_preferences',
    sessionSpecs.flatMap((s, i) =>
      s.prefs.map(([court, priority, approved]) => ({
        session_id: sessions[i].id,
        venue_id: courtByName[court].venue_id,
        court_id: courtByName[court].id,
        priority,
        approved,
      })),
    ),
  );

  // ---- participants, payments, waitlist ----------------------------------
  const participantRows = [];
  for (const [i, spec] of sessionSpecs.entries()) {
    const session = sessions[i];
    const pool = [...players];
    const take = (n) => pool.splice(0, n);

    // Same uniform-keys rule as sessions above.
    const row = (p, status, extra) => ({
      session_id: session.id,
      user_id: p.id,
      status,
      amount_due_thb: spec.budget,
      payment_due_at: bkk(spec.deadlineDay, '20:00'),
      confirmed_at: null,
      cancelled_at: null,
      ...extra,
    });

    const now = new Date().toISOString();
    for (const p of take(spec.paid ?? 0)) {
      participantRows.push(row(p, 'paid_confirmed', { confirmed_at: now }));
    }
    for (const p of take(spec.pending ?? 0)) {
      participantRows.push(row(p, 'joined_pending_payment', {}));
    }
    for (const p of take(spec.refunded ?? 0)) {
      participantRows.push(row(p, 'refunded', { confirmed_at: now, cancelled_at: now }));
    }
  }

  const participants = await insert('session_participants', participantRows);
  console.log(`players in sessions: ${participants.length}`);

  const payments = await insert(
    'payments',
    participants.map((p) => ({
      session_id: p.session_id,
      participant_id: p.id,
      user_id: p.user_id,
      amount_thb: p.amount_due_thb,
      status:
        p.status === 'paid_confirmed' ? 'paid' : p.status === 'refunded' ? 'refunded' : 'pending',
      provider: 'mock',
      provider_ref:
        p.status === 'joined_pending_payment' ? null : `mock_demo_${p.id.replace(/-/g, '')}`,
      idempotency_key: `demo:pay:${p.id}`,
      paid_at: p.status === 'joined_pending_payment' ? null : new Date().toISOString(),
      expires_at: p.payment_due_at,
    })),
  );

  // Refunds on the cancelled session.
  const cancelledSession = sessionByKey.cancelled;
  const refundPayments = payments.filter((p) => p.session_id === cancelledSession.id);
  if (refundPayments.length > 0) {
    await insert(
      'refunds',
      refundPayments.map((p) => ({
        payment_id: p.id,
        session_id: p.session_id,
        user_id: p.user_id,
        amount_thb: p.amount_thb,
        status: 'completed',
        reason: 'ผู้จัดยกเลิกก๊วน คืนเงินเต็มจำนวน',
        provider_ref: `mock_demo_refund_${p.id.replace(/-/g, '')}`,
        idempotency_key: `demo:refund:${p.id}`,
        processed_at: new Date().toISOString(),
        policy_snapshot: { rule: 'organizer_cancelled', percent: 100 },
      })),
    );
  }

  // Waitlist on the full pickleball session.
  const readySpec = sessionSpecs.find((s) => s.key === 'ready');
  if (readySpec?.waitlist) {
    const inReady = new Set(
      participants.filter((p) => p.session_id === sessionByKey.ready.id).map((p) => p.user_id),
    );
    const queue = players.filter((p) => !inReady.has(p.id)).slice(0, readySpec.waitlist);
    if (queue.length > 0) {
      await insert(
        'waitlist_entries',
        queue.map((p, i) => ({
          session_id: sessionByKey.ready.id,
          user_id: p.id,
          position: i + 1,
          status: 'waiting',
        })),
      );
      console.log(`waitlist:  ${queue.length} on the pickleball session`);
    }
  }

  // ---- the confirmed booking ---------------------------------------------
  const bookedSpec = sessionSpecs.find((s) => s.key === 'booked');
  const bookedSession = sessionByKey.booked;
  const bookedCourt = courtByName[bookedSpec.booking.court];

  const [hold] = await insert('court_holds', [
    {
      session_id: bookedSession.id,
      court_id: bookedCourt.id,
      starts_at: bookedSession.starts_at,
      ends_at: bookedSession.ends_at,
      status: 'converted',
      expires_at: minutesFromNow(-60),
      idempotency_key: `demo:hold:${bookedSession.id}`,
    },
  ]);

  const [booking] = await insert('bookings', [
    {
      session_id: bookedSession.id,
      venue_id: bookedCourt.venue_id,
      court_id: bookedCourt.id,
      hold_id: hold.id,
      starts_at: bookedSession.starts_at,
      ends_at: bookedSession.ends_at,
      status: 'confirmed',
      price_thb: bookedSpec.booking.price,
      attempt_no: 1,
      idempotency_key: `demo:booking:${bookedSession.id}`,
      confirmed_at: new Date().toISOString(),
      decided_by: organizer.id,
    },
  ]);

  await rest(`sessions?id=eq.${bookedSession.id}`, {
    method: 'PATCH',
    body: { booking_id: booking.id },
  });

  // A request still waiting in the partner inbox, so that screen is not empty.
  const openSession = sessionByKey.open;
  const inboxCourt = courtByName['สนาม B (7 คน)'];
  const [inboxHold] = await insert('court_holds', [
    {
      session_id: openSession.id,
      court_id: inboxCourt.id,
      starts_at: openSession.starts_at,
      ends_at: openSession.ends_at,
      status: 'converted',
      expires_at: minutesFromNow(20),
      idempotency_key: `demo:hold:inbox:${openSession.id}`,
    },
  ]);
  await insert('bookings', [
    {
      session_id: openSession.id,
      venue_id: inboxCourt.venue_id,
      court_id: inboxCourt.id,
      hold_id: inboxHold.id,
      starts_at: openSession.starts_at,
      ends_at: openSession.ends_at,
      status: 'requested',
      price_thb: 3360,
      attempt_no: 1,
      expires_at: minutesFromNow(22 * 60),
      idempotency_key: `demo:booking:inbox:${openSession.id}`,
    },
  ]);
  console.log(`bookings:  1 confirmed + 1 waiting in the partner inbox`);

  const codes = await rest(
    `sessions?select=public_code,title,status&id=in.(${sessions.map((s) => `"${s.id}"`).join(',')})`,
  );

  console.log('\n─────────────────────────────────────────────');
  console.log('Demo data created.\n');
  for (const c of codes) {
    console.log(`  /s/${c.public_code.padEnd(9)} ${c.status.padEnd(15)} ${c.title}`);
  }
  if (created > 0) {
    console.log(`\n  Demo player accounts (${created} created):`);
    for (const p of players) console.log(`    ${p.email}`);
    console.log(`\n  Password for all of them:  ${password}`);
    console.log('  Shown once. Store it now, or reset it from the Supabase dashboard.');
  }
  console.log('\n  Remove everything: node scripts/clear-remote-demo.mjs --url ... --key ...');
  console.log('─────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('\n✗ Failed:', err.message);
  process.exit(1);
});
