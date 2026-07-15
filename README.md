# Herion

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

## Notes

- Do not commit `.env`.
- Pin `OPEN_WEBUI_TAG` to a release tag before production use.

## Motif3 API Proxy

The GitHub Pages client calls the `motif-api` Supabase Edge Function so the
Motif3 API key is never embedded in the public browser bundle.

1. Add repository secrets `MOTIF_300B` (the Motif3 API key) and
   `SUPABASE_KHA_PROJECT` (a Supabase personal access token).
2. The proxy deploys automatically when its files are pushed to `main`, or it
   can be deployed with the `Deploy Motif3 API Proxy` workflow manually.
3. The client calls model `motif3` through the proxy at
   `https://chat-azure.motiftech.io/openapi/v1/chat/completions`.
