import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';

export default function Login() {
  const { signInWithMicrosoft, signInWithEmail, profile } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If user is already authenticated, redirect to dashboard
  useEffect(() => {
    if (profile) {
      navigate('/dashboard');
    }
  }, [profile, navigate]);

  const handleMicrosoftSignIn = async () => {
    try {
      setError(null);
      setLoading(true);
      await signInWithMicrosoft();
    } catch (error) {
      console.error('Microsoft sign in error:', error);
      setError(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email || !password) {
      setError('Please enter both email and password');
      return;
    }

    try {
      setError(null);
      setLoading(true);
      await signInWithEmail(email, password);

      // Explicitly navigate after successful login
      console.log('Login successful, navigating to dashboard');
      navigate('/dashboard');
    } catch (error) {
      console.error('Email sign in error:', error);
      setError(error instanceof Error ? error.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="h-12 w-12 rounded-lg bg-nintex-navy flex items-center justify-center">
              <svg
                className="h-8 w-8 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a 2 2 0 0 1 -2 -2V5a 2 2 0 0 1 2 -2h5.586a 1 1 0 0 1 .707 .293l5.414 5.414a 1 1 0 0 1 .293 .707V19a 2 2 0 0 1 -2 2z"
                />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold">CPS230 Critical Operations</h1>
          <p className="text-muted-foreground mt-2">Sign in to your account</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign In</CardTitle>
            <CardDescription>
              Choose your authentication method
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Tabs defaultValue="email" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="email">Email</TabsTrigger>
                <TabsTrigger value="microsoft">Microsoft SSO</TabsTrigger>
              </TabsList>

              <TabsContent value="email" className="space-y-4 mt-4">
                <form onSubmit={handleEmailSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      autoComplete="current-password"
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-nintex-orange hover:bg-nintex-orange-hover"
                    disabled={loading}
                  >
                    {loading ? 'Signing in...' : 'Sign In with Email'}
                  </Button>
                </form>

                <div className="text-xs text-muted-foreground text-center">
                  For local users created by administrators
                </div>
              </TabsContent>

              <TabsContent value="microsoft" className="space-y-4 mt-4">
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    Sign in using your organizational Microsoft account.
                  </p>
                  <p>
                    You'll be redirected to the Microsoft sign-in page.
                  </p>
                </div>

                <Button
                  onClick={handleMicrosoftSignIn}
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                  disabled={loading}
                >
                  <svg className="mr-2 h-5 w-5" viewBox="0 0 21 21" fill="currentColor">
                    <rect x="1" y="1" width="9" height="9" fill="currentColor" />
                    <rect x="1" y="11" width="9" height="9" fill="currentColor" />
                    <rect x="11" y="1" width="9" height="9" fill="currentColor" />
                    <rect x="11" y="11" width="9" height="9" fill="currentColor" />
                  </svg>
                  {loading ? 'Redirecting...' : 'Sign In with Microsoft'}
                </Button>

                <div className="text-xs text-muted-foreground text-center">
                  For users with organizational Azure AD accounts
                </div>
              </TabsContent>
            </Tabs>

            <div className="mt-6 text-center text-sm">
              <span className="text-muted-foreground">Need help? </span>
              <span className="text-accent font-medium">
                Contact your administrator
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
