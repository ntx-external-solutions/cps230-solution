import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSettings, useUpdateSetting, useSyncProcessManager, useSyncHistory, useLatestSync, useCancelSync } from '@/hooks/useSettings';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, XCircle, Clock, AlertTriangle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function Settings() {
  const { profile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { data: settings = [], isLoading } = useSettings(['pm_site_url', 'pm_username', 'pm_password', 'pm_tenant_id', 'sync_scope', 'dashboard_filters_expanded']);
  const updateSettings = useUpdateSetting();
  const syncPM = useSyncProcessManager();
  const cancelSync = useCancelSync();
  const { data: latestSync } = useLatestSync(true); // Enable polling only on Settings page

  // Poll sync history when there's an active sync
  const isSyncing = latestSync?.status === 'in_progress';
  const { data: syncHistory = [] } = useSyncHistory(isSyncing ? 10000 : undefined);

  // Nintex PM settings
  const [siteUrl, setSiteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [tenantId, setTenantId] = useState('');

  // Sync scope setting
  const [syncScope, setSyncScope] = useState('cps230_only');

  // Sync scope warning dialog
  const [scopeWarningOpen, setScopeWarningOpen] = useState(false);
  const [pendingSyncScope, setPendingSyncScope] = useState<string | null>(null);

  // General settings
  const [accountName, setAccountName] = useState('');
  const [isLoadingAccount, setIsLoadingAccount] = useState(true);
  const [dashboardFiltersExpanded, setDashboardFiltersExpanded] = useState(false);

  useEffect(() => {
    if (settings.length > 0) {
      setSiteUrl((settings.find(s => s.key === 'pm_site_url')?.value as string) || '');
      setUsername((settings.find(s => s.key === 'pm_username')?.value as string) || '');
      setPassword((settings.find(s => s.key === 'pm_password')?.value as string) || '');
      setTenantId((settings.find(s => s.key === 'pm_tenant_id')?.value as string) || '');
      setSyncScope((settings.find(s => s.key === 'sync_scope')?.value as string) || 'cps230_only');
      setDashboardFiltersExpanded((settings.find(s => s.key === 'dashboard_filters_expanded')?.value as boolean) ?? false);
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
        { key: 'sync_scope', value: syncScope },
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

  const handleUpdateAccount = async () => {
    // Account management is handled through Azure AD tenant
    // This functionality is not available in the Azure AD implementation
    toast({
      title: 'Not Available',
      description: 'Account settings are managed through Azure AD. Contact your administrator.',
    });
  };

  const handleToggleDashboardFilters = async (checked: boolean) => {
    setDashboardFiltersExpanded(checked);
    try {
      await updateSettings.mutateAsync([
        { key: 'dashboard_filters_expanded', value: checked }
      ]);
      toast.success('Dashboard filters setting updated');
    } catch (error) {
      toast.error('Failed to update dashboard filters setting');
      console.error(error);
      // Revert on error
      setDashboardFiltersExpanded(!checked);
    }
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
                        <Label htmlFor="site-url">Base URL</Label>
                        <Input
                          id="site-url"
                          type="text"
                          placeholder="demo.promapp.com"
                          value={siteUrl}
                          onChange={(e) => setSiteUrl(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Process Manager base URL (e.g., demo.promapp.com)
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="tenant-id">Site ID</Label>
                        <Input
                          id="tenant-id"
                          type="text"
                          placeholder="93555a16ceb24f139a6e8a40618d3f8b"
                          value={tenantId}
                          onChange={(e) => setTenantId(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Site identifier from your Process Manager URL (can be any value like "Contoso", "TestSite", or a GUID)
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
                        <Label htmlFor="sync-scope">Sync Scope</Label>
                        <Select value={syncScope} onValueChange={(value) => {
                          if (value === 'cps230_only' && syncScope === 'all_processes') {
                            setPendingSyncScope(value);
                            setScopeWarningOpen(true);
                          } else {
                            setSyncScope(value);
                          }
                        }}>
                          <SelectTrigger id="sync-scope">
                            <SelectValue placeholder="Select sync scope..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cps230_only">CPS230 Tagged Processes Only</SelectItem>
                            <SelectItem value="all_processes">All Processes</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Choose whether to sync only CPS230-tagged processes or all processes from your Nintex site.
                        </p>
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

                    <div className="border-t pt-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <Label htmlFor="dashboard-filters">Dashboard Filters</Label>
                          <p className="text-xs text-muted-foreground">
                            Show dashboard filters expanded by default
                          </p>
                        </div>
                        <Switch
                          id="dashboard-filters"
                          checked={dashboardFiltersExpanded}
                          onCheckedChange={handleToggleDashboardFilters}
                          disabled={isLoading}
                        />
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <div className="space-y-2">
                        <Label htmlFor="theme">Theme</Label>
                        <Select value={theme} onValueChange={setTheme}>
                          <SelectTrigger id="theme" className="w-full">
                            <SelectValue placeholder="Select theme" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="light">Light</SelectItem>
                            <SelectItem value="dark">Dark</SelectItem>
                            <SelectItem value="system">System</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Choose how the application looks. System matches your device theme.
                        </p>
                      </div>
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
      <AlertDialog open={scopeWarningOpen} onOpenChange={setScopeWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Switch to CPS230 Only?
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                Switching from "All Processes" to "CPS230 Tagged Processes Only" will remove
                all non-CPS230 process data from the solution on the next sync, including:
              </span>
              <span className="block font-medium text-foreground">
                - Processes not tagged with #CPS230
                <br />
                - Systems only referenced by removed processes
                <br />
                - Regions only referenced by removed processes
              </span>
              <span className="block">
                This action cannot be undone. You would need to switch back to "All Processes"
                and re-sync to restore the removed data.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSyncScope(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-orange-600 hover:bg-orange-700"
              onClick={() => {
                if (pendingSyncScope) {
                  setSyncScope(pendingSyncScope);
                }
                setPendingSyncScope(null);
              }}
            >
              Switch to CPS230 Only
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
