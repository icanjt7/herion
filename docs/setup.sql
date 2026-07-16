-- Herian: Supabase 초기 설정 SQL
-- Supabase Dashboard → SQL Editor 에서 전체 실행하세요.

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
  created_at timestamptz default now()
);

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
