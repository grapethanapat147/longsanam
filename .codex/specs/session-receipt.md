# ใบเสร็จก๊วน — the receipt that goes back to LINE

## Problem

After every session, someone types the same message into the group chat:
who came, what it cost, who has paid, who still owes. It is Longsanam's core
loop written out by hand. ตีแบด's scoreboard taught the lesson: the tool people
use *around* the session is what brings the next person in. The receipt is
that tool for us, and unlike a scoreboard it is made of things we already know.

## Design

**One page, `/s/[code]/receipt`.** It draws from data the earlier tickets
produce, with fallbacks so it ships even if they have not:

| Line | Source | Fallback |
| --- | --- | --- |
| Who played | `checked_in_at` (LSN-0020) | paid / pay-later status |
| Per head | `settled_per_person_thb` (LSN-0021) | `budget_per_person_thb` |
| Guests | LSN-0022 rows | none |
| Paid / owing | `payments.status` | — |

**Two views of the same page.** A signed-in participant or the organizer sees
names. Anyone else — which is the point, they arrived from a LINE chat — sees
the totals, the headcount and the number owing, with names masked:
"ผู้เล่น 6 คน · จ่ายแล้ว 5 · ค้าง 1". Enough to see what the tool does; nothing
that a stranger should know about a named person's debt.

**It unfurls.** LINE renders `og:image`. The route ships a generated image via
Next.js `ImageResponse` in the court-lines style: session name, date, per-head,
paid/owing counts. The picture in the chat *is* the feature; the link is how
you get the detail.

**Share.** A "ส่งใบเสร็จเข้า LINE" button reuses `lineShareUrl` with the
receipt URL. No LINE token needed — it is the same text-share the session link
already uses.

**Copy.** The page's own words: "ใบเสร็จก๊วน", "ค้าง", "จ่ายแล้ว", never
"invoice". Every figure is in baht, rounded as the calculator rounded it.

## Out of scope

PDF export. Per-game breakdown display. Any payment action on the receipt
itself — the pay button stays on the session page where the payment flow lives.

## Acceptance criteria

- [ ] `/s/[code]/receipt` renders for a completed session with every line in
      the table above, using fallbacks when a source is absent.
- [ ] Non-participants see masked names and correct totals; participants and
      the organizer see names. RLS-level, pinned by pgTAP.
- [ ] The route serves an `og:image` and LINE's link preview shows it
      (verified by pasting the link into a LINE chat once).
- [ ] The share button opens LINE with the receipt URL.
- [ ] `npm run verify` and `npm run test:db` pass.
