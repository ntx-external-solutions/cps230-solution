/**
 * Custom BPMN Modules
 * Exports all custom providers and modules for the BPMN modeler
 */

import CustomPaletteProvider from './CustomPaletteProvider';
import CustomContextPadProvider from './CustomContextPadProvider';

// Custom Palette Module
export const customPaletteModule = {
  __init__: ['customPaletteProvider'],
  customPaletteProvider: ['type', CustomPaletteProvider]
};

// Custom Context Pad Module
export const customContextPadModule = {
  __init__: ['customContextPadProvider'],
  customContextPadProvider: ['type', CustomContextPadProvider]
};

// Configuration helper
export function getModelerConfig(userRole: string) {
  const config: any = {
    userRole,
    additionalModules: [
      customPaletteModule,
      customContextPadModule
    ],
    moddleExtensions: {
      custom: {
        name: 'Custom',
        uri: 'http://custom',
        prefix: 'custom',
        xml: {
          tagAlias: 'lowerCase'
        },
        types: [
          {
            name: 'ProcessData',
            superClass: ['Element'],
            properties: [
              { name: 'processId', isAttr: true, type: 'String' },
              { name: 'processName', isAttr: true, type: 'String' },
              { name: 'pmProcessId', isAttr: true, type: 'String' },
              { name: 'processUniqueId', isAttr: true, type: 'String' }
            ]
          }
        ]
      }
    }
  };

  // For basic users, disable all editing modules
  if (userRole === 'user') {
    config.additionalModules.push({
      __init__: ['readOnlyProvider'],
      readOnlyProvider: ['type', class ReadOnlyProvider {
        static $inject = ['eventBus', 'contextPad', 'palette', 'paletteProvider'];

        constructor(eventBus: any, contextPad: any, palette: any, paletteProvider: any) {
          // Hide the palette
          if (palette && palette._container) {
            palette._container.style.display = 'none';
          }

          // Prevent palette from opening
          eventBus.on('palette.create', () => {
            if (palette && palette._container) {
              palette._container.style.display = 'none';
            }
          });

          // Hide context pad completely
          if (contextPad && contextPad._overlays) {
            contextPad._overlays.show = () => {};
          }

          // Prevent context pad from opening on element selection
          eventBus.on('contextPad.create', 10000, () => false);
          eventBus.on('selection.changed', 10000, (event: any) => {
            // Allow selection but close context pad immediately
            setTimeout(() => {
              if (contextPad) {
                contextPad.close();
              }
            }, 0);
          });

          // Disable dragging of elements (not canvas panning)
          eventBus.on('create.start', 10000, () => false);
          eventBus.on('shape.move.start', 10000, () => false);

          // Disable all command stack operations
          const commandEvents = [
            'commandStack.shape.create.preExecute',
            'commandStack.shape.delete.preExecute',
            'commandStack.connection.create.preExecute',
            'commandStack.connection.delete.preExecute',
            'commandStack.elements.move.preExecute',
            'commandStack.shape.resize.preExecute',
            'commandStack.element.updateProperties.preExecute',
            'commandStack.connection.updateWaypoints.preExecute'
          ];

          commandEvents.forEach(eventName => {
            eventBus.on(eventName, 10000, () => false);
          });

          // Override context pad provider to return nothing
          contextPad.registerProvider({
            getContextPadEntries: () => ({})
          });

          // Override palette to be empty
          if (paletteProvider) {
            paletteProvider.getPaletteEntries = () => ({});
          }
        }
      }]
    });
  }

  return config;
}
