-- 작성자가 요구사항 게시글을 수정·삭제할 수 있도록 게시판 쓰기 정책을 보완합니다.
-- Herian은 직원 화이트리스트 기반 브라우저 세션을 사용하므로 소유자 확인은
-- 클라이언트의 로그인 이메일과 쿼리의 user_email 조건을 함께 적용합니다.
drop policy if exists "요구사항 삭제" on public.user_requests;
create policy "요구사항 삭제" on public.user_requests
  for delete using (true);

-- user_requests 전용 테이블 적용 전 chat_logs에 저장된 게시글도 수정·삭제할 수 있습니다.
drop policy if exists "임시 요구사항 수정" on public.chat_logs;
create policy "임시 요구사항 수정" on public.chat_logs
  for update
  using (model = 'user_request')
  with check (model = 'user_request');

drop policy if exists "임시 요구사항 삭제" on public.chat_logs;
create policy "임시 요구사항 삭제" on public.chat_logs
  for delete using (model = 'user_request');
