create type claim_status as enum ('CANDIDATE', 'VERIFIED', 'CONFLICT');
create type feedback_type as enum ('CONFIRM', 'CONTRADICT', 'HELPFUL', 'NOT_HELPFUL');
create type evidence_source as enum ('REPORT', 'DRIVER_FEEDBACK');
create type point_reason as enum ('REPORT_CREATED', 'CLAIM_VERIFIED', 'GUIDE_HELPFUL');

create table reports (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text unique,
  place_id text not null,
  driver_id text not null,
  sanitized_summary text not null check (char_length(sanitized_summary) <= 500),
  removed_pii_types text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table claims (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  place_id text not null,
  reporter_id text not null,
  claim_type text not null,
  value text not null check (char_length(value) <= 240),
  vehicle_type text not null check (vehicle_type in ('ALL', 'BIKE', 'CAR', 'VAN', '1TON')),
  time_condition text check (char_length(time_condition) <= 80),
  status claim_status not null default 'CANDIDATE',
  confidence numeric(4, 3) not null default 0.350 check (confidence between 0 and 1),
  helpful_count integer not null default 0 check (helpful_count >= 0),
  not_helpful_count integer not null default 0 check (not_helpful_count >= 0),
  utility_score numeric(4, 3) not null default 0.500 check (utility_score between 0 and 1),
  created_at timestamptz not null default now()
);
create index claims_delivery_lookup_idx
  on claims(place_id, vehicle_type, status, created_at desc);

create table report_claims (
  report_id uuid not null references reports(id) on delete cascade,
  claim_id uuid not null references claims(id) on delete cascade,
  primary key (report_id, claim_id)
);

create table claim_evidence (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references claims(id) on delete cascade,
  driver_id text not null,
  feedback feedback_type not null,
  source evidence_source not null,
  created_at timestamptz not null default now(),
  unique(claim_id, driver_id, feedback)
);
create unique index claim_evidence_one_fact_verdict_idx
  on claim_evidence(claim_id, driver_id)
  where feedback in ('CONFIRM', 'CONTRADICT');
create unique index claim_evidence_one_utility_verdict_idx
  on claim_evidence(claim_id, driver_id)
  where feedback in ('HELPFUL', 'NOT_HELPFUL');

create table points_ledger (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  driver_id text not null,
  points integer not null check (points > 0),
  reason point_reason not null,
  created_at timestamptz not null default now()
);
create index points_ledger_driver_idx on points_ledger(driver_id);

alter table reports enable row level security;
alter table claims enable row level security;
alter table report_claims enable row level security;
alter table claim_evidence enable row level security;
alter table points_ledger enable row level security;

create or replace function mz_create_report(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted reports%rowtype;
begin
  insert into reports (
    place_id,
    driver_id,
    sanitized_summary,
    removed_pii_types
  ) values (
    payload->>'place_id',
    payload->>'driver_id',
    payload->>'sanitized_summary',
    coalesce(
      array(select jsonb_array_elements_text(payload->'removed_pii_types')),
      '{}'
    )
  ) returning * into inserted;
  return to_jsonb(inserted);
end;
$$;

create or replace function mz_create_claim(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted claims%rowtype;
begin
  insert into claims (
    report_id,
    place_id,
    reporter_id,
    claim_type,
    value,
    vehicle_type,
    time_condition
  ) values (
    (payload->>'report_id')::uuid,
    payload->>'place_id',
    payload->>'reporter_id',
    payload->>'claim_type',
    payload->>'value',
    payload->>'vehicle_type',
    payload->>'time_condition'
  ) returning * into inserted;
  return to_jsonb(inserted);
end;
$$;

create or replace function mz_find_claims(payload jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
  from claims c
  where c.place_id = payload->>'place_id'
    and (
      payload->>'claim_type' is null
      or c.claim_type = payload->>'claim_type'
    )
    and (
      payload->>'vehicle_type' is null
      or c.vehicle_type = payload->>'vehicle_type'
      or c.vehicle_type = 'ALL'
    )
    and (
      payload->'statuses' is null
      or c.status::text in (
        select jsonb_array_elements_text(payload->'statuses')
      )
    );
$$;

create or replace function mz_get_claim(payload jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select to_jsonb(c)
  from claims c
  where c.id = (payload->>'claim_id')::uuid;
$$;

create or replace function mz_update_claim(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  updated claims%rowtype;
begin
  update claims
  set
    status = (payload->>'status')::claim_status,
    confidence = (payload->>'confidence')::numeric,
    helpful_count = (payload->>'helpful_count')::integer,
    not_helpful_count = (payload->>'not_helpful_count')::integer,
    utility_score = (payload->>'utility_score')::numeric
  where id = (payload->>'claim_id')::uuid
  returning * into updated;
  if updated.id is null then
    raise exception 'claim not found';
  end if;
  return to_jsonb(updated);
end;
$$;

create or replace function mz_add_evidence(payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into claim_evidence (claim_id, driver_id, feedback, source)
  values (
    (payload->>'claim_id')::uuid,
    payload->>'driver_id',
    (payload->>'feedback')::feedback_type,
    (payload->>'source')::evidence_source
  );
  return true;
exception
  when unique_violation then
    return false;
end;
$$;

create or replace function mz_list_evidence(payload jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb)
  from claim_evidence e
  where e.claim_id = (payload->>'claim_id')::uuid;
$$;

create or replace function mz_award_points(payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into points_ledger (idempotency_key, driver_id, points, reason)
  values (
    payload->>'idempotency_key',
    payload->>'driver_id',
    (payload->>'points')::integer,
    (payload->>'reason')::point_reason
  );
  return true;
exception
  when unique_violation then
    return false;
end;
$$;

create or replace function mz_point_balance(payload jsonb)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(points), 0)::integer
  from points_ledger
  where driver_id = payload->>'driver_id';
$$;

create or replace function mz_contribution_receipt(target_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reportId', r.id::text,
    'claimIds', coalesce(
      jsonb_agg(c.id::text order by rc.claim_id) filter (where c.id is not null),
      '[]'::jsonb
    ),
    'claimStatuses', coalesce(
      jsonb_agg(c.status::text order by rc.claim_id) filter (where c.id is not null),
      '[]'::jsonb
    ),
    'awardedPoints', 10
  )
  from reports r
  left join report_claims rc on rc.report_id = r.id
  left join claims c on c.id = rc.claim_id
  where r.id = target_report_id
  group by r.id;
$$;

create or replace function mz_get_contribution_receipt(payload jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select mz_contribution_receipt(r.id)
  from reports r
  where r.idempotency_key = payload->>'idempotency_key'
    and r.driver_id = payload->>'driver_id';
$$;

create or replace function mz_commit_contribution(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_report_id uuid;
  inserted_report reports%rowtype;
  inserted_claim claims%rowtype;
  target_claim claims%rowtype;
  operation jsonb;
begin
  select id into existing_report_id
  from reports
  where idempotency_key = payload->>'idempotency_key'
    and driver_id = payload->>'driver_id';
  if existing_report_id is not null then
    return mz_contribution_receipt(existing_report_id);
  end if;

  insert into reports (
    idempotency_key,
    place_id,
    driver_id,
    sanitized_summary,
    removed_pii_types
  ) values (
    payload->>'idempotency_key',
    payload->>'place_id',
    payload->>'driver_id',
    payload->>'sanitized_summary',
    coalesce(
      array(select jsonb_array_elements_text(payload->'removed_pii_types')),
      '{}'
    )
  ) returning * into inserted_report;

  for operation in select value from jsonb_array_elements(payload->'operations')
  loop
    if operation->>'kind' = 'NEW' then
      insert into claims (
        report_id,
        place_id,
        reporter_id,
        claim_type,
        value,
        vehicle_type,
        time_condition
      ) values (
        inserted_report.id,
        inserted_report.place_id,
        inserted_report.driver_id,
        operation->'claim'->>'claim_type',
        operation->'claim'->>'value',
        operation->'claim'->>'vehicle_type',
        operation->'claim'->>'time_condition'
      ) returning * into inserted_claim;
      insert into report_claims (report_id, claim_id)
      values (inserted_report.id, inserted_claim.id);
    elsif operation->>'kind' = 'EVIDENCE' then
      select * into target_claim
      from claims
      where id = (operation->>'claim_id')::uuid;
      if target_claim.id is null then
        raise exception 'claim not found';
      end if;
      insert into report_claims (report_id, claim_id)
      values (inserted_report.id, target_claim.id);
      if target_claim.reporter_id <> inserted_report.driver_id then
        insert into claim_evidence (claim_id, driver_id, feedback, source)
        values (
          target_claim.id,
          inserted_report.driver_id,
          (operation->>'feedback')::feedback_type,
          'REPORT'
        ) on conflict do nothing;
      end if;
    else
      raise exception 'unsupported contribution operation';
    end if;
  end loop;

  insert into points_ledger (idempotency_key, driver_id, points, reason)
  values (
    'report:' || inserted_report.id::text || ':created',
    inserted_report.driver_id,
    10,
    'REPORT_CREATED'
  );

  return mz_contribution_receipt(inserted_report.id);
end;
$$;

revoke all on reports, claims, report_claims, claim_evidence, points_ledger from anon, authenticated;
revoke all on function mz_create_report(jsonb) from public, anon, authenticated;
revoke all on function mz_create_claim(jsonb) from public, anon, authenticated;
revoke all on function mz_find_claims(jsonb) from public, anon, authenticated;
revoke all on function mz_get_claim(jsonb) from public, anon, authenticated;
revoke all on function mz_update_claim(jsonb) from public, anon, authenticated;
revoke all on function mz_add_evidence(jsonb) from public, anon, authenticated;
revoke all on function mz_list_evidence(jsonb) from public, anon, authenticated;
revoke all on function mz_award_points(jsonb) from public, anon, authenticated;
revoke all on function mz_point_balance(jsonb) from public, anon, authenticated;
revoke all on function mz_contribution_receipt(uuid) from public, anon, authenticated;
revoke all on function mz_get_contribution_receipt(jsonb) from public, anon, authenticated;
revoke all on function mz_commit_contribution(jsonb) from public, anon, authenticated;

grant execute on function mz_create_report(jsonb) to service_role;
grant execute on function mz_create_claim(jsonb) to service_role;
grant execute on function mz_find_claims(jsonb) to service_role;
grant execute on function mz_get_claim(jsonb) to service_role;
grant execute on function mz_update_claim(jsonb) to service_role;
grant execute on function mz_add_evidence(jsonb) to service_role;
grant execute on function mz_list_evidence(jsonb) to service_role;
grant execute on function mz_award_points(jsonb) to service_role;
grant execute on function mz_point_balance(jsonb) to service_role;
grant execute on function mz_contribution_receipt(uuid) to service_role;
grant execute on function mz_get_contribution_receipt(jsonb) to service_role;
grant execute on function mz_commit_contribution(jsonb) to service_role;
