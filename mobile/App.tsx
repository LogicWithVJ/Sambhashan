import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { io, Socket } from "socket.io-client";
import {
  mediaDevices,
  MediaStream,
  RTCIceCandidate,
  RTCPeerConnection,
  RTCSessionDescription,
} from "react-native-webrtc";
import { apiRequest, CallHistory, getSocketUrl, PublicUser, User } from "./src/api";

type Session = { user: User; token: string };
type Call = {
  callId: string;
  role: "caller" | "callee";
  accepted: boolean;
  startedAt: string | null;
  peerName: string;
  peerUserId: string;
};
type Screen = "login" | "register" | "home" | "history" | "call";

function emitWithAck<T>(socket: Socket, event: string, payload: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("The calling service did not respond. Please try again.")),
      10000,
    );
    socket.emit(event, payload, (response: T & { error?: string }) => {
      clearTimeout(timer);
      if (response?.error) reject(new Error(response.error));
      else resolve(response);
    });
  });
}

function ErrorMessage({ children }: { children: string }) {
  return children ? <Text style={styles.error}>{children}</Text> : null;
}

function ActionButton({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        secondary && styles.secondaryButton,
        disabled && styles.disabledButton,
      ]}
    >
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>
        {title}
      </Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "none",
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "words";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholderTextColor="#8492a8"
        secureTextEntry={secureTextEntry}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

function CallView({
  call,
  socket,
  onEnd,
}: {
  call: Call;
  socket: Socket;
  onEnd: () => void;
}) {
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState("Requesting media permission…");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<RTCIceCandidate[]>([]);
  const offerStartedRef = useRef(false);
  const endedRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    const peer = new RTCPeerConnection({
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
      ],
    });
    peerRef.current = peer;

    peer.ontrack = (event) => {
      const streams = (event as typeof event & { streams?: MediaStream[] }).streams;
      if (streams?.[0]) setRemoteStream(streams[0]);
    };
    peer.onicecandidate = (event) => {
      const candidate = (event as typeof event & { candidate?: RTCIceCandidate | null }).candidate;
      if (candidate) {
        socket.emit("call:signal", {
          call_id: call.callId,
          signal: {
            type: "ice-candidate",
            candidate: candidate.toJSON(),
          },
        });
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") setStatus("Connected");
      else if (peer.connectionState === "connecting") setStatus("Connecting…");
      else if (peer.connectionState === "disconnected") setStatus("Connection interrupted…");
      else if (peer.connectionState === "failed") {
        setStatus("Connection failed");
        setError("Could not establish a media connection. Try another network.");
      }
    };

    const sendOffer = async () => {
      if (call.role !== "caller" || offerStartedRef.current) return;
      offerStartedRef.current = true;
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit("call:signal", {
          call_id: call.callId,
          signal: {
            type: "description",
            description: { type: peer.localDescription?.type, sdp: peer.localDescription?.sdp },
          },
        });
      } catch (offerError) {
        setError(`Could not start the call: ${(offerError as Error).message}`);
      }
    };

    const signalHandler = async (event: {
      call_id: string;
      signal: { type: string; description?: RTCSessionDescription; candidate?: RTCIceCandidate };
    }) => {
      if (event.call_id !== call.callId) return;
      const { signal } = event;
      try {
        if (signal.type === "description" && signal.description?.type === "offer") {
          await peer.setRemoteDescription(
            new RTCSessionDescription({
              type: signal.description.type,
              sdp: signal.description.sdp || "",
            }),
          );
          for (const candidate of pendingIceRef.current.splice(0)) {
            await peer.addIceCandidate(candidate);
          }
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          socket.emit("call:signal", {
            call_id: call.callId,
            signal: {
              type: "description",
              description: { type: peer.localDescription?.type, sdp: peer.localDescription?.sdp },
            },
          });
        } else if (signal.type === "description" && signal.description?.type === "answer") {
          await peer.setRemoteDescription(
            new RTCSessionDescription({
              type: signal.description.type,
              sdp: signal.description.sdp || "",
            }),
          );
          for (const candidate of pendingIceRef.current.splice(0)) {
            await peer.addIceCandidate(candidate);
          }
        } else if (signal.type === "ice-candidate" && signal.candidate) {
          const candidate = new RTCIceCandidate(signal.candidate as RTCIceCandidateInit);
          if (peer.remoteDescription) await peer.addIceCandidate(candidate);
          else pendingIceRef.current.push(candidate);
        }
      } catch (signalError) {
        setError(`Call setup failed: ${(signalError as Error).message}`);
      }
    };
    const peerReadyHandler = (event: { call_id: string }) => {
      if (event.call_id === call.callId) void sendOffer();
    };
    const endedHandler = (event: { call_id: string; status: string }) => {
      if (event.call_id !== call.callId) return;
      endedRef.current = true;
    };
    const rejectedHandler = (event: { call_id: string }) => {
      if (event.call_id !== call.callId) return;
      endedRef.current = true;
    };
    socket.on("call:signal", signalHandler);
    socket.on("call:peer-ready", peerReadyHandler);
    socket.on("call:ended", endedHandler);
    socket.on("call:rejected", rejectedHandler);

    async function prepareMedia() {
      try {
        const stream = (await mediaDevices.getUserMedia({ audio: true, video: false })) as MediaStream;
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        stream.getAudioTracks().forEach((track) => peer.addTrack(track, stream));
        setStatus(call.role === "caller" ? "Waiting for answer…" : "Connecting…");
        socket.emit("call:ready", { call_id: call.callId }, (response: { error?: string }) => {
          if (response?.error) setError(response.error);
        });
      } catch (mediaError) {
        const nativeError = mediaError as Error & { name?: string };
        setStatus("Media unavailable");
        setError(
          nativeError.name === "NotAllowedError"
            ? "Allow microphone access in Android settings to call."
            : `Could not access your microphone: ${nativeError.message}`,
        );
      }
    }

    void prepareMedia();
    return () => {
      disposed = true;
      socket.off("call:signal", signalHandler);
      socket.off("call:peer-ready", peerReadyHandler);
      socket.off("call:ended", endedHandler);
      socket.off("call:rejected", rejectedHandler);
      peer.close();
      peerRef.current = null;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (!endedRef.current) socket.emit("call:end", { call_id: call.callId });
    };
  }, [call.callId, call.role, onEnd, socket]);

  useEffect(() => {
    if (!call.startedAt) return undefined;
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - Date.parse(call.startedAt!)) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [call.startedAt]);

  function finishCall() {
    endedRef.current = true;
    socket.emit("call:end", { call_id: call.callId });
    onEnd();
  }

  function toggleMute() {
    const next = !muted;
    streamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  }

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.title}>Voice call</Text>
      <Text style={styles.mutedText}>
        {call.peerName} · {status} {call.startedAt ? `· ${Math.floor(elapsed / 60).toString().padStart(2, "0")}:${(elapsed % 60).toString().padStart(2, "0")}` : ""}
      </Text>
      <ErrorMessage>{error}</ErrorMessage>
      <View style={styles.voiceStage}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{call.peerName.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.title}>{call.peerName}</Text>
        <Text style={styles.mutedText}>{remoteStream ? "Audio connected" : status}</Text>
      </View>
      <View style={styles.buttonRow}>
        <ActionButton title={muted ? "Unmute" : "Mute"} onPress={toggleMute} secondary />
      </View>
      <ActionButton title="End call" onPress={finishCall} />
    </ScrollView>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [session, setSession] = useState<Session | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [searchId, setSearchId] = useState("");
  const [foundUser, setFoundUser] = useState<PublicUser | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Record<string, boolean>>({});
  const [callHistory, setCallHistory] = useState<CallHistory[]>([]);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const finishCallScreen = useCallback(() => {
    setActiveCall(null);
    setScreen("home");
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function restoreSession() {
      try {
        const token = await SecureStore.getItemAsync("access_token");
        if (!token) return;
        const user = await apiRequest<User>("/auth/me", token);
        if (!cancelled) {
          setSession({ user, token });
          setScreen("home");
        }
      } catch (restoreError) {
        setError(`Could not restore your session: ${(restoreError as Error).message}`);
        try {
          await SecureStore.deleteItemAsync("access_token");
        } catch (clearError) {
          setError(`Could not clear the expired session: ${(clearError as Error).message}`);
        }
      }
    }
    void restoreSession();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!session) {
      socket?.disconnect();
      setSocket(null);
      return undefined;
    }
    const connection = io(getSocketUrl(), {
      path: "/socket.io",
      auth: { token: session.token },
      transports: ["websocket"],
    });
    setSocket(connection);
    connection.on("connect_error", (connectError) => {
      setError(`Calling service: ${connectError.message}`);
    });
    connection.on("presence:update", (event: { user_id: string; online: boolean }) => {
      setOnlineUsers((current) => ({ ...current, [event.user_id]: event.online }));
    });
    connection.on("call:incoming", (event: {
      call_id: string;
      caller: { user_id: string; full_name: string };
    }) => {
      Alert.alert(
        "Incoming voice call",
        `${event.caller.full_name} (${event.caller.user_id}) is calling.`,
        [
          {
            text: "Decline",
            style: "destructive",
            onPress: () => {
              connection.emit("call:reject", { call_id: event.call_id }, (response: { error?: string }) => {
                if (response?.error) setError(response.error);
              });
            },
          },
          {
            text: "Accept",
            onPress: async () => {
              try {
                const response = await emitWithAck<{ call_id: string; started_at: string }>(
                  connection,
                  "call:accept",
                  { call_id: event.call_id },
                );
                setActiveCall({
                  callId: event.call_id,
                  role: "callee",
                  accepted: true,
                  startedAt: response.started_at,
                  peerName: event.caller.full_name,
                  peerUserId: event.caller.user_id,
                });
                setScreen("call");
              } catch (acceptError) {
                setError((acceptError as Error).message);
              }
            },
          },
        ],
        { cancelable: false },
      );
    });
    connection.on("call:accepted", (event: { call_id: string; started_at: string }) => {
      setActiveCall((current) => current?.callId === event.call_id
        ? { ...current, accepted: true, startedAt: event.started_at }
        : current);
    });
    connection.on("call:ended", (event: { call_id: string; status: string }) => {
      setActiveCall((current) => {
        if (current?.callId !== event.call_id) return current;
        Alert.alert("Call ended", event.status === "missed" ? "The call was missed." : "The call has ended.");
        setScreen("home");
        return null;
      });
    });
    connection.on("call:rejected", (event: { call_id: string }) => {
      setActiveCall((current) => {
        if (current?.callId !== event.call_id) return current;
        Alert.alert("Call declined", "The other person declined your call.");
        setScreen("home");
        return null;
      });
    });
    return () => {
      connection.disconnect();
      setSocket((current) => current === connection ? null : current);
    };
  }, [session]);

  async function authenticate(isRegister: boolean) {
    setBusy(true);
    setError("");
    try {
      if (isRegister) {
        await apiRequest("/auth/register", undefined, {
          method: "POST",
          body: JSON.stringify({
            full_name: fullName,
            mobile_number: mobile,
            email: email || null,
            password,
          }),
        });
      }
      const result = await apiRequest<User & { access_token: string }>("/auth/mobile-login", undefined, {
        method: "POST",
        body: JSON.stringify({ identifier: isRegister ? mobile : identifier, password }),
      });
      await SecureStore.setItemAsync("access_token", result.access_token);
      setSession({ user: result, token: result.access_token });
      setScreen("home");
      if (isRegister) Alert.alert("Account created", `Your User ID is ${result.user_id}. Save it for future sign-ins.`);
    } catch (authError) {
      setError((authError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await SecureStore.deleteItemAsync("access_token");
    setSession(null);
    setActiveCall(null);
    setScreen("login");
  }

  async function searchUser() {
    if (!session) return;
    setBusy(true);
    setError("");
    setFoundUser(null);
    try {
      const result = await apiRequest<PublicUser>(
        `/users/${encodeURIComponent(searchId.trim())}`,
        session.token,
      );
      setFoundUser(result);
    } catch (searchError) {
      setError((searchError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startCall() {
    if (!socket?.connected || !foundUser) {
      setError("Connect to the calling service and search for an online user first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await emitWithAck<{ call_id: string }>(socket, "call:invite", {
        target_user_id: foundUser.user_id,
        call_type: "voice",
      });
      setActiveCall({
        callId: response.call_id,
        role: "caller",
        accepted: false,
        startedAt: null,
        peerName: foundUser.full_name,
        peerUserId: foundUser.user_id,
      });
      setScreen("call");
    } catch (callError) {
      setError((callError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      setCallHistory(await apiRequest<CallHistory[]>("/calls/history", session.token));
      setScreen("history");
    } catch (historyError) {
      setError((historyError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const online = foundUser ? onlineUsers[foundUser.user_id] : undefined;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <StatusBar style="light" />
      {screen === "login" || screen === "register" ? (
        <ScrollView contentContainerStyle={styles.authPage} keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>SAMBHASHAN</Text>
          <Text style={styles.title}>
            {screen === "login" ? "Connect across languages." : "Create your account"}
          </Text>
          <Text style={styles.mutedText}>
            {screen === "login" ? "Sign in with mobile number or User ID." : "Use your mobile number. Email is optional."}
          </Text>
          <View style={styles.form}>
            {screen === "register" ? (
              <>
                <Field label="Full name" value={fullName} onChangeText={setFullName} autoCapitalize="words" />
                <Field label="Mobile number" value={mobile} onChangeText={setMobile} keyboardType="phone-pad" />
                <Field label="Email (optional)" value={email} onChangeText={setEmail} keyboardType="email-address" />
              </>
            ) : (
              <Field label="Mobile number or User ID" value={identifier} onChangeText={setIdentifier} />
            )}
            <Field label="Password (8+ characters)" value={password} onChangeText={setPassword} secureTextEntry />
            <ErrorMessage>{error}</ErrorMessage>
            <ActionButton
              title={busy ? "Please wait…" : screen === "login" ? "Sign in" : "Create account"}
              onPress={() => void authenticate(screen === "register")}
              disabled={busy}
            />
            {busy && <ActivityIndicator color="#67e8f9" />}
            <Pressable onPress={() => { setError(""); setScreen(screen === "login" ? "register" : "login"); }}>
              <Text style={styles.linkText}>
                {screen === "login" ? "New here? Create an account" : "Already have an account? Sign in"}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : screen === "call" && activeCall && socket ? (
        <CallView
          call={activeCall}
          socket={socket}
          onEnd={finishCallScreen}
        />
      ) : screen === "history" ? (
        <ScrollView contentContainerStyle={styles.page}>
          <Text style={styles.brand}>RECENT CALLS</Text>
          <ActionButton title="Back to dashboard" onPress={() => setScreen("home")} secondary />
          {callHistory.length === 0 ? (
            <Text style={styles.mutedText}>No calls yet.</Text>
          ) : callHistory.map((call) => (
            <View key={call.call_id} style={styles.resultCard}>
              <Text style={styles.resultName}>{call.call_type} · {call.status}</Text>
              <Text style={styles.mutedText}>
                {call.caller_user_id === session?.user.user_id ? "To" : "From"}{" "}
                {call.caller_user_id === session?.user.user_id ? call.receiver_user_id : call.caller_user_id}
              </Text>
              <Text style={styles.mutedText}>
                {new Date(call.created_at).toLocaleString()} · {call.duration_seconds}s
              </Text>
            </View>
          ))}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View>
              <Text style={styles.brand}>SAMBHASHAN</Text>
              <Text style={styles.title}>Hi, {session?.user.full_name}</Text>
              <Text style={styles.mutedText}>Your ID: {session?.user.user_id}</Text>
              <Text style={[styles.mutedText, socket?.connected ? styles.onlineText : styles.error]}>
                {socket?.connected ? "Calling service connected" : "Connecting to calling service…"}
              </Text>
            </View>
            <Pressable onPress={() => void logout()}><Text style={styles.linkText}>Log out</Text></Pressable>
          </View>
          <View style={styles.form}>
            <Text style={styles.sectionTitle}>Find someone</Text>
            <Field label="Search by User ID" value={searchId} onChangeText={setSearchId} />
            <ActionButton title={busy ? "Searching…" : "Search"} onPress={() => void searchUser()} disabled={busy} />
            <ErrorMessage>{error}</ErrorMessage>
            {foundUser && (
              <View style={styles.resultCard}>
                <Text style={styles.resultName}>{foundUser.full_name}</Text>
                <Text style={styles.mutedText}>{foundUser.user_id}</Text>
                <Text style={[styles.mutedText, online ? styles.onlineText : styles.error]}>
                  {online === undefined ? "Status unavailable" : online ? "Online" : "Offline"}
                </Text>
                {foundUser.preferred_language && (
                  <Text style={styles.mutedText}>Language: {foundUser.preferred_language}</Text>
                )}
                {foundUser.user_id !== session?.user.user_id && (
                  <View style={styles.buttonRow}>
                    <ActionButton title="Voice call" onPress={() => void startCall()} disabled={busy || !online || !socket?.connected} />
                  </View>
                )}
              </View>
            )}
            <View style={styles.divider} />
            <ActionButton title="Call history" onPress={() => void loadHistory()} secondary disabled={busy} />
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0f172a" },
  authPage: { flexGrow: 1, justifyContent: "center", padding: 24 },
  page: { flexGrow: 1, padding: 24, paddingTop: 64, gap: 18 },
  brand: { color: "#67e8f9", fontSize: 13, fontWeight: "800", letterSpacing: 3 },
  title: { color: "#f8fafc", fontSize: 28, fontWeight: "800", marginTop: 8 },
  sectionTitle: { color: "#f8fafc", fontSize: 20, fontWeight: "700" },
  mutedText: { color: "#a7b3c6", fontSize: 14, marginTop: 6 },
  form: { gap: 14, marginTop: 28 },
  field: { gap: 7 },
  label: { color: "#dbe5f3", fontSize: 14, fontWeight: "600" },
  input: {
    color: "#f8fafc",
    borderWidth: 1,
    borderColor: "#475569",
    backgroundColor: "#111c30",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  button: {
    minHeight: 48,
    backgroundColor: "#06b6d4",
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { color: "#083344", fontWeight: "800", fontSize: 15 },
  secondaryButton: { backgroundColor: "#1e293b", borderWidth: 1, borderColor: "#475569" },
  secondaryButtonText: { color: "#e2e8f0" },
  disabledButton: { opacity: 0.45 },
  linkText: { color: "#67e8f9", fontWeight: "700", textAlign: "center", padding: 8 },
  error: { color: "#fda4af", fontSize: 14, marginTop: 5 },
  onlineText: { color: "#6ee7b7" },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  resultCard: { borderWidth: 1, borderColor: "#334155", borderRadius: 14, backgroundColor: "#172338", padding: 18, gap: 5 },
  resultName: { color: "#f8fafc", fontSize: 18, fontWeight: "700" },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  divider: { height: 1, backgroundColor: "#334155", marginVertical: 8 },
  voiceStage: { flex: 1, minHeight: 380, alignItems: "center", justifyContent: "center", gap: 12 },
  avatar: { width: 120, height: 120, borderRadius: 60, backgroundColor: "#164e63", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#cffafe", fontSize: 48, fontWeight: "800" },
});
