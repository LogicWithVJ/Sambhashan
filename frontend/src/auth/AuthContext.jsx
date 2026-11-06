import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiRequest } from "../lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      setUser(await apiRequest("/auth/me"));
    } catch (error) {
      if (error.status !== 401) throw error;
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refreshUser()
      .catch((error) => console.error("Could not load the current user.", error))
      .finally(() => setLoading(false));
  }, [refreshUser]);

  const logout = async () => {
    await apiRequest("/auth/logout", { method: "POST" });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, refreshUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
