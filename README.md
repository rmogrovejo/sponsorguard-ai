# SponsorGuard AI

Automated QA for creator sponsorships — catch compliance mistakes before publishing.

This monorepo contains a React/Vite review workspace and a FastAPI deterministic compliance API. Reviewers can configure sponsorship requirements, submit an SRT transcript, and inspect timestamped PASS/WARNING/FAIL findings.

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

The frontend calls `http://127.0.0.1:8000` by default. Override the API origin with `VITE_SPONSORGUARD_API_URL`; see `frontend/.env.example`.
