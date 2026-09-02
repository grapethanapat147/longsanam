-- ===========================================================================
-- Longsanam — reference data
--
-- Sports are not demo content: the create-session wizard cannot function
-- without them, and every court is classified by one. They therefore belong in
-- a migration rather than in seed.sql, which only ever runs against a local
-- `db reset` and would leave a freshly deployed database with no sports at all.
--
-- Written idempotently so re-running a migration set is safe.
-- ===========================================================================

insert into public.sports (id, slug, name_th, name_en, emoji, default_players, sort_order)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'badminton',  'แบดมินตัน',  'Badminton',  '🏸',  8, 10),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'football',   'ฟุตบอล',     'Football',   '⚽', 14, 20),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'tennis',     'เทนนิส',     'Tennis',     '🎾',  4, 30),
  ('aaaaaaaa-0000-4000-8000-000000000004', 'basketball', 'บาสเกตบอล',  'Basketball', '🏀', 10, 40),
  ('aaaaaaaa-0000-4000-8000-000000000005', 'pickleball', 'พิคเคิลบอล', 'Pickleball', '🥒',  4, 50),
  ('aaaaaaaa-0000-4000-8000-000000000006', 'custom',     'กีฬาอื่น ๆ', 'Custom',     '🏅', 10, 90)
on conflict (id) do update
  set slug            = excluded.slug,
      name_th         = excluded.name_th,
      name_en         = excluded.name_en,
      emoji           = excluded.emoji,
      default_players = excluded.default_players,
      sort_order      = excluded.sort_order;
