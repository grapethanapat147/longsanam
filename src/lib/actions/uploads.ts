'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { reasonLabel, t } from '@/i18n';

/**
 * Image uploads.
 *
 * Uploads run through the caller's own Supabase client, so the storage policies
 * — not this file — decide whether a write is allowed. The checks here exist to
 * fail early with a message a person can act on, and to keep obviously bad
 * input off the network.
 */

export type UploadState = { ok: boolean; error?: string; message?: string; url?: string };

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

type Validated = { file: File; extension: string };

function validateImage(value: FormDataEntryValue | null, maxBytes: number): Validated | string {
  if (!(value instanceof File) || value.size === 0) {
    return 'กรุณาเลือกไฟล์รูปภาพ';
  }
  if (!ALLOWED_TYPES.includes(value.type as (typeof ALLOWED_TYPES)[number])) {
    return 'รองรับเฉพาะไฟล์ JPG, PNG และ WebP';
  }
  if (value.size > maxBytes) {
    return `ไฟล์ใหญ่เกินไป (สูงสุด ${Math.round(maxBytes / 1024 / 1024)} MB)`;
  }
  return { file: value, extension: EXTENSION[value.type] ?? 'jpg' };
}

/**
 * Turns a public object URL back into the bucket-relative path, so replacing an
 * image can delete the one it replaced instead of orphaning it.
 */
function storagePathFromPublicUrl(url: string | null, bucket: string): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${bucket}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  const path = url.slice(index + marker.length).split('?')[0];
  return path.length > 0 ? decodeURIComponent(path) : null;
}

export async function uploadAvatarAction(
  _prev: UploadState | null,
  formData: FormData,
): Promise<UploadState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const validated = validateImage(formData.get('file'), 2 * 1024 * 1024);
  if (typeof validated === 'string') return { ok: false, error: validated };

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  // The folder must be the user's id — that is what the storage policy checks.
  const path = `${user.id}/avatar-${Date.now()}.${validated.extension}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, validated.file, { contentType: validated.file.type, upsert: false });

  if (uploadError) {
    console.error('[uploadAvatarAction] upload failed', uploadError);
    return { ok: false, error: 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('avatars').getPublicUrl(path);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', user.id);

  if (updateError) {
    // The row is the record of truth; a stored object it does not point at is
    // just litter, so clean it up rather than leaving a mismatch.
    await supabase.storage.from('avatars').remove([path]);
    return { ok: false, error: t.common.unexpectedError };
  }

  const previous = storagePathFromPublicUrl(profile?.avatar_url ?? null, 'avatars');
  if (previous && previous !== path) {
    await supabase.storage.from('avatars').remove([previous]);
  }

  revalidatePath('/app/profile');
  revalidatePath('/', 'layout');
  return { ok: true, message: 'อัปเดตรูปโปรไฟล์แล้ว', url: publicUrl };
}

export async function removeAvatarAction(): Promise<UploadState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  const path = storagePathFromPublicUrl(profile?.avatar_url ?? null, 'avatars');

  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
  if (error) return { ok: false, error: t.common.unexpectedError };

  if (path) await supabase.storage.from('avatars').remove([path]);

  revalidatePath('/app/profile');
  revalidatePath('/', 'layout');
  return { ok: true, message: 'ลบรูปโปรไฟล์แล้ว' };
}

export async function uploadVenueCoverAction(
  _prev: UploadState | null,
  formData: FormData,
): Promise<UploadState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const venueId = String(formData.get('venueId') ?? '');
  if (!venueId) return { ok: false, error: t.common.unexpectedError };

  const validated = validateImage(formData.get('file'), 5 * 1024 * 1024);
  if (typeof validated === 'string') return { ok: false, error: validated };

  const supabase = await createClient();

  const { data: venue } = await supabase
    .from('venues')
    .select('cover_image_url')
    .eq('id', venueId)
    .maybeSingle();

  if (!venue) return { ok: false, error: reasonLabel.forbidden };

  const path = `${venueId}/cover-${Date.now()}.${validated.extension}`;

  const { error: uploadError } = await supabase.storage
    .from('venue-images')
    .upload(path, validated.file, { contentType: validated.file.type, upsert: false });

  if (uploadError) {
    console.error('[uploadVenueCoverAction] upload failed', uploadError);
    // A storage policy rejection is the likely cause, and it means exactly one
    // thing to the operator: this is not their venue.
    return { ok: false, error: 'อัปโหลดรูปไม่สำเร็จ — คุณอาจไม่มีสิทธิ์จัดการสนามนี้' };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from('venue-images').getPublicUrl(path);

  const { error: updateError } = await supabase
    .from('venues')
    .update({ cover_image_url: publicUrl })
    .eq('id', venueId);

  if (updateError) {
    await supabase.storage.from('venue-images').remove([path]);
    return { ok: false, error: reasonLabel.forbidden };
  }

  const previous = storagePathFromPublicUrl(venue.cover_image_url, 'venue-images');
  if (previous && previous !== path) {
    await supabase.storage.from('venue-images').remove([previous]);
  }

  revalidatePath(`/venue/${venueId}`);
  revalidatePath('/venue');
  return { ok: true, message: 'อัปเดตรูปสนามแล้ว', url: publicUrl };
}
