-- ===========================================================================
-- Longsanam — image storage
--
-- Two public-read buckets. "Public" here means the rendered image URL needs no
-- signing, which is what a session link shared into a LINE group requires.
-- Writes stay tightly scoped: a user owns the folder named after their id, and
-- a venue folder is writable only by that venue's members.
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('venue-images', 'venue-images', true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

/**
 * Object paths are `<owner-uuid>/<file>`. A path whose first segment is not a
 * UUID must not raise — it simply belongs to nobody, so the policy denies it.
 */
create or replace function public.storage_owner_id(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when (storage.foldername(p_name))[1] ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then ((storage.foldername(p_name))[1])::uuid
    else null
  end;
$$;

-- ---------------------------------------------------------------------------
-- Avatars
-- ---------------------------------------------------------------------------

create policy avatars_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'avatars');

create policy avatars_owner_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and public.storage_owner_id(name) = auth.uid()
  );

create policy avatars_owner_update on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and public.storage_owner_id(name) = auth.uid())
  with check (bucket_id = 'avatars' and public.storage_owner_id(name) = auth.uid());

create policy avatars_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and public.storage_owner_id(name) = auth.uid());

-- ---------------------------------------------------------------------------
-- Venue images
-- ---------------------------------------------------------------------------

create policy venue_images_public_read on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'venue-images');

create policy venue_images_member_write on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'venue-images'
    and public.is_venue_member(public.storage_owner_id(name))
  );

create policy venue_images_member_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'venue-images'
    and public.is_venue_member(public.storage_owner_id(name))
  )
  with check (
    bucket_id = 'venue-images'
    and public.is_venue_member(public.storage_owner_id(name))
  );

create policy venue_images_member_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'venue-images'
    and public.is_venue_member(public.storage_owner_id(name))
  );

grant execute on function public.storage_owner_id(text) to anon, authenticated, service_role;
