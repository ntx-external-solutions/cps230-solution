import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { userProfilesApi } from '@/lib/api';
import { UserProfile, UserRole } from '@/types/database';
import { Pencil, Trash2, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function Users() {
  const { profile, isPromaster } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [addFormData, setAddFormData] = useState({
    email: '',
    password: '',
    full_name: '',
    role: 'user' as UserRole,
  });
  const [editFormData, setEditFormData] = useState({
    full_name: '',
    role: 'user' as UserRole,
  });

  useEffect(() => {
    if (profile?.account_id) {
      fetchUsers();
    }
  }, [profile?.account_id]);

  const fetchUsers = async () => {
    if (!profile?.account_id) return;

    try {
      setLoading(true);
      const data = await userProfilesApi.getAll();
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async () => {
    if (!profile?.account_id) return;

    // Validate inputs
    if (!addFormData.email || !addFormData.password) {
      toast({
        title: 'Error',
        description: 'Email and password are required',
        variant: 'destructive',
      });
      return;
    }

    if (addFormData.password.length < 6) {
      toast({
        title: 'Error',
        description: 'Password must be at least 6 characters',
        variant: 'destructive',
      });
      return;
    }

    try {
      // Call the edge function to create the user
      const { data, error } = await supabase.functions.invoke('create-user', {
        body: {
          email: addFormData.email,
          password: addFormData.password,
          full_name: addFormData.full_name || null,
          role: addFormData.role,
          account_id: profile.account_id,
        },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Failed to create user');

      toast({
        title: 'Success',
        description: 'User created successfully',
      });

      setIsAddDialogOpen(false);
      resetAddForm();
      fetchUsers();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to create user',
        variant: 'destructive',
      });
    }
  };

  const handleUpdateUser = async () => {
    if (!selectedUser) return;

    try {
      await userProfilesApi.update(selectedUser.id, {
        full_name: editFormData.full_name || null,
        role: editFormData.role,
      });

      toast({
        title: 'Success',
        description: 'User updated successfully',
      });

      setIsEditDialogOpen(false);
      setSelectedUser(null);
      resetEditForm();
      fetchUsers();
    } catch (error: any) {
      console.error('Error updating user:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update user',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      await userProfilesApi.delete(selectedUser.id);

      toast({
        title: 'Success',
        description: 'User removed successfully',
      });

      setIsDeleteDialogOpen(false);
      setSelectedUser(null);
      fetchUsers();
    } catch (error: any) {
      console.error('Error deleting user:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete user',
        variant: 'destructive',
      });
    }
  };

  const openEditDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setEditFormData({
      full_name: user.full_name || '',
      role: user.role,
    });
    setIsEditDialogOpen(true);
  };

  const openDeleteDialog = (user: UserProfile) => {
    setSelectedUser(user);
    setIsDeleteDialogOpen(true);
  };

  const resetAddForm = () => {
    setAddFormData({
      email: '',
      password: '',
      full_name: '',
      role: 'user',
    });
  };

  const resetEditForm = () => {
    setEditFormData({
      full_name: '',
      role: 'user',
    });
  };

  const getRoleLabel = (role: UserRole) => {
    switch (role) {
      case 'promaster':
        return 'Promaster';
      case 'business_analyst':
        return 'Business Analyst';
      case 'user':
        return 'User';
      default:
        return role;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">User Management</h2>
            <p className="text-muted-foreground">
              Manage user access and permissions
            </p>
          </div>
          {isPromaster && (
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              className="bg-nintex-orange hover:bg-nintex-orange-hover"
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Users</CardTitle>
            <CardDescription>
              View and manage user roles (User, Business Analyst, Promaster)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-[200px] items-center justify-center">
                <p className="text-muted-foreground">Loading users...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="flex h-[200px] items-center justify-center border-2 border-dashed border-muted-foreground/25 rounded-lg bg-muted/10">
                <p className="text-muted-foreground">No users found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Created</TableHead>
                    {isPromaster && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell className="font-medium">
                        {user.full_name || 'N/A'}
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{getRoleLabel(user.role)}</TableCell>
                      <TableCell>
                        {new Date(user.created_at).toLocaleDateString()}
                      </TableCell>
                      {isPromaster && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(user)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteDialog(user)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Add User Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[525px]">
          <DialogHeader>
            <DialogTitle>Add New User</DialogTitle>
            <DialogDescription>
              Create a new user account for your organization
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add_email">
                Email <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add_email"
                type="email"
                value={addFormData.email}
                onChange={(e) =>
                  setAddFormData({ ...addFormData, email: e.target.value })
                }
                placeholder="user@example.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add_password">
                Password <span className="text-destructive">*</span>
              </Label>
              <Input
                id="add_password"
                type="password"
                value={addFormData.password}
                onChange={(e) =>
                  setAddFormData({ ...addFormData, password: e.target.value })
                }
                placeholder="Minimum 6 characters"
              />
              <p className="text-xs text-muted-foreground">
                User can change this password after first login
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="add_full_name">Full Name</Label>
              <Input
                id="add_full_name"
                value={addFormData.full_name}
                onChange={(e) =>
                  setAddFormData({ ...addFormData, full_name: e.target.value })
                }
                placeholder="John Doe"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="add_role">Role</Label>
              <Select
                value={addFormData.role}
                onValueChange={(value) =>
                  setAddFormData({ ...addFormData, role: value as UserRole })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="business_analyst">Business Analyst</SelectItem>
                  <SelectItem value="promaster">Promaster</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddDialogOpen(false);
                resetAddForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddUser}
              className="bg-nintex-orange hover:bg-nintex-orange-hover"
            >
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information and role
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <p className="text-sm text-muted-foreground">{selectedUser.email}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_full_name">Full Name</Label>
                <Input
                  id="edit_full_name"
                  value={editFormData.full_name}
                  onChange={(e) =>
                    setEditFormData({ ...editFormData, full_name: e.target.value })
                  }
                  placeholder="John Doe"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit_role">Role</Label>
                <Select
                  value={editFormData.role}
                  onValueChange={(value) =>
                    setEditFormData({ ...editFormData, role: value as UserRole })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="business_analyst">Business Analyst</SelectItem>
                    <SelectItem value="promaster">Promaster</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateUser}
              className="bg-nintex-orange hover:bg-nintex-orange-hover"
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete User Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this user? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {selectedUser && (
            <div className="py-4">
              <p className="text-sm">
                <strong>Name:</strong> {selectedUser.full_name || 'N/A'}
              </p>
              <p className="text-sm">
                <strong>Email:</strong> {selectedUser.email}
              </p>
              <p className="text-sm">
                <strong>Role:</strong> {getRoleLabel(selectedUser.role)}
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteUser}>
              Delete User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
