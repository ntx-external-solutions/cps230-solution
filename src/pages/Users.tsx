import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { azureApi } from '@/lib/azureApi';
import { UserPlus, Trash2, KeyRound, AlertCircle, Pencil } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';

interface AppUser {
  id: string;
  email: string;
  full_name: string | null;
  role: 'user' | 'business_analyst' | 'promaster';
  azure_ad_object_id: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateUserFormData {
  email: string;
  displayName: string;
  password: string;
  confirmPassword: string;
  role: 'user' | 'business_analyst' | 'promaster';
  forceChangePassword: boolean;
  jobTitle?: string;
  department?: string;
}

export default function UserManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [resetPasswordDialogOpen, setResetPasswordDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);

  const [formData, setFormData] = useState<CreateUserFormData>({
    email: '',
    displayName: '',
    password: '',
    confirmPassword: '',
    role: 'user',
    forceChangePassword: true,
  });

  const [resetPasswordData, setResetPasswordData] = useState({
    newPassword: '',
    confirmPassword: '',
    forceChangePassword: true,
  });

  const [editFormData, setEditFormData] = useState({
    email: '',
    full_name: '',
  });

  // Fetch local users
  const { data: users, isLoading, error } = useQuery({
    queryKey: ['local-users'],
    queryFn: async () => {
      const response = await azureApi.get('/user-profiles');
      if (response.error) throw new Error(response.error);
      return response.data as AppUser[];
    },
  });

  // Create user mutation
  const createUserMutation = useMutation({
    mutationFn: async (data: CreateUserFormData) => {
      const response = await azureApi.post('/auth/local/users', {
        email: data.email,
        password: data.password,
        full_name: data.displayName,
        role: data.role,
      });
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-users'] });
      setCreateDialogOpen(false);
      setFormData({
        email: '',
        displayName: '',
        password: '',
        confirmPassword: '',
        role: 'user',
        forceChangePassword: true,
      });
      toast({
        title: 'User created',
        description: 'Local user account has been created successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete user mutation
  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const response = await azureApi.delete(`/user-profiles/${userId}`);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-users'] });
      toast({
        title: 'User deleted',
        description: 'User has been deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Reset password mutation
  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: any }) => {
      const response = await azureApi.patch(`/auth/local/users/${userId}/reset-password`, {
        newPassword: data.newPassword,
      });
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      setResetPasswordDialogOpen(false);
      setSelectedUser(null);
      setResetPasswordData({
        newPassword: '',
        confirmPassword: '',
        forceChangePassword: true,
      });
      toast({
        title: 'Password reset',
        description: 'User password has been reset successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update user mutation
  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: any }) => {
      const response = await azureApi.patch(`/user-profiles?id=${userId}`, data);
      if (response.error) throw new Error(response.error);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['local-users'] });
      setEditDialogOpen(false);
      setSelectedUser(null);
      setEditFormData({
        email: '',
        full_name: '',
      });
      toast({
        title: 'User updated',
        description: 'User information has been updated successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleCreateUser = () => {
    // Validation
    if (!formData.email || !formData.displayName || !formData.password) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast({
        title: 'Validation Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    if (formData.password.length < 8) {
      toast({
        title: 'Validation Error',
        description: 'Password must be at least 8 characters long',
        variant: 'destructive',
      });
      return;
    }

    createUserMutation.mutate(formData);
  };

  const handleResetPassword = () => {
    if (!selectedUser) return;

    if (!resetPasswordData.newPassword) {
      toast({
        title: 'Validation Error',
        description: 'Please enter a new password',
        variant: 'destructive',
      });
      return;
    }

    if (resetPasswordData.newPassword !== resetPasswordData.confirmPassword) {
      toast({
        title: 'Validation Error',
        description: 'Passwords do not match',
        variant: 'destructive',
      });
      return;
    }

    if (resetPasswordData.newPassword.length < 8) {
      toast({
        title: 'Validation Error',
        description: 'Password must be at least 8 characters long',
        variant: 'destructive',
      });
      return;
    }

    resetPasswordMutation.mutate({
      userId: selectedUser.id,
      data: resetPasswordData,
    });
  };

  const handleUpdateUser = () => {
    if (!selectedUser) return;

    if (!editFormData.email) {
      toast({
        title: 'Validation Error',
        description: 'Email is required',
        variant: 'destructive',
      });
      return;
    }

    updateUserMutation.mutate({
      userId: selectedUser.id,
      data: {
        email: editFormData.email,
        full_name: editFormData.full_name || null,
      },
    });
  };

  const handleDeleteUser = (user: AppUser) => {
    if (confirm(`Are you sure you want to delete user "${user.email}"? This action cannot be undone.`)) {
      deleteUserMutation.mutate(user.id);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">User Management</h1>
            <p className="text-muted-foreground mt-2">
              Create and manage Azure AD user accounts
            </p>
          </div>

          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <UserPlus className="mr-2 h-4 w-4" />
                Create User
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Local User</DialogTitle>
                <DialogDescription>
                  Create a new user account with email and password authentication
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="user@example.com"
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="displayName">Display Name *</Label>
                  <Input
                    id="displayName"
                    value={formData.displayName}
                    onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                    placeholder="John Doe"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="password">Password *</Label>
                    <Input
                      id="password"
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Minimum 8 characters"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="confirmPassword">Confirm Password *</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      placeholder="Re-enter password"
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="role">Application Role</Label>
                  <Select
                    value={formData.role}
                    onValueChange={(value: any) => setFormData({ ...formData, role: value })}
                  >
                    <SelectTrigger id="role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User (View Only)</SelectItem>
                      <SelectItem value="business_analyst">Business Analyst (Can Edit)</SelectItem>
                      <SelectItem value="promaster">Promaster (Full Admin)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="jobTitle">Job Title (Optional)</Label>
                    <Input
                      id="jobTitle"
                      value={formData.jobTitle || ''}
                      onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                      placeholder="e.g., Business Analyst"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="department">Department (Optional)</Label>
                    <Input
                      id="department"
                      value={formData.department || ''}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder="e.g., Finance"
                    />
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="forceChangePassword"
                    checked={formData.forceChangePassword}
                    onCheckedChange={(checked) =>
                      setFormData({ ...formData, forceChangePassword: checked })
                    }
                  />
                  <Label htmlFor="forceChangePassword">
                    Require password change on first sign-in
                  </Label>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreateUser} disabled={createUserMutation.isPending}>
                  {createUserMutation.isPending ? 'Creating...' : 'Create User'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>About User Management</AlertTitle>
          <AlertDescription>
            Users created here will use email/password authentication stored in the database.
            Organizational users with Azure AD can still sign in using their Microsoft account (SSO).
            Both authentication methods provide access to the same application.
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Application Users</CardTitle>
            <CardDescription>
              All users with access to the CPS230 application
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="text-center py-8 text-muted-foreground">Loading users...</div>
            )}

            {error && (
              <div className="text-center py-8 text-destructive">
                Error loading users: {error.message}
              </div>
            )}

            {users && users.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                No users found. Create your first user to get started.
              </div>
            )}

            {users && users.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Auth Type</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">{user.full_name || 'N/A'}</TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'promaster' ? 'default' : user.role === 'business_analyst' ? 'secondary' : 'outline'}>
                          {user.role === 'promaster' ? 'Promaster' : user.role === 'business_analyst' ? 'Business Analyst' : 'User'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {user.azure_ad_object_id && <Badge variant="outline">SSO</Badge>}
                          <Badge variant="outline">Password</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user);
                              setEditFormData({
                                email: user.email,
                                full_name: user.full_name || '',
                              });
                              setEditDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedUser(user);
                              setResetPasswordDialogOpen(true);
                            }}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDeleteUser(user)}
                            disabled={deleteUserMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Reset Password Dialog */}
        <Dialog open={resetPasswordDialogOpen} onOpenChange={setResetPasswordDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Reset password for {selectedUser?.full_name || selectedUser?.email}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  value={resetPasswordData.newPassword}
                  onChange={(e) =>
                    setResetPasswordData({ ...resetPasswordData, newPassword: e.target.value })
                  }
                  placeholder="Minimum 8 characters"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="confirmNewPassword">Confirm Password</Label>
                <Input
                  id="confirmNewPassword"
                  type="password"
                  value={resetPasswordData.confirmPassword}
                  onChange={(e) =>
                    setResetPasswordData({ ...resetPasswordData, confirmPassword: e.target.value })
                  }
                  placeholder="Re-enter password"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Switch
                  id="forceChangePasswordReset"
                  checked={resetPasswordData.forceChangePassword}
                  onCheckedChange={(checked) =>
                    setResetPasswordData({ ...resetPasswordData, forceChangePassword: checked })
                  }
                />
                <Label htmlFor="forceChangePasswordReset">
                  Require password change on next sign-in
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setResetPasswordDialogOpen(false);
                  setSelectedUser(null);
                  setResetPasswordData({
                    newPassword: '',
                    confirmPassword: '',
                    forceChangePassword: true,
                  });
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleResetPassword}
                disabled={resetPasswordMutation.isPending}
              >
                {resetPasswordMutation.isPending ? 'Resetting...' : 'Reset Password'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit User Dialog */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user information for {selectedUser?.full_name || selectedUser?.email}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="editEmail">Email Address</Label>
                <Input
                  id="editEmail"
                  type="email"
                  value={editFormData.email}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, email: e.target.value })
                  }
                  placeholder="user@example.com"
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="editFullName">Display Name</Label>
                <Input
                  id="editFullName"
                  value={editFormData.full_name}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, full_name: e.target.value })
                  }
                  placeholder="John Doe"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setEditDialogOpen(false);
                  setSelectedUser(null);
                  setEditFormData({
                    email: '',
                    full_name: '',
                  });
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpdateUser}
                disabled={updateUserMutation.isPending}
              >
                {updateUserMutation.isPending ? 'Updating...' : 'Update User'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
