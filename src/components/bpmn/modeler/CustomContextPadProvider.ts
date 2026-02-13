/**
 * Custom Context Pad Provider
 * Restricts context menu options based on user role
 * Only shows relevant actions for Call Activities
 */

export default class CustomContextPadProvider {
  private contextPad: any;
  private modeling: any;
  private elementFactory: any;
  private connect: any;
  private create: any;
  private popupMenu: any;
  private canvas: any;
  private rules: any;
  private translate: any;
  private userRole: string;

  static $inject = [
    'contextPad',
    'modeling',
    'elementFactory',
    'connect',
    'create',
    'popupMenu',
    'canvas',
    'rules',
    'translate'
  ];

  constructor(
    contextPad: any,
    modeling: any,
    elementFactory: any,
    connect: any,
    create: any,
    popupMenu: any,
    canvas: any,
    rules: any,
    translate: any,
    config?: { userRole?: string }
  ) {
    this.contextPad = contextPad;
    this.modeling = modeling;
    this.elementFactory = elementFactory;
    this.connect = connect;
    this.create = create;
    this.popupMenu = popupMenu;
    this.canvas = canvas;
    this.rules = rules;
    this.translate = translate;
    this.userRole = config?.userRole || 'user';

    contextPad.registerProvider(this);
  }

  getContextPadEntries(element: any) {
    const {
      modeling,
      elementFactory,
      connect,
      create,
      translate
    } = this;

    const canEdit = this.userRole === 'promaster' || this.userRole === 'business_analyst';
    const actions: any = {};

    // Only show actions for Call Activities
    if (element.type !== 'bpmn:CallActivity') {
      return actions;
    }

    if (canEdit) {
      // Delete action
      actions['delete'] = {
        group: 'edit',
        className: 'bpmn-icon-trash',
        title: translate('Remove'),
        action: {
          click: function() {
            modeling.removeElements([element]);
          }
        }
      };

      // Connect action
      actions['connect'] = {
        group: 'connect',
        className: 'bpmn-icon-connection-multi',
        title: translate('Connect using Sequence Flow'),
        action: {
          click: function(event: any) {
            connect.start(event, element);
          }
        }
      };

      // Append Call Activity
      actions['append.call-activity'] = {
        group: 'model',
        className: 'bpmn-icon-call-activity',
        title: translate('Append Call Activity'),
        action: {
          click: function(event: any) {
            const shape = elementFactory.createShape({
              type: 'bpmn:CallActivity'
            });
            create.start(event, shape, element);
          }
        }
      };
    }

    return actions;
  }
}
