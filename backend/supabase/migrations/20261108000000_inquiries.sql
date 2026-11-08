-- The Private Architecture Review inquiries. One row per PAR reference.
-- This table is the whole "CRM": the notification email says who wrote, this row says where the opportunity stands.

create table if not exists public.inquiries (
  ref            text primary key check (ref ~ '^PAR-[0-9]{6}-[A-Z0-9]{4}$'),
  created_at     timestamptz not null default now(),
  name           text not null,
  email          text not null,
  org            text not null,
  challenge      text not null,
  scale          text,
  goal           text not null,
  env            text,
  incidents      jsonb not null default '[]',
  complete       boolean not null default false,
  inspected      jsonb not null default '[]',
  pages          jsonb not null default '[]',
  report         boolean not null default false,
  source         text,
  medium         text,
  campaign       text,
  opened_from    text,
  page           text,
  mdq_shared     boolean not null default false,
  mdq            jsonb,
  delivered      boolean not null default false,
  delivered_at   timestamptz,
  delivery_error text,
  -- Commercial stage. Maintained by hand in the Table Editor. Never inferred from clicks.
  status         text not null default 'received'
                 check (status in ('received','qualified','proposal','won','lost','declined')),
  qualified_at   timestamptz,
  proposal_at    timestamptz,
  won_at         timestamptz,
  notes          text
);

create index if not exists inquiries_created_idx on public.inquiries (created_at desc);
create index if not exists inquiries_email_idx on public.inquiries (email, created_at desc);

-- Stamp the date the first time a stage is reached, so changing a status is the only thing you ever do by hand.
create or replace function public.inquiries_stage_stamp() returns trigger language plpgsql as $$
begin
  if new.status = 'qualified' and new.qualified_at is null then new.qualified_at := now(); end if;
  if new.status = 'proposal'  then new.qualified_at := coalesce(new.qualified_at, now()); if new.proposal_at is null then new.proposal_at := now(); end if; end if;
  if new.status = 'won'       then new.qualified_at := coalesce(new.qualified_at, now()); new.proposal_at := coalesce(new.proposal_at, now()); if new.won_at is null then new.won_at := now(); end if; end if;
  return new;
end $$;

drop trigger if exists inquiries_stage_stamp on public.inquiries;
create trigger inquiries_stage_stamp before insert or update of status on public.inquiries
  for each row execute function public.inquiries_stage_stamp();

-- Nobody but the service role can read or write: the public site key sees nothing.
alter table public.inquiries enable row level security;
revoke all on public.inquiries from anon, authenticated;
grant all on public.inquiries to service_role;

-- Where the portfolio is producing business: one row per entry point.
create or replace view public.inquiry_funnel with (security_invoker = true) as
select coalesce(source, 'direct') as source, coalesce(campaign, 'none') as campaign, coalesce(opened_from, 'unknown') as opened_from,
       count(*) as inquiries,
       count(*) filter (where status in ('qualified','proposal','won')) as qualified,
       count(*) filter (where status in ('proposal','won')) as proposals,
       count(*) filter (where status = 'won') as won
from public.inquiries
group by 1, 2, 3
order by inquiries desc;

revoke all on public.inquiry_funnel from anon, authenticated;
grant select on public.inquiry_funnel to service_role;
