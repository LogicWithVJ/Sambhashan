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
mobile/                   Expo Android client with native WebRTC
  src/                    API client and API URL configuration
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
- The `mobile/` folder contains an Android-first React Native app with secure token
  storage and native WebRTC. It requires an Expo development build; Expo Go is not
  supported for native calls.

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

### Run the Android mobile app

See [mobile/README.md](./mobile/README.md) for phone/emulator connection instructions.

Install Android Studio with the Android SDK and platform tools. In Android Studio,
create/start an emulator, or connect an Android phone with USB debugging enabled.
Native WebRTC is not available in Expo Go; install a development build:

```powershell
cd mobile
npm install
npx expo install --check
npx expo run:android
```

For a physical phone, configure the laptop's local IPv4 address (find it with
`ipconfig`) in `mobile/.env.local`, using this format:

```text
EXPO_PUBLIC_API_URL=http://192.168.1.10:8000
```

Use the actual IPv4 address of the laptop and keep the phone and laptop on the same
Wi-Fi. On Android Emulator, the default `http://10.0.2.2:8000` reaches the host laptop.
Run FastAPI so the phone can reach it:

```powershell
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --reload
```

Allow Python/Uvicorn through Windows Firewall on a private network if prompted. Rebuild
the Android development app after changing native dependencies or permissions. After
the first install, `cd mobile; npm start` starts Metro for JS-only edits.

The mobile app supports registration/sign-in, profile-independent User ID search,
online status, incoming/outgoing voice and video calls, mute, camera toggle/switch,
and call history. A physical phone can call a browser or another phone signed into a
different account.

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
