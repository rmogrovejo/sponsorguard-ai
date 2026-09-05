# CreatorPreflight

Know what to fix before you publish.

CreatorPreflight is a local-first editorial preflight workspace. It inspects a short-form cut or a sponsored transcript and returns grounded, reviewable findings before the creator publishes.

This project was built for the AI Content Engine Hackathon.

## What it does

Creators already have many tools for generating content. CreatorPreflight focuses on pre-publish QA and a post-publish audience reading:

- **Short-Form Preflight** checks a local MP4 against TikTok / YouTube Shorts / Instagram Reels guidance.
- **Sponsored Content / SponsorGuard** checks an SRT transcript against campaign rules.
- **Audience Pulse** reads public YouTube/Shorts comments (or pasted comments) for signals, themes, reply candidates, and next-content opportunities.

The interface is bilingual (English / Spanish) and supports Light, Dark, and System appearance. Drafts and settings stay in this browser.

## Why it exists

A publish-time miss—wrong crop, missing CTA, late sponsor mention, forbidden claim—is expensive. CreatorPreflight makes those issues visible, timestamped, and editable before upload.

## Modules

### Short-Form Preflight

Upload an MP4. CreatorPreflight measures format, duration, audio, an energy-based speech-activity estimate, pacing / dead-air, and (when Gemini is configured) opening + CTA meaning. The report includes a timeline, ranked priorities, and optional on-demand wording suggestions.

### Sponsored Content / SponsorGuard

Name a campaign, paste a sponsor brief and/or enter rules, submit an SRT transcript, and inspect PASS / REVIEW / FAIL / NOT EVALUATED findings with evidence. Optional brief extraction and Generate Fix are provider-backed. Deterministic mention, token, URL, timing, and forbidden-phrase checks do not require Gemini.

### Audience Pulse

Paste a YouTube / Shorts URL or paste comments one-per-line (TikTok, Instagram, stream clips, and other platforms). CreatorPreflight normalizes and caps comments (200), classifies audience signals with Gemini, aggregates percentages deterministically, and returns grounded themes, reply-worthy comments, and next-content opportunities. URL mode needs `YOUTUBE_API_KEY` on the backend. Manual paste needs only Gemini. No OAuth, scraping, or auto-replies.

## Key features

- Deterministic media and transcript measurements
- Isolated Gemini verification for meaning-only checks
- Grounded evidence; no invented quotes
- On-demand Short-Form suggestions and SponsorGuard fixes
- Audience Pulse post-publish comment reading
- EN/ES system UI; creator content is never machine-translated
- Autosave / recovery and an error boundary
- Process-local rate limits on expensive public endpoints

## Architecture

```text
Browser (Vite / React)
        │  HTTPS in production
        │  VITE_SPONSORGUARD_API_URL
        ▼
FastAPI (CreatorPreflight API)
   ├── deterministic media / SRT / matchers / comment aggregation
   ├── optional YouTube Data API (public comments)
   └── optional Gemini adapters
```

The frontend never receives `GEMINI_API_KEY` or `YOUTUBE_API_KEY`. TLS is terminated by the host or reverse proxy, not by FastAPI.

## Deterministic vs AI

Gemini is not authoritative for measurements.

| Check | Source of truth |
| --- | --- |
| Orientation, resolution, duration, audio | Decoded media |
| Speech activity / dead-air | Energy-based estimate |
| Mentions, tokens, URLs, timing, forbidden phrases | Transcript matchers |
| Talking points, forbidden claims, opening/CTA meaning | Gemini + grounding |
| Audience Pulse signal percentages | Deterministic counts from classified labels |
| Audience Pulse themes / replies / opportunities | Gemini + grounding to real comment ids |

If Gemini is missing, rate-limited, or timed out, deterministic Short-Form and SponsorGuard findings still return. Audience Pulse requires Gemini for a full reading and fails closed with a controlled error. Semantic rows become NOT EVALUATED / unavailable where designed. The product does not invent a passing semantic result.

## Grounding and privacy

- Evidence is original transcript, speech, or comment text, not model-written quotes.
- Uploaded videos are written to a generated temp file and deleted after the request.
- Local drafts are browser storage, not a cloud backup.
- Application logs record request ID, route, method, status, duration, and controlled error codes. They must not contain API keys, briefs, transcripts, speech, comment bodies, video bytes, raw provider bodies, or temp paths.

## Tech stack

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: FastAPI, Pydantic, PyAV, pytest
- Optional model: Gemini (`google-genai`)

## Run locally

### Backend

```bash
cd backend
python -m venv .venv
```

```powershell
.\.venv\Scripts\Activate.ps1
```

```bash
source .venv/bin/activate
```

```bash
python -m pip install -r requirements.txt
copy .env.example .env   # Windows: Copy-Item .env.example .env
python -m pytest
python -m uvicorn app.main:app --reload --env-file .env
```

API: `http://127.0.0.1:8000`

Health: `GET /health` (process liveness only; it does not call Gemini)

### Frontend

```bash
cd frontend
npm ci
npm run dev
```

Default API origin is `http://127.0.0.1:8000`. Override with `VITE_SPONSORGUARD_API_URL` (see `frontend/.env.example`).

### Demo fixtures

- `examples/acmevpn-brief.txt`
- `examples/acmevpn.srt`

Do not commit a large or copyrighted MP4. To generate a tiny synthetic vertical clip with backend dependencies installed:

```bash
python scripts/generate_demo_mp4.py
```

Otherwise use any local MP4 you already have.

## Gemini configuration

Set `GEMINI_API_KEY` only on the backend (hosting secret or `backend/.env`). Never put it in Vite env files.

Audience Pulse URL mode also needs `YOUTUBE_API_KEY` on the backend only. Manual comment paste does not need YouTube.

A production/demo deployment needs a Gemini project/key with enough quota. Free-tier 429s are expected under load. CreatorPreflight then degrades: Short-Form still returns deterministic format/audio/pacing rows; SponsorGuard still runs manual/deterministic rules; Audience Pulse fails closed with a controlled error until Gemini is available.

Live provider tests are opt-in and skipped unless both a key and `CREATORPREFLIGHT_LIVE_GEMINI=1` are set. Do not enable that flag in CI.

## Tests

```bash
# backend
cd backend
python -m pytest
python -m compileall app
python -m pip check

# frontend
cd frontend
npm test
npm run typecheck
npm run build
```

## Deployment

Primary path for this hackathon:

1. **Backend:** Docker image on [Render](https://render.com) (`render.yaml`, `backend/Dockerfile`). One Uvicorn worker. No `--reload`.
2. **Frontend:** static Vite build on [Vercel](https://vercel.com) (`frontend/vercel.json` security headers).

PyAV is why the API uses Docker instead of a bare Python buildpack. Do not add Redis or extra workers unless you accept that in-memory rate-limit state is per process.

### Backend environment

| Variable | Production |
| --- | --- |
| `CREATORPREFLIGHT_ENV` | `production` |
| `SPONSORGUARD_ALLOWED_ORIGINS` | **Required.** Exact frontend HTTPS origin, comma-separated. No `*`. Localhost may still be listed if you want. |
| `GEMINI_API_KEY` | Hosting secret. Required for Audience Pulse and other AI features. |
| `YOUTUBE_API_KEY` | Hosting secret. Required only for Audience Pulse YouTube URL mode. |
| `SPONSORGUARD_LLM_*` / timeouts / upload / rate-limit vars | See `backend/.env.example` |

Also configure the platform/proxy body limit to at least the Short-Form upload size (25 MB default). Application middleware checks `Content-Length` and counts streamed bytes when that header is missing, but a proxy limit is still required.

### Frontend build variable

```text
VITE_SPONSORGUARD_API_URL=https://your-api.onrender.com
```

This is inlined at `npm run build`. A production bundle without it will not fall back to localhost.

HTTPS is assumed in production. The API does not terminate TLS.

The UI is an in-page workspace (no client router). Hosting does not need SPA path rewrites unless you add routes later.

## Limitations

- Semantic Gemini decisions are probabilistic and can be unavailable.
- Free-tier Gemini quota will 429; the app must stay usable without the model.
- Speech activity is an energy-based estimate, not a transcript ASR.
- Local drafts are not cloud backups.
- Video uploads are capped (25 MB default) and never persisted.
- Audience Pulse analyzes at most 200 comments per request and never scrapes TikTok/Instagram.
- Rate limits are process-local (one worker). They reset if the process restarts and do not coordinate across instances.
- Requests without `Content-Length` are counted in-app, but you should still set a proxy body limit.

## Hackathon smoke test

A. Open the deployed app
B. English + Light
C. Spanish + Dark
D. Upload a small MP4
E. Confirm deterministic Short-Form rows
F. If quota allows, confirm opening/CTA semantics
G. Sponsored Content: add a manual requirement
H. Analyze `examples/acmevpn.srt`
I. Generate Fix on a failing deterministic row
J. Refresh and confirm the draft returns
K. Submit invalid SRT: input kept, guide highlighted, localized error
L. With Gemini unset or 429: deterministic work remains
M. Narrow / mobile viewport
N. Audience Pulse: paste a few comments and analyze (Gemini required)
O. Audience Pulse: YouTube URL only if `YOUTUBE_API_KEY` is configured

## License

MIT. See `LICENSE`.
