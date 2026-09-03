/**
 * Remove everything `seed-remote-demo.mjs` created, and nothing else.
 *
 * Demo rows are identified by the venue slugs the seeder uses and by the demo
 * email domain — never by "delete all rows". Real venues, real players and any
 * session that is not attached to a demo venue survive.
 *
 * Usage:
 *   node scripts/clear-remote-demo.mjs --url <supabase-url> --key <service-role-key>
 *   node scripts/clear-remote-demo.mjs ... --dry-run
 */

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
const DRY_RUN = args.includes('--dry-run');

const SUPABASE_URL = (arg('url') ?? process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const SERVICE_KEY = arg('key') ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Usage: node scripts/clear-remote-demo.mjs --url <url> --key <service-role-key>');
  process.exit(1);
}

const DEMO_VENUE_SLUGS = [
  'ladprao-badminton-center',
  'thonglor-football-arena',
  'rama9-pickleball-club',
];
const DEMO_EMAIL_DOMAIN = 'demo.longsanam.app';

const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
}

const inList = (values) => `(${values.map((v) => `"${v}"`).join(',')})`;

async function main() {
  console.log(`→ ${SUPABASE_URL}${DRY_RUN ? '  (dry run)' : ''}\n`);

  const venues = await rest(`venues?select=id,name,slug&slug=in.${inList(DEMO_VENUE_SLUGS)}`);
  const venueIds = venues.map((v) => v.id);

  // Sessions counted as demo are those whose venue preferences all point at
  // demo venues — a session the user created themselves is left alone.
  let sessionIds = [];
  if (venueIds.length > 0) {
    const prefs = await rest(
      `session_venue_preferences?select=session_id,venue_id&venue_id=in.${inList(venueIds)}`,
    );
    sessionIds = [...new Set(prefs.map((p) => p.session_id))];
  }

  const usersRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers });
  const allUsers = (await usersRes.json()).users ?? [];
  const demoUsers = allUsers.filter((u) => (u.email ?? '').endsWith(`@${DEMO_EMAIL_DOMAIN}`));

  console.log('Will remove:');
  console.log(`  venues         ${venues.length}`);
  console.log(`  sessions       ${sessionIds.length}`);
  console.log(`  demo accounts  ${demoUsers.length}`);

  if (venues.length === 0 && sessionIds.length === 0 && demoUsers.length === 0) {
    console.log('\nNothing to remove.');
    return;
  }

  if (DRY_RUN) {
    console.log('\nDry run — nothing deleted.');
    return;
  }

  // Sessions first: cascades take participants, payments, refunds, waitlist,
  // holds and bookings with them. `sessions.booking_id` is cleared first so the
  // foreign key does not block the delete.
  if (sessionIds.length > 0) {
    await rest(`sessions?id=in.${inList(sessionIds)}`, {
      method: 'PATCH',
      body: { booking_id: null },
    });
    await rest(`bookings?session_id=in.${inList(sessionIds)}`, { method: 'DELETE' });
    await rest(`sessions?id=in.${inList(sessionIds)}`, { method: 'DELETE' });
    console.log(`\n  ✓ sessions removed (${sessionIds.length})`);
  }

  if (venueIds.length > 0) {
    await rest(`venues?id=in.${inList(venueIds)}`, { method: 'DELETE' });
    console.log(`  ✓ venues removed (${venueIds.length})`);
  }

  for (const u of demoUsers) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${u.id}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) console.warn(`  ! could not delete ${u.email}: ${res.status}`);
  }
  console.log(`  ✓ demo accounts removed (${demoUsers.length})`);

  console.log('\nDone. Real data was not touched.');
}

main().catch((err) => {
  console.error('\n✗ Failed:', err.message);
  process.exit(1);
});
