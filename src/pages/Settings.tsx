import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useSettings, useUpdateSetting, useSyncProcessManager, useSyncHistory, useLatestSync, useCancelSync } from '@/hooks/useSettings';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, Clock, Plus, Trash2, Edit2, Check, X as XIcon } from 'lucide-react';

interface Region {
  name: string;
  label: string;
  icon?: string;
}

export default function Settings() {
  const { profile } = useAuth();
  const { data: settings = [], isLoading } = useSettings(['pm_site_url', 'pm_username', 'pm_password', 'pm_tenant_id', 'regions']);
  const updateSettings = useUpdateSetting();
  const syncPM = useSyncProcessManager();
  const cancelSync = useCancelSync();
  const { data: latestSync } = useLatestSync();

  // Poll sync history when there's an active sync
  const isSyncing = latestSync?.status === 'in_progress';
  const { data: syncHistory = [] } = useSyncHistory(isSyncing ? 10000 : undefined);

  // Nintex PM settings
  const [siteUrl, setSiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');

  // Regions settings
  const [regions, setRegions] = useState<Region[]>([]);
  const [newRegionName, setNewRegionName] = useState('');
  const [newRegionLabel, setNewRegionLabel] = useState('');
  const [newRegionIcon, setNewRegionIcon] = useState('');
  const [editingRegionIndex, setEditingRegionIndex] = useState<number | null>(null);
  const [editRegionLabel, setEditRegionLabel] = useState('');
  const [editRegionIcon, setEditRegionIcon] = useState('');

  // General settings
  const [accountName, setAccountName] = useState('');
  const [accountDomain, setAccountDomain] = useState('');
  const [accountId, setAccountId] = useState('');
  const [isLoadingAccount, setIsLoadingAccount] = useState(true);

  useEffect(() => {
    if (settings.length > 0) {
      setSiteUrl((settings.find(s => s.key === 'pm_site_url')?.value as string) || '');
      setUsername((settings.find(s => s.key === 'pm_username')?.value as string) || '');
      setPassword((settings.find(s => s.key === 'pm_password')?.value as string) || '');
      setTenantId((settings.find(s => s.key === 'pm_tenant_id')?.value as string) || '');

      const regionsData = settings.find(s => s.key === 'regions')?.value as Region[] | undefined;
      setRegions(regionsData || []);
    }
  }, [settings]);

  // Load account data - disabled for Azure AD implementation
  useEffect(() => {
    // Azure AD implementation doesn't use separate accounts table
    // Account info is managed through Azure AD tenant
    setIsLoadingAccount(false);
  }, []);

  const handleSaveConnection = async () => {
    try {
      // TODO: SECURITY - Implement encryption for password before saving
      // Use Supabase Vault or client-side encryption
      // For now, passwords are stored in plaintext (SECURITY RISK)
      await updateSettings.mutateAsync([
        { key: 'pm_site_url', value: siteUrl },
        { key: 'pm_username', value: username },
        { key: 'pm_password', value: password }, // ⚠️ PLAINTEXT PASSWORD
        { key: 'pm_tenant_id', value: tenantId },
      ]);
      toast.success('Connection settings saved successfully');
    } catch (error) {
      toast.error('Failed to save connection settings');
      console.error(error);
    }
  };

  const handleSyncNow = async () => {
    try {
      await syncPM.mutateAsync();
      toast.success('Sync started! Check the Sync History below for progress.');
    } catch (error: any) {
      toast.error(`Failed to start sync: ${error?.message || 'Unknown error'}`);
      console.error(error);
    }
  };

  const handleCancelSync = async () => {
    if (!latestSync?.id) return;

    try {
      await cancelSync.mutateAsync(latestSync.id);
      toast.success('Sync cancelled');
    } catch (error: any) {
      toast.error(`Failed to cancel sync: ${error?.message || 'Unknown error'}`);
      console.error(error);
    }
  };

  const handleAddRegion = async () => {
    if (!newRegionName.trim() || !newRegionLabel.trim()) {
      toast.error('Region name and label are required');
      return;
    }

    if (regions.some(r => r.name === newRegionName.trim())) {
      toast.error('A region with this name already exists');
      return;
    }

    const newRegions = [...regions, {
      name: newRegionName.trim(),
      label: newRegionLabel.trim(),
      icon: newRegionIcon.trim() || undefined
    }];

    try {
      await updateSettings.mutateAsync([{ key: 'regions', value: newRegions }]);
      setRegions(newRegions);
      setNewRegionName('');
      setNewRegionLabel('');
      setNewRegionIcon('');
      toast.success('Region added successfully');
    } catch (error) {
      toast.error('Failed to add region');
      console.error(error);
    }
  };

  const handleDeleteRegion = async (index: number) => {
    const newRegions = regions.filter((_, i) => i !== index);
    try {
      await updateSettings.mutateAsync([{ key: 'regions', value: newRegions }]);
      setRegions(newRegions);
      toast.success('Region deleted successfully');
    } catch (error) {
      toast.error('Failed to delete region');
      console.error(error);
    }
  };

  const handleStartEditRegion = (index: number) => {
    setEditingRegionIndex(index);
    setEditRegionLabel(regions[index].label);
    setEditRegionIcon(regions[index].icon || '');
  };

  const handleSaveEditRegion = async (index: number) => {
    if (!editRegionLabel.trim()) {
      toast.error('Region label is required');
      return;
    }

    const newRegions = [...regions];
    newRegions[index] = {
      ...newRegions[index],
      label: editRegionLabel.trim(),
      icon: editRegionIcon.trim() || undefined
    };

    try {
      await updateSettings.mutateAsync([{ key: 'regions', value: newRegions }]);
      setRegions(newRegions);
      setEditingRegionIndex(null);
      toast.success('Region updated successfully');
    } catch (error) {
      toast.error('Failed to update region');
      console.error(error);
    }
  };

  const handleCancelEditRegion = () => {
    setEditingRegionIndex(null);
    setEditRegionLabel('');
    setEditRegionIcon('');
  };

  const handleUpdateAccount = async () => {
    // Account management is handled through Azure AD tenant
    // This functionality is not available in the Azure AD implementation
    toast({
      title: 'Not Available',
      description: 'Account settings are managed through Azure AD. Contact your administrator.',
    });
  };

  const getSyncStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-orange-600" />;
      case 'in_progress':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Settings</h2>
          <p className="text-muted-foreground">
            Configure application settings and integrations
          </p>
        </div>

        <Tabs defaultValue="nintex" className="space-y-6">
          <TabsList>
            <TabsTrigger value="nintex">Nintex Process Manager</TabsTrigger>
            <TabsTrigger value="regions">Regions</TabsTrigger>
            <TabsTrigger value="general">General</TabsTrigger>
          </TabsList>

          <TabsContent value="nintex">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Nintex Process Manager Connection</CardTitle>
                  <CardDescription>
                    Configure connection to your Nintex Process Manager environment
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-40">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="site-url">Site URL</Label>
                        <Input
                          id="site-url"
                          type="text"
                          placeholder="demo.promapp.com"
                          value={siteUrl}
                          onChange={(e) => setSiteUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Your Process Manager site URL (without https://)
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="tenant-id">Tenant ID</Label>
                        <Input
                          id="tenant-id"
                          type="text"
                          placeholder="93555a16ceb24f139a6e8a40618d3f8b"
                          value={tenantId}
                          onChange={(e) => setTenantId(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Your tenant ID from the Process Manager URL
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="username">Username</Label>
                        <Input
                          id="username"
                          type="text"
                          placeholder="user@example.com"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <div className="flex space-x-2">
                          <Button
                            className="bg-nintex-orange hover:bg-nintex-orange-hover"
                            onClick={handleSaveConnection}
                            disabled={updateSettings.isPending}
                          >
                            {updateSettings.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Connection
                          </Button>
                          <Button
                            variant="outline"
                            onClick={handleSyncNow}
                            disabled={syncPM.isPending || isSyncing || !siteUrl || !tenantId || !username || !password}
                          >
                            {(syncPM.isPending || isSyncing) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isSyncing ? 'Syncing...' : 'Sync Now'}
                          </Button>
                          {isSyncing && (
                            <Button
                              variant="destructive"
                              onClick={handleCancelSync}
                              disabled={cancelSync.isPending}
                            >
                              Cancel Sync
                            </Button>
                          )}
                        </div>
                        {isSyncing && latestSync && (
                          <div className="space-y-2">
                            <p className="text-sm text-blue-600 flex items-center gap-2">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Sync in progress... You can navigate away, it will continue in the background.
                            </p>
                            {latestSync.total_batches > 1 && (
                              <p className="text-xs text-muted-foreground">
                                Batch {latestSync.current_batch || 1} of {latestSync.total_batches}
                              </p>
                            )}
                            {latestSync.total_processes > 0 && (
                              <div className="space-y-1">
                                <p className="text-sm text-muted-foreground">
                                  Processed {latestSync.processed_count || 0} of {latestSync.total_processes} processes
                                </p>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{
                                      width: `${((latestSync.processed_count || 0) / latestSync.total_processes) * 100}%`
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Sync History</CardTitle>
                  <CardDescription>
                    Recent synchronization attempts with Process Manager
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {syncHistory.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      No sync history available
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {syncHistory.map((sync) => (
                        <div
                          key={sync.id}
                          className="flex items-start justify-between border-b pb-4 last:border-0"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              {getSyncStatusIcon(sync.status)}
                              <span className="font-medium capitalize">{sync.status}</span>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {sync.records_synced} records synced
                            </p>
                            {sync.error_message && (
                              <p className="text-sm text-red-600">{sync.error_message}</p>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground text-right">
                            <p>{new Date(sync.started_at).toLocaleString()}</p>
                            <p className="text-xs">by {sync.initiated_by}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="regions">
            <Card>
              <CardHeader>
                <CardTitle>Regions Management</CardTitle>
                <CardDescription>
                  Configure regions available for assignment to processes and controls
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Add New Region */}
                <div className="space-y-4 p-4 border rounded-lg bg-muted/50">
                  <h3 className="font-medium text-sm">Add New Region</h3>
                  <div className="grid gap-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="new-region-name">Region Name (ID)</Label>
                        <Input
                          id="new-region-name"
                          placeholder="EMEA"
                          value={newRegionName}
                          onChange={(e) => setNewRegionName(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Internal identifier (uppercase, no spaces)</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-region-label">Display Label</Label>
                        <Input
                          id="new-region-label"
                          placeholder="Europe, Middle East, and Africa"
                          value={newRegionLabel}
                          onChange={(e) => setNewRegionLabel(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Human-readable label</p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="new-region-icon">Icon (Optional)</Label>
                        <Input
                          id="new-region-icon"
                          placeholder="🌍"
                          value={newRegionIcon}
                          onChange={(e) => setNewRegionIcon(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">Emoji or icon code</p>
                      </div>
                    </div>
                    <Button
                      onClick={handleAddRegion}
                      disabled={updateSettings.isPending}
                      className="w-fit"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Region
                    </Button>
                  </div>
                </div>

                {/* Existing Regions */}
                <div className="space-y-3">
                  <h3 className="font-medium text-sm">Current Regions</h3>
                  {regions.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8 border-2 border-dashed rounded-lg">
                      No regions configured yet. Add your first region above.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {regions.map((region, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                          {editingRegionIndex === index ? (
                            <div className="flex-1 grid grid-cols-3 gap-4">
                              <div>
                                <Input
                                  value={region.name}
                                  disabled
                                  className="bg-muted"
                                />
                              </div>
                              <div>
                                <Input
                                  value={editRegionLabel}
                                  onChange={(e) => setEditRegionLabel(e.target.value)}
                                  placeholder="Display Label"
                                />
                              </div>
                              <div>
                                <Input
                                  value={editRegionIcon}
                                  onChange={(e) => setEditRegionIcon(e.target.value)}
                                  placeholder="Icon"
                                />
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-4">
                              {region.icon && <span className="text-2xl">{region.icon}</span>}
                              <div>
                                <p className="font-medium">{region.label}</p>
                                <p className="text-sm text-muted-foreground">{region.name}</p>
                              </div>
                            </div>
                          )}
                          <div className="flex items-center gap-2">
                            {editingRegionIndex === index ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleSaveEditRegion(index)}
                                  disabled={updateSettings.isPending}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={handleCancelEditRegion}
                                >
                                  <XIcon className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleStartEditRegion(index)}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleDeleteRegion(index)}
                                  disabled={updateSettings.isPending}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>
                  Manage your organization account information
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoadingAccount ? (
                  <div className="flex items-center justify-center h-40">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="account-name">Account Name</Label>
                      <Input
                        id="account-name"
                        type="text"
                        placeholder="Organization Name"
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        The name of your organization
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="account-domain">Email Domain</Label>
                      <Input
                        id="account-domain"
                        type="text"
                        value={accountDomain}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">
                        All users with this email domain belong to this account (cannot be changed)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>Account ID</Label>
                      <Input
                        type="text"
                        value={accountId}
                        disabled
                        className="bg-muted font-mono text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Unique identifier for this account
                      </p>
                    </div>

                    <Button
                      onClick={handleUpdateAccount}
                      disabled={!accountName.trim()}
                    >
                      Save Account Settings
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
