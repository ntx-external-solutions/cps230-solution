import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Signup() {
  const { signUp, user } = useAuth();

  // If user is already authenticated, redirect to dashboard
  useEffect(() => {
    if (user) {
      window.location.href = '/dashboard';
    }
  }, [user]);

  const handleSignUp = async () => {
    try {
      // With Azure AD SSO, sign-up redirects to Microsoft authentication
      // First-time users will be registered automatically
      await signUp();
    } catch (error) {
      console.error('Sign up error:', error);
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
          <p className="text-muted-foreground mt-2">Create your account</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Sign Up</CardTitle>
            <CardDescription>
              Create a new account using Azure AD
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                This application uses Azure Active Directory for secure authentication.
              </p>
              <p>
                Click the button below to be redirected to the Microsoft sign-in page.
              </p>
            </div>

            <Button
              onClick={handleSignUp}
              className="w-full bg-nintex-orange hover:bg-nintex-orange-hover"
            >
              Sign In with Azure AD
            </Button>

            <div className="mt-4 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link to="/login" className="text-accent hover:underline font-medium">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
