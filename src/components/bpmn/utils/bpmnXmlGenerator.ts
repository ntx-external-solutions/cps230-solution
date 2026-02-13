/**
 * BPMN XML Generator
 * Generates BPMN 2.0 XML with Call Activities from process data
 */

interface Process {
  id: string;
  process_name: string;
  process_unique_id: string;
  pm_process_id?: number | null;
  canvas_position?: { x: number; y: number } | null;
}

interface DiagramData {
  bpmnXml?: string;
  processLinks?: Record<string, string>;
}

/**
 * Generate empty BPMN diagram with starter template
 */
export function generateEmptyDiagram(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                   xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                   xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                   xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                   xmlns:custom="http://custom"
                   id="Definitions_1"
                   targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

/**
 * Generate BPMN XML from processes (legacy - for migration)
 * Converts old task-based diagrams to Call Activity-based diagrams
 */
export function generateBpmnFromProcesses(processes: Process[]): string {
  const callActivities = processes.map((process, index) => {
    const x = process.canvas_position?.x ?? 100 + (index % 5) * 200;
    const y = process.canvas_position?.y ?? 100 + Math.floor(index / 5) * 150;
    const callActivityId = `CallActivity_${process.id.replace(/-/g, '_')}`;

    return {
      element: `
      <bpmn:callActivity id="${callActivityId}" name="${escapeXml(process.process_name)}" calledElement="${process.id}">
        <bpmn:extensionElements>
          <custom:processData
            processId="${process.id}"
            processName="${escapeXml(process.process_name)}"
            ${process.pm_process_id ? `pmProcessId="${process.pm_process_id}"` : ''}
            processUniqueId="${process.process_unique_id}" />
        </bpmn:extensionElements>
      </bpmn:callActivity>`,
      diagram: `
      <bpmndi:BPMNShape id="${callActivityId}_di" bpmnElement="${callActivityId}">
        <dc:Bounds x="${x}" y="${y}" width="120" height="80" />
      </bpmndi:BPMNShape>`
    };
  });

  const elementsXml = callActivities.map(ca => ca.element).join('\n');
  const diagramsXml = callActivities.map(ca => ca.diagram).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                   xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                   xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
                   xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
                   xmlns:custom="http://custom"
                   id="Definitions_1"
                   targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="Process_1" isExecutable="false">
    ${elementsXml}
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_1">
      ${diagramsXml}
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

/**
 * Extract process links from BPMN XML
 */
export function extractProcessLinks(bpmnXml: string): Record<string, string> {
  const links: Record<string, string> = {};

  // Parse calledElement attributes
  const calledElementRegex = /<bpmn:callActivity[^>]+id="([^"]+)"[^>]+calledElement="([^"]+)"/g;
  let match;

  while ((match = calledElementRegex.exec(bpmnXml)) !== null) {
    const [, callActivityId, processId] = match;
    links[callActivityId] = processId;
  }

  // Also check custom:processData extensions
  const processDataRegex = /<custom:processData[^>]+processId="([^"]+)"/g;
  const callActivityRegex = /<bpmn:callActivity[^>]+id="([^"]+)"/g;

  return links;
}

/**
 * Load or generate initial diagram
 */
export function getInitialDiagram(savedDiagram: DiagramData | null, processes: Process[]): string {
  if (savedDiagram?.bpmnXml) {
    return savedDiagram.bpmnXml;
  }

  // If no saved diagram but we have processes, generate from processes (migration path)
  if (processes && processes.length > 0) {
    return generateBpmnFromProcesses(processes);
  }

  // Otherwise start with empty diagram
  return generateEmptyDiagram();
}

/**
 * Helper to escape XML special characters
 */
function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
