create table if not exists public.rag_tables (
  id                  text primary key,
  document_title      text not null check (char_length(document_title) between 1 and 300),
  source_file         text not null check (char_length(source_file) between 1 and 500),
  revision_basis      text not null default '' check (char_length(revision_basis) <= 100),
  page_start          integer not null check (page_start > 0),
  page_end            integer not null check (page_end >= page_start),
  table_index         integer not null check (table_index > 0),
  table_title         text not null default '' check (char_length(table_title) <= 500),
  table_type          text not null check (table_type in ('data_table', 'form', 'qa_table', 'layout_box', 'ocr_form')),
  context_before      text not null default '',
  context_after       text not null default '',
  row_count           integer not null check (row_count > 0),
  column_count        integer not null check (column_count > 0),
  cells               jsonb not null check (jsonb_typeof(cells) = 'array'),
  anchor_matrix       jsonb not null check (jsonb_typeof(anchor_matrix) = 'array'),
  expanded_matrix     jsonb not null check (jsonb_typeof(expanded_matrix) = 'array'),
  markdown            text not null,
  search_text         text not null,
  extraction_method   text not null check (extraction_method in ('lines', 'text', 'ocr')),
  confidence          numeric(4,3) not null check (confidence between 0 and 1),
  checksum_sha256     text not null unique check (char_length(checksum_sha256) = 64),
  import_batch_id     uuid not null,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists rag_tables_document_page_idx
  on public.rag_tables (document_title, page_start, table_index);
create index if not exists rag_tables_source_page_idx
  on public.rag_tables (source_file, page_start, table_index);
create index if not exists rag_tables_type_idx
  on public.rag_tables (table_type) where is_active;
create index if not exists rag_tables_search_idx
  on public.rag_tables using gin (to_tsvector('simple', search_text));

alter table public.rag_tables enable row level security;
revoke all on table public.rag_tables from anon, authenticated;

create or replace function public.import_rag_tables(p_rows jsonb, p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  insert into public.rag_tables (
    id, document_title, source_file, revision_basis, page_start, page_end,
    table_index, table_title, table_type, context_before, context_after,
    row_count, column_count, cells, anchor_matrix, expanded_matrix, markdown,
    search_text, extraction_method, confidence, checksum_sha256, import_batch_id,
    is_active, updated_at
  )
  select
    item.id, item.document_title, item.source_file, item.revision_basis,
    item.page_start, item.page_end, item.table_index, item.table_title,
    item.table_type, item.context_before, item.context_after, item.row_count,
    item.column_count, item.cells, item.anchor_matrix, item.expanded_matrix,
    item.markdown, item.search_text, item.extraction_method, item.confidence,
    item.checksum_sha256, p_batch_id, true, now()
  from jsonb_to_recordset(p_rows) as item(
    id text,
    document_title text,
    source_file text,
    revision_basis text,
    page_start integer,
    page_end integer,
    table_index integer,
    table_title text,
    table_type text,
    context_before text,
    context_after text,
    row_count integer,
    column_count integer,
    cells jsonb,
    anchor_matrix jsonb,
    expanded_matrix jsonb,
    markdown text,
    search_text text,
    extraction_method text,
    confidence numeric,
    checksum_sha256 text
  )
  on conflict (id) do update set
    document_title = excluded.document_title,
    source_file = excluded.source_file,
    revision_basis = excluded.revision_basis,
    page_start = excluded.page_start,
    page_end = excluded.page_end,
    table_index = excluded.table_index,
    table_title = excluded.table_title,
    table_type = excluded.table_type,
    context_before = excluded.context_before,
    context_after = excluded.context_after,
    row_count = excluded.row_count,
    column_count = excluded.column_count,
    cells = excluded.cells,
    anchor_matrix = excluded.anchor_matrix,
    expanded_matrix = excluded.expanded_matrix,
    markdown = excluded.markdown,
    search_text = excluded.search_text,
    extraction_method = excluded.extraction_method,
    confidence = excluded.confidence,
    checksum_sha256 = excluded.checksum_sha256,
    import_batch_id = excluded.import_batch_id,
    is_active = true,
    updated_at = now();

  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.search_rag_tables(p_terms text[], p_limit integer default 12)
returns table (
  id text,
  document_title text,
  source_file text,
  revision_basis text,
  page_start integer,
  page_end integer,
  table_index integer,
  table_title text,
  table_type text,
  row_count integer,
  column_count integer,
  expanded_matrix jsonb,
  markdown text,
  search_text text,
  confidence numeric,
  score numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with terms as (
    select distinct lower(trim(term)) as term
    from unnest(coalesce(p_terms, array[]::text[])) as term
    where char_length(trim(term)) >= 2
    limit 24
  ), scored as (
    select
      table_row.id,
      sum(
        case when lower(table_row.table_title) like '%' || terms.term || '%' then 12 else 0 end +
        case when lower(table_row.document_title) like '%' || terms.term || '%' then 8 else 0 end +
        case when lower(table_row.search_text) like '%' || terms.term || '%' then 2 else 0 end
      )::numeric as score
    from public.rag_tables table_row
    join terms on lower(table_row.search_text) like '%' || terms.term || '%'
    where table_row.is_active
    group by table_row.id
  )
  select
    table_row.id,
    table_row.document_title,
    table_row.source_file,
    table_row.revision_basis,
    table_row.page_start,
    table_row.page_end,
    table_row.table_index,
    table_row.table_title,
    table_row.table_type,
    table_row.row_count,
    table_row.column_count,
    table_row.expanded_matrix,
    table_row.markdown,
    table_row.search_text,
    table_row.confidence,
    scored.score
  from scored
  join public.rag_tables table_row using (id)
  order by scored.score desc, table_row.confidence desc, table_row.page_start
  limit greatest(1, least(coalesce(p_limit, 12), 30));
$$;

revoke all on function public.import_rag_tables(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.search_rag_tables(text[], integer) from public, anon, authenticated;
grant execute on function public.import_rag_tables(jsonb, uuid) to service_role;
grant execute on function public.search_rag_tables(text[], integer) to service_role;
