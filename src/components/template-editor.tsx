import React, { useState, useEffect } from "react";
import { Button, Input, Card, CardHeader, CardBody, Divider, Chip, Accordion, AccordionItem, Checkbox, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, addToast } from "@heroui/react";
import { Icon } from "@iconify/react";
import { DragDropContext, Droppable, Draggable } from "react-beautiful-dnd";
import { ActionEditor } from "./action-editor";
import { MidiTriggerSelector } from "./midi-trigger-selector";
import { MacroTypeSelector } from "./macro-type-selector";
import { Action, MacroTemplate, MacroCategory } from "../types/macro";

interface TemplateEditorProps {
  template: MacroTemplate;
  onSave: (template: MacroTemplate) => void;
  onCancel: () => void;
  categories: MacroCategory[];
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({ 
  template, 
  onSave, 
  onCancel,
  categories 
}) => {
  const [templateName, setTemplateName] = useState(template.name);
  const [templateDescription, setTemplateDescription] = useState(template.description || "");
  const [actions, setActions] = useState<Action[]>([]);
  const [beforeActions, setBeforeActions] = useState<Action[]>([]);
  const [afterActions, setAfterActions] = useState<Action[]>([]);
  const [decrementActions, setDecrementActions] = useState<Action[]>([]);
  const [clickActions, setClickActions] = useState<Action[]>([]);
  const [isEditing, setIsEditing] = useState<{section: string, index: number} | null>(null);
  const [macroType, setMacroType] = useState<"standard" | "encoder" | "encoder-click">("standard");
  const [sharedTimeout, setSharedTimeout] = useState<number>(1000);
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(template.categoryId);
  const [currentView, setCurrentView] = useState<'edit' | 'editable-fields'>('edit');
  
  // Store template's editable fields configuration
  const [editableFields, setEditableFields] = useState(template.editableFields);
  
  // Add expandedSections state similar to macro-builder
  const [expandedSections, setExpandedSections] = useState({
    before: false,
    main: false,
    after: false,
    decrement: false,
    click: false
  });

  // Load template data on mount
  useEffect(() => {
    // Set basic template info
    setTemplateName(template.name);
    setTemplateDescription(template.description || "");
    setActions(template.actions || []);
    setBeforeActions(template.beforeActions || []);
    setAfterActions(template.afterActions || []);
    setSharedTimeout(template.timeout || 1000);
    setSelectedCategory(template.categoryId);
    
    // Set macro type based on template type
    if (template.type === "encoder-increment" || template.type === "encoder-decrement") {
      setMacroType("encoder");
    } else if (template.type === "encoder-click") {
      setMacroType("encoder-click");
    } else {
      setMacroType("standard");
    }
    
    // Load encoder-specific actions if present
    if (template.decrementActions) {
      setDecrementActions(template.decrementActions);
    }
    
    if (template.clickActions) {
      setClickActions(template.clickActions);
    }
    
    // Load editable fields configuration
    setEditableFields(template.editableFields);
  }, [template]);
  
  // Add toggleSection function similar to macro-builder
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const handleAddAction = (type: string, section: string = "main") => {
    if(isEditing) {
      addToast({
        title: "Error",
        description: "You must save or cancel the active edit before adding a new action",
        color: "danger"
      });
      return;
    }
    const newAction: Action = {
      id: crypto.randomUUID(),
      type,
      params: getDefaultParamsForType(type),
    };
    
    if (section === "before") {
      setBeforeActions([...beforeActions, newAction]);
      setIsEditing({section: "before", index: beforeActions.length});
    } else if (section === "after") {
      setAfterActions([...afterActions, newAction]);
      setIsEditing({section: "after", index: afterActions.length});
    } else if (section === "decrement") {
      setDecrementActions([...decrementActions, newAction]);
      setIsEditing({section: "decrement", index: decrementActions.length});
    } else if (section === "click") {
      setClickActions([...clickActions, newAction]);
      setIsEditing({section: "click", index: clickActions.length});
    } else {
      setActions([...actions, newAction]);
      setIsEditing({section: "main", index: actions.length});
    }
    
    // Add the new action to editableActionParams so it can be selected in editable fields
    setEditableFields(prev => {
      return {
        ...prev,
        actionParams: [
          ...prev.actionParams,
          {
            id: newAction.id,
            section: section as any, // Cast to satisfy type requirements
            params: [] // Start with no params selected
          }
        ]
      };
    });
  };

  const getDefaultParamsForType = (type: string): Record<string, any> => {
    switch (type) {
      case "keypress":
        return { key: "", modifiers: [], hold: false, duration: 500 };
      case "keyrelease":
        return { key: "" };
      case "mouseclick":
        return { button: "left", hold: false };
      case "mouserelease":
        return { button: "left" };
      case "mousemove":
        return { 
          x: 0, 
          y: 0,
          relative: false,
          direction: "right", 
          distance: 100
        };


      case "delay":
        return { duration: 500 };
      default:
        return {};
    }
  };

  const handleUpdateAction = (index: number, updatedAction: Action, section: string = "main") => {
    // Add validation for key press actions
        if ((updatedAction.type === "keypress" || updatedAction.type === "keyrelease") && 
       (!updatedAction.params.key || updatedAction.params.key === "")) {
      addToast({
        title: "Invalid Action",
        description: "Key press actions must have a key specified",
        color: "danger"
      });
      return;
    }
    
    if (section === "before") {
      const newActions = [...beforeActions];
      newActions[index] = updatedAction;
      setBeforeActions(newActions);
    } else if (section === "after") {
      const newActions = [...afterActions];
      newActions[index] = updatedAction;
      setAfterActions(newActions);
    } else if (section === "decrement") {
      const newActions = [...decrementActions];
      newActions[index] = updatedAction;
      setDecrementActions(newActions);
    } else if (section === "click") {
      const newActions = [...clickActions];
      newActions[index] = updatedAction;
      setClickActions(newActions);
    } else {
      const newActions = [...actions];
      newActions[index] = updatedAction;
      setActions(newActions);
    }
    
    // Add the updated action's params to editable fields if it's not already there
    setEditableFields(prev => {
      // Check if this action is already in the editable fields
      const existingIndex = prev.actionParams.findIndex(param => param.id === updatedAction.id);
      
      if (existingIndex === -1) {
        // Action not found, add it
        return {
          ...prev,
          actionParams: [
            ...prev.actionParams,
            {
              id: updatedAction.id,
              section: section as any,
              params: [] // Start with no params selected
            }
          ]
        };
      }
      
      // Action already exists, no need to update
      return prev;
    });
    
    setIsEditing(null);
  };

  const handleDeleteAction = (index: number, section: string = "main") => {
    let actionId = "";
    
    if (section === "before") {
      actionId = beforeActions[index].id;
      const newActions = [...beforeActions];
      newActions.splice(index, 1);
      setBeforeActions(newActions);
    } else if (section === "after") {
      actionId = afterActions[index].id;
      const newActions = [...afterActions];
      newActions.splice(index, 1);
      setAfterActions(newActions);
    } else if (section === "decrement") {
      actionId = decrementActions[index].id;
      const newActions = [...decrementActions];
      newActions.splice(index, 1);
      setDecrementActions(newActions);
    } else if (section === "click") {
      actionId = clickActions[index].id;
      const newActions = [...clickActions];
      newActions.splice(index, 1);
      setClickActions(newActions);
    } else {
      actionId = actions[index].id;
      const newActions = [...actions];
      newActions.splice(index, 1);
      setActions(newActions);
    }
    
    // Also remove this action from the editable fields configuration
    setEditableFields(prev => {
      return {
        ...prev,
        actionParams: prev.actionParams.filter(
          item => !(item.id === actionId && item.section === section)
        )
      };
    });
  };

  const handleDragEnd = (result: any, section: string = "main") => {
    if (!result.destination) return;
    
    const startIndex = result.source.index;
    const endIndex = result.destination.index;
    
    if (section === "before") {
      const newActions = [...beforeActions];
      const [removed] = newActions.splice(startIndex, 1);
      newActions.splice(endIndex, 0, removed);
      setBeforeActions(newActions);
    } else if (section === "after") {
      const newActions = [...afterActions];
      const [removed] = newActions.splice(startIndex, 1);
      newActions.splice(endIndex, 0, removed);
      setAfterActions(newActions);
    } else if (section === "decrement") {
      const newActions = [...decrementActions];
      const [removed] = newActions.splice(startIndex, 1);
      newActions.splice(endIndex, 0, removed);
      setDecrementActions(newActions);
    } else if (section === "click") {
      const newActions = [...clickActions];
      const [removed] = newActions.splice(startIndex, 1);
      newActions.splice(endIndex, 0, removed);
      setClickActions(newActions);
    } else {
      const newActions = [...actions];
      const [removed] = newActions.splice(startIndex, 1);
      newActions.splice(endIndex, 0, removed);
      setActions(newActions);
    }
  };

  const handleStartSave = () => {
    // Validate required fields
    if (!templateName.trim()) {
      addToast({
        title: "Error",
        description: "Template name is required",
        color: "danger"
      });
      return;
    }
    
    if (actions.length === 0) {
      addToast({
        title: "Error",
        description: "You must add at least one main action",
        color: "danger"
      });
      return;
    }
    
    // For encoder types, require both increment and decrement actions
    if (macroType === "encoder" && decrementActions.length === 0) {
      addToast({
        title: "Warning",
        description: "Encoder template is missing decrement actions",
        color: "warning"
      });
    }

    // Change to editable fields view instead of showing modal
    setCurrentView('editable-fields');
  };
  
  const handleSaveTemplate = () => {
    try {
      // Determine the template type based on the macro type
      let templateType: MacroTemplate["type"];
      if (macroType === "standard") {
        templateType = "standard";
      } else if (macroType === "encoder") {
        templateType = "encoder-increment";
      } else if (macroType === "encoder-click") {
        templateType = "encoder-click";
      } else {
        templateType = "standard";
      }
      
      // Create updated template object
      const updatedTemplate: MacroTemplate = {
        ...template,
        id: template.id,
        name: templateName,
        description: templateDescription,
        categoryId: selectedCategory,
        type: templateType,
        // Core action arrays
        actions: actions,
        beforeActions: beforeActions.length > 0 ? beforeActions : undefined,
        afterActions: afterActions.length > 0 ? afterActions : undefined,
        // For encoder templates
        decrementActions: decrementActions.length > 0 ? decrementActions : undefined,
        clickActions: clickActions.length > 0 ? clickActions : undefined,
        // Settings
        timeout: sharedTimeout,
        // Editable field configuration - use our managed state
        editableFields: editableFields,
        updatedAt: new Date().toISOString()
      };
      
      // Save the template
      onSave(updatedTemplate);
      
      addToast({
        title: "Success",
        description: "Template updated successfully",
        color: "success"
      });
    } catch (err) {
      console.error("Error saving template:", err);
      addToast({
        title: "Error",
        description: "Failed to save template",
        color: "danger"
      });
    }
  };

  const handleBackToEditView = () => {
    setCurrentView('edit');
  };

  const renderActionList = (actionsList: Action[], section: string) => {
    return (
      <DragDropContext onDragEnd={(result) => handleDragEnd(result, section)}>
        <Droppable droppableId={`actions-${section}`}>
          {(provided) => (
            <div
              {...provided.droppableProps}
              ref={provided.innerRef}
              className="space-y-2"
            >
              {actionsList.map((action, index) => (
                <Draggable key={action.id} draggableId={action.id} index={index}>
                  {(provided) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.draggableProps}
                      {...provided.dragHandleProps}
                    >
                      {isEditing?.section === section && isEditing.index === index ? (
                        <ActionEditor
                          action={action}
                          onSave={(updatedAction) => handleUpdateAction(index, updatedAction, section)}
                          onCancel={handleCancelEdit}
                        />
                      ) : (
                        <Card className="p-3">
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <div className="bg-default-100 p-1 rounded-full">
                                <Icon icon="lucide:grip" className="text-default-500" />
                              </div>
                              <div>
                                <span className="font-medium capitalize">{action.type}</span>
                                <p className="text-xs text-foreground-500">
                                  {getActionSummary(action)}
                                </p>
                              </div>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                onPress={() => setIsEditing({section, index})}
                              >
                                <Icon icon="lucide:edit" className="text-default-500" />
                              </Button>
                              <Button
                                isIconOnly
                                size="sm"
                                variant="light"
                                color="danger"
                                onPress={() => handleDeleteAction(index, section)}
                              >
                                <Icon icon="lucide:trash-2" className="text-danger" />
                              </Button>
                            </div>
                          </div>
                        </Card>
                      )}
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    );
  };

  const renderActionButtons = (section: string) => {
    return (
      <div className="flex gap-2 mt-4">
        {/* Key Dropdown */}
        <Dropdown>
          <DropdownTrigger>
            <Button size="sm" variant="flat" endContent={<Icon icon="lucide:chevron-down" className="text-foreground-500" />}>
              + Key
        </Button>
          </DropdownTrigger>
          <DropdownMenu 
            aria-label="Key action types"
            className="z-50"
          >
            <DropdownItem key="keypress" onPress={() => handleAddAction("keypress", section)}>
              Key Press
            </DropdownItem>
            <DropdownItem key="keyrelease" onPress={() => handleAddAction("keyrelease", section)}>
              Key Release
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
        
        {/* Mouse Dropdown */}
        <Dropdown>
          <DropdownTrigger>
            <Button size="sm" variant="flat" endContent={<Icon icon="lucide:chevron-down" className="text-foreground-500" />}>
              + Mouse
            </Button>
          </DropdownTrigger>
          <DropdownMenu 
            aria-label="Mouse action types"
            className="z-50"
          >
            <DropdownItem key="mouseclick" onPress={() => handleAddAction("mouseclick", section)}>
              Mouse Click
            </DropdownItem>
            <DropdownItem key="mousemove" onPress={() => handleAddAction("mousemove", section)}>
              Mouse Move
            </DropdownItem>
            <DropdownItem key="mouserelease" onPress={() => handleAddAction("mouserelease", section)}>
              Mouse Release
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
        
        <Button size="sm" variant="flat" onPress={() => handleAddAction("delay", section)}>
          + Delay
        </Button>
      </div>
    );
  };

  // Get all params for an action type
  const getActionParams = (action: Action): string[] => {
    if (!action) return [];
    
    // Return different params based on action type
    switch (action.type) {
      case "keypress":
        return ["key", "modifiers", "hold", "duration"];
      case "keyrelease":
        return ["key"];
      case "mouseclick":
        return ["button", "hold"];
      case "mouserelease":
        return ["button"];
      case "mousemove":
        return action.params.relative 
          ? ["relative", "direction", "distance", "duration"] 
          : ["x", "y", "relative", "duration"];


      case "delay":
        return ["duration"];
      default:
        return Object.keys(action.params);
    }
  };

  // Helper to get friendly names for action params
  const getParamFriendlyName = (param: string): string => {
    const nameMap: Record<string, string> = {
      "key": "Key",
      "modifiers": "Modifiers",
      "button": "Mouse Button",
      "x": "X Coordinate",
      "y": "Y Coordinate",
      "duration": "Duration",
      "relative": "Relative Movement",
      "direction": "Direction",
      "distance": "Distance",
      "hold": "Hold Button"
    };
    
    return nameMap[param] || param;
  };

  // Get the section title
  const getSectionTitle = (section: string, macroType: string): string => {
    switch (section) {
      case "before": return "Before Actions";
      case "main": return macroType === "standard" ? "Main Actions" : "Increment Actions";
      case "after": return "After Actions";
      case "decrement": return "Decrement Actions";
      case "click": return "Click Actions";
      default: return "Actions";
    }
  };

  // Add the handleCancelEdit function
  const handleCancelEdit = () => {
    if (isEditing) {
      // If this is a newly added action (last in the array), remove it
      const { section, index } = isEditing;
      
      if (section === "before" && index === beforeActions.length - 1) {
        setBeforeActions(beforeActions.slice(0, -1));
      } else if (section === "after" && index === afterActions.length - 1) {
        setAfterActions(afterActions.slice(0, -1));
      } else if (section === "decrement" && index === decrementActions.length - 1) {
        setDecrementActions(decrementActions.slice(0, -1));
      } else if (section === "click" && index === clickActions.length - 1) {
        setClickActions(clickActions.slice(0, -1));
      } else if (section === "main" && index === actions.length - 1) {
        setActions(actions.slice(0, -1));
      }
    }
    
    setIsEditing(null);
  };

  return (
    <div className="h-full flex flex-col">
      {currentView === 'edit' ? (
        <>
          <div className="p-4 flex-grow overflow-y-auto">
            <div className="space-y-6">
              <div>
                
                
                <div className="space-y-4">
                  <Input
                    label="Template Name"
                    placeholder="Enter a name for your template"
                    value={templateName}
                    onValueChange={setTemplateName}
                  />
                  
                  <Input
                    label="Description"
                    placeholder="Brief description of what this template does"
                    value={templateDescription}
                    onValueChange={setTemplateDescription}
                  />
                  
                  <div>
                    <label className="text-sm font-medium mb-2 block">Category</label>
                    <select 
                      className="w-full rounded-md border-default-200 p-2"
                      value={selectedCategory || ""}
                      onChange={(e) => setSelectedCategory(e.target.value || undefined)}
                    >
                      <option value="">None</option>
                      {categories.map(category => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </div>
                  
                  <MacroTypeSelector 
                    value={macroType}
                    onChange={setMacroType}
                  />
                  
                  <div>
                    <p className="text-sm font-medium mb-2">Timeout (ms)</p>
                    <Input
                      type="number"
                      placeholder="Timeout in milliseconds"
                      value={sharedTimeout.toString()}
                      onValueChange={(value) => setSharedTimeout(parseInt(value) || 1000)}
                    />
                    <p className="text-xs text-foreground-500 mt-1">
                      Time before after-actions are triggered when macro is inactive
                    </p>
                  </div>
                </div>
              </div>
              
              <Divider />
              
              {/* Actions section */}
              <div>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium">Actions</h3>
                  <div className="text-sm text-foreground-500">
                    Timeout: {sharedTimeout}ms
                  </div>
                </div>
                
                <Accordion 
                  defaultSelectedKeys={
                    Object.entries(expandedSections)
                      .filter(([_, value]) => value)
                      .map(([key]) => key)
                  }
                  selectionMode="multiple"
                >
                  {/* Before Actions Section */}
                  <AccordionItem 
                    key="before" 
                    aria-label="Before Actions" 
                    title={
                      <div className="flex items-center gap-2">
                        <Icon icon="lucide:chevrons-left" className="text-foreground-500" />
                        <span>Before Actions</span>
                        <Chip size="sm" variant="flat" color="primary">{beforeActions.length}</Chip>
                      </div>
                    }
                    subtitle="Actions to execute before the main sequence (shared across all triggers)"
                  >
                    <Card className="mt-4 border-none shadow-none">
                      <CardBody>
                        {renderActionList(beforeActions, "before")}
                        {renderActionButtons("before")}
                      </CardBody>
                    </Card>
                  </AccordionItem>
                  
                  {/* Main Actions Section */}
                  <AccordionItem 
                    key="main" 
                    aria-label="Main Actions" 
                    title={
                      <div className="flex items-center gap-2">
                        <Icon icon="lucide:rotate-cw" className="text-foreground-500" />
                        <span>{macroType === "standard" ? "Main Actions" : "Increment Actions"}</span>
                        <Chip size="sm" variant="flat" color="primary">{actions.length}</Chip>
                      </div>
                    }
                    subtitle="Actions to execute when the macro is triggered"
                  >
                    <Card className="mt-4 border-none shadow-none">
                      <CardBody>
                        {renderActionList(actions, "main")}
                        {renderActionButtons("main")}
                      </CardBody>
                    </Card>
                  </AccordionItem>
                  
                  {/* Conditionally render AccordionItem components based on macroType */}
                  {macroType !== "standard" ? (
                    <AccordionItem 
                      key="decrement" 
                      aria-label="Decrement Actions" 
                      title={
                        <div className="flex items-center gap-2">
                          <Icon icon="lucide:rotate-ccw" className="text-foreground-500" />
                          <span>Decrement Actions</span>
                          <Chip size="sm" variant="flat" color="warning">{decrementActions.length}</Chip>
                        </div>
                      }
                      subtitle="Actions to execute when the decrement trigger is triggered"
                    >
                      <Card className="mt-4 border-none shadow-none">
                        <CardBody>
                          {renderActionList(decrementActions, "decrement")}
                          {renderActionButtons("decrement")}
                        </CardBody>
                      </Card>
                    </AccordionItem>
                  ) : null}
                  
                  {/* Conditionally render Click Actions */}
                  {macroType === "encoder-click" ? (
                    <AccordionItem 
                      key="click" 
                      aria-label="Click Actions" 
                      title={
                        <div className="flex items-center gap-2">
                          <Icon icon="lucide:mouse-pointer-click" className="text-foreground-500" />
                          <span>Click Actions</span>
                          <Chip size="sm" variant="flat" color="secondary">{clickActions.length}</Chip>
                        </div>
                      }
                      subtitle="Actions to execute when the encoder is clicked"
                    >
                      <Card className="mt-4 border-none shadow-none">
                        <CardBody>
                          {renderActionList(clickActions, "click")}
                          {renderActionButtons("click")}
                        </CardBody>
                      </Card>
                    </AccordionItem>
                  ) : null}
                  
                  {/* After Actions Section */}
                  <AccordionItem 
                    key="after" 
                    aria-label="After Actions" 
                    title={
                      <div className="flex items-center gap-2">
                        <Icon icon="lucide:chevrons-right" className="text-foreground-500" />
                        <span>After Actions</span>
                        <Chip size="sm" variant="flat" color="default">{afterActions.length}</Chip>
                      </div>
                    }
                    subtitle="Actions to execute after timeout when the macro is inactive"
                  >
                    <Card className="mt-4 border-none shadow-none">
                      <CardBody>
                        {renderActionList(afterActions, "after")}
                        {renderActionButtons("after")}
                      </CardBody>
                    </Card>
                  </AccordionItem>
                </Accordion>
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-default-200 flex justify-end gap-2">
            <Button variant="flat" onPress={onCancel}>
              Cancel
            </Button>
            <Button color="primary" onPress={handleStartSave}>
              Next: Configure Editable Fields
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="p-4 flex-grow overflow-y-auto">
            <div className="mb-6 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Button
                  variant="flat"
                  size="sm"
                  startContent={<Icon icon="lucide:arrow-left" />}
                  onPress={handleBackToEditView}
                >
                  Back to Edit
                </Button>
                <h2 className="text-xl font-semibold">Configure Editable Fields</h2>
              </div>
              <div className="text-sm text-foreground-500">
                Step 2 of 2
              </div>
            </div>
            
            <div className="mb-4">
              <p className="text-sm text-foreground-600">
                Select which parts of the template can be customized when creating a macro from it.
                Users will be able to modify any parameter you mark as editable.
              </p>
            </div>

            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-medium mb-2">Template Options</h3>
                <div className="space-y-3">
                  <Checkbox
                    isSelected={editableFields.category}
                    onValueChange={(checked) => {
                      setEditableFields({
                        ...editableFields,
                        category: checked
                      });
                    }}
                  >
                    Category {selectedCategory ? `(${categories.find(c => c.id === selectedCategory)?.name || 'None'})` : '(None)'}
                  </Checkbox>
                  
                  <div className="pl-6 pt-2 text-sm text-foreground-500">
                    <p>MIDI values will always be editable in templates.</p>
                    <p>This includes channel, note/controller number, and CC values.</p>
                  </div>
                </div>
              </div>

              <Divider />

              <div>
                <h3 className="text-lg font-medium mb-3">Editable Action Parameters</h3>
                <p className="text-sm text-foreground-500 mb-4">
                  Select which parameters should be editable when using this template
                </p>

                {(() => {
                  // Determine if this macro is an encoder macro
                  const isEncoder = macroType !== "standard";
                  
                  // Create an array of sections to display
                  const sectionsToShow = ["before", "main"];
                  if (isEncoder) sectionsToShow.push("decrement");
                  if (macroType === "encoder-click") sectionsToShow.push("click");
                  sectionsToShow.push("after");
                  
                  return (
                    <>
                      {sectionsToShow.map(section => {
                        // Get the actions based on the section
                        let sectionActions: Action[] = [];
                        if (section === "before") sectionActions = beforeActions;
                        else if (section === "main") sectionActions = actions;
                        else if (section === "after") sectionActions = afterActions;
                        else if (section === "decrement") sectionActions = decrementActions;
                        else if (section === "click") sectionActions = clickActions;
                        
                        if (sectionActions.length === 0) return null;

                        return (
                          <div key={section} className="mb-5">
                            <h4 className="font-medium text-md border-b pb-2 mb-3">{getSectionTitle(section, macroType)}</h4>
                            <div className="space-y-4">
                              {sectionActions.map((action, index) => {
                                // Find this action in the editableActionParams list
                                const editableParamsConfig = editableFields.actionParams.find(
                                  item => item.id === action.id && item.section === section
                                );
                                
                                // If not found (shouldn't happen if our logic is correct), create a default
                                const editableParams = editableParamsConfig?.params || [];
                                  
                                // Get all available params for this action type
                                const availableParams = getActionParams(action);

                                return (
                                  <Card key={action.id} className="p-3">
                                    <div className="mb-2">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="text-foreground-500">{index + 1}.</span>
                                        <span className="font-medium capitalize">{action.type}</span>
                                      </div>
                                      <p className="text-xs text-foreground-500 pl-6">
                                        {getActionSummary(action)}
                                      </p>
                                    </div>
                                    
                                    <div className="pl-6 mt-3">
                                      <p className="text-sm mb-2">Editable parameters:</p>
                                      <div className="grid grid-cols-2 gap-2">
                                        {availableParams.map(param => (
                                          <Checkbox
                                            key={param}
                                            size="sm"
                                            isSelected={editableParams.includes(param)}
                                            onValueChange={() => {
                                              // Toggle this param for this action
                                              setEditableFields(prev => {
                                                const newActionParams = prev.actionParams.map(item => {
                                                  if (item.id === action.id && item.section === section) {
                                                    // Toggle the param
                                                    const newParams = item.params.includes(param)
                                                      ? item.params.filter(p => p !== param)
                                                      : [...item.params, param];
                                                    
                                                    return { ...item, params: newParams };
                                                  }
                                                  return item;
                                                });
                                                
                                                // If this action wasn't in the list yet, add it
                                                if (!editableParamsConfig) {
                                                  newActionParams.push({
                                                    id: action.id,
                                                    section: section as any,
                                                    params: [param]
                                                  });
                                                }
                                                
                                                return {
                                                  ...prev,
                                                  actionParams: newActionParams
                                                };
                                              });
                                            }}
                                          >
                                            {getParamFriendlyName(param)}
                                          </Checkbox>
                                        ))}
                                      </div>
                                    </div>
                                  </Card>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-default-200 flex justify-end gap-2">
            <Button variant="flat" onPress={handleBackToEditView}>
              Back
            </Button>
            <Button color="primary" onPress={handleSaveTemplate}>
              Save Template
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

function getActionSummary(action: Action): string {
  switch (action.type) {
    case "keypress":
      if (action.params.hold) {
        return `Hold ${action.params.key}${action.params.modifiers?.length ? ` with ${action.params.modifiers.join('+')}` : ''}`;
      } else {
      return `Press ${action.params.key}${action.params.modifiers?.length ? ` with ${action.params.modifiers.join('+')}` : ''}`;
      }
    case "keyrelease":
      return `Release ${action.params.key}`;
    case "mouseclick":
      if (action.params.button === "scroll-up") {
        return `Scroll up (amount: ${action.params.amount || 3})`;
      } else if (action.params.button === "scroll-down") {
        return `Scroll down (amount: ${action.params.amount || 3})`;
      } else {
      return `${action.params.button} click${action.params.hold ? ' (hold)' : ''}`;
      }
    case "mouserelease":
      return `Release ${action.params.button} button`;
    case "mousemove":
      if (action.params.relative) {
        return `Move ${action.params.direction || 'right'} by ${action.params.distance || 100}px`;
      } else {
        return `Move to (${action.params.x}, ${action.params.y})`;
      }

    case "delay":
      return `Wait for ${action.params.duration}ms`;
    default:
      return "Unknown action";
  }
} 