-- 요구사항 게시글에 여러 사용자가 답글을 남길 수 있도록 합니다.
create table if not exists public.user_request_comments (
  id          uuid primary key default gen_random_uuid(),
  request_id  uuid not null references public.user_requests(id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 3000),
  user_email  text not null,
  user_name   text not null,
  department  text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists user_request_comments_request_created_idx
  on public.user_request_comments (request_id, created_at);

-- 전용 댓글 테이블 배포 전에 chat_logs에 저장된 답글을 이관합니다.
insert into public.user_request_comments (
  id, request_id, content, user_email, user_name, department, created_at, updated_at
)
select
  log.id,
  request.id,
  log.question::jsonb ->> 'content',
  log.user_email,
  coalesce(log.user_name, ''),
  coalesce(log.question::jsonb ->> 'department', ''),
  log.created_at,
  log.created_at
from public.chat_logs as log
join public.user_requests as request
  on request.id::text = log.question::jsonb ->> 'request_id'
where log.model = 'user_request_comment'
  and char_length(coalesce(log.question::jsonb ->> 'content', '')) between 1 and 3000
on conflict (id) do nothing;

alter table public.user_request_comments enable row level security;

drop policy if exists "요구사항 답글 조회" on public.user_request_comments;
create policy "요구사항 답글 조회" on public.user_request_comments
  for select using (true);

drop policy if exists "요구사항 답글 등록" on public.user_request_comments;
create policy "요구사항 답글 등록" on public.user_request_comments
  for insert with check (true);
