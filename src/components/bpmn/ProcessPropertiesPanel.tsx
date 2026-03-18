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

interface ProcessInput {
  Id: number;
  FromProcess: string;
  FromProcessId: number;
  FromProcessUniqueId: string;
  Resource: string;
  HowUsed: string;
  UniqueId: string;
}

interface ProcessOutput {
  Id: number;
  Output: string;
  HowUsed: string;
  ToProcess: string;
  ToProcessId: number;
  ToProcessUniqueId: string;
  UniqueId: string;
}

interface ProcessTrigger {
  Id: number;
  UniqueId: string;
  Trigger: string;
  Frequency: string;
  Volume: string;
}

interface ProcessTarget {
  Id: number;
  Measure: string;
  Target: string;
  UniqueId: string;
}

interface Process {
  id: string;
  process_name: string;
  process_unique_id: string;
  pm_process_id?: number | null;
  owner_username?: string | null;
  process_expert?: string | null;
  process_status?: string | null;
  regions?: string[] | null;
  systems?: Array<{ id: string; system_name: string }>;
  controls?: Array<{ id: string; control_name: string }>;
  criticalOperations?: Array<{ id: string; operation_name: string }>;
  inputs?: ProcessInput[] | null;
  outputs?: ProcessOutput[] | null;
  triggers?: ProcessTrigger[] | null;
  targets?: ProcessTarget[] | null;
}

interface ProcessPropertiesPanelProps {
  selectedProcessId: string | null;
  selectedElement: any; // BPMN element
  processes: Process[];
  onProcessLink: (processId: string) => void;
  onFontSizeChange?: (fontSize: number) => void;
  onBorderStyleChange?: (borderStyle: 'dashed' | 'solid') => void;
  onClose: () => void;
  readOnly?: boolean;
}

export function ProcessPropertiesPanel({
  selectedProcessId,
  selectedElement,
  processes,
  onProcessLink,
  onFontSizeChange,
  onBorderStyleChange,
  onClose,
  readOnly = false
}: ProcessPropertiesPanelProps) {
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [openSections, setOpenSections] = useState({
    criticalOps: true,
    controls: false,
    systems: false,
    regions: false,
    inputs: false,
    outputs: false,
    triggers: false,
    targets: false,
    elementStyling: false
  });

  // Get current styling properties from element
  const currentFontSize = selectedElement?.businessObject?.get('fontSize') || 12;
  const currentBorderStyle = selectedElement?.businessObject?.get('borderStyle') || 'dashed';
  const isGroupElement = selectedElement?.type === 'bpmn:Group';

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
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">Process Unique ID</Label>
                <p className="text-xs font-mono break-all bg-muted/50 p-2 rounded border">
                  {selectedProcess.process_unique_id}
                </p>
              </div>

              {/* Owner */}
              {selectedProcess.owner_username && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Owner</Label>
                  <p className="text-sm text-foreground">{selectedProcess.owner_username}</p>
                </div>
              )}

              {/* Expert */}
              {selectedProcess.process_expert && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Process Expert</Label>
                  <p className="text-sm text-foreground">{selectedProcess.process_expert}</p>
                </div>
              )}

              {/* Status */}
              {selectedProcess.process_status && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground">Status</Label>
                  <div>
                    <Badge
                      variant={
                        selectedProcess.process_status.toLowerCase().includes('publish') ? 'default' :
                        selectedProcess.process_status.toLowerCase().includes('draft') ? 'secondary' :
                        selectedProcess.process_status.toLowerCase().includes('archive') ? 'outline' : 'secondary'
                      }
                      className="text-xs"
                    >
                      {selectedProcess.process_status}
                    </Badge>
                  </div>
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

              {/* Process Inputs */}
              {selectedProcess.inputs && selectedProcess.inputs.length > 0 && (
                <Collapsible open={openSections.inputs} onOpenChange={() => toggleSection('inputs')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 p-2 rounded -mx-2">
                    <Label className="text-xs text-muted-foreground cursor-pointer">Inputs</Label>
                    <div className="flex items-center gap-1">
                      <Badge variant="default" className="text-xs bg-indigo-600">
                        {selectedProcess.inputs.length}
                      </Badge>
                      {openSections.inputs ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="flex flex-col gap-2">
                      {selectedProcess.inputs.map((input) => (
                        <div key={input.UniqueId} className="p-2 bg-muted/50 rounded text-xs space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold">From:</span>
                            <a
                              href={`${baseUrl}/Process/${input.FromProcessUniqueId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {input.FromProcess}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </div>
                          <div><span className="font-semibold">Resource:</span> {input.Resource}</div>
                          {input.HowUsed && <div><span className="font-semibold">How Used:</span> {input.HowUsed}</div>}
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Process Outputs */}
              {selectedProcess.outputs && selectedProcess.outputs.length > 0 && (
                <Collapsible open={openSections.outputs} onOpenChange={() => toggleSection('outputs')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 p-2 rounded -mx-2">
                    <Label className="text-xs text-muted-foreground cursor-pointer">Outputs</Label>
                    <div className="flex items-center gap-1">
                      <Badge variant="default" className="text-xs bg-teal-600">
                        {selectedProcess.outputs.length}
                      </Badge>
                      {openSections.outputs ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="flex flex-col gap-2">
                      {selectedProcess.outputs.map((output) => (
                        <div key={output.UniqueId} className="p-2 bg-muted/50 rounded text-xs space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="font-semibold">To:</span>
                            <a
                              href={`${baseUrl}/Process/${output.ToProcessUniqueId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline flex items-center gap-1"
                            >
                              {output.ToProcess}
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </div>
                          <div><span className="font-semibold">Output:</span> {output.Output}</div>
                          {output.HowUsed && <div><span className="font-semibold">How Used:</span> {output.HowUsed}</div>}
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Process Triggers */}
              {selectedProcess.triggers && selectedProcess.triggers.length > 0 && (
                <Collapsible open={openSections.triggers} onOpenChange={() => toggleSection('triggers')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 p-2 rounded -mx-2">
                    <Label className="text-xs text-muted-foreground cursor-pointer">Triggers</Label>
                    <div className="flex items-center gap-1">
                      <Badge variant="default" className="text-xs bg-amber-600">
                        {selectedProcess.triggers.length}
                      </Badge>
                      {openSections.triggers ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="flex flex-col gap-2">
                      {selectedProcess.triggers.map((trigger) => (
                        <div key={trigger.UniqueId} className="p-2 bg-muted/50 rounded text-xs space-y-1">
                          <div><span className="font-semibold">Trigger:</span> {trigger.Trigger}</div>
                          <div className="flex gap-3">
                            <span><span className="font-semibold">Frequency:</span> {trigger.Frequency}</span>
                            {trigger.Volume && <span><span className="font-semibold">Volume:</span> {trigger.Volume}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Process Targets */}
              {selectedProcess.targets && selectedProcess.targets.length > 0 && (
                <Collapsible open={openSections.targets} onOpenChange={() => toggleSection('targets')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 p-2 rounded -mx-2">
                    <Label className="text-xs text-muted-foreground cursor-pointer">Targets</Label>
                    <div className="flex items-center gap-1">
                      <Badge variant="default" className="text-xs bg-rose-600">
                        {selectedProcess.targets.length}
                      </Badge>
                      {openSections.targets ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="flex flex-col gap-2">
                      {selectedProcess.targets.map((target) => (
                        <div key={target.UniqueId} className="p-2 bg-muted/50 rounded text-xs space-y-1">
                          <div><span className="font-semibold">Measure:</span> {target.Measure}</div>
                          <div><span className="font-semibold">Target:</span> {target.Target}</div>
                        </div>
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Element Styling Controls - only for editors */}
              {!readOnly && (
                <Collapsible open={openSections.elementStyling} onOpenChange={() => toggleSection('elementStyling')}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full hover:bg-muted/50 p-2 rounded -mx-2">
                    <Label className="text-xs text-muted-foreground cursor-pointer">Element Styling</Label>
                    {openSections.elementStyling ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="space-y-3">
                      {/* Font Size Control */}
                      <div className="space-y-2">
                        <Label htmlFor="fontSize" className="text-xs">Font Size</Label>
                        <Select
                          value={currentFontSize.toString()}
                          onValueChange={(value) => onFontSizeChange?.(parseInt(value))}
                        >
                          <SelectTrigger id="fontSize" className="text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10px</SelectItem>
                            <SelectItem value="12">12px (Default)</SelectItem>
                            <SelectItem value="14">14px</SelectItem>
                            <SelectItem value="16">16px</SelectItem>
                            <SelectItem value="18">18px</SelectItem>
                            <SelectItem value="20">20px</SelectItem>
                            <SelectItem value="24">24px</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Border Style Control - only for Group elements */}
                      {isGroupElement && (
                        <div className="space-y-2">
                          <Label htmlFor="borderStyle" className="text-xs">Border Style</Label>
                          <Select
                            value={currentBorderStyle}
                            onValueChange={(value) => onBorderStyleChange?.(value as 'dashed' | 'solid')}
                          >
                            <SelectTrigger id="borderStyle" className="text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="dashed">Dashed (Default)</SelectItem>
                              <SelectItem value="solid">Solid</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
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
