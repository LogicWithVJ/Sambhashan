import { BrowserRouter, Link, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";

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
        <button className="button-secondary" onClick={logout}>Log out</button>
      </div>
      <section className="mt-10 rounded-2xl border border-slate-700 bg-slate-800/70 p-6">
        <p className="text-sm text-slate-400">Your User ID</p>
        <p className="mt-2 font-mono text-2xl font-semibold tracking-wider text-cyan-200">
          {user.user_id}
        </p>
        <p className="mt-4 text-sm text-slate-400">
          Your account is ready. Profile editing, user search, and calling are planned
          for later Stage 1 modules.
        </p>
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
