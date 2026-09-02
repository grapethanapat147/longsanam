import 'server-only';

/**
 * The current instant, read once per request.
 *
 * Server Components render once per request, so reading the clock here is
 * deterministic for that render — unlike a Client Component, where a re-render
 * would silently change the answer. Routing every server-side clock read
 * through this helper keeps that distinction explicit and gives one place to
 * substitute a fixed clock in tests.
 */
export function requestNow(): number {
  return Date.now();
}

export function requestDate(): Date {
  return new Date(requestNow());
}
