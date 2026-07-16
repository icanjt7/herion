-- Herian 사용 로그에 AI 최종 답변 일부를 보관합니다.
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
