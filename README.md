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
`documentApiUrl` is required for this format.

HWPX files can be generated directly in the browser as well. Enter
`HWPX 문서로 정리해줘` or select HWPX from the report-file dialog. The generated
document preserves headings, paragraphs, bullet lists, tables as structured
text, author metadata, and the creation date without requiring a template ID or
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

1. Add repository secrets `MOTIF_300B` (the Motif3 API key),
   `OPENROUTER_API_KEY` (the OpenRouter emergency free-router key), and
   `SUPABASE_KHA_PROJECT` (a Supabase personal access token).
2. The proxy deploys automatically when its files are pushed to `main`, or it
   can be deployed with the `Deploy Motif3 API Proxy` workflow manually.
3. The proxy calls `motif3` first and falls back to `openrouter/free` when the
   Motif endpoint is unavailable. OpenRouter's free route is rate-limited and
   is intended only for emergency, low-volume use.

Attachment contents are not sent to OpenRouter by default. Set the repository
variable `OPENROUTER_ALLOW_INTERNAL_DATA=true` only after the organization has
approved transferring those materials to OpenRouter's upstream model pool.

The client requests up to 16,384 output tokens for normal chat and 8,192 for
spell-check results. These values can be changed with `maxOutputTokens` and
`spellCheckMaxOutputTokens` in `docs/config.js`; the upstream model may apply a
lower hard limit.

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

For an existing deployment, run
`supabase/migrations/20260716150000_chat_log_answer_excerpt.sql` to store up to
1,000 characters of each AI final answer with the existing question log. Older
rows remain valid and show an empty answer excerpt. A fresh installation only
needs `docs/setup.sql`, which already includes this column and its indexes.
