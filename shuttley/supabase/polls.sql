-- ── Push subscriptions ────────────────────────────────────────────────────
create table if not exists push_subscriptions (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  endpoint   text not null,
  subscription jsonb not null,
  created_at timestamptz default now(),
  unique(user_id, endpoint)
);
alter table push_subscriptions enable row level security;
create policy "Users manage own push subscriptions"
  on push_subscriptions for all using (auth.uid() = user_id);

-- ── Session polls ──────────────────────────────────────────────────────────
create table if not exists session_polls (
  id           uuid default gen_random_uuid() primary key,
  club_id      uuid references clubs(id) on delete cascade not null,
  created_by   uuid references auth.users(id) not null,
  session_date date not null,
  session_time text,          -- e.g. "7:00 PM – 9:00 PM"
  notes        text,
  status       text default 'open',   -- open | closed
  created_at   timestamptz default now()
);
alter table session_polls enable row level security;
create policy "Club members can view polls"
  on session_polls for select using (
    exists (
      select 1 from memberships
      where club_id = session_polls.club_id
        and user_id = auth.uid()
        and status  = 'approved'
    )
  );
create policy "Members can create polls"
  on session_polls for insert with check (
    exists (
      select 1 from memberships
      where club_id = session_polls.club_id
        and user_id = auth.uid()
        and status  = 'approved'
    )
  );
create policy "Moderators can update polls"
  on session_polls for update using (
    exists (
      select 1 from memberships
      where club_id = session_polls.club_id
        and user_id = auth.uid()
        and role    = 'moderator'
        and status  = 'approved'
    )
  );
create policy "Creator can delete own polls"
  on session_polls for delete using (
    auth.uid() = created_by
  );

-- ── Poll responses ─────────────────────────────────────────────────────────
create table if not exists poll_responses (
  id           uuid default gen_random_uuid() primary key,
  poll_id      uuid references session_polls(id) on delete cascade not null,
  user_id      uuid references auth.users(id) not null,
  response     text not null,   -- yes | no | maybe
  responded_at timestamptz default now(),
  unique(poll_id, user_id)
);
alter table poll_responses enable row level security;
create policy "Club members can view poll responses"
  on poll_responses for select using (
    exists (
      select 1 from session_polls sp
      join memberships m on m.club_id = sp.club_id
      where sp.id     = poll_responses.poll_id
        and m.user_id = auth.uid()
        and m.status  = 'approved'
    )
  );
create policy "Members can insert own response"
  on poll_responses for insert with check (auth.uid() = user_id);
create policy "Members can update own response"
  on poll_responses for update using (auth.uid() = user_id);
