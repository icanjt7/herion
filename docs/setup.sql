-- Herion: Supabase 초기 설정 SQL
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
  created_at timestamptz default now()
);

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
