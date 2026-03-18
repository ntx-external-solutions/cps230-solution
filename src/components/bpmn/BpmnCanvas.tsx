import { useEffect, useRef, useState, useCallback } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
import { getModelerConfig } from './modeler';
import { ProcessPropertiesPanel } from './ProcessPropertiesPanel';
import { FilterState } from './utils/highlightCalculator';
import { generateBpmnFromProcesses, generateEmptyDiagram } from './utils/bpmnXmlGenerator';
import { Button } from '@/components/ui/button';
import { Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useSettings, useUpdateSetting } from '@/hooks/useSettings';

/**
 * Escape HTML to prevent XSS attacks
 * Sanitizes user-controlled data before rendering in BPMN overlays
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

interface ProcessData {
  id: string;
  process_name: string;
  process_unique_id: string;
  pm_process_id: number;
  owner_username: string | null;
  input_processes?: string[] | null;
  output_processes?: string[] | null;
  canvas_position?: { x: number; y: number } | null;
  regions?: string[] | null;
  systems?: Array<{ id: string; system_name: string }>;
  controls?: Array<{ id: string }>;
  criticalOperations?: Array<{ id: string }>;
}

interface BpmnCanvasProps {
  processes: ProcessData[];
  userRole: 'promaster' | 'business_analyst' | 'user';
  filters: FilterState;
}

export function BpmnCanvas({
  processes,
  userRole,
  filters
}: BpmnCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const modelerRef = useRef<BpmnModeler | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedElement, setSelectedElement] = useState<any>(null);
  const [selectedProcessId, setSelectedProcessId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { data: settings = [] } = useSettings(['bpmn_diagram']);
  const updateSettings = useUpdateSetting();

  const savedDiagramData = settings.find(s => s.key === 'bpmn_diagram')?.value as { xml: string; viewbox?: any };
  const savedDiagramXml = savedDiagramData?.xml;
  const savedViewbox = savedDiagramData?.viewbox;

  // Save diagram function
  const saveDiagram = useCallback(async () => {
    if (!modelerRef.current) return;

    try {
      setIsSaving(true);

      // Get current viewport to preserve zoom and position
      const canvas = modelerRef.current.get('canvas') as any;
      const viewbox = canvas.viewbox();

      const { xml } = await modelerRef.current.saveXML({ format: true });

      await updateSettings.mutateAsync([{
        key: 'bpmn_diagram',
        value: {
          xml,
          viewbox: {
            x: viewbox.x,
            y: viewbox.y,
            width: viewbox.width,
            height: viewbox.height,
            scale: viewbox.scale
          }
        }
      }]);

      setHasUnsavedChanges(false);
      toast.success('Diagram saved successfully');
    } catch (err) {
      console.error('Error saving diagram:', err);
      toast.error('Failed to save diagram');
    } finally {
      setIsSaving(false);
    }
  }, [updateSettings]);

  // Initialize BPMN modeler
  useEffect(() => {
    if (!containerRef.current) return;

    const config = getModelerConfig(userRole);
    const modeler = new BpmnModeler({
      container: containerRef.current,
      ...config,
    });

    modelerRef.current = modeler;

    // Determine which BPMN XML to load
    let bpmnXml: string;
    if (savedDiagramXml) {
      // Use saved diagram if available
      bpmnXml = savedDiagramXml;
    } else {
      // Always start with empty diagram - users will manually add elements
      bpmnXml = generateEmptyDiagram();
    }

    modeler.importXML(bpmnXml).then(() => {
      const canvas = modeler.get('canvas') as any;

      // Restore saved viewport if available
      if (savedViewbox) {
        canvas.viewbox({
          x: savedViewbox.x,
          y: savedViewbox.y,
          width: savedViewbox.width,
          height: savedViewbox.height
        });
        canvas.zoom(savedViewbox.scale || 1);
      } else {
        canvas.zoom('fit-viewport');
      }
    }).catch((err: Error) => {
      console.error('Error importing BPMN diagram:', err);
      setError('Failed to load process diagram');
    });

    // Listen for element selection
    const eventBus = modeler.get('eventBus') as any;
    eventBus.on('selection.changed', (event: any) => {
      const { newSelection } = event;

      if (newSelection.length === 1) {
        const element = newSelection[0];
        setSelectedElement(element);

        // Extract process ID from Task or Group (stored in custom property)
        if (element.type === 'bpmn:Task' || element.type === 'bpmn:Group') {
          const processId = element.businessObject.get('linkedProcessId');
          setSelectedProcessId(processId || null);
        } else {
          setSelectedProcessId(null);
        }
      } else {
        setSelectedElement(null);
        setSelectedProcessId(null);
      }
    });

    // Track changes for unsaved changes indicator
    if (userRole !== 'user') {
      eventBus.on('commandStack.changed', () => {
        setHasUnsavedChanges(true);
      });
    }

    // Cleanup
    return () => {
      modeler.destroy();
    };
  }, [savedDiagramXml, savedViewbox, processes, userRole]);

  // Apply highlighting when filters change
  useEffect(() => {
    if (!modelerRef.current) return;

    const canvas = modelerRef.current.get('canvas') as any;
    const elementRegistry = modelerRef.current.get('elementRegistry') as any;
    const overlays = modelerRef.current.get('overlays') as any;
    const modeling = modelerRef.current.get('modeling') as any;

    // Clear all existing overlays
    overlays.clear();

    // Reset all element styles and restore original colors
    elementRegistry.forEach((element: any) => {
      if (element.type === 'bpmn:Task' || element.type === 'bpmn:Group') {
        // Remove marker classes
        canvas.removeMarker(element, 'highlight-system');
        canvas.removeMarker(element, 'highlight-control');
        canvas.removeMarker(element, 'highlight-critical');

        // Explicitly restore original styling by removing inline styles
        const gfx = elementRegistry.getGraphics(element);
        if (gfx) {
          const visual = gfx.querySelector('.djs-visual > :first-child');
          if (visual) {
            // Remove inline styles to allow CSS defaults to take over
            visual.style.removeProperty('fill');
            visual.style.removeProperty('stroke');
            visual.style.removeProperty('stroke-width');
          }
        }
      }
    });

    // Apply new highlighting based on filters
    const hasActiveFilters =
      filters.systems.length > 0 ||
      filters.regions.length > 0 ||
      filters.controls.length > 0 ||
      filters.criticalOperations.length > 0 ||
      filters.owners.length > 0 ||
      filters.experts.length > 0;

    if (!hasActiveFilters) return;

    elementRegistry.forEach((element: any) => {
      if (element.type !== 'bpmn:Task' && element.type !== 'bpmn:Group') return;

      const processId = element.businessObject.get('linkedProcessId');
      const processData = processes.find(p => p.id === processId);

      if (!processData) return;

      // Priority: Critical Operations > Controls (borders only)
      let borderApplied = false;

      // Check Critical Operations (RED fill - highest priority)
      if (!borderApplied && filters.criticalOperations.length > 0) {
        const matchesCriticalOp = processData.criticalOperations?.some(co =>
          filters.criticalOperations.includes(co.id)
        );

        if (matchesCriticalOp) {
          canvas.addMarker(element, 'highlight-critical');
          borderApplied = true;
        }
      }

      // Check Controls (BLUE border - second priority)
      if (!borderApplied && filters.controls.length > 0) {
        const matchesControl = processData.controls?.some(ctrl =>
          filters.controls.includes(ctrl.id)
        );

        if (matchesControl) {
          canvas.addMarker(element, 'highlight-control');
          borderApplied = true;
        }
      }

      // Check Systems (GREEN overlay labels - independent of border)
      if (filters.systems.length > 0 && processData.systems) {
        const matchedSystems = processData.systems.filter(sys =>
          filters.systems.includes(sys.id)
        );

        if (matchedSystems.length > 0) {
          const systemsHtml = `
            <div style="
              background: rgba(16, 185, 129, 0.9);
              color: white;
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 10px;
              font-weight: 500;
              white-space: nowrap;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            ">
              ${escapeHtml(matchedSystems.map(s => s.system_name).join(', '))}
            </div>
          `;

          overlays.add(element, {
            position: { bottom: -5, right: 10 },
            html: systemsHtml
          });
        }
      }

      // Check Regions (OVERLAY - independent of border)
      if (filters.regions.length > 0 && processData.regions) {
        const matchedRegions = processData.regions.filter(region =>
          filters.regions.includes(region)
        );

        if (matchedRegions.length > 0) {
          const regionHtml = `
            <div style="
              background: rgba(59, 130, 246, 0.9);
              color: white;
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 10px;
              font-weight: 500;
              white-space: nowrap;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            ">
              ${escapeHtml(matchedRegions.join(', '))}
            </div>
          `;

          overlays.add(element, {
            position: { top: -5, right: 10 },
            html: regionHtml
          });
        }
      }

      // Check Process Owner (OVERLAY - independent of border)
      if (filters.owners.length > 0 && processData.owner_username) {
        const matchesOwner = filters.owners.includes(processData.owner_username);

        if (matchesOwner) {
          const ownerHtml = `
            <div style="
              background: rgba(147, 51, 234, 0.9);
              color: white;
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 10px;
              font-weight: 500;
              white-space: nowrap;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            ">
              Owner: ${escapeHtml(processData.owner_username)}
            </div>
          `;

          overlays.add(element, {
            position: { top: -5, left: 10 },
            html: ownerHtml
          });
        }
      }

      // Check Process Expert (OVERLAY - independent of border)
      if (filters.experts.length > 0 && (processData as any).process_expert) {
        const matchesExpert = filters.experts.includes((processData as any).process_expert);

        if (matchesExpert) {
          const expertHtml = `
            <div style="
              background: rgba(249, 115, 22, 0.9);
              color: white;
              padding: 2px 6px;
              border-radius: 3px;
              font-size: 10px;
              font-weight: 500;
              white-space: nowrap;
              box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            ">
              Expert: ${escapeHtml((processData as any).process_expert)}
            </div>
          `;

          overlays.add(element, {
            position: { bottom: -5, left: 10 },
            html: expertHtml
          });
        }
      }
    });
  }, [filters, processes]);

  // Handle process linking from property panel
  const handleProcessLink = (processId: string) => {
    if (!modelerRef.current || !selectedElement) return;

    const modeling = modelerRef.current.get('modeling') as any;
    const moddle = modelerRef.current.get('moddle') as any;
    const process = processes.find(p => p.id === processId);

    if (!process) return;

    // Update Task or Group with process information
    // Store linkedProcessId as a custom attribute
    const businessObject = selectedElement.businessObject;
    businessObject.set('linkedProcessId', process.id);

    // For Groups, update the categoryValue name; for Tasks, update the element name
    if (selectedElement.type === 'bpmn:Group') {
      const categoryValue = businessObject.categoryValueRef;
      if (categoryValue) {
        categoryValue.value = process.process_name;
      }
    }

    modeling.updateProperties(selectedElement, {
      name: process.process_name
    });

    setSelectedProcessId(processId);
  };

  // Handle font size changes
  const handleFontSizeChange = (fontSize: number) => {
    if (!modelerRef.current || !selectedElement) return;

    const modeling = modelerRef.current.get('modeling') as any;
    const graphicsFactory = modelerRef.current.get('graphicsFactory') as any;

    // Store font size in custom attribute
    selectedElement.businessObject.set('fontSize', fontSize);

    // Trigger re-render by updating a property
    modeling.updateProperties(selectedElement, {
      'custom:fontSize': fontSize
    });

    // Apply CSS styling directly to the element
    const elementRegistry = modelerRef.current.get('elementRegistry') as any;
    const gfx = elementRegistry.getGraphics(selectedElement);
    if (gfx) {
      const textElement = gfx.querySelector('text');
      if (textElement) {
        textElement.style.fontSize = `${fontSize}px`;
      }
    }

    setHasUnsavedChanges(true);
  };

  // Handle border style changes (Group elements only)
  const handleBorderStyleChange = (borderStyle: 'dashed' | 'solid') => {
    if (!modelerRef.current || !selectedElement || selectedElement.type !== 'bpmn:Group') return;

    const modeling = modelerRef.current.get('modeling') as any;
    const canvas = modelerRef.current.get('canvas') as any;

    // Store border style in custom attribute
    selectedElement.businessObject.set('borderStyle', borderStyle);

    // Apply styling via marker class
    canvas.removeMarker(selectedElement, 'group-border-dashed');
    canvas.removeMarker(selectedElement, 'group-border-solid');

    if (borderStyle === 'solid') {
      canvas.addMarker(selectedElement, 'group-border-solid');
    } else {
      canvas.addMarker(selectedElement, 'group-border-dashed');
    }

    setHasUnsavedChanges(true);
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        {error}
      </div>
    );
  }

  const canEdit = userRole === 'promaster' || userRole === 'business_analyst';

  return (
    <div className="flex h-full">
      {/* BPMN Canvas */}
      <div className="flex-1 relative">
        {/* Save Button - only show for editors */}
        {canEdit && (
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            <Button
              onClick={saveDiagram}
              disabled={isSaving || !hasUnsavedChanges}
              size="sm"
              className="shadow-lg"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {hasUnsavedChanges ? 'Save Diagram' : 'Saved'}
                </>
              )}
            </Button>
          </div>
        )}

        <div
          ref={containerRef}
          className="w-full h-full"
        />

        {/* Add custom CSS for highlighting and styling */}
        <style>{`
          /* Dark mode: Make all BPMN element borders light colored for visibility */
          .dark .djs-visual > :first-child {
            stroke: #cbd5e1 !important;
          }

          /* Dark mode: Tasks and Groups should have transparent/light fill by default */
          .dark [data-element-id] .djs-visual > rect,
          .dark [data-element-id] .djs-visual > polygon {
            fill: transparent !important;
          }

          /* Dark mode: Make connection lines visible */
          .dark .djs-connection .djs-visual > path {
            stroke: #94a3b8 !important;
          }

          .highlight-control .djs-visual > :nth-child(1) {
            stroke: #3b82f6 !important;
            stroke-width: 4 !important;
          }

          .highlight-critical .djs-visual > :nth-child(1) {
            fill: rgba(239, 68, 68, 0.3) !important;
            stroke: #ef4444 !important;
            stroke-width: 2 !important;
          }

          /* Group border style customization */
          .group-border-solid .djs-visual > :nth-child(1) {
            stroke-dasharray: none !important;
          }

          .group-border-dashed .djs-visual > :nth-child(1) {
            stroke-dasharray: 10, 5 !important;
          }

          /* Hide BPMN.io logo/reference */
          .bjs-powered-by {
            display: none !important;
          }

          /* Hide event elements from palette/context pad if they somehow appear */
          .bpmn-icon-start-event-none,
          .bpmn-icon-end-event-none,
          .bpmn-icon-intermediate-event-none,
          .bpmn-icon-subprocess-expanded {
            display: none !important;
          }

          /* Convert palette to single column layout (tall, narrow) */
          .djs-palette {
            width: 60px !important;
          }

          .djs-palette-entries {
            display: flex !important;
            flex-direction: column !important;
            align-items: center !important;
            column-gap: 0 !important;
          }

          .djs-palette-entry {
            width: 46px !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
          }

          .djs-palette .separator {
            width: 100% !important;
            height: 1px !important;
            margin: 4px 0 !important;
          }

          /* Adjust palette group spacing */
          .djs-palette .group {
            display: flex !important;
            flex-direction: column !important;
            width: 100% !important;
          }

          /* Dark mode: Make palette icons visible */
          .dark .djs-palette .entry,
          .dark .djs-palette [class^="bpmn-icon-"],
          .dark .djs-palette [class*=" bpmn-icon-"] {
            color: #e2e8f0 !important;
          }

          .dark .djs-palette .entry:hover {
            background-color: rgba(255, 255, 255, 0.1) !important;
          }

          .dark .djs-palette .entry:before {
            color: #e2e8f0 !important;
          }
        `}</style>
      </div>

      {/* Properties Panel (shown for all users when Task or Group element is selected) */}
      {(selectedElement?.type === 'bpmn:Task' || selectedElement?.type === 'bpmn:Group') && (
        <ProcessPropertiesPanel
          selectedProcessId={selectedProcessId}
          selectedElement={selectedElement}
          processes={processes}
          onProcessLink={handleProcessLink}
          onFontSizeChange={canEdit ? handleFontSizeChange : undefined}
          onBorderStyleChange={canEdit ? handleBorderStyleChange : undefined}
          onClose={() => {
            const selection = modelerRef.current?.get('selection') as any;
            selection?.deselect(selectedElement);
          }}
          readOnly={userRole === 'user'}
        />
      )}
    </div>
  );
}
