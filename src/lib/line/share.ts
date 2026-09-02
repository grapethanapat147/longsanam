/**
 * Pure share-link helpers, safe to import from client components. Kept apart
 * from `@/lib/line` so the messaging/token code never reaches the browser bundle.
 */
export function lineShareUrl(sessionUrl: string): string {
  return `https://line.me/R/msg/text/?${encodeURIComponent(sessionUrl)}`;
}
