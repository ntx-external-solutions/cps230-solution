import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { userProfilesApi } from '@/lib/api';
import type { UserProfile } from '@/types/database';
import { createUserProfileWithAccount } from '@/lib/accounts';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    fullName: string | undefined,
    accountId: string,
    isFirstUser: boolean
  ) => Promise<void>;
  signOut: () => Promise<void>;
  isPromaster: boolean;
  isBusinessAnalyst: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchUserProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchUserProfile = async (userId: string) => {
    try {
      const data = await userProfilesApi.getByUserId(userId);
      setProfile(data);
    } catch (error) {
      console.error('Error fetching user profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string | undefined,
    accountId: string,
    isFirstUser: boolean
  ) => {
    // Create the auth user first
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
        // Disable email confirmation for development - remove this in production
        emailRedirectTo: window.location.origin,
      },
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('Failed to create user');

    // Create the user profile with account association
    try {
      await createUserProfileWithAccount(
        authData.user.id,
        email,
        accountId,
        isFirstUser,
        fullName
      );
    } catch (profileError: any) {
      // If profile creation fails, we should ideally delete the auth user
      // but Supabase doesn't allow that from the client side
      console.error('Failed to create user profile:', profileError);
      throw new Error(`Account created but profile setup failed: ${profileError.message}`);
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const isPromaster = profile?.role === 'promaster';
  const isBusinessAnalyst = profile?.role === 'business_analyst' || isPromaster;

  const value = {
    user,
    profile,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    isPromaster,
    isBusinessAnalyst,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
