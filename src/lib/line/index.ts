/**
 * LINE integration points.
 *
 * Longsanam is meant to be opened from a LINE chat, but the MVP runs entirely
 * on email auth so that development and demos need no LINE channel. Everything
 * LINE-specific is declared here and reports "not configured" when the
 * environment variables are absent — deliberately, rather than pretending to
 * work, because a login button that silently does nothing is worse than one
 * that explains why it is disabled.
 *
 * To switch on LINE Login:
 *   1. Create a LINE Login channel and set LINE_LOGIN_CHANNEL_ID/SECRET.
 *   2. Register Supabase Auth as an OIDC provider pointing at LINE, or
 *      exchange the LINE token server-side and call `signInWithIdToken`.
 *   3. Store the LINE user id on `profile_contacts.line_user_id` so push
 *      messages can be addressed later.
 */

export type LineConfig = {
  loginChannelId: string | null;
  liffId: string | null;
  messagingToken: string | null;
};

export function readLineConfig(): LineConfig {
  return {
    loginChannelId: process.env.LINE_LOGIN_CHANNEL_ID || null,
    liffId: process.env.NEXT_PUBLIC_LINE_LIFF_ID || null,
    messagingToken: process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN || null,
  };
}

export function isLineLoginConfigured(): boolean {
  return Boolean(process.env.LINE_LOGIN_CHANNEL_ID && process.env.LINE_LOGIN_CHANNEL_SECRET);
}

export function isLiffConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_LINE_LIFF_ID);
}

export function isLineMessagingConfigured(): boolean {
  return Boolean(process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN);
}

/**
 * Share URL for a session. Re-exported from `./share`, which is the copy that
 * client components import so this module's tokens stay server-side.
 */
export { lineShareUrl } from './share';

export type LineNotification = {
  lineUserId: string;
  text: string;
};

export type LinePushResult =
  | { ok: true; delivered: number }
  | { ok: false; reason: 'not_configured' | 'request_failed'; detail?: string };

/**
 * Push a message to a LINE user. Returns `not_configured` rather than throwing
 * so notification delivery is best-effort and never fails a booking. In-app
 * notifications are always written regardless; LINE is an extra channel.
 */
export async function pushLineMessage(notification: LineNotification): Promise<LinePushResult> {
  const token = process.env.LINE_MESSAGING_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    return { ok: false, reason: 'not_configured' };
  }

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        to: notification.lineUserId,
        messages: [{ type: 'text', text: notification.text }],
      }),
    });

    if (!response.ok) {
      return {
        ok: false,
        reason: 'request_failed',
        detail: `HTTP ${response.status}`,
      };
    }
    return { ok: true, delivered: 1 };
  } catch (error) {
    return {
      ok: false,
      reason: 'request_failed',
      detail: error instanceof Error ? error.message : 'unknown',
    };
  }
}
