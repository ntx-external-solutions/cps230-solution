/**
 * Custom Palette Provider
 * Restricts the BPMN palette to only show Call Activities and essential tools
 * Only Promaster and Business Analyst roles can create Call Activities
 */

export default class CustomPaletteProvider {
  private palette: any;
  private create: any;
  private elementFactory: any;
  private spaceTool: any;
  private lassoTool: any;
  private handTool: any;
  private globalConnect: any;
  private translate: any;
  private userRole: string;

  static $inject = [
    'palette',
    'create',
    'elementFactory',
    'spaceTool',
    'lassoTool',
    'handTool',
    'globalConnect',
    'translate'
  ];

  constructor(
    palette: any,
    create: any,
    elementFactory: any,
    spaceTool: any,
    lassoTool: any,
    handTool: any,
    globalConnect: any,
    translate: any,
    config?: { userRole?: string }
  ) {
    this.palette = palette;
    this.create = create;
    this.elementFactory = elementFactory;
    this.spaceTool = spaceTool;
    this.lassoTool = lassoTool;
    this.handTool = handTool;
    this.globalConnect = globalConnect;
    this.translate = translate;
    this.userRole = config?.userRole || 'user';

    palette.registerProvider(this);
  }

  getPaletteEntries() {
    const {
      create,
      elementFactory,
      spaceTool,
      lassoTool,
      handTool,
      globalConnect,
      translate
    } = this;

    const canEdit = this.userRole === 'promaster' || this.userRole === 'business_analyst';

    function createCallActivity(event: any) {
      const shape = elementFactory.createShape({
        type: 'bpmn:CallActivity'
      });
      create.start(event, shape);
    }

    function createGroup(event: any) {
      const shape = elementFactory.createShape({
        type: 'bpmn:Group'
      });
      create.start(event, shape);
    }

    const entries: any = {};

    // Hand tool - always available
    entries['hand-tool'] = {
      group: 'tools',
      className: 'bpmn-icon-hand-tool',
      title: translate('Activate the hand tool'),
      action: {
        click: function(event: any) {
          handTool.activateHand(event);
        }
      }
    };

    // Lasso tool - always available
    entries['lasso-tool'] = {
      group: 'tools',
      className: 'bpmn-icon-lasso-tool',
      title: translate('Activate the lasso tool'),
      action: {
        click: function(event: any) {
          lassoTool.activateSelection(event);
        }
      }
    };

    // Space tool - always available
    entries['space-tool'] = {
      group: 'tools',
      className: 'bpmn-icon-space-tool',
      title: translate('Activate the create/remove space tool'),
      action: {
        click: function(event: any) {
          spaceTool.activateSelection(event);
        }
      }
    };

    // Only show creation tools for Promaster and Business Analyst
    if (canEdit) {
      // Global connect tool
      entries['global-connect-tool'] = {
        group: 'tools',
        className: 'bpmn-icon-connection-multi',
        title: translate('Activate the global connect tool'),
        action: {
          click: function(event: any) {
            globalConnect.start(event);
          }
        }
      };

      // Separator
      entries['tool-separator'] = {
        group: 'tools',
        separator: true
      };

      // Call Activity - the main element users can create
      entries['create.call-activity'] = {
        group: 'activity',
        className: 'bpmn-icon-call-activity',
        title: translate('Create Call Activity'),
        action: {
          dragstart: createCallActivity,
          click: createCallActivity
        }
      };

      // Group - for visual organization
      entries['create.group'] = {
        group: 'activity',
        className: 'bpmn-icon-group',
        title: translate('Create Group'),
        action: {
          dragstart: createGroup,
          click: createGroup
        }
      };
    }

    return entries;
  }
}
