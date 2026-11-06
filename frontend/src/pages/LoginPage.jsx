import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../lib/api";

export function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await apiRequest("/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password }),
      });
      setUser(await apiRequest("/auth/me"));
      navigate("/dashboard");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <Link className="text-sm font-semibold text-cyan-300" to="/">← LinguaConnect</Link>
        <h1 className="mt-8 text-3xl font-bold">Welcome back</h1>
        <p className="mt-2 text-slate-400">Sign in with your mobile number or User ID.</p>
        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          <label className="field-label">
            Mobile number or User ID
            <input
              autoComplete="username"
              className="field-input"
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Enter mobile number or User ID"
              required
              value={identifier}
            />
          </label>
          <label className="field-label">
            Password
            <input
              autoComplete="current-password"
              className="field-input"
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
          <button className="button-primary w-full" disabled={submitting} type="submit">
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-400">
          New here? <Link className="text-cyan-300 hover:underline" to="/register">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
