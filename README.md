# Sambhashan

LinguaConnect is a multilingual voice and video communication platform. Development is
currently limited to Stage 1; AI translation is intentionally out of scope.

## Architecture

```text
frontend/                 React + Vite + Tailwind client
  src/
    auth/                 Authentication context and route protection
    pages/                Landing, registration, login, and dashboard screens
    lib/                  Backend API client
backend/                  FastAPI application
  app/
    api/                  HTTP route handlers
    core/                 Configuration and database setup
    models/               SQLAlchemy database models
    schemas/              Request and response validation
    services/             Authentication and password utilities
  tests/                  Backend automated tests
docs/                     Architecture and integration notes
```

The backend owns authentication and user data. The frontend calls it through `/api`;
Vite proxies that prefix to FastAPI during local development. Future signaling and
WebRTC modules will be separate from authentication and will not depend on AI services.
The database URL is configurable for PostgreSQL, with SQLite as a convenient local
development default.

## Stage 1, module 1: authentication

This module provides mobile-number registration, generated User IDs, mobile/User ID
login, Argon2 password hashing, an HttpOnly signed session cookie, logout, and a
protected `/api/auth/me` endpoint. Email is optional. Recovery is not enabled because
there is no verified recovery method.

### Run the backend (PowerShell)

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:SECRET_KEY = "replace-with-a-long-random-secret"
$env:DATABASE_URL = "sqlite:///./linguaconnect.db"
uvicorn app.main:app --reload
```

For PostgreSQL, set `DATABASE_URL` to a SQLAlchemy URL such as
`postgresql+psycopg://user:password@localhost:5432/linguaconnect` before starting
FastAPI. Use a securely generated secret and HTTPS in deployment; set
`COOKIE_SECURE=true` when serving over HTTPS.

### Run the frontend (a second PowerShell terminal)

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL (normally `http://localhost:5173`). Register with a mobile number
and password, note the generated User ID, and try signing in with either identifier.

### Run backend tests

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest
```

## Current scope and next modules

Only the authentication foundation is implemented. Profile editing, user search,
presence, call history, Socket.IO signaling, and WebRTC are not yet implemented.
Profile viewing/editing and the initial dashboard are implemented. The next module
should add user search; calling should then be developed independently of any future
translation service.
