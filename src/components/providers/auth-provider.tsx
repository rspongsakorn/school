"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { SessionProfile } from "@/lib/auth/session-profile";

type AuthState = {
  profile: SessionProfile | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthState>({ profile: null, isLoading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthState>({ profile: null, isLoading: true });

  const loadProfile = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setState({ profile: null, isLoading: false });
      router.push("/login");
      return;
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id, role, display_name, is_active")
      .eq("id", user.id)
      .maybeSingle();

    if (!profileRow?.is_active) {
      setState({ profile: null, isLoading: false });
      await supabase.auth.signOut();
      router.push("/login?error=inactive");
      return;
    }

    setState({
      profile: {
        id: profileRow.id,
        role: profileRow.role as SessionProfile["role"],
        display_name: profileRow.display_name,
        is_active: profileRow.is_active,
        email: user.email ?? "",
      },
      isLoading: false,
    });
  }, [router]);

  useEffect(() => {
    void loadProfile();

    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setState({ profile: null, isLoading: false });
        router.push("/login");
      }
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        void loadProfile();
      }
    });

    return () => subscription.unsubscribe();
  }, [loadProfile, router]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function useRequireRole(role: SessionProfile["role"] | SessionProfile["role"][]) {
  const { profile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    const roles = Array.isArray(role) ? role : [role];
    if (profile && !roles.includes(profile.role)) {
      router.push("/");
    }
  }, [profile, isLoading, role, router]);
}
