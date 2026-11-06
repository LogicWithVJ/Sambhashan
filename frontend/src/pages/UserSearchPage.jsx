import { useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";

export function UserSearchPage() {
  const [userId, setUserId] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setResult(null);
    setError("");
    setSearching(true);
    try {
      setResult(await apiRequest(`/users/${encodeURIComponent(userId.trim())}`));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link className="text-sm font-semibold text-cyan-300 hover:underline" to="/dashboard">
        ← Dashboard
      </Link>
      <h1 className="mt-6 text-3xl font-bold">Find someone</h1>
      <p className="mt-2 text-slate-400">
        Search by their LinguaConnect User ID. Private contact details are never shown.
      </p>

      <form className="mt-8 flex flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="user-id-search">User ID</label>
        <input
          autoComplete="off"
          className="field-input flex-1"
          id="user-id-search"
          onChange={(event) => setUserId(event.target.value)}
          placeholder="Enter User ID (for example, LC123ABC456)"
          required
          value={userId}
        />
        <button className="button-primary" disabled={searching} type="submit">
          {searching ? "Searching…" : "Search"}
        </button>
      </form>

      {error && <p className="mt-5 text-sm text-rose-300" role="alert">{error}</p>}

      {result && (
        <section className="mt-8 rounded-2xl border border-slate-700 bg-slate-800/70 p-6">
          <div className="flex items-center gap-4">
            {result.profile_picture_url ? (
              <img
                alt={`${result.full_name}'s profile`}
                className="h-16 w-16 rounded-full object-cover"
                src={result.profile_picture_url}
              />
            ) : (
              <div aria-hidden="true" className="grid h-16 w-16 place-items-center rounded-full bg-cyan-950 text-xl font-bold text-cyan-200">
                {result.full_name.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-xl font-semibold">{result.full_name}</h2>
              <p className="mt-1 font-mono text-cyan-200">{result.user_id}</p>
            </div>
          </div>
          <dl className="mt-6 grid gap-4 border-t border-slate-700 pt-5 sm:grid-cols-2">
            {result.preferred_language && (
              <div>
                <dt className="text-sm text-slate-400">Preferred language</dt>
                <dd className="mt-1">{result.preferred_language}</dd>
              </div>
            )}
            {result.country && (
              <div>
                <dt className="text-sm text-slate-400">Country or location</dt>
                <dd className="mt-1">{result.country}</dd>
              </div>
            )}
          </dl>
          <p className="mt-6 text-sm text-slate-400">
            Voice and video call actions will be available in the calling module.
          </p>
        </section>
      )}
    </main>
  );
}
