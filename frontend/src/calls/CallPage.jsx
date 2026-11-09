import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCalls } from "./CallContext";

const iceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export function CallPage() {
  const { callId } = useParams();
  const { socket, connected, currentCall, endCall } = useCalls();
  const navigate = useNavigate();
  const [remoteStream, setRemoteStream] = useState(null);
  const [status, setStatus] = useState("Requesting microphone permission…");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const remoteAudioRef = useRef(null);
  const peerRef = useRef(null);
  const streamRef = useRef(null);
  const queuedSignalsRef = useRef([]);
  const pendingIceRef = useRef([]);
  const acceptedRef = useRef(currentCall?.accepted ?? false);
  const offerStartedRef = useRef(false);
  const endedRef = useRef(false);
  const role = currentCall?.callId === callId ? currentCall.role : null;
  const startedAt = currentCall?.callId === callId ? currentCall.startedAt : null;

  const sendSignal = useCallback((signal) => {
    if (!socket?.connected) {
      setError("Connection to the calling service was lost.");
      return;
    }
    socket.emit("call:signal", { call_id: callId, signal }, (response) => {
      if (response?.error) setError(response.error);
    });
  }, [callId, socket]);

  const processSignal = useCallback(async (signal) => {
    const peer = peerRef.current;
    if (!peer) {
      queuedSignalsRef.current.push(signal);
      return;
    }
    try {
      if (signal.type === "description" && signal.description?.type === "offer") {
        await peer.setRemoteDescription(new RTCSessionDescription(signal.description));
        for (const candidate of pendingIceRef.current.splice(0)) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        sendSignal({
          type: "description",
          description: { type: peer.localDescription.type, sdp: peer.localDescription.sdp },
        });
      } else if (signal.type === "description" && signal.description?.type === "answer") {
        await peer.setRemoteDescription(new RTCSessionDescription(signal.description));
        for (const candidate of pendingIceRef.current.splice(0)) {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } else if (signal.type === "ice-candidate" && signal.candidate) {
        if (peer.remoteDescription) {
          await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          pendingIceRef.current.push(signal.candidate);
        }
      }
    } catch (signalError) {
      setError(`Could not establish the call: ${signalError.message}`);
    }
  }, [sendSignal]);

  const createOffer = useCallback(async () => {
    const peer = peerRef.current;
    if (!peer || offerStartedRef.current) return;
    offerStartedRef.current = true;
    try {
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      sendSignal({
        type: "description",
        description: { type: peer.localDescription.type, sdp: peer.localDescription.sdp },
      });
    } catch (offerError) {
      setError(`Could not start the call: ${offerError.message}`);
    }
  }, [sendSignal]);

  useEffect(() => {
    if (!role) {
      setError("This call is not active in this browser session.");
      setStatus("Call unavailable");
      return undefined;
    }
    if (!socket) {
      setError("Connecting to the calling service…");
      return undefined;
    }
    let disposed = false;

    const acceptedHandler = (event) => {
      if (event.call_id !== callId || role !== "caller") return;
      acceptedRef.current = true;
      setStatus("Connecting…");
    };
    const peerReadyHandler = (event) => {
      if (event.call_id === callId && role === "caller") createOffer();
    };
    const signalHandler = (event) => {
      if (event.call_id === callId) processSignal(event.signal);
    };
    const endedHandler = (event) => {
      if (event.call_id !== callId) return;
      endedRef.current = true;
      navigate("/dashboard");
    };
    socket.on("call:accepted", acceptedHandler);
    socket.on("call:peer-ready", peerReadyHandler);
    socket.on("call:signal", signalHandler);
    socket.on("call:ended", endedHandler);

    async function prepareMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const peer = new RTCPeerConnection({ iceServers });
        peerRef.current = peer;
        stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
        peer.ontrack = (event) => {
          const [incomingStream] = event.streams;
          if (incomingStream) setRemoteStream(incomingStream);
        };
        peer.onicecandidate = (event) => {
          if (event.candidate) {
            sendSignal({ type: "ice-candidate", candidate: event.candidate.toJSON() });
          }
        };
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === "connected") setStatus("Connected");
          else if (peer.connectionState === "connecting") setStatus("Connecting…");
          else if (peer.connectionState === "disconnected") setStatus("Connection interrupted…");
          else if (peer.connectionState === "failed") {
            setStatus("Connection failed");
            setError("The network connection could not be established. Check your network and try again.");
          }
        };
        for (const signal of queuedSignalsRef.current.splice(0)) {
          await processSignal(signal);
        }
        setStatus(acceptedRef.current ? "Connecting…" : "Waiting for answer…");
        socket.emit("call:ready", { call_id: callId }, (response) => {
          if (response?.error) setError(response.error);
        });
      } catch (mediaError) {
        if (disposed) return;
        setStatus("Microphone unavailable");
        setError(
          mediaError.name === "NotAllowedError"
            ? "Allow microphone access to join this call."
            : `Could not access your microphone: ${mediaError.message}`,
        );
      }
    }

    prepareMedia();
    return () => {
      disposed = true;
      socket.off("call:accepted", acceptedHandler);
      socket.off("call:peer-ready", peerReadyHandler);
      socket.off("call:signal", signalHandler);
      socket.off("call:ended", endedHandler);
      peerRef.current?.close();
      peerRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (!endedRef.current) socket.emit("call:end", { call_id: callId });
    };
  }, [callId, createOffer, navigate, processSignal, role, sendSignal, socket]);

  useEffect(() => {
    if (currentCall?.callId === callId && currentCall.accepted) {
      acceptedRef.current = true;
    }
  }, [callId, currentCall]);

  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      remoteAudioRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    if (!startedAt) return undefined;
    const updateDuration = () => {
      setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(startedAt)) / 1000)));
    };
    updateDuration();
    const timer = window.setInterval(updateDuration, 1000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  function toggleMute() {
    const nextMuted = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !nextMuted; });
    setMuted(nextMuted);
  }

  function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
    const remaining = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remaining}`;
  }

  function leaveCall() {
    endedRef.current = true;
    endCall(callId);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col px-6 py-12">
      <header className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Sambhashan voice call
        </p>
        <h1 className="mt-4 text-3xl font-bold">{currentCall?.peerName || "One-to-one call"}</h1>
        <p className="mt-2 text-sm text-slate-400">
          {status}{startedAt ? ` · ${formatDuration(elapsed)}` : ""}
          {!connected ? " · Signaling disconnected" : ""}
        </p>
      </header>
      {error && <p className="mt-6 rounded-lg bg-rose-950/60 p-3 text-sm text-rose-200" role="alert">{error}</p>}
      <section className="my-auto py-16 text-center">
        <div aria-hidden="true" className="mx-auto grid h-36 w-36 place-items-center rounded-full bg-cyan-950 text-5xl font-bold text-cyan-200">
          {currentCall?.peerName?.slice(0, 1).toUpperCase() || "•"}
        </div>
        <p className="mt-6 text-slate-300">
          {remoteStream ? "Voice connected" : status}
        </p>
        <audio autoPlay ref={remoteAudioRef} />
      </section>
      <div className="flex justify-center gap-3">
        <button className="button-secondary" onClick={toggleMute} type="button">
          {muted ? "Unmute microphone" : "Mute microphone"}
        </button>
        <button className="rounded-lg bg-rose-600 px-5 py-3 font-semibold text-white hover:bg-rose-500" onClick={leaveCall} type="button">
          End call
        </button>
      </div>
    </main>
  );
}
