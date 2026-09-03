# SponsorGuard AI

Automated QA for creator sponsorships — catch compliance mistakes before publishing.

This monorepo contains a React/Vite review workspace and a FastAPI compliance API. Reviewers can extract a human-reviewable checklist from a sponsor brief, correct it, submit an SRT transcript, and inspect grounded PASS/WARNING/FAIL/NOT EVALUATED findings. Deterministic rules remain authoritative; two explicit semantic rule types use isolated AI verification with source-index grounding and reviewable failure states.

## Project structure

```text
sponsorguard-ai/
├── frontend/        React, TypeScript, Vite, and Tailwind CSS
├── backend/         FastAPI, Pydantic, and pytest
├── LICENSE
└── README.md
```

## Backend

From the repository root:

```bash
cd backend
python -m venv .venv
```

Activate the virtual environment:

```powershell
# Windows PowerShell
.\.venv\Scripts\Activate.ps1
```

```bash
# macOS/Linux
source .venv/bin/activate
```

Install dependencies, run the tests, and start the API:

```bash
python -m pip install -r requirements.txt
python -m pytest
python -m uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`. Check it with `GET /health`.
The deterministic review endpoint is `POST /api/v1/compliance/analyze`.
The optional brief-extraction endpoint is `POST /api/v1/briefs/extract`; see `backend/.env.example` and `backend/README.md` for backend-only provider configuration.

## Frontend

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

The Vite development server prints the local application URL. To verify a production build:

```bash
npm run typecheck
npm test
npm run build
```

The frontend calls `http://127.0.0.1:8000` by default. Override the API origin with `VITE_SPONSORGUARD_API_URL`; see `frontend/.env.example`. Provider keys must never be placed in the frontend environment.
