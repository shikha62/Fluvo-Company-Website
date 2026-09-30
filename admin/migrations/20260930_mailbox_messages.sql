create table if not exists public.mailbox_messages (
  id uuid primary key default gen_random_uuid(),
  mailbox_email text not null,
  folder text not null,
  uid_validity text not null,
  imap_uid bigint not null,
  message_id text,
  from_data jsonb not null default '[]'::jsonb,
  to_data jsonb not null default '[]'::jsonb,
  cc_data jsonb not null default '[]'::jsonb,
  subject text not null default '(No Subject)',
  received_at timestamptz,
  snippet text not null default '',
  text_body text not null default '',
  html_body text,
  attachments jsonb not null default '[]'::jsonb,
  unread boolean not null default false,
  starred boolean not null default false,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (mailbox_email, folder, uid_validity, imap_uid)
);

create index if not exists mailbox_messages_received_at_idx
  on public.mailbox_messages (mailbox_email, folder, received_at desc);

alter table public.mailbox_messages enable row level security;
revoke all on public.mailbox_messages from anon, authenticated;
grant all on public.mailbox_messages to service_role;