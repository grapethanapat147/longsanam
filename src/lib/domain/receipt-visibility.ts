/**
 * Who is allowed to see the names on a receipt.
 *
 * This is the only thing standing between an outsider and the player list on
 * the named path. That path reads through `createAdminClient()`, which bypasses
 * RLS on purpose — the database will hand over every row it is asked for and
 * will not second-guess the caller. The RPC behind the masked path is pinned by
 * pgTAP, but pgTAP cannot see this decision at all, so it lives here as a pure
 * function with its own test rather than as a condition buried in a loader.
 */
export type ReceiptViewer = {
  viewerId: string | null;
  organizerId: string;
  isParticipant: boolean;
};

/**
 * Kept separate so the loader can skip the participant lookup for an organizer,
 * without that shortcut becoming a second, drifting copy of the rule.
 */
export function isReceiptOrganizer(viewerId: string | null, organizerId: string): boolean {
  if (!viewerId) return false;
  return viewerId === organizerId;
}

export function canSeeReceiptNames({
  viewerId,
  organizerId,
  isParticipant,
}: ReceiptViewer): boolean {
  // An absent viewer is nobody: signed out, or a chat app fetching og:image.
  // The empty string is checked as well, because it is the shape a missing
  // session id arrives in when something upstream coalesces instead of failing,
  // and `'' === ''` would otherwise hand the receipt to a viewer who has no id.
  if (!viewerId) return false;
  if (isReceiptOrganizer(viewerId, organizerId)) return true;
  return isParticipant;
}
