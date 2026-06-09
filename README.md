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
