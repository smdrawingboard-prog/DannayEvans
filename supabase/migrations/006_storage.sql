-- ============================================================================
-- 006 — STORAGE BUCKETS
--
-- All buckets are private. Files are reached through short-lived signed URLs
-- generated server-side; a raw storage URL is never rendered in the UI.
--
-- Path convention: <org_id>/<subject>/<uuid>-<filename>
-- The leading org_id segment is what the policies below authorise on.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('sealed-documents', 'sealed-documents', false, 26214400, array[
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'image/png','image/jpeg'
   ]),
  ('recruitment-files', 'recruitment-files', false, 26214400, array[
     'application/pdf',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'image/png','image/jpeg','image/webp'
   ]),
  ('org-branding', 'org-branding', false, 2097152,
     array['image/png','image/jpeg','image/svg+xml','image/webp'])
on conflict (id) do nothing;

-- The first path segment must be an organisation the caller belongs to.
-- Returns null rather than raising when the first segment is not a uuid, so a
-- malformed path simply fails the policy instead of erroring the request.
create or replace function storage_path_org(name text)
returns uuid language plpgsql immutable as $$
begin
  return nullif(split_part(name, '/', 1), '')::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

do $$
declare b text;
begin
  foreach b in array array['sealed-documents','recruitment-files','org-branding'] loop
    execute format($f$
      create policy %I on storage.objects for all
        using (bucket_id = %L and storage_path_org(name) in (select current_org_ids()))
        with check (bucket_id = %L and storage_path_org(name) in (select current_org_ids()))
    $f$, b || '_member', b, b);
  end loop;
end $$;
