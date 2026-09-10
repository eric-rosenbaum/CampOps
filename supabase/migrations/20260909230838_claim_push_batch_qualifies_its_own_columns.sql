-- claim_push_batch could not claim anything.
--
-- It returns `table (id uuid, ...)`, and in plpgsql an OUT column is a variable, so the bare
-- `where id in (...)` in the claiming update resolved to that variable rather than to the column
-- and Postgres refused the whole function with "column reference id is ambiguous". The queue
-- would have filled and the sender would have returned 500 on every call.
--
-- Aliasing the table and qualifying the reference is the fix. Nothing else about the function
-- changes.
create or replace function public.claim_push_batch(p_limit integer default 50)
returns table (id uuid, title text, body text, data jsonb, devices jsonb)
language plpgsql security definer set search_path = public as $fn$
declare v_batch uuid := gen_random_uuid();
begin
  -- A send that died mid-flight left its rows claimed. Ten minutes is far longer than the
  -- function can run, so anything still 'sending' after that is abandoned, not in progress.
  update push_notifications p
     set state = 'pending', batch_id = null, updated_at = now()
   where p.state = 'sending' and p.updated_at < now() - interval '10 minutes';

  update push_notifications p
     set state = 'failed', error = 'expired before it could be sent', updated_at = now()
   where p.state = 'pending' and p.created_at <= now() - interval '24 hours';

  update push_notifications p
     set state = 'sending', batch_id = v_batch, updated_at = now()
   where p.id in (
     select q.id from push_notifications q
      where q.state = 'pending'
      order by q.created_at
      limit greatest(1, least(p_limit, 200))
   );

  -- Nobody has the app installed. Settle it here rather than sending the function an empty
  -- errand, and leave the state as 'skipped' so the email planner knows to cover it.
  update push_notifications p
     set state = 'skipped', devices = 0, updated_at = now()
   where p.batch_id = v_batch and p.state = 'sending'
     and not exists (select 1 from device_tokens d where d.user_id = p.user_id);

  return query
  select p.id, p.title, p.body, p.data,
         (select jsonb_agg(jsonb_build_object('token', d.token, 'environment', d.environment))
            from device_tokens d where d.user_id = p.user_id)
    from push_notifications p
   where p.batch_id = v_batch and p.state = 'sending';
end;
$fn$;

revoke execute on function public.claim_push_batch(integer) from public, anon, authenticated;
grant execute on function public.claim_push_batch(integer) to service_role;
