-- Index drawdown stages: per-plan target sets keyed by 52-week drawdown, applied only after user confirmation.
alter table portfolio.plans add column if not exists drawdown_plan jsonb;
alter table portfolio.plans drop constraint if exists plans_drawdown_plan_object;
alter table portfolio.plans add constraint plans_drawdown_plan_object
  check (drawdown_plan is null or (jsonb_typeof(drawdown_plan) = 'object' and pg_column_size(drawdown_plan) <= 16384));
