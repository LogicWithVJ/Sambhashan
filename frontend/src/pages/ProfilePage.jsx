import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../lib/api";

const languages = [
  "English",
  "Arabic",
  "Bengali",
  "Chinese",
  "French",
  "Hindi",
  "Japanese",
  "Portuguese",
  "Russian",
  "Spanish",
];

export function ProfilePage() {
  const { setUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    apiRequest("/auth/profile")
      .then((data) => {
        setProfile(data);
        setForm({
          full_name: data.full_name,
          email: data.email || "",
          profile_picture_url: data.profile_picture_url || "",
          preferred_language: data.preferred_language || "",
          country: data.country || "",
        });
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updatedProfile = await apiRequest("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          ...form,
          email: form.email || null,
          profile_picture_url: form.profile_picture_url || null,
          preferred_language: form.preferred_language || null,
          country: form.country || null,
        }),
      });
      setProfile(updatedProfile);
      setForm({
        ...form,
        profile_picture_url: updatedProfile.profile_picture_url || "",
      });
      setUser((current) => ({ ...current, full_name: updatedProfile.full_name }));
      setNotice("Your profile has been updated.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link className="text-sm font-semibold text-cyan-300 hover:underline" to="/dashboard">
        ← Dashboard
      </Link>
      <h1 className="mt-6 text-3xl font-bold">Your profile</h1>
      <p className="mt-2 text-slate-400">Manage the information shown on your account.</p>

      {loading ? (
        <p className="mt-8 text-slate-300" role="status">Loading your profile…</p>
      ) : error && !form ? (
        <p className="mt-8 text-rose-300" role="alert">{error}</p>
      ) : (
        <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-800/70 p-6 sm:p-8">
          <div className="mb-8 flex items-center gap-4">
            {form.profile_picture_url ? (
              <img
                alt={`${profile.full_name}'s profile`}
                className="h-16 w-16 rounded-full object-cover"
                src={form.profile_picture_url}
              />
            ) : (
              <div aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-cyan-950 text-xl font-bold text-cyan-200">
                {profile.full_name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-sm text-slate-400">User ID</p>
              <p className="font-mono font-semibold tracking-wider text-cyan-200">{profile.user_id}</p>
            </div>
          </div>

          <dl className="mb-8 grid gap-4 border-b border-slate-700 pb-8 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-slate-400">Mobile number</dt>
              <dd className="mt-1 font-medium">{profile.mobile_number}</dd>
              <p className="mt-1 text-xs text-slate-500">Visible only to you.</p>
            </div>
            <div>
              <dt className="text-sm text-slate-400">Account created</dt>
              <dd className="mt-1 font-medium">
                {new Date(profile.created_at).toLocaleDateString()}
              </dd>
            </div>
          </dl>

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="field-label">
              Full name
              <input className="field-input" maxLength="120" name="full_name" onChange={updateField} required value={form.full_name} />
            </label>
            <label className="field-label">
              Email <span className="font-normal text-slate-500">(optional)</span>
              <input className="field-input" autoComplete="email" name="email" onChange={updateField} type="email" value={form.email} />
            </label>
            <label className="field-label">
              Profile picture URL <span className="font-normal text-slate-500">(optional)</span>
              <input className="field-input" name="profile_picture_url" onChange={updateField} placeholder="https://example.com/photo.jpg" type="url" value={form.profile_picture_url} />
            </label>
            <label className="field-label">
              Preferred language <span className="font-normal text-slate-500">(optional)</span>
              <select className="field-input" name="preferred_language" onChange={updateField} value={form.preferred_language}>
                <option value="">Select a language</option>
                {languages.map((language) => <option key={language} value={language}>{language}</option>)}
                {form.preferred_language && !languages.includes(form.preferred_language) && (
                  <option value={form.preferred_language}>{form.preferred_language}</option>
                )}
              </select>
            </label>
            <label className="field-label">
              Country or location <span className="font-normal text-slate-500">(optional)</span>
              <input className="field-input" maxLength="100" name="country" onChange={updateField} value={form.country} />
            </label>
            {error && <p className="text-sm text-rose-300" role="alert">{error}</p>}
            {notice && <p className="text-sm text-emerald-300" role="status">{notice}</p>}
            <button className="button-primary" disabled={saving} type="submit">
              {saving ? "Saving…" : "Save profile"}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
