import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { X, Copy, Check, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import { toast } from 'sonner';

interface Process {
  id: string;
  process_name: string;
  process_unique_id: string;
  pm_process_id?: number | null;
  owner_username?: string | null;
  regions?: string[] | null;
  systems?: Array<{ id: string; system_name: string }>;
  controls?: Array<{ id: string; control_name: string }>;
  criticalOperations?: Array<{ id: string; operation_name: string }>;
}

interface ProcessPropertiesPanelProps {
  selectedProcessId: string | null;
  processes: Process[];
  onProcessLink: (processId: string) => void;
  onClose: () => void;
  readOnly?: boolean;
}

export function ProcessPropertiesPanel({
  selectedProcessId,
  processes,
  onProcessLink,
  onClose,
  readOnly = false
}: ProcessPropertiesPanelProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [openSections, setOpenSections] = useState({
    criticalOps: true,
    controls: false,
    systems: false,
    regions: false
  });

  // Get site URL and tenant ID from settings
  const { data: settings } = useSettings(['pm_site_url', 'pm_tenant_id']);
  const pmSiteUrl = settings?.find(s => s.key === 'pm_site_url')?.value as string;
  const pmTenantId = settings?.find(s => s.key === 'pm_tenant_id')?.value as string;

  // Construct full base URL from site URL + tenant ID
  // Examples:
  // - https://demo.promapp.com/93555a16ceb24f139a6e8a40618d3f8b
  // - https://us.promapp.com/contoso
  const baseUrl = pmSiteUrl && pmTenantId ? `https://${pmSiteUrl}/${pmTenantId}` : '';

  const selectedProcess = processes.find(p => p.id === selectedProcessId);

  const handleProcessSelect = (processId: string) => {
    onProcessLink(processId);
  };

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Construct full process URL: baseUrl + /Process/{uniqueId}
  const processUrl = selectedProcess && baseUrl
    ? `${baseUrl}/Process/${selectedProcess.process_unique_id}`
    : '';

  const handleCopyUrl = async () => {
    if (!processUrl) return;

    try {
      await navigator.clipboard.writeText(processUrl);
      setCopiedUrl(true);
      toast.success('URL copied to clipboard');
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch (err) {
      toast.error('Failed to copy URL');
    }
  };

  return (
    <div className="w-96 border-l bg-background overflow-y-auto">
      <Card className="rounded-none border-0">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="text-lg">Process Properties</CardTitle>
              <CardDescription className="mt-1">
                View and manage process details
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Process Selector - only for editors */}
          {!readOnly && (
            <div className="space-y-2">
              <Label>Select Process</Label>
              <Select value={selectedProcessId || undefined} onValueChange={handleProcessSelect}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Select a process..." />
                </SelectTrigger>
                <SelectContent>
                  {processes.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No processes found
                    </div>
                  ) : (
                    processes.map((process) => (
                      <SelectItem key={process.id} value={process.id} className="text-sm">
                        {process.process_name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Process Details */}
          {selectedProcess && (
            <div className={readOnly ? "space-y-4" : "border-t pt-4 space-y-4"}>
              {/* Process Name with URL */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Process Name</Label>
                <div className="flex items-center gap-2">
                  <a
                    href={processUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-primary hover:underline flex items-center gap-1 flex-1"
                  >
                    {selectedProcess.process_name}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleCopyUrl}
                    title="Copy URL"
                    className="h-8 w-8 shrink-0"
                  >
                    {copiedUrl ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Process Unique ID */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Process Unique ID</Label>
                <p className="text-xs font-mono break-all bg-muted p-2 rounded">
                  {selectedProcess.process_unique_id}
                </p>
              </div>

              {/* Owner */}
              {selectedProcess.owner_username && (
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Owner</Label>
                  <p className="text-sm">{selectedProcess.owner_username}</p>
                </div>
              )}

              {/* Critical Operations */}
              {selectedProcess.criticalOperations && selectedProcess.criticalOperations.length > 0 && (
                <Collapsible open={openSections.criticalOps} onOpenChange={() => toggleSection('criticalOps')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 p-2 rounded -mx-2">
                    <Label className="text-xs text-muted-foreground cursor-pointer">Critical Operations</Label>
                    <div className="flex items-center gap-1">
                      <Badge variant="destructive" className="text-xs">
                        {selectedProcess.criticalOperations.length}
                      </Badge>
                      {openSections.criticalOps ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="flex flex-col gap-1">
                      {selectedProcess.criticalOperations.map((operation) => (
                        <Badge key={operation.id} variant="destructive" className="text-xs justify-start">
                          {operation.operation_name}
                        </Badge>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Controls */}
              {selectedProcess.controls && selectedProcess.controls.length > 0 && (
                <Collapsible open={openSections.controls} onOpenChange={() => toggleSection('controls')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 p-2 rounded -mx-2">
                    <Label className="text-xs text-muted-foreground cursor-pointer">Related Controls</Label>
                    <div className="flex items-center gap-1">
                      <Badge variant="default" className="text-xs bg-blue-600">
                        {selectedProcess.controls.length}
                      </Badge>
                      {openSections.controls ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="flex flex-col gap-1">
                      {selectedProcess.controls.map((control) => (
                        <Badge key={control.id} variant="outline" className="text-xs justify-start">
                          {control.control_name}
                        </Badge>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Systems */}
              {selectedProcess.systems && selectedProcess.systems.length > 0 && (
                <Collapsible open={openSections.systems} onOpenChange={() => toggleSection('systems')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 p-2 rounded -mx-2">
                    <Label className="text-xs text-muted-foreground cursor-pointer">Related Systems</Label>
                    <div className="flex items-center gap-1">
                      <Badge variant="default" className="text-xs bg-green-600">
                        {selectedProcess.systems.length}
                      </Badge>
                      {openSections.systems ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="flex flex-col gap-1">
                      {selectedProcess.systems.map((system) => (
                        <Badge key={system.id} variant="outline" className="text-xs justify-start">
                          {system.system_name}
                        </Badge>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Regions */}
              {selectedProcess.regions && selectedProcess.regions.length > 0 && (
                <Collapsible open={openSections.regions} onOpenChange={() => toggleSection('regions')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 p-2 rounded -mx-2">
                    <Label className="text-xs text-muted-foreground cursor-pointer">Regions</Label>
                    <div className="flex items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {selectedProcess.regions.length}
                      </Badge>
                      {openSections.regions ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="flex flex-wrap gap-1">
                      {selectedProcess.regions.map((region) => (
                        <Badge key={region} variant="secondary" className="text-xs">
                          {region}
                        </Badge>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
