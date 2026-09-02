import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/domain/types';

export type CurrentUser = {
  id: string;
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
  role: AppRole;
};

/**
 * The signed-in user, or null. Uses `getUser()` rather than `getSession()`
 * because only the former revalidates the token against the auth server.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, avatar_url, role')
    .eq('id', user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    displayName: profile?.display_name ?? user.email?.split('@')[0] ?? 'ผู้ใช้',
    avatarUrl: profile?.avatar_url ?? null,
    role: profile?.role ?? 'player',
  };
}

/** Redirects to sign-in, preserving where the user was headed. */
export async function requireUser(returnTo?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    const next = returnTo ? `?next=${encodeURIComponent(returnTo)}` : '';
    redirect(`/auth/sign-in${next}`);
  }
  return user;
}

/**
 * Route-level role gate. This is a user-experience guard that keeps people out
 * of pages they cannot use; RLS is what actually protects the data.
 */
export async function requireRole(roles: readonly AppRole[], returnTo?: string): Promise<CurrentUser> {
  const user = await requireUser(returnTo);
  if (!roles.includes(user.role)) {
    redirect('/app?error=forbidden');
  }
  return user;
}

/** Venue membership is per-venue, so it cannot be answered by role alone. */
export async function requireVenueMembership(venueId: string): Promise<CurrentUser> {
  const user = await requireUser(`/venue/${venueId}`);
  const supabase = await createClient();

  const { data } = await supabase
    .from('venue_members')
    .select('venue_id')
    .eq('venue_id', venueId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!data && user.role !== 'platform_admin') {
    redirect('/venue?error=forbidden');
  }
  return user;
}

/** Venues the current user administers. Empty for players. */
export async function getMyVenueIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.from('venue_members').select('venue_id').eq('user_id', userId);
  return (data ?? []).map((row) => row.venue_id);
}
