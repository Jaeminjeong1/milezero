-- Remove all MileZero runtime data without restoring demo records.
drop function if exists mz_reset_to_example_data();

create or replace function mz_reset_to_empty_data()
returns boolean
language plpgsql
set search_path = public
as $$
begin
  truncate table
    claim_evidence,
    report_claims,
    claims,
    points_ledger,
    reports;

  return true;
end;
$$;
