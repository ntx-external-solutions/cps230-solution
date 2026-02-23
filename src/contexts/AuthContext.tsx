import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  PublicClientApplication,
  AccountInfo,
  InteractionRequiredAuthError,
  AuthenticationResult,
} from '@azure/msal-browser';
import { MsalProvider, useMsal, useIsAuthenticated } from '@azure/msal-react';
import { azureApi, setAccessTokenProvider } from '@/lib/azureApi';
import type { UserProfile } from '@/types/database';

// MSAL Configuration for Azure AD
const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_AZURE_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_AZURE_TENANT_ID}`,
    redirectUri: import.meta.env.VITE_REDIRECT_URI || window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage' as const,
    storeAuthStateInCookie: false,
  },
};

const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};

// Create MSAL instance
export const msalInstance = new PublicClientApplication(msalConfig);

interface AuthContextType {
  user: AccountInfo | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signUp: () => Promise<void>;
  signOut: () => Promise<void>;
  isPromaster: boolean;
  isBusinessAnalyst: boolean;
  getAccessToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Inner provider that uses MSAL hooks
function AuthProviderInner({ children }: { children: React.ReactNode }) {
  const { instance, accounts } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const user = accounts.length > 0 ? accounts[0] : null;

  // Get ID token for API calls (ID token is used for backend authentication)
  const getAccessToken = async (): Promise<string> => {
    if (!user) {
      throw new Error('No authenticated user');
    }

    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account: user,
      });
      // Return ID token instead of access token for backend authentication
      // ID token has our client ID as the audience, access token is for Microsoft Graph
      return response.idToken;
    } catch (error) {
      if (error instanceof InteractionRequiredAuthError) {
        // Fallback to interactive method
        const response = await instance.acquireTokenPopup({
          ...loginRequest,
          account: user,
        });
        return response.idToken;
      }
      throw error;
    }
  };

  // Set up the access token provider for the API client
  useEffect(() => {
    setAccessTokenProvider(getAccessToken);
  }, [user]);

  // Fetch user profile when authenticated
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (!isAuthenticated || !user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // Get or create user profile
        const azureAdObjectId = user.localAccountId || user.homeAccountId;
        const email = user.username;

        // Try to create/update user profile
        const result = await azureApi.createUser({
          azure_ad_object_id: azureAdObjectId,
          email: email,
          full_name: user.name || undefined,
        });

        if (result.error) {
          console.error('Error creating/updating user profile:', result.error);
          // Still set a basic profile from Azure AD data
          setProfile({
            id: azureAdObjectId,
            azure_ad_object_id: azureAdObjectId,
            email: email,
            full_name: user.name || null,
            role: 'user',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as UserProfile);
        } else {
          setProfile(result.data);
        }
      } catch (error) {
        console.error('Error fetching user profile:', error);
        // Set basic profile from Azure AD
        if (user) {
          setProfile({
            id: user.localAccountId || user.homeAccountId,
            azure_ad_object_id: user.localAccountId || user.homeAccountId,
            email: user.username,
            full_name: user.name || null,
            role: 'user',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as UserProfile);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchUserProfile();
  }, [isAuthenticated, user]);

  const signIn = async () => {
    try {
      console.log('Starting login with request:', loginRequest);
      console.log('Current MSAL accounts:', accounts);

      // Try popup first for better error visibility
      try {
        const response = await instance.loginPopup(loginRequest);
        console.log('Login successful:', response);
      } catch (popupError) {
        console.log('Popup failed, trying redirect:', popupError);
        await instance.loginRedirect(loginRequest);
      }
    } catch (error) {
      console.error('Login failed:', error);
      alert(`Login error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  };

  const signUp = async () => {
    // Azure AD sign-up flow - users sign up through the sign-in page
    await signIn();
  };

  const signOut = async () => {
    try {
      const logoutRequest = {
        account: user,
        postLogoutRedirectUri: window.location.origin,
      };
      await instance.logoutRedirect(logoutRequest);
    } catch (error) {
      console.error('Logout failed:', error);
      throw error;
    }
  };

  const isPromaster = profile?.role === 'promaster';
  const isBusinessAnalyst = profile?.role === 'business_analyst' || isPromaster;

  const value = {
    user,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    isPromaster,
    isBusinessAnalyst,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Main provider that wraps with MsalProvider
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [msalReady, setMsalReady] = useState(false);
  const [msalError, setMsalError] = useState<string | null>(null);

  useEffect(() => {
    const initializeMsal = async () => {
      try {
        console.log('Initializing MSAL with config:', {
          clientId: msalConfig.auth.clientId,
          authority: msalConfig.auth.authority,
          redirectUri: msalConfig.auth.redirectUri,
        });
        await msalInstance.initialize();
        console.log('MSAL initialized successfully');
        setMsalReady(true);
      } catch (error) {
        console.error('MSAL initialization failed:', error);
        setMsalError(error instanceof Error ? error.message : 'Unknown error');
      }
    };

    initializeMsal();
  }, []);

  if (msalError) {
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h3>Authentication Error</h3>
        <p>Failed to initialize authentication: {msalError}</p>
        <pre>{JSON.stringify(msalConfig, null, 2)}</pre>
      </div>
    );
  }

  if (!msalReady) {
    return <div style={{ padding: '20px' }}>Initializing authentication...</div>;
  }

  return (
    <MsalProvider instance={msalInstance}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </MsalProvider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
