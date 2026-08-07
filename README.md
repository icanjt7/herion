# Herian

헤리안(Herian)은 Heritage와 `~에 속한 사람/것`을 뜻하는 `an`을 결합한 이름으로, **국가유산 실무업무를 지원하는 AI 업무 파트너**입니다.

K-Heritage GPT service — internal AI chat assistant for kh.or.kr users.

Based on [Open WebUI](https://github.com/open-webui/open-webui).

## Quick Start

1. Copy the environment template.

   ```powershell
   Copy-Item .env.example .env
   ```

2. Edit `.env` and set `OPENAI_API_KEY`.

3. Start the service.

   ```powershell
   docker compose up -d
   ```

4. Open http://localhost:3000.

The first account created becomes the admin. Later signups are set to `pending` — admin must approve them.

## Access Control

For the quickest POC, use local login and approve only `@kh.or.kr` accounts manually.

For OAuth/SSO, set in `.env`:

```env
OAUTH_ALLOWED_DOMAINS=kh.or.kr
ENABLE_OAUTH_SIGNUP=true
ENABLE_LOGIN_FORM=false
```

Then configure Microsoft Entra ID or Google OAuth values.

## Useful Commands

```powershell
docker compose up -d
docker compose logs -f
docker compose down
docker compose down -v   # reset all data
```

## Preview

A static UI preview is available via GitHub Pages at `docs/index.html`.

## Document parsing and report generation

The optional `document-service` container uses Docling for structured document
parsing and generates DOCX, PDF, PPTX, or template-based HWPX reports.

PowerPoint files can also be generated directly in the browser with the bundled
National Heritage Promotion Agency template. Enter a request such as
`PPT 만들어줘` or select PowerPoint from the report-file dialog; no
`documentApiUrl` is required for this format. The client-side layout engine
classifies each slide as overview, metrics, priority, timeline, or general
cards, then applies two-column information cards, big-stat KPIs and editable
comparison tables, three-step priority cards, or a horizontal process timeline.
Long content is split into continuation slides within a fixed safe area.
For PowerPoint requests, the LLM is instructed to return a validated JSON array
using `cards_2col`, `stat`, `timeline`, `table`, `diagram`, and `chart` slide
types. Tables use a navy header with alternating body rows, process diagrams use
rounded step cards and directional arrows, and charts use editable native
PptxGenJS bar charts. The browser parser in
`docs/pptx-llm-parser.js` validates and normalizes that response without
executing it, maps the structured data into the visual layout engine, and
converts it back to readable Markdown for the chat, DOCX, and HWPX download
flows. Legacy Markdown presentation responses remain supported as a fallback.

DOCX reports can be generated directly in the browser with an A4 cover,
National Heritage Promotion Agency colors, structured headings, native Word
bullets, formatted tables, a header, and an official-information footer. Enter
`Word 보고서로 만들어줘` or select Word from the report-file dialog; no
`documentApiUrl` is required.

HWPX files can be generated directly in the browser as well. Enter
`HWPX 문서로 정리해줘` or select HWPX from the report-file dialog. The generated
document applies the agency palette and Malgun Gothic typography to its cover,
headings, body copy, bullet lists, table-style rows, author metadata, creation
date, and official contact information without requiring a template ID or
`documentApiUrl`.

```powershell
docker compose --profile documents up --build document-service
```

Set `documentApiUrl` in `docs/config.js` to the deployed HTTPS service URL. If
the value is empty or the service is unavailable, Herian keeps using its local
browser parser. HWPX generation requires an approved template containing
`{{TITLE}}`, `{{SUBTITLE}}`, `{{AUTHOR}}`, and `{{BODY}}` markers.

## Notes

- Do not commit `.env`.
- Pin `OPEN_WEBUI_TAG` to a release tag before production use.

## Law API Proxy

The GitHub Pages client uses the `law-api` Supabase Edge Function so the law API
OC is not exposed in `docs/config.js` and browser CORS does not block requests.

1. Add repository secrets `lawSearch` (the approved OC) and
   `SUPABASE_KHA_PROJECT` (a Supabase personal access token).
2. Push the proxy files to `main`, or run the `Deploy Law API Proxy` workflow
   manually.
3. Register the Supabase function/server domain or outbound IP in the approved
   국가법령정보 OPEN API application if the API rejects the server request.

## Motif3 API Proxy

The GitHub Pages client calls the `motif-api` Supabase Edge Function so the
Motif3 API key is never embedded in the public browser bundle.

1. Add repository secrets `MOTIF_300B` (the Motif3 API key) and
   `SUPABASE_KHA_PROJECT` (a Supabase personal access token).
2. The proxy deploys automatically when its files are pushed to `main`, or it
   can be deployed with the `Deploy Motif3 API Proxy` workflow manually.
3. The client calls model `motif3` through the proxy at
   `https://chat-azure.motiftech.io/openapi/v1/chat/completions`.

The client requests up to 16,384 output tokens for normal chat and 8,192 for
spell-check results. These values can be changed with `maxOutputTokens` and
`spellCheckMaxOutputTokens` in `docs/config.js`; the upstream model may apply a
lower hard limit.

## Internal guideline RAG

Normal chat requests also search the National Heritage Agency's internal
articles, regulations, detailed rules, guidelines, and work-processing
standards compiled on 2026-07-29 and 2026-07-30. The encrypted corpus contains
2,934 unique semantic chunks from 99 documents; 28 repeated chunks in the
source packages are removed during the build. Retrieval combines
document-title, section-title, and body-term relevance, limits repeated chunks
from the same document, and injects only the top matching passages into the
Motif3 system context. Answers are instructed to identify supporting passages
as `[내부 지침: 문서명 · 조항/구분]` and to request departmental confirmation
when the retrieved text is insufficient.

The plaintext corpus is never placed in `docs/` or committed to the public
repository. Rebuild the encrypted function asset with:

```bash
node scripts/build-rag-corpus.mjs \
  --input /secure/path/guidelines/05_rag_chunks.json \
  --input /secure/path/internal-rules/05_rag_chunks.json \
  --key-file /secure/path/rag-data-key.txt
```

`rag-data-key.txt` must contain a base64-encoded 32-byte AES key. Store the same
value in the GitHub Actions secret `RAG_DATA_KEY`. OpenAI embeddings in the
source package are currently null; the deployed retrieval is therefore sparse
RAG and can be upgraded to hybrid vector retrieval later without changing the
chunk IDs.

Rich chunk packages may also provide `major_section`, `topic`, `subsection`,
`minor_heading`, `unit_title`, `unit_type`, and `related_regulations`; the
builder maps these fields into searchable hierarchy and metadata. The 2026-05-01
work handbook is stored as a separate encrypted corpus and uses the repository
secret `RAG_WORK_HANDBOOK_KEY`, so neither its plaintext nor its key is included
in the public bundle.

The handbook build also passes `--form-inventory`, `--document-title`,
`--source-file`, `--revision`, and `--department`. Image-only forms become
explicit limitation chunks that confirm the form exists while directing users
to the original handbook or responsible department instead of inventing fields.

### Structured PDF tables

Policy PDF tables are stored separately in the private `rag_tables` database
table. The extractor preserves each physical cell, `rowspan`/`colspan`, an
expanded retrieval matrix, PDF page, surrounding context, and a Markdown view.
Plaintext table data and encryption keys must not be committed. Rebuild and
encrypt the private package with:

```bash
python -m pip install -r scripts/requirements-rag-tables.txt
python scripts/extract-pdf-tables.py \
  --document "/secure/handbook.pdf::국가유산진흥원 복무 편람::2026-01-01" \
  --document "/secure/rules.pdf::국가유산진흥원 정관 및 내규 전문::2026-07-29" \
  --document "/secure/guidelines.pdf::진흥원 지침 및 업무처리기준::2026-07-30" \
  --output /secure/private.rag-tables.json \
  --summary /secure/table-extraction-summary.json
python scripts/encrypt-rag-tables.py \
  --input /secure/private.rag-tables.json \
  --output supabase/data/rag-tables.enc \
  --metadata supabase/data/rag-tables.metadata.json \
  --key-file /secure/private.rag-tables.key
```

Set the matching base64 key as the repository secret `RAG_TABLE_DATA_KEY`.
The `Deploy Structured RAG Tables` workflow applies the private database schema,
decrypts the package only on the GitHub runner, imports it in batches, and
removes superseded rows from the same source PDFs. The Motif proxy retrieves
matching tables with the service role and injects only the relevant table or
rows into the model context.

### Accounting and contract corpus

The accounting corpus adds three page-aware PDF sources and three Excel
workbooks. PDF body text is stored as encrypted semantic chunks with exact PDF
pages. Ruled PDF tables and all seven workbook sheets are stored as structured
tables; Excel extraction trims unused styled cells while preserving formulas,
merged-cell spans, sheet order, sheet names, and the actual used range.
Image-heavy PDF pages receive separate Korean OCR chunks that are explicitly
treated as navigation aids rather than sole evidence for amounts, rates, dates,
or account classifications.

The encrypted assets use independent repository secrets:
`RAG_ACCOUNTING_KEY` for `rag-corpus-accounting.ts` and
`RAG_ACCOUNTING_TABLE_KEY` for `accounting-rag-tables.enc`. Plaintext extraction
outputs and OCR images must remain outside the repository. The structured-table
deployment imports both encrypted packages and replaces prior rows only for the
source files contained in each package.

## Web Search Proxy

Herian automatically performs a Tavily web search when the user explicitly asks
to search, look something up, find sources, or requests current information.
There is no toolbar toggle: search intent is detected from the request. Search
results and source URLs are injected into the model context, and an explicit
search request fails visibly instead of silently falling back to an unsearched
answer.

The browser calls the `web-search-api` Supabase Edge Function, so the Tavily key
is not included in the static GitHub Pages bundle. Add repository secrets
`TAVILY_API` and `SUPABASE_KHA_PROJECT`; pushing the function or its deployment
workflow configures `TAVILY_API_KEY` in Supabase and deploys the proxy.

Culture and national-heritage fact questions use a curated source profile before
the open web. The profile searches the Cultural Heritage Administration and
Royal Palaces and Tombs sites, the National Heritage Portal and Research
Institute, primary historical sources, specialist dictionaries, and the
configured cross-check sources. Results are ranked by source tier, and a broad
search is used only when the curated set returns too few relevant documents.

Organization and department questions bypass the general search index and read
the official organization pages directly: the Korea Heritage Agency department
guide at `https://www.kh.or.kr/org/chf/menu/410` and the Korea Heritage Service
organization guide at its `organization_info.jsp` page. The two institutions
use separate routing profiles so their departments are not mixed.

## Weather Lookup

Weather questions such as `서울 오늘 날씨` and `부산 내일 기온` are detected
automatically without adding a toolbar menu. The browser calls the
`weather-api` Supabase Edge Function, which geocodes the requested place and
retrieves current conditions plus a three-day forecast from Open-Meteo. For
days 4 through 10, the proxy prioritizes the Korea Meteorological
Administration Mid-term Forecast API (`getMidLandFcst` + `getMidTa`) and uses
Open-Meteo only when the official mid-term data is unavailable. Answers
can include the current and apparent temperature, humidity, precipitation
probability, wind, and the day's minimum and maximum temperature with the local
observation time and source link.

Weather data is rendered directly from the normalized API response instead of
being rewritten by the chat model, preventing false "real-time information is
unavailable" replies. A request with no place, such as `날씨`, returns a
12-region Republic of Korea overview. Service timestamps use `Asia/Seoul`, and
Seoul is the configured reference/default location.

Open-Meteo Geocoding is used first. When it cannot resolve a Korean-language
place name, the proxy uses OpenStreetMap Nominatim as a user-triggered fallback
and includes the applicable attribution link.

Add the data.go.kr service key as the repository secret `MIDFCSTINFOSERVICE`.
The weather deployment workflow copies it to the Supabase Edge Function secret;
the key is never included in the browser bundle. The existing
`SUPABASE_KHA_PROJECT` deployment secret is also required.

Herian parses PDF, DOCX, PPTX, XLSX/XLS/XLSB/ODS, HWPX, and text attachments in
the browser when the optional document service is unavailable. Spreadsheet
parsing preserves sheet names, cell locations, formatted values, formulas,
links, comments, merged ranges, and hidden-sheet state. Herian does not
truncate extracted attachment text or impose its own upload, expanded-HWPX, or
per-message character cap. Browser memory, hosting request size, and upstream
model context limits still apply.

## Cloudflare Image Generation

Herian automatically routes prompts such as `그려줘`, `그려`, and image
`생성해` requests to the `image-api` Supabase Edge Function. The function uses
Cloudflare Workers AI with `@cf/black-forest-labs/flux-1-schnell`; API
credentials remain in Supabase secrets. When Cloudflare returns the daily free
allocation error (`3036`), the client explains that no more images can be
generated that day.

See [the Korean Cloudflare setup guide](docs/CLOUDFLARE_IMAGE_SETUP.md) for the
account, token, GitHub secret, deployment, and verification steps.

## Requirement Board

`docs/requests.html` collects user requests with category, priority, author, and
review status. The writing dialog can call Motif3 to turn a rough note into a
structured requirement while preserving the user's facts.

Run `supabase/migrations/20260716090000_user_requests.sql` in the Supabase SQL
Editor (or use `docs/setup.sql` for a fresh installation) to create
`user_requests` and its policies. Until that table is available, the board uses the existing
`chat_logs` table as a central temporary store; the setup SQL migrates those
temporary posts into `user_requests` without changing their IDs.

Apply `supabase/migrations/20260803070000_user_request_comments.sql` to add
threaded replies to requirement posts. Before that table is available, replies
are stored centrally in `chat_logs` and are migrated without changing their IDs.
The post author can also edit or delete their own requirement from its detail dialog;
deleting a dedicated-table post cascades to its replies.

For an existing deployment, run
`supabase/migrations/20260716150000_chat_log_answer_excerpt.sql` to store up to
1,000 characters of each AI final answer with the existing question log. Older
rows remain valid and show an empty answer excerpt. A fresh installation only
needs `docs/setup.sql`, which already includes this column and its indexes.
