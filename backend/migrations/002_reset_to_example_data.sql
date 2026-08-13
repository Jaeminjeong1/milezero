-- Reset all MileZero runtime data and restore only the judge example guide.
create or replace function mz_reset_to_example_data()
returns boolean
language plpgsql
set search_path = public
as $$
declare
  seed_report_id constant uuid := '00000000-0000-4000-8000-000000000001';
  seed_claim_id constant uuid := '00000000-0000-4000-8000-000000000002';
  seed_created_at constant timestamptz := '2026-08-13T00:00:00.000Z';
begin
  truncate table
    claim_evidence,
    report_claims,
    claims,
    points_ledger,
    reports;

  insert into reports (
    id,
    idempotency_key,
    place_id,
    driver_id,
    sanitized_summary,
    removed_pii_types,
    created_at
  ) values (
    seed_report_id,
    'demo-seed-guide-v1',
    'demo-office-tower',
    'demo-knowledge-reporter',
    '1톤 차량은 후문 진입 후 B2 하역장을 이용합니다.',
    '{}',
    seed_created_at
  );

  insert into claims (
    id,
    report_id,
    place_id,
    reporter_id,
    claim_type,
    value,
    vehicle_type,
    time_condition,
    status,
    confidence,
    helpful_count,
    not_helpful_count,
    utility_score,
    created_at
  ) values (
    seed_claim_id,
    seed_report_id,
    'demo-office-tower',
    'demo-knowledge-reporter',
    'INTERNAL_ROUTE',
    '1톤 차량은 후문으로 진입 후 B2 하역장을 이용하세요',
    '1TON',
    null,
    'VERIFIED',
    0.650,
    2,
    0,
    0.700,
    seed_created_at
  );

  insert into report_claims (report_id, claim_id)
  values (seed_report_id, seed_claim_id);

  insert into claim_evidence (
    claim_id,
    driver_id,
    feedback,
    source,
    created_at
  ) values
    (
      seed_claim_id,
      'demo-seed-verifier',
      'CONFIRM',
      'DRIVER_FEEDBACK',
      seed_created_at
    ),
    (
      seed_claim_id,
      'demo-seed-helper-a',
      'HELPFUL',
      'DRIVER_FEEDBACK',
      seed_created_at
    ),
    (
      seed_claim_id,
      'demo-seed-helper-b',
      'HELPFUL',
      'DRIVER_FEEDBACK',
      seed_created_at
    );

  return true;
end;
$$;
