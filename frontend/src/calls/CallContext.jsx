import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import { useAuth } from "../auth/AuthContext";

const CallContext = createContext(null);

function emitWithAck(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("The calling service did not respond. Please try again.")),
      10000,
    );
    socket.emit(event, payload, (response) => {
      window.clearTimeout(timer);
      resolve(response);
    });
  });
}

export function CallProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const socketRef = useRef(null);
  const activeCallRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [currentCall, setCurrentCall] = useState(null);
  const [presence, setPresence] = useState({});
  const [callNotice, setCallNotice] = useState("");

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    if (!user?.user_id) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      activeCallRef.current = null;
      setConnected(false);
      setIncomingCall(null);
      setCurrentCall(null);
      setPresence({});
      return undefined;
    }

    const socket = io("/", {
      path: "/socket.io",
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("presence:update", ({ user_id, online }) => {
      setPresence((current) => ({ ...current, [user_id]: online }));
    });
    socket.on("call:incoming", (call) => setIncomingCall(call));
    socket.on("call:accepted", (event) => {
      if (activeCallRef.current?.callId !== event.call_id) return;
      const updatedCall = {
        ...activeCallRef.current,
        accepted: true,
        startedAt: event.started_at,
      };
      activeCallRef.current = updatedCall;
      setCurrentCall(updatedCall);
    });
    socket.on("call:rejected", (event) => {
      if (activeCallRef.current?.callId !== event.call_id) return;
      activeCallRef.current = null;
      setCurrentCall(null);
      setCallNotice("Your call was declined.");
      navigateRef.current("/dashboard");
    });
    socket.on("call:ended", (event) => {
      setIncomingCall((current) => current?.call_id === event.call_id ? null : current);
      if (activeCallRef.current?.callId === event.call_id) {
        activeCallRef.current = null;
        setCurrentCall(null);
        setCallNotice(
          event.status === "missed" ? "The call was missed." : "The call has ended.",
        );
        navigateRef.current("/dashboard");
      }
    });
    socket.on("connect_error", () => {
      setConnected(false);
      setCallNotice("Calling service is unavailable. Please try again.");
    });

    return () => {
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      setConnected(false);
    };
  }, [user?.user_id]);

  async function startCall(targetUserId) {
    const socket = socketRef.current;
    if (!socket?.connected) throw new Error("Connecting to the calling service. Try again shortly.");
    setCallNotice("");
    const response = await emitWithAck(
      socket,
      "call:invite",
      { target_user_id: targetUserId, call_type: "voice" },
    );
    if (!response || response.error) {
      throw new Error(response?.error || "Could not start the call.");
    }
    const nextCall = {
      callId: response.call_id,
      role: "caller",
      accepted: false,
      startedAt: null,
    };
    activeCallRef.current = nextCall;
    setCurrentCall(nextCall);
    navigate(`/calls/${response.call_id}`);
  }

  async function acceptCall() {
    const socket = socketRef.current;
    if (!socket?.connected || !incomingCall) {
      throw new Error("The calling service is disconnected.");
    }
    const response = await emitWithAck(
      socket,
      "call:accept",
      { call_id: incomingCall.call_id },
    );
    if (!response || response.error) {
      throw new Error(response?.error || "Could not accept the call.");
    }
    const activeCall = {
      callId: incomingCall.call_id,
      role: "callee",
      accepted: true,
      startedAt: response.started_at,
    };
    activeCallRef.current = activeCall;
    setCurrentCall(activeCall);
    setIncomingCall(null);
    navigate(`/calls/${incomingCall.call_id}`);
  }

  async function rejectCall() {
    if (!incomingCall || !socketRef.current?.connected) return;
    const response = await emitWithAck(
      socketRef.current,
      "call:reject",
      { call_id: incomingCall.call_id },
    );
    if (response?.error) throw new Error(response.error);
    setIncomingCall(null);
  }

  function endCall(callId) {
    socketRef.current?.emit("call:end", { call_id: callId });
    activeCallRef.current = null;
    setCurrentCall(null);
    navigate("/dashboard");
  }

  return (
    <CallContext.Provider
      value={{
        socket: socketRef.current,
        connected,
        incomingCall,
        currentCall,
        presence,
        callNotice,
        setCallNotice,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCalls() {
  const context = useContext(CallContext);
  if (!context) throw new Error("useCalls must be used within CallProvider.");
  return context;
}

export function IncomingCallDialog() {
  const { incomingCall, acceptCall, rejectCall, connected } = useCalls();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!incomingCall) return null;

  async function answer() {
    setBusy(true);
    setError("");
    try {
      await acceptCall();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    setBusy(true);
    setError("");
    try {
      await rejectCall();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="incoming-call-title">
      <section className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-800 p-6 text-center shadow-2xl">
        <p className="text-sm font-semibold uppercase tracking-widest text-cyan-300">
          Incoming voice call
        </p>
        <h2 className="mt-4 text-2xl font-bold" id="incoming-call-title">
          {incomingCall.caller.full_name}
        </h2>
        <p className="mt-1 font-mono text-sm text-slate-400">{incomingCall.caller.user_id}</p>
        {error && <p className="mt-4 text-sm text-rose-300" role="alert">{error}</p>}
        <div className="mt-7 flex justify-center gap-3">
          <button className="button-secondary" disabled={busy} onClick={decline} type="button">
            Decline
          </button>
          <button className="button-primary" disabled={busy || !connected} onClick={answer} type="button">
            {busy ? "Connecting…" : "Answer"}
          </button>
        </div>
      </section>
    </div>
  );
}
