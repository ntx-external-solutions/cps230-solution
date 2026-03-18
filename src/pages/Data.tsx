import { AppLayout } from '@/components/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProcessesTable } from '@/components/tables/ProcessesTable';
import { SystemsTable } from '@/components/tables/SystemsTable';
import { RegionsTable } from '@/components/tables/RegionsTable';
import { CriticalOperationsTable } from '@/components/tables/CriticalOperationsTable';
import { ControlsTable } from '@/components/tables/ControlsTable';

export default function Data() {
  return (
    <AppLayout>
      <Tabs defaultValue="processes" className="space-y-6">
        <TabsList>
          <TabsTrigger value="processes">Processes</TabsTrigger>
          <TabsTrigger value="systems">Systems</TabsTrigger>
          <TabsTrigger value="regions">Regions</TabsTrigger>
          <TabsTrigger value="critical-operations">Critical Operations</TabsTrigger>
          <TabsTrigger value="controls">Controls</TabsTrigger>
        </TabsList>

        <TabsContent value="processes">
          <Card>
            <CardHeader>
              <CardTitle>Processes</CardTitle>
              <CardDescription>
                View and manage processes synced from Nintex Process Manager
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ProcessesTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="systems">
          <Card>
            <CardHeader>
              <CardTitle>Systems</CardTitle>
              <CardDescription>
                View and manage systems used in processes
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SystemsTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="regions">
          <Card>
            <CardHeader>
              <CardTitle>Regions</CardTitle>
              <CardDescription>
                View and manage geographic regions for processes and controls
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RegionsTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="critical-operations">
          <Card>
            <CardHeader>
              <CardTitle>Critical Operations</CardTitle>
              <CardDescription>
                View and manage critical operations for CPS230 compliance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CriticalOperationsTable />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="controls">
          <Card>
            <CardHeader>
              <CardTitle>Controls</CardTitle>
              <CardDescription>
                View and manage controls that govern critical operations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ControlsTable />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
