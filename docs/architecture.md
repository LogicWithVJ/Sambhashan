# LinguaConnect architecture

## Stage boundaries

- **Stage 1:** accounts, profiles, user discovery, presence, one-to-one voice/video,
  signaling, and call history.
- **Stage 2:** speech recognition, translation, subtitles, and translated audio.
- **Stage 3:** performance, broader testing, optimization, and deployment.

No Stage 2 feature is part of the current implementation.

## Components

| Component | Location | Responsibility |
|---|---|---|
| Web client | `frontend/` | React UI, navigation, authenticated HTTP calls |
| API | `backend/app/api/` | HTTP endpoints and request authorization |
| Authentication | `backend/app/services/` | Password hashing and signed session tokens |
| Persistence | `backend/app/models/`, `backend/app/core/database.py` | SQLAlchemy models and database sessions |
| Signaling | `backend/app/realtime.py` | Authenticated Socket.IO presence, invitations, and WebRTC signaling |
| WebRTC | `frontend/src/calls/` | Browser media, peer connections, and call controls |
| Call history | `backend/app/models/call.py`, `backend/app/api/calls.py` | Metadata-only call records; no media is stored |
| Translation (planned) | Separate Stage 2 service | Must not be required for calls to work |

## Folder and file responsibilities

| Path | Purpose |
|---|---|
| `README.md` | Project overview and local setup/test commands |
| `.gitignore` | Excludes local environments, dependencies, databases, and build output |
| `docs/architecture.md` | Architecture boundaries and component responsibilities |
| `backend/requirements.txt` | Python runtime and test dependencies |
| `backend/.env.example` | Example configuration keys; replace development values |
| `backend/app/main.py` | FastAPI app factory, database lifecycle, health endpoint, route registration |
| `backend/app/api/auth.py` | Registration, login, logout, session validation, current-user endpoint |
| `backend/app/api/users.py` | Authenticated User ID search returning public profile fields only |
| `backend/app/api/calls.py` | Authenticated recent call history endpoint |
| `backend/app/realtime.py` | Cookie-authenticated Socket.IO, presence, invitations, and signaling relays |
| `backend/app/core/config.py` | Environment-backed settings |
| `backend/app/core/database.py` | SQLAlchemy base, engine creation, request-scoped sessions |
| `backend/app/models/user.py` | User account persistence model |
| `backend/app/models/call.py` | Call metadata history model |
| `backend/app/schemas/auth.py` | Authentication and private profile request/response validation |
| `backend/app/schemas/users.py` | Public profile response without email or mobile number |
| `backend/app/schemas/calls.py` | Call history response validation |
| `backend/app/services/auth.py` | Mobile normalization and password hashing/verification |
| `backend/app/{api,core,models,schemas,services}/__init__.py` | Marks backend directories as Python packages |
| `backend/tests/test_auth.py` | Registration, login, authorization, profile, and user-search tests |
| `backend/tests/test_calls.py` | Call history, signaling, and two-client Socket.IO integration tests |
| `frontend/package.json` | Frontend scripts and dependency manifest |
| `frontend/package-lock.json` | Reproducible npm dependency resolution |
| `frontend/vite.config.js` | Vite React/Tailwind plugins and development API proxy |
| `frontend/index.html` | Browser document shell |
| `frontend/src/main.jsx` | React application bootstrap |
| `frontend/src/App.jsx` | Client routes, landing page, and protected dashboard |
| `frontend/src/auth/AuthContext.jsx` | Current-user state and logout action |
| `frontend/src/lib/api.js` | Credentialed API requests and error handling |
| `frontend/src/pages/LoginPage.jsx` | Mobile/User ID sign-in form |
| `frontend/src/pages/RegisterPage.jsx` | Registration form and generated-ID confirmation |
| `frontend/src/pages/ProfilePage.jsx` | Authenticated profile view and edit form |
| `frontend/src/pages/UserSearchPage.jsx` | Authenticated User ID search and public profile result |
| `frontend/src/pages/CallHistoryPage.jsx` | Authenticated call history |
| `frontend/src/calls/CallContext.jsx` | Socket.IO connection, presence, and invitation state |
| `frontend/src/calls/CallPage.jsx` | WebRTC peer connection, media controls, and call duration |
| `frontend/src/styles.css` | Tailwind import and shared responsive/auth styles |

## Authentication flow

Registration stores a normalized mobile number, optional email, generated User ID,
and Argon2 password hash. Login accepts either mobile number or User ID and returns
a signed token in an HttpOnly, SameSite=Lax cookie. Authenticated requests send that
cookie automatically. The frontend does not persist the token in browser storage.

The cookie is configured as Secure only when `COOKIE_SECURE=true`; enable that setting
in HTTPS deployments. The development default is not suitable for production.
Password recovery is deliberately not advertised or exposed until a verified
recovery channel is configured.

The authenticated profile endpoints (`GET` and `PATCH /api/auth/profile`) expose the
current account's phone number only to that account. Profile edits support name,
optional email, picture URL, preferred language, and country/location. Public user
discovery uses a separate response that omits private contact information.

Socket.IO authenticates the same signed session cookie as the HTTP API. Call
invitations, participant membership, and all signaling relays are validated server-side.
Offer/answer descriptions and ICE candidates are relayed only between the two call
participants. WebRTC media uses DTLS-SRTP peer connections and is not sent through or
recorded by the API server. Google STUN servers are configured for initial connectivity;
TURN is not configured.

Presence and active-call state currently live in process memory. Run one Uvicorn worker;
multi-worker or multi-instance deployment requires shared presence/call coordination.
The current startup uses SQLAlchemy `create_all`; existing databases need migrations
before schema changes are deployed to production.

## Database

`DATABASE_URL` configures SQLAlchemy. SQLite is the local default; PostgreSQL is
supported with the included psycopg driver. Schema migrations are not yet set up;
the current auth module creates its initial tables when the API starts.
