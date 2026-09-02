'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { reasonLabel, t } from '@/i18n';

/**
 * Venue Partner Portal actions.
 *
 * Authorization is enforced twice on purpose: RLS restricts the rows a venue
 * admin can touch, and `venue_decide_booking` re-checks membership inside the
 * transaction that flips the booking.
 */

export type VenueActionState = { ok: boolean; error?: string; fieldErrors?: Record<string, string> };

const createVenueSchema = z.object({
  name: z.string().trim().min(2, 'กรุณากรอกชื่อสนาม').max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, reasonLabel.invalid_slug),
  address: z.string().trim().min(4, 'กรุณากรอกที่อยู่'),
  district: z.string().trim().min(1, 'กรุณากรอกเขต/อำเภอ'),
  province: z.string().trim().min(1).default('กรุงเทพมหานคร'),
  phone: z.string().trim().max(30).optional(),
  description: z.string().trim().max(500).optional(),
});

export async function createVenueAction(
  _prev: VenueActionState | null,
  formData: FormData,
): Promise<VenueActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const parsed = createVenueSchema.safeParse({
    name: formData.get('name'),
    slug: formData.get('slug'),
    address: formData.get('address'),
    district: formData.get('district'),
    province: formData.get('province') || 'กรุงเทพมหานคร',
    phone: formData.get('phone') || undefined,
    description: formData.get('description') || undefined,
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0] ?? 'form')] ??= issue.message;
    }
    return { ok: false, error: parsed.error.issues[0]?.message, fieldErrors };
  }

  const supabase = await createClient();
  // create_venue runs as the caller (auth.uid()) and makes them the owner.
  const { data, error } = await supabase.rpc('create_venue', {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_address: parsed.data.address,
    p_district: parsed.data.district,
    p_province: parsed.data.province,
    p_phone: parsed.data.phone ?? undefined,
    p_description: parsed.data.description ?? undefined,
  });

  if (error) return { ok: false, error: t.common.unexpectedError };

  const result = data as { ok?: boolean; reason?: string; venueId?: string } | null;
  if (!result?.ok || !result.venueId) {
    const reason = result?.reason ?? '';
    return {
      ok: false,
      error: reasonLabel[reason] ?? t.common.unexpectedError,
      fieldErrors: reason === 'slug_taken' ? { slug: reasonLabel.slug_taken } : undefined,
    };
  }

  revalidatePath('/venue');
  redirect(`/venue/${result.venueId}`);
}

const courtSchema = z.object({
  venueId: z.string().uuid(),
  courtId: z.string().uuid().optional(),
  name: z.string().trim().min(1, 'กรุณากรอกชื่อคอร์ต').max(80),
  capacity: z.coerce.number().int().min(1).max(60),
  basePriceThb: z.coerce.number().int().min(0).max(100000),
  minBookingMinutes: z.coerce.number().int().min(15).max(480),
  sportIds: z.array(z.string().uuid()).min(1, 'เลือกกีฬาอย่างน้อย 1 ชนิด'),
  isActive: z.boolean(),
});

export async function upsertCourtAction(
  _prev: VenueActionState | null,
  formData: FormData,
): Promise<VenueActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const parsed = courtSchema.safeParse({
    venueId: formData.get('venueId'),
    courtId: formData.get('courtId') || undefined,
    name: formData.get('name'),
    capacity: formData.get('capacity'),
    basePriceThb: formData.get('basePriceThb'),
    minBookingMinutes: formData.get('minBookingMinutes') || 60,
    sportIds: formData.getAll('sportIds').map(String).filter(Boolean),
    isActive: formData.get('isActive') !== 'off',
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fieldErrors[String(issue.path[0] ?? 'form')] ??= issue.message;
    }
    return { ok: false, error: parsed.error.issues[0]?.message, fieldErrors };
  }

  const v = parsed.data;
  const supabase = await createClient();

  const payload = {
    venue_id: v.venueId,
    name: v.name,
    capacity: v.capacity,
    base_price_thb: v.basePriceThb,
    min_booking_minutes: v.minBookingMinutes,
    is_active: v.isActive,
  };

  let courtId = v.courtId;

  if (courtId) {
    const { error } = await supabase.from('courts').update(payload).eq('id', courtId);
    if (error) return { ok: false, error: reasonLabel.forbidden };
  } else {
    const { data, error } = await supabase.from('courts').insert(payload).select('id').single();
    if (error || !data) return { ok: false, error: reasonLabel.forbidden };
    courtId = data.id;

    // A brand new court needs opening hours or it can never be booked.
    await supabase.from('court_availability').insert(
      Array.from({ length: 7 }, (_, weekday) => ({
        court_id: courtId!,
        kind: 'opening_hours' as const,
        weekday,
        opens_at: '06:00',
        closes_at: '23:00',
      })),
    );
  }

  await supabase.from('court_sports').delete().eq('court_id', courtId);
  await supabase
    .from('court_sports')
    .insert(v.sportIds.map((sportId) => ({ court_id: courtId!, sport_id: sportId })));

  revalidatePath(`/venue/${v.venueId}/courts`);
  revalidatePath(`/venue/${v.venueId}`);
  return { ok: true };
}

const openingHoursSchema = z.object({
  venueId: z.string().uuid(),
  courtId: z.string().uuid(),
  opensAt: z.string().regex(/^\d{2}:\d{2}$/),
  closesAt: z.string().regex(/^\d{2}:\d{2}$/),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, 'เลือกอย่างน้อย 1 วัน'),
});

export async function setOpeningHoursAction(
  _prev: VenueActionState | null,
  formData: FormData,
): Promise<VenueActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const parsed = openingHoursSchema.safeParse({
    venueId: formData.get('venueId'),
    courtId: formData.get('courtId'),
    opensAt: formData.get('opensAt'),
    closesAt: formData.get('closesAt'),
    weekdays: formData.getAll('weekdays').map(String).filter(Boolean),
  });

  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message };
  }
  if (parsed.data.opensAt >= parsed.data.closesAt) {
    return { ok: false, error: 'เวลาปิดต้องอยู่หลังเวลาเปิด' };
  }

  const supabase = await createClient();
  await supabase
    .from('court_availability')
    .delete()
    .eq('court_id', parsed.data.courtId)
    .eq('kind', 'opening_hours');

  const { error } = await supabase.from('court_availability').insert(
    parsed.data.weekdays.map((weekday) => ({
      court_id: parsed.data.courtId,
      kind: 'opening_hours' as const,
      weekday,
      opens_at: parsed.data.opensAt,
      closes_at: parsed.data.closesAt,
    })),
  );

  if (error) return { ok: false, error: reasonLabel.forbidden };

  revalidatePath(`/venue/${parsed.data.venueId}/courts`);
  return { ok: true };
}

const blockSlotSchema = z.object({
  venueId: z.string().uuid(),
  courtId: z.string().uuid(),
  kind: z.enum(['blackout', 'manual_block']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  reason: z.string().trim().max(200).optional(),
});

export async function blockCourtSlotAction(
  _prev: VenueActionState | null,
  formData: FormData,
): Promise<VenueActionState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const parsed = blockSlotSchema.safeParse({
    venueId: formData.get('venueId'),
    courtId: formData.get('courtId'),
    kind: formData.get('kind') || 'manual_block',
    date: formData.get('date'),
    startTime: formData.get('startTime'),
    endTime: formData.get('endTime'),
    reason: formData.get('reason') || undefined,
  });

  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  if (parsed.data.startTime >= parsed.data.endTime) {
    return { ok: false, error: 'เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม' };
  }

  const startsAt = `${parsed.data.date}T${parsed.data.startTime}:00+07:00`;
  const endsAt = `${parsed.data.date}T${parsed.data.endTime}:00+07:00`;

  const admin = createAdminClient();
  // Blocking a slot that is already booked would strand a paid session.
  const { data: conflict } = await admin.rpc('court_has_conflict', {
    p_court_id: parsed.data.courtId,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
  });

  if (conflict === true) {
    return {
      ok: false,
      error: 'ช่วงเวลานี้มีการจองหรือการกันคอร์ตอยู่แล้ว กรุณายกเลิกรายการนั้นก่อน',
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('court_availability').insert({
    court_id: parsed.data.courtId,
    kind: parsed.data.kind,
    starts_at: startsAt,
    ends_at: endsAt,
    reason: parsed.data.reason ?? null,
    created_by: user.id,
  });

  if (error) return { ok: false, error: reasonLabel.forbidden };

  revalidatePath(`/venue/${parsed.data.venueId}/calendar`);
  return { ok: true };
}

export async function removeBlockAction(
  blockId: string,
  venueId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const supabase = await createClient();
  const { error } = await supabase
    .from('court_availability')
    .delete()
    .eq('id', blockId)
    .in('kind', ['blackout', 'manual_block']);

  if (error) return { ok: false, error: reasonLabel.forbidden };

  revalidatePath(`/venue/${venueId}/calendar`);
  return { ok: true };
}

export async function decideBookingAction(
  bookingId: string,
  approve: boolean,
  reason?: string,
): Promise<{ ok: boolean; error?: string; status?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const supabase = await createClient();
  // Runs as the caller so the RPC's own membership check applies.
  const { data, error } = await supabase.rpc('venue_decide_booking', {
    p_booking_id: bookingId,
    p_approve: approve,
    p_reason: reason ?? undefined,
  });

  if (error) return { ok: false, error: t.common.unexpectedError };

  const result = data as { ok?: boolean; reason?: string; status?: string } | null;
  if (!result?.ok) {
    return { ok: false, error: reasonLabel[result?.reason ?? ''] ?? t.common.unexpectedError };
  }

  const admin = createAdminClient();
  const { data: booking } = await admin
    .from('bookings')
    .select('session_id, sessions!bookings_session_id_fkey(organizer_id, title, public_code)')
    .eq('id', bookingId)
    .maybeSingle();

  const session = booking?.sessions as
    | { organizer_id: string; title: string; public_code: string }
    | null;

  if (session) {
    await admin.rpc('notify_user', {
      p_user_id: session.organizer_id,
      p_session_id: booking!.session_id,
      p_kind: approve ? 'booking_confirmed' : 'booking_rejected',
      p_title: approve ? 'สนามยืนยันการจองแล้ว' : 'สนามปฏิเสธคำขอจอง',
      p_body: approve
        ? `${session.title} ได้คอร์ตเรียบร้อยแล้ว`
        : `${session.title} ถูกปฏิเสธ${reason ? `: ${reason}` : ''} ระบบจะลองสนามสำรองถัดไปเมื่อคุณสั่งจองอีกครั้ง`,
      p_action_url: `/organizer/sessions/${booking!.session_id}`,
    });
  }

  revalidatePath('/venue', 'layout');
  revalidatePath('/organizer', 'layout');
  return { ok: true, status: result.status };
}

export async function setAutoConfirmAction(
  venueId: string,
  autoConfirm: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: reasonLabel.not_authenticated };

  const supabase = await createClient();
  const { error } = await supabase
    .from('venues')
    .update({ auto_confirm_bookings: autoConfirm })
    .eq('id', venueId);

  if (error) return { ok: false, error: reasonLabel.forbidden };

  revalidatePath(`/venue/${venueId}`);
  return { ok: true };
}
