'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { t } from '@/i18n';

export type ActionState = { ok: boolean; error?: string; message?: string };

const credentialsSchema = z.object({
  email: z.string().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, t.auth.passwordTooShort),
});

const signUpSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1, t.common.required).max(60),
});

export async function signInAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t.common.unexpectedError };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Never leak whether the address exists.
    return { ok: false, error: t.auth.invalidCredentials };
  }

  const next = String(formData.get('next') ?? '/app');
  revalidatePath('/', 'layout');
  redirect(next.startsWith('/') ? next : '/app');
}

export async function signUpAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const parsed = signUpSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    displayName: formData.get('displayName'),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t.common.unexpectedError };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    // Consumed by the handle_new_user trigger, which creates the profile.
    options: { data: { display_name: parsed.data.displayName, role: 'player' } },
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/', 'layout');
  redirect('/app');
}

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}
