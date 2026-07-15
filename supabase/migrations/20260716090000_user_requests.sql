-- Herion 사용자 요구사항 게시판
create table if not exists public.user_requests (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (char_length(title) between 2 and 120),
  category    text not null default '기능 개선',
  priority    text not null default '보통',
  content     text not null check (char_length(content) between 5 and 10000),
  status      text not null default '접수',
  user_email  text not null,
  user_name   text not null,
  department  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists user_requests_created_at_idx
  on public.user_requests (created_at desc);
create index if not exists user_requests_status_idx
  on public.user_requests (status);

-- 전용 테이블 배포 전에 chat_logs 임시 저장소로 접수된 요구사항 이관
insert into public.user_requests (
  id, title, category, priority, content, status,
  user_email, user_name, department, created_at, updated_at
)
select
  id,
  coalesce(question::jsonb ->> 'title', '제목 없음'),
  coalesce(question::jsonb ->> 'category', '기타'),
  coalesce(question::jsonb ->> 'priority', '보통'),
  coalesce(question::jsonb ->> 'content', ''),
  coalesce(question::jsonb ->> 'status', '접수'),
  user_email,
  coalesce(user_name, ''),
  coalesce(question::jsonb ->> 'department', ''),
  created_at,
  created_at
from public.chat_logs
where model = 'user_request'
on conflict (id) do nothing;

alter table public.user_requests enable row level security;

drop policy if exists "요구사항 조회" on public.user_requests;
create policy "요구사항 조회" on public.user_requests
  for select using (true);

drop policy if exists "요구사항 등록" on public.user_requests;
create policy "요구사항 등록" on public.user_requests
  for insert with check (true);

drop policy if exists "요구사항 상태 변경" on public.user_requests;
create policy "요구사항 상태 변경" on public.user_requests
  for update using (true) with check (true);
