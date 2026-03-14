import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/AppLayout';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { UserRole } from '@/types/database';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
  requiresEditor?: boolean; // Allows promaster or business_analyst
}

export function ProtectedRoute({ children, requiredRole, requiresEditor = false }: ProtectedRouteProps) {
  const { user, profile, loading, isPromaster, isBusinessAnalyst } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Check for either Azure AD user OR local auth profile
  if (!user && !profile) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check permissions
  let hasPermission = true;
  let requiredRoleText = '';

  if (requiredRole) {
    hasPermission = profile?.role === requiredRole || profile?.role === 'promaster';
    requiredRoleText = requiredRole === 'promaster' ? 'Promasters' : 'Promasters and Business Analysts';
  } else if (requiresEditor) {
    hasPermission = isPromaster || isBusinessAnalyst;
    requiredRoleText = 'Promasters and Business Analysts';
  }

  if (!hasPermission) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
          <Card className="w-full max-w-md">
            <CardHeader>
              <div className="flex items-center gap-2">
                <AlertCircle className="h-6 w-6 text-destructive" />
                <CardTitle>Access Denied</CardTitle>
              </div>
              <CardDescription>
                You don't have permission to access this page
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                This page is only accessible to {requiredRoleText}.
              </p>
              <p className="text-sm text-muted-foreground">
                Your current role: <span className="font-medium capitalize">{profile?.role}</span>
              </p>
              <Button
                onClick={() => window.location.href = '/dashboard'}
                className="w-full"
              >
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return <>{children}</>;
}
