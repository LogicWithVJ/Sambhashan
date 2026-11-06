import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../lib/api";

export function CallHistoryPage() {
  const { user } = useAuth();
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest("/calls/history")
      .then(setCalls)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link className="text-sm font-semibold text-cyan-300 hover:underline" to="/dashboard">
        ← Dashboard
      </Link>
      <h1 className="mt-6 text-3xl font-bold">Call history</h1>
      {loading && <p className="mt-8 text-slate-300" role="status">Loading call history…</p>}
      {error && <p className="mt-8 text-rose-300" role="alert">{error}</p>}
      {!loading && !error && calls.length === 0 && (
        <p className="mt-8 text-slate-400">Your recent calls will appear here.</p>
      )}
      <ul className="mt-6 space-y-3">
        {calls.map((call) => {
          const outgoing = call.caller_user_id === user.user_id;
          const otherUserId = outgoing ? call.receiver_user_id : call.caller_user_id;
          return (
            <li className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-800/70 p-4" key={call.call_id}>
              <div>
                <p className="font-semibold">{outgoing ? "Outgoing" : "Incoming"} {call.call_type} call</p>
                <p className="mt-1 font-mono text-sm text-slate-400">{otherUserId}</p>
                <p className="mt-1 text-xs text-slate-500">{new Date(call.created_at).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="capitalize text-slate-300">{call.status}</p>
                <p className="mt-1 text-sm text-slate-400">{call.duration_seconds}s</p>
              </div>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
