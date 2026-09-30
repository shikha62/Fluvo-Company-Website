create extension if not exists pgcrypto;

create table if not exists public.email_automation_settings (
  id text primary key default 'default' check (id = 'default'),
  test_mode boolean not null default true,
  test_email_recipient text,
  max_emails_per_hour integer not null default 10 check (max_emails_per_hour between 1 and 500),
  max_emails_per_day integer not null default 50 check (max_emails_per_day between 1 and 5000),
  delay_seconds integer not null default 60 check (delay_seconds between 0 and 86400),
  fallbacks jsonb not null default '{}'::jsonb,
  company_mappings jsonb not null default '{"fluvo.com":"Fluvo","acme.com":"Acme"}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.email_automation_settings (id) values ('default') on conflict (id) do nothing;

update public.queries
set notes = null
where type = 'system_config' and full_name = 'email_config' and notes is not null;

create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  subject text not null,
  body text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.email_templates (name, subject, body, is_active)
values (
  'Fluvo Growth Outreach',
  'A few growth opportunities for {{company_name}}',
  $body$Hi {{first_name}},

I came across {{company_name}} while researching {{industry_category}} and noticed {{specific_observation}}.

Based on our initial review, there appears to be an opportunity to improve {{growth_area}}, particularly around {{specific_opportunity}}.

Fluvo is a technology-driven digital growth partner specializing in Performance Marketing, Technical SEO & GEO, Web Engineering, CRO, Marketing Automation, and First-Party Attribution.

We connect these capabilities into a unified growth architecture designed to improve measurable outcomes across:

Acquisition → Conversion → Attribution → Revenue → Scale

For {{company_name}}, I'd specifically evaluate:

• {{opportunity_1}}
• {{opportunity_2}}
• {{opportunity_3}}

Our approach combines technical audits, data-driven experimentation, performance optimization, and continuous measurement against metrics such as CAC, ROAS, CVR, qualified pipeline, and attributable revenue.

Would you be open to a 20–30 minute conversation? I'd be happy to share the key opportunities we identified and a potential growth roadmap for {{company_name}}.

Best regards,

{{sender_name}}
{{sender_designation}}
Fluvo

Technology-Driven Digital Growth & Performance Engineering

Website: https://www.fluvo.in/
Email: connect@fluvo.in
Phone: +91 98711 38167

Technical SEO • Performance Marketing • Web Engineering • CRO • Automation • Attribution

Unsubscribe: {{unsubscribe_url}}$body$,
  true
) on conflict (name) do nothing;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  first_name text not null default 'there',
  company_name text not null,
  company_domain text not null,
  industry text,
  website text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_id uuid references public.email_templates(id),
  sender_email text not null default 'connect@fluvo.in',
  status text not null default 'draft' check (status in ('draft','queued','running','completed','paused','failed','cancelled')),
  test_mode boolean not null default true,
  compliance_confirmed boolean not null default false,
  total_recipients integer not null default 0,
  queued_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_by text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create table if not exists public.campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  lead_id uuid references public.leads(id),
  recipient_email text not null,
  personalized_subject text,
  personalized_body text,
  status text not null default 'pending' check (status in ('pending','queued','sending','sent','failed','bounced','unsubscribed','suppressed','duplicate','already_contacted','invalid')),
  provider_message_id text,
  attempts integer not null default 0,
  error_message text,
  sent_at timestamptz,
  available_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, recipient_email)
);

create index if not exists idx_campaigns_created_at on public.campaigns (created_at desc);
create index if not exists idx_campaign_recipients_queue on public.campaign_recipients (status, available_at, created_at);
create index if not exists idx_campaign_recipients_email on public.campaign_recipients (recipient_email, status);

create table if not exists public.email_events (
  id uuid primary key default gen_random_uuid(),
  campaign_recipient_id uuid references public.campaign_recipients(id) on delete set null,
  event_type text not null,
  provider_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.email_automation_settings enable row level security;
alter table public.email_templates enable row level security;
alter table public.leads enable row level security;
alter table public.campaigns enable row level security;
alter table public.campaign_recipients enable row level security;
alter table public.email_events enable row level security;
alter table public.suppression_list enable row level security;
alter table public.audit_logs enable row level security;

create or replace function public.claim_email_automation_recipient(
  p_hour_limit integer,
  p_day_limit integer,
  p_delay_seconds integer
) returns setof public.campaign_recipients
language plpgsql
security definer
set search_path = public
as $$
declare
  hourly_sent integer;
  daily_sent integer;
  last_sent timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('fluvo-email-automation-worker'));
  select count(*) into hourly_sent from public.campaign_recipients
    where status = 'sent' and sent_at >= now() - interval '1 hour';
  select count(*) into daily_sent from public.campaign_recipients
    where status = 'sent' and sent_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  if hourly_sent >= greatest(p_hour_limit, 1) or daily_sent >= greatest(p_day_limit, 1) then
    return;
  end if;

  select max(sent_at) into last_sent from public.campaign_recipients where status = 'sent';
  if last_sent is not null and last_sent + make_interval(secs => greatest(p_delay_seconds, 0)) > now() then
    return;
  end if;

  return query
  with candidate as (
    select r.id
    from public.campaign_recipients r
    join public.campaigns c on c.id = r.campaign_id
    where r.status = 'queued' and r.available_at <= now() and c.status in ('queued','running')
      and not exists (select 1 from public.campaign_recipients active where active.status = 'sending')
    order by r.created_at
    limit 1
    for update of r skip locked
  )
  update public.campaign_recipients r
  set status = 'sending', attempts = r.attempts + 1, updated_at = now()
  from candidate
  where r.id = candidate.id
  returning r.*;

  update public.campaigns c set status = 'running', started_at = coalesce(started_at, now())
  where c.id in (select campaign_id from public.campaign_recipients where status = 'sending')
    and c.status = 'queued';
end;
$$;

revoke all on function public.claim_email_automation_recipient(integer, integer, integer) from public;
grant execute on function public.claim_email_automation_recipient(integer, integer, integer) to service_role;