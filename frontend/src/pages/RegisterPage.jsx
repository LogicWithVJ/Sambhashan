import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";

export function RegisterPage() {
  const [form, setForm] = useState({
    full_name: "",
    mobile_number: "",
    email: "",
    password: "",
    confirm_password: "",
  });
  const [createdUserId, setCreatedUserId] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    if (form.password !== form.confirm_password) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiRequest("/auth/register", {
        method: "POST",
        body: JSON.stringify({
          full_name: form.full_name,
          mobile_number: form.mobile_number,
          email: form.email || null,
          password: form.password,
        }),
      });
      setCreatedUserId(result.user_id);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (createdUserId) {
    return (
      <main className="auth-layout">
        <section className="auth-card">
          <p className="text-sm font-semibold uppercase tracking-widest text-emerald-300">
            Account created
          </p>
          <h1 className="mt-4 text-3xl font-bold">Your LinguaConnect ID</h1>
          <p className="mt-3 text-slate-300">
            Save this ID. You can use it with your password to sign in.
          </p>
          <p className="mt-6 rounded-xl bg-slate-900 p-4 text-center font-mono text-2xl font-bold tracking-widest text-cyan-200">
            {createdUserId}
          </p>
          <Link className="button-primary mt-7 w-full" to="/login">Continue to sign in</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <Link className="text-sm font-semibold text-cyan-300" to="/">← LinguaConnect</Link>
        <h1 className="mt-8 text-3xl font-bold">Create your account</h1>
        <p className="mt-2 text-slate-400">A mobile number is required. Email is optional.</p>
        <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
          <label className="field-label">
            Full name
            <input className="field-input" maxLength="120" name="full_name" onChange={updateField} required value={form.full_name} />
          </label>
          <label className="field-label">
            Mobile number
            <input className="field-input" autoComplete="tel" name="mobile_number" onChange={updateField} placeholder="+1 202 555 0198" required value={form.mobile_number} />
          </label>
          <label className="field-label">
            Email <span className="font-normal text-slate-500">(optional)</span>
            <input className="field-input" autoComplete="email" name="email" onChange={updateField} type="email" value={form.email} />
          </label>
          <label className="field-label">
            Password
            <input className="field-input" autoComplete="new-password" minLength="8" name="password" onChange={updateField} required type="password" value={form.password} />
          </label>
          <label className="field-label">
            Confirm password
            <input className="field-input" autoComplete="new-password" minLength="8" name="confirm_password" onChange={updateField} required type="password" value={form.confirm_password} />
          </label>
          {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
          <button className="button-primary w-full" disabled={submitting} type="submit">
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="mt-6 text-sm text-slate-400">
          Already registered? <Link className="text-cyan-300 hover:underline" to="/login">Sign in</Link>
        </p>
      </section>
    </main>
  );
}
