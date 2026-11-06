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
| Signaling (planned) | `backend/app/` (separate module) | Socket.IO call invitations and WebRTC signaling |
| WebRTC (planned) | `frontend/src/` (separate module) | Browser media and peer connections |
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
| `backend/app/core/config.py` | Environment-backed settings |
| `backend/app/core/database.py` | SQLAlchemy base, engine creation, request-scoped sessions |
| `backend/app/models/user.py` | User account persistence model |
| `backend/app/schemas/auth.py` | Authentication request/response validation |
| `backend/app/services/auth.py` | Mobile normalization and password hashing/verification |
| `backend/app/{api,core,models,schemas,services}/__init__.py` | Marks backend directories as Python packages |
| `backend/tests/test_auth.py` | Registration, duplicate, login, and authorization tests |
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

## Database

`DATABASE_URL` configures SQLAlchemy. SQLite is the local default; PostgreSQL is
supported with the included psycopg driver. Schema migrations are not yet set up;
the current auth module creates its initial tables when the API starts.
