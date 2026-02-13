import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { checkOrCreateAccount, extractEmailDomain } from '@/lib/accounts';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showAccountDialog, setShowAccountDialog] = useState(false);
  const [accountName, setAccountName] = useState('');
  const [pendingSignup, setPendingSignup] = useState<{
    email: string;
    password: string;
    fullName: string;
  } | null>(null);
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // First, check if account exists for this email domain
      const accountCheck = await checkOrCreateAccount(email);

      if (accountCheck.isFirstUser) {
        // This is the first user - need to get account name
        setPendingSignup({ email, password, fullName });
        setAccountName(extractEmailDomain(email)); // Default to domain name
        setShowAccountDialog(true);
        setLoading(false);
      } else {
        // Account exists, proceed with signup
        await signUp(email, password, fullName, accountCheck.accountId, false);
        toast({
          title: 'Success',
          description: 'Account created successfully! Please check your email to confirm.',
        });
        navigate('/login');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create account',
        variant: 'destructive',
      });
      setLoading(false);
    }
  };

  const handleAccountNameSubmit = async () => {
    if (!accountName.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter an account name',
        variant: 'destructive',
      });
      return;
    }

    if (!pendingSignup) return;

    setLoading(true);
    try {
      // Create account with the provided name
      const accountCheck = await checkOrCreateAccount(
        pendingSignup.email,
        accountName.trim()
      );

      // Now create the user
      await signUp(
        pendingSignup.email,
        pendingSignup.password,
        pendingSignup.fullName,
        accountCheck.accountId,
        true // This is the first user (promaster)
      );

      setShowAccountDialog(false);
      toast({
        title: 'Success',
        description: 'Account created successfully! You have been assigned as the administrator. Please check your email to confirm.',
      });
      navigate('/login');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create account',
        variant: 'destructive',
      });
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
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
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
              Create a new account to access the application
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="John Doe"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your.email@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  minLength={6}
                />
                <p className="text-xs text-muted-foreground">
                  Password must be at least 6 characters
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating account...' : 'Sign Up'}
              </Button>
            </form>

            <div className="mt-4 text-center text-sm">
              <span className="text-muted-foreground">Already have an account? </span>
              <Link to="/login" className="text-accent hover:underline font-medium">
                Sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Account Name Dialog */}
      <Dialog open={showAccountDialog} onOpenChange={setShowAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Your Account Name</DialogTitle>
            <DialogDescription>
              You're the first user from your organization. Please provide a name for your account.
              All users with email addresses from{' '}
              <strong>@{pendingSignup && extractEmailDomain(pendingSignup.email)}</strong> will be
              part of this account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="accountName">Account Name</Label>
              <Input
                id="accountName"
                placeholder="e.g., Acme Corporation"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleAccountNameSubmit();
                  }
                }}
              />
              <p className="text-sm text-muted-foreground">
                This will be the name shown to all users in your organization.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowAccountDialog(false);
                setPendingSignup(null);
              }}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button onClick={handleAccountNameSubmit} disabled={loading}>
              {loading ? 'Creating Account...' : 'Create Account'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
