-- Herian: Supabase 초기 설정 SQL
-- Supabase Dashboard → SQL Editor 에서 전체 실행하세요.

-- RAG 관리용 운영 오버레이는 supabase/migrations/20260803100000_rag_chunk_overrides.sql을
-- 함께 실행합니다. 암호화된 기본 코퍼스는 유지하고 관리자 수정본과 변경 이력만 저장합니다.

-- 기존 profiles 테이블/트리거 정리
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
drop table if exists public.profiles;

-- employees 테이블 (접속 허용 직원 화이트리스트)
create table if not exists public.employees (
  id         uuid primary key default gen_random_uuid(),
  email      text unique not null,
  name       text not null,
  role       text not null default 'user',  -- 'user' | 'admin'
  department text not null default '',      -- 부서
  position_title text not null default '',  -- 직책
  created_at timestamptz default now()
);

-- 기존 테이블에 컬럼 추가 (이미 생성된 경우)
alter table public.employees add column if not exists department text not null default '';
alter table public.employees add column if not exists position_title text not null default '';

alter table public.employees enable row level security;

-- 로그인 확인용 전체 조회 허용
drop policy if exists "로그인 조회" on public.employees;
create policy "로그인 조회" on public.employees
  for select using (true);

-- 관리자 대시보드에서 직원 추가/삭제 허용
drop policy if exists "직원 등록" on public.employees;
create policy "직원 등록" on public.employees
  for insert with check (true);

drop policy if exists "직원 삭제" on public.employees;
create policy "직원 삭제" on public.employees
  for delete using (true);

drop policy if exists "직원 수정" on public.employees;
create policy "직원 수정" on public.employees
  for update using (true);

-- 기본 허용 사용자: t@kh.or.kr
insert into public.employees (email, name, role, department, position_title)
values ('t@kh.or.kr', 't', 'user', '', '')
on conflict (email) do update
set
  name = excluded.name,
  role = excluded.role,
  department = excluded.department,
  position_title = excluded.position_title;

-- 직원 등록 예시 (필요 시 추가)
-- insert into public.employees (email, name, role) values ('hong@kh.or.kr', '홍길동', 'user');
-- insert into public.employees (email, name, role) values ('admin@kh.or.kr', '관리자', 'admin');

-- AI 대화 로그 테이블
create table if not exists public.chat_logs (
  id         uuid primary key default gen_random_uuid(),
  user_email text not null,
  user_name  text,
  model      text,
  question   text,
  answer_excerpt text not null default '',
  created_at timestamptz default now()
);

alter table public.chat_logs
  add column if not exists answer_excerpt text not null default '';

comment on column public.chat_logs.answer_excerpt is
  '내부 추론과 첨부 원문을 제외한 AI 최종 답변 앞부분(클라이언트 기준 최대 1000자)';

create index if not exists chat_logs_created_at_idx
  on public.chat_logs (created_at desc);
create index if not exists chat_logs_user_email_idx
  on public.chat_logs (user_email);
create index if not exists chat_logs_model_idx
  on public.chat_logs (model);

alter table public.chat_logs enable row level security;

drop policy if exists "로그 기록" on public.chat_logs;
create policy "로그 기록" on public.chat_logs
  for insert with check (true);

drop policy if exists "로그 조회" on public.chat_logs;
create policy "로그 조회" on public.chat_logs
  for select using (true);

-- 사용자 요구사항 게시판
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

-- 현재 Herian은 직원 화이트리스트 기반 세션을 사용하므로 관리자 화면의 상태 변경을 허용합니다.
drop policy if exists "요구사항 상태 변경" on public.user_requests;
create policy "요구사항 상태 변경" on public.user_requests
  for update using (true) with check (true);

drop policy if exists "요구사항 삭제" on public.user_requests;
create policy "요구사항 삭제" on public.user_requests
  for delete using (true);

drop policy if exists "임시 요구사항 수정" on public.chat_logs;
create policy "임시 요구사항 수정" on public.chat_logs
  for update
  using (model = 'user_request')
  with check (model = 'user_request');

drop policy if exists "임시 요구사항 삭제" on public.chat_logs;
create policy "임시 요구사항 삭제" on public.chat_logs
  for delete using (model = 'user_request');

-- 요구사항 게시글 답글
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

-- ─── 관리자 대시보드 운영 이력 ──────────────────────────────
create table if not exists public.admin_dashboard_records (
  id               uuid primary key default gen_random_uuid(),
  record_type      text not null default 'note'
                   check (record_type in ('snapshot', 'note')),
  record_date      date not null default current_date,
  title            text not null check (char_length(title) between 2 and 120),
  category         text not null default '운영 메모',
  content          text not null default '' check (char_length(content) <= 10000),
  status           text not null default '참고',
  total_employees  integer check (total_employees is null or total_employees >= 0),
  admin_count      integer check (admin_count is null or admin_count >= 0),
  today_chats      bigint check (today_chats is null or today_chats >= 0),
  total_chats      bigint check (total_chats is null or total_chats >= 0),
  created_by_email text not null,
  created_by_name  text not null default '',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists admin_dashboard_records_date_idx
  on public.admin_dashboard_records (record_date desc, created_at desc);
create index if not exists admin_dashboard_records_category_idx
  on public.admin_dashboard_records (category);
create unique index if not exists admin_dashboard_daily_snapshot_idx
  on public.admin_dashboard_records (record_date)
  where record_type = 'snapshot';

-- 기존 대화 로그에서 복원 가능한 과거 일별 대화 수와 누적 대화 수를 최초 이관합니다.
-- 과거 직원/관리자 수는 변경 이력이 없으므로 임의로 채우지 않습니다.
with daily as (
  select
    (created_at at time zone 'Asia/Seoul')::date as record_date,
    count(*)::bigint as day_chats
  from public.chat_logs
  group by 1
), history as (
  select
    record_date,
    day_chats,
    sum(day_chats) over (order by record_date)::bigint as cumulative_chats
  from daily
)
insert into public.admin_dashboard_records (
  record_type, record_date, title, category, content, status,
  today_chats, total_chats, created_by_email, created_by_name
)
select
  'snapshot',
  history.record_date,
  history.record_date::text || ' 운영 현황',
  '자동 집계',
  '기존 사용 로그에서 복원한 일별 대화 지표입니다. 당시 직원·관리자 수는 복원할 수 없습니다.',
  '과거 복원',
  history.day_chats,
  history.cumulative_chats,
  'system@herian.local',
  '시스템'
from history
where not exists (
  select 1 from public.admin_dashboard_records existing
  where existing.record_type = 'snapshot'
    and existing.record_date = history.record_date
);

alter table public.admin_dashboard_records enable row level security;

drop policy if exists "관리자 운영 이력 조회" on public.admin_dashboard_records;
create policy "관리자 운영 이력 조회" on public.admin_dashboard_records
  for select using (true);

drop policy if exists "관리자 운영 이력 등록" on public.admin_dashboard_records;
create policy "관리자 운영 이력 등록" on public.admin_dashboard_records
  for insert with check (true);

drop policy if exists "관리자 운영 이력 수정" on public.admin_dashboard_records;
create policy "관리자 운영 이력 수정" on public.admin_dashboard_records
  for update using (true) with check (true);

drop policy if exists "관리자 운영 이력 삭제" on public.admin_dashboard_records;
create policy "관리자 운영 이력 삭제" on public.admin_dashboard_records
  for delete using (true);
