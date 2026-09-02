# SponsorGuard AI

Automated QA for creator sponsorships — catch compliance mistakes before publishing.

This repository contains the initial hackathon architecture: a React/Vite frontend and a FastAPI backend. The sponsorship compliance engine is intentionally not implemented yet.

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

## Frontend

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

The Vite development server prints the local application URL. To verify a production build:

```bash
npm run build
```
