-- Herion: Supabase 초기 설정 SQL
-- Supabase Dashboard → SQL Editor 에서 전체 실행하세요.

-- 1. profiles 테이블 생성
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  approved   boolean not null default false,
  role       text not null default 'pending',
  created_at timestamptz default now()
);

-- 2. Row Level Security 활성화
alter table public.profiles enable row level security;

-- 3. 본인 프로필 조회 허용 (로그인된 사용자)
drop policy if exists "본인 프로필 조회" on public.profiles;
create policy "본인 프로필 조회"
  on public.profiles for select
  using (auth.uid() = id);

-- 4. 관리자는 전체 조회 허용
drop policy if exists "전체 프로필 조회 (관리자)" on public.profiles;
create policy "전체 프로필 조회 (관리자)"
  on public.profiles for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

-- 5. 신규 사용자 가입 시 profiles 자동 생성 트리거
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, approved, role)
  values (new.id, new.email, false, 'pending')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 6. 관리자 이메일은 가입 즉시 approved = true
--    config.js 의 adminEmails 와 동일하게 수동으로 업데이트하거나,
--    아래 주석을 풀고 이메일을 직접 입력하세요.
-- update public.profiles set approved = true, role = 'admin'
--   where email = 'admin@kh.or.kr';
