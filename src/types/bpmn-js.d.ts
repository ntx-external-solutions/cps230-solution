declare module 'bpmn-js/lib/Modeler' {
  export default class BpmnModeler {
    constructor(options: {
      container: HTMLElement;
      keyboard?: {
        bindTo: Document;
      };
    });

    importXML(xml: string): Promise<{ warnings: any[] }>;

    get(service: 'canvas'): any;
    get(service: 'eventBus'): any;
    get(service: 'elementRegistry'): any;
    get(service: string): any;

    destroy(): void;
  }
}

declare module 'bpmn-js/dist/assets/diagram-js.css';
declare module 'bpmn-js/dist/assets/bpmn-font/css/bpmn-embedded.css';
