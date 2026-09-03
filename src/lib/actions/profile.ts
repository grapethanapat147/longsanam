'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { reasonLabel, t } from '@/i18n';

export type ProfileActionState = {
  ok: boolean;
  error?: string;
  message?: string;
};

const profileSchema = z.object({
  displayName: z.string().trim().min(1, t.common.required).max(60),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[0-9+\-\s]*$/, 'เบอร์โทรไม่ถูกต้อง')
    .optional(),
});

export async function updateProfileAction(
  _prev: ProfileActionState | null,
  formData: FormData,
): Promise<ProfileActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const parsed = profileSchema.safeParse({
    displayName: formData.get('displayName'),
    phone: formData.get('phone') || undefined,
  });

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const supabase = await createClient();

  // Role is deliberately not in this payload; a database trigger rejects any
  // attempt to change it from a non-admin session regardless.
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: parsed.data.displayName })
    .eq('id', user.id);

  if (error) return { ok: false, error: t.common.unexpectedError };

  const { error: contactError } = await supabase
    .from('profile_contacts')
    .upsert(
      { user_id: user.id, phone: parsed.data.phone ?? null, email: user.email },
      { onConflict: 'user_id' },
    );

  if (contactError) return { ok: false, error: t.common.unexpectedError };

  revalidatePath('/app/profile');
  revalidatePath('/', 'layout');
  return { ok: true, message: 'บันทึกข้อมูลเรียบร้อยแล้ว' };
}
