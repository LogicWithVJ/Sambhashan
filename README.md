# Sambhashan (LinguaConnect)

A multilingual voice and video communication platform. Work is currently limited to
Stage 1; AI translation is intentionally out of scope.

## Architecture

```text
frontend/                 React + Vite + Tailwind client
  src/
    auth/                 Authentication context and route protection
    calls/                Socket.IO call state and WebRTC call screen
    pages/                Landing, account, profile, search, and history screens
    lib/                  Backend API client
backend/                  FastAPI application
  app/
    api/                  Authenticated HTTP route handlers
    realtime.py           Authenticated Socket.IO signaling and presence
    core/                 Configuration and database setup
    models/               SQLAlchemy database models
    schemas/              Request and response validation
    services/             Authentication and password utilities
  tests/                  Backend automated tests
docs/                     Architecture and integration notes
```

The backend owns authentication, user data, call history, and Socket.IO signaling.
The frontend calls HTTP endpoints through `/api` and connects to `/socket.io`; Vite
proxies both to FastAPI during local development. WebRTC media is peer-to-peer and
does not depend on AI services. The database URL is configurable for PostgreSQL, with
SQLite as a convenient local development default.

## Stage 1 features currently implemented

- Mobile-number registration, generated User IDs, mobile/User ID login, Argon2
  password hashing, signed HttpOnly session cookie, and logout.
- Private profile viewing/editing and authenticated search by User ID; search results
  omit mobile numbers and email addresses.
- Authenticated Socket.IO call invitations, accept/reject, presence, WebRTC signaling,
  voice/video media, mute/camera controls, call duration, disconnect handling, and
  recent call history.
- Calls are not recorded. Password recovery is not available until a verified
  recovery method is configured.

The Socket.IO signaling state is in-process; run one Uvicorn worker for this version.
Use HTTPS in deployment (required for browser media access outside localhost). The
included public STUN servers may not connect through restrictive networks; reliable
deployment requires a TURN server.

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
Allow microphone/camera access to place a call. Test calling with two signed-in
browsers or devices.

### Run backend tests

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest
```

## Current limitations

There is no TURN server configuration, schema migration framework, password-change or
recovery flow, notification preference management, or production deployment setup.
Voice/video behavior still needs browser/device testing across real networks; the
automated tests cover API privacy and a two-client Socket.IO signaling exchange, not
camera/microphone hardware or end-to-end media quality.
