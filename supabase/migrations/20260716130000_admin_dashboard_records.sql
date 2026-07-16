-- Herian 관리자 대시보드 운영 이력
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

-- 현재 서비스는 직원 화이트리스트 기반 세션을 사용하며 이 화면은 관리자 페이지에서만 노출됩니다.
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
