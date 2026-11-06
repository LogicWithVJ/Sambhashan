import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { CallProvider, IncomingCallDialog, useCalls } from "./calls/CallContext";
import { CallPage } from "./calls/CallPage";
import { CallHistoryPage } from "./pages/CallHistoryPage";
import { LoginPage } from "./pages/LoginPage";
import { ProfilePage } from "./pages/ProfilePage";
import { RegisterPage } from "./pages/RegisterPage";
import { UserSearchPage } from "./pages/UserSearchPage";

function LandingPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center px-6 py-16">
      <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-cyan-300">
        LinguaConnect
      </p>
      <h1 className="max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl">
        Talk to anyone, wherever they are.
      </h1>
      <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">
        A simpler way to connect across languages. Create an account with your
        mobile number to get started.
      </p>
      <div className="mt-9 flex flex-wrap gap-3">
        <Link className="button-primary" to="/register">Create account</Link>
        <Link className="button-secondary" to="/login">Sign in</Link>
      </div>
    </main>
  );
}

function ProtectedDashboard() {
  const { user, loading, logout } = useAuth();
  const { callNotice, connected } = useCalls();

  if (loading) {
    return <p className="p-8 text-center text-slate-300">Loading your account…</p>;
  }
  if (!user) return <Navigate to="/login" replace />;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
            LinguaConnect
          </p>
          <h1 className="mt-3 text-3xl font-bold">Welcome, {user.full_name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link className="button-secondary" to="/profile">Your profile</Link>
          <button className="button-secondary" onClick={logout}>Log out</button>
        </div>
      </div>
      <section className="mt-10 rounded-2xl border border-slate-700 bg-slate-800/70 p-6">
        <p className="text-sm text-slate-400">Your User ID</p>
        <p className="mt-2 font-mono text-2xl font-semibold tracking-wider text-cyan-200">
          {user.user_id}
        </p>
        <p className="mt-4 text-sm text-slate-400">
          Share your User ID so people can find you and connect with a voice or video call.
        </p>
      </section>
      {callNotice && <p className="mt-4 text-sm text-cyan-200" role="status">{callNotice}</p>}
      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <Link className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 transition hover:border-cyan-700" to="/search">
          <h2 className="text-lg font-semibold">Find someone</h2>
          <p className="mt-2 text-sm text-slate-400">Look up a person using their User ID.</p>
        </Link>
        <Link className="rounded-2xl border border-slate-700 bg-slate-800/70 p-6 transition hover:border-cyan-700" to="/profile">
          <h2 className="text-lg font-semibold">Profile settings</h2>
          <p className="mt-2 text-sm text-slate-400">Update your name, email, picture, and language.</p>
        </Link>
        <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Calling</h2>
            <span className={`text-xs ${connected ? "text-emerald-300" : "text-slate-400"}`}>
              {connected ? "Signaling online" : "Connecting…"}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400">Start voice or video calls from a person’s search result.</p>
          <Link className="mt-4 inline-block text-sm font-semibold text-cyan-300 hover:underline" to="/calls/history">
            View call history →
          </Link>
        </div>
      </section>
    </main>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/dashboard" element={<ProtectedDashboard />} />
      <Route
        path="/calls/history"
        element={(
          <ProtectedRoute>
            <CallHistoryPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/calls/:callId"
        element={(
          <ProtectedRoute>
            <CallPage />
          </ProtectedRoute>
        )}
      />
      <Route
        path="/profile"
        element={(
          <ProfileRoute />
        )}
      />
      <Route
        path="/search"
        element={(
          <ProtectedRoute>
            <UserSearchPage />
          </ProtectedRoute>
        )}
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function ProfileRoute() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-center text-slate-300">Loading your account…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <ProfilePage />;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-center text-slate-300">Loading your account…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CallProvider>
          <AppRoutes />
          <IncomingCallDialog />
        </CallProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
