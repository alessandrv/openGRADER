import React, { useState, useEffect } from "react";
import { Button, Card, Input, Modal,addToast, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Chip, Checkbox } from "@heroui/react";
import { Icon } from "@iconify/react";
import { MacroTemplate, MacroDefinition, Action, MacroCategory } from "../types/macro";

interface TemplateManagerProps {
  macro: MacroDefinition;
  onClose: () => void;
  onSave: (template: MacroTemplate) => void;
  categories: MacroCategory[];
  initialEditableFields?: MacroTemplate["editableFields"];
  isEditing?: boolean;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({ 
  macro, 
  onClose, 
  onSave,
  categories,
  initialEditableFields,
  isEditing = false
}) => {
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [includeCategoryInTemplate, setIncludeCategoryInTemplate] = useState(true);
  const [includeMidiValues, setIncludeMidiValues] = useState(false);
  const [editableMidiValues, setEditableMidiValues] = useState({
    channel: true,
    note: true,
    controller: true,
    value: true
  });
  const [editableActionParams, setEditableActionParams] = useState<{
    id: string;
    section: "before" | "main" | "after" | "decrement" | "click";
    params: string[];
  }[]>([]);
  

  // Initialize form on mount
  useEffect(() => {
    // If editing, use the template name as the initial name
    if (isEditing) {
      setTemplateName(macro.name);
      // For description, check if it exists on macro via type assertion
      setTemplateDescription((macro as any).description || "");
      
      // If we have initial editable fields, use them
      if (initialEditableFields) {
        setIncludeCategoryInTemplate(initialEditableFields.category);
        // Use type assertion to address section string type
        setEditableActionParams(initialEditableFields.actionParams as {
          id: string;
          section: "before" | "main" | "after" | "decrement" | "click";
          params: string[];
        }[]);
      }
    } else {
      setTemplateName(macro.name);
    setIncludeCategoryInTemplate(!!macro.categoryId);
    }

    // If we don't have initial editable fields or we're not editing, set up editable params
    if (!initialEditableFields || !isEditing) {
    // Check if this is a merged encoder macro with all parts
    const encoderGroup = (macro as any)._encoderGroup;
    const isEncoderGroup = !!encoderGroup;

    // Initialize editable action params
    const initialParams: {
      id: string;
      section: "before" | "main" | "after" | "decrement" | "click";
      params: string[];
    }[] = [];

    // Add main actions
    macro.actions.forEach(action => {
      initialParams.push({
        id: action.id,
        section: "main",
        params: [] // Start with no params selected
      });
    });

      // Add before actions
      if (macro.beforeActions) {
        macro.beforeActions.forEach(action => {
          initialParams.push({
            id: action.id,
            section: "before",
            params: []
          });
        });
      }

      // Add after actions
      if (macro.afterActions) {
        macro.afterActions.forEach(action => {
          initialParams.push({
            id: action.id,
            section: "after",
            params: []
          });
        });
      }

    // If this is a merged encoder macro, add actions from all parts
    if (isEncoderGroup) {
      console.log("Processing encoder group with all parts:", encoderGroup);

      // Add decrement actions if they exist
      if (encoderGroup.decrement && encoderGroup.decrement.actions) {
        encoderGroup.decrement.actions.forEach((action: Action) => {
          initialParams.push({
            id: action.id,
            section: "decrement", 
            params: []
          });
        });
      }
      
      // Add click actions if they exist
      if (encoderGroup.click && encoderGroup.click.actions) {
        encoderGroup.click.actions.forEach((action: Action) => {
          initialParams.push({
            id: action.id,
            section: "click",
            params: []
          });
        });
      }
    }

      setEditableActionParams(initialParams);
    }
  }, [macro, initialEditableFields, isEditing]);

  const handleActionParamToggle = (actionId: string, section: "before" | "main" | "after" | "decrement" | "click", paramName: string) => {
    setEditableActionParams(prev => {
      return prev.map(item => {
        if (item.id === actionId && item.section === section) {
          // Toggle the param - add it if not present, remove it if present
          const newParams = item.params.includes(paramName)
            ? item.params.filter(p => p !== paramName)
            : [...item.params, paramName];
          
          return { ...item, params: newParams };
        }
        return item;
      });
    });
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim()) {
      addToast({
        title: "Error",
        description: "Template name cannot be empty",
        color: "danger"
      });
      return;
    }

    // Check if this is a merged encoder macro with all parts
    const encoderGroup = (macro as any)._encoderGroup;
    const isEncoderGroup = !!encoderGroup;
    
    // Get all macros with the same groupId if this is part of a group
    let relatedMacros: MacroDefinition[] = [];
    if (macro.groupId && !isEncoderGroup) {
      const allMacros: MacroDefinition[] = JSON.parse(localStorage.getItem("midiMacros") || "[]");
      relatedMacros = allMacros.filter(m => m.groupId === macro.groupId);
    }

    // Find increment, decrement, and click parts
    let incrementPart: MacroDefinition | undefined;
    let decrementPart: MacroDefinition | undefined;
    let clickPart: MacroDefinition | undefined;
    
    if (isEncoderGroup) {
      // Use the pre-loaded encoder parts from the merged macro
      incrementPart = encoderGroup.increment;
      decrementPart = encoderGroup.decrement;
      clickPart = encoderGroup.click;
    } else {
      // Otherwise find them from related macros
      incrementPart = macro.type === "encoder-increment" ? macro : 
        relatedMacros.find(m => m.type === "encoder-increment");
      decrementPart = macro.type === "encoder-decrement" ? macro : 
        relatedMacros.find(m => m.type === "encoder-decrement");
      clickPart = macro.type === "encoder-click" ? macro : 
        relatedMacros.find(m => m.type === "encoder-click");
    }

    // Determine the type of template based on available parts
    let templateType: "standard" | "encoder-increment" | "encoder-decrement" | "encoder-click" = "standard";
    if (macro.groupId || isEncoderGroup) {
      if (clickPart) {
        templateType = "encoder-click"; // Full encoder with click
      } else if (incrementPart || decrementPart) {
        templateType = incrementPart ? "encoder-increment" : "encoder-decrement";
      }
    } else {
      templateType = macro.type as any || "standard";
    }

    // Get actions for each part of the template
    const mainActions = incrementPart?.actions || macro.actions || [];
    const decrementActions = decrementPart?.actions || [];
    const clickActions = clickPart?.actions || [];
    const beforeActions = macro.beforeActions || [];
    const afterActions = macro.afterActions || [];
    
    // Debug to help check for duplications
    console.log("Creating template with:");
    console.log(`- Template type: ${templateType}`);
    console.log(`- Main actions: ${mainActions.length}`);
    if (templateType.includes("encoder")) {
      console.log(`- Decrement actions: ${decrementActions.length}`);
      if (templateType === "encoder-click") {
        console.log(`- Click actions: ${clickActions.length}`);
      }
    }
    console.log(`- Before actions: ${beforeActions.length}`);
    console.log(`- After actions: ${afterActions.length}`);

    // Determine if we're editing or creating a new template
    const templateId = isEditing ? macro.id : crypto.randomUUID();
    const createdDate = isEditing ? (macro as any).createdAt : new Date().toISOString();

    // Create template object
    const template: MacroTemplate = {
      id: templateId,
      name: templateName,
      description: templateDescription,
      categoryId: includeCategoryInTemplate ? macro.categoryId : undefined,
      type: templateType,
      actions: mainActions,
      beforeActions: beforeActions.length > 0 ? beforeActions : undefined,
      afterActions: afterActions.length > 0 ? afterActions : undefined,
      timeout: macro.timeout,
      // For encoder templates, store the decrement and click actions
      decrementActions: templateType.includes("encoder") ? decrementActions : undefined,
      clickActions: templateType === "encoder-click" ? clickActions : undefined,
      editableFields: {
        category: includeCategoryInTemplate,
        midi: true, // Always true to ensure MIDI values are editable
        midiValues: {
          channel: true,
          note: true,
          controller: true,
          value: true
        }, // Always enable all MIDI value fields
        actionParams: editableActionParams,
      },
      createdAt: createdDate,
      updatedAt: isEditing ? new Date().toISOString() : undefined
    };

    // Save the template
    onSave(template);
    
    // Show success toast
    addToast({
      title: isEditing ? "Template Updated" : "Template Created",
      description: `Template "${templateName}" ${isEditing ? "updated" : "saved"} successfully`,
      color: "success"
    });

    // Close the manager
    onClose();
  };

  // Get action by ID and section for display
  const getAction = (id: string, section: string): Action | undefined => {
    // Check if this is a merged encoder macro with all parts
    const encoderGroup = (macro as any)._encoderGroup;
    const isEncoderGroup = !!encoderGroup;

    if (section === "main") {
      return macro.actions.find(a => a.id === id);
    } else if (section === "before" && macro.beforeActions) {
      return macro.beforeActions.find(a => a.id === id);
    } else if (section === "after" && macro.afterActions) {
      return macro.afterActions.find(a => a.id === id);
    } else if (section === "decrement") {
      // Try to find the action in the merged encoder group first
      if (isEncoderGroup && encoderGroup.decrement) {
        const action = encoderGroup.decrement.actions.find((a: Action) => a.id === id);
        if (action) return action;
      }
      
      // Fallback to searching in related macros
      if (macro.groupId) {
        try {
          const allMacros: MacroDefinition[] = JSON.parse(localStorage.getItem("midiMacros") || "[]");
          const decrementMacro = allMacros.find(m => 
            m.groupId === macro.groupId && m.type === "encoder-decrement");
          if (decrementMacro && decrementMacro.actions) {
            return decrementMacro.actions.find(a => a.id === id);
          }
        } catch (e) {
          console.error("Error finding decrement action:", e);
        }
      }
    } else if (section === "click") {
      // Try to find the action in the merged encoder group first
      if (isEncoderGroup && encoderGroup.click) {
        const action = encoderGroup.click.actions.find((a: Action) => a.id === id);
        if (action) return action;
      }
      
      // Fallback to searching in related macros
      if (macro.groupId) {
        try {
          const allMacros: MacroDefinition[] = JSON.parse(localStorage.getItem("midiMacros") || "[]");
          const clickMacro = allMacros.find(m => 
            m.groupId === macro.groupId && m.type === "encoder-click");
          if (clickMacro && clickMacro.actions) {
            return clickMacro.actions.find(a => a.id === id);
          }
        } catch (e) {
          console.error("Error finding click action:", e);
        }
      }
    }
    return undefined;
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

  // Get summary of the action for display
  const getActionSummary = (action: Action): string => {
    switch (action.type) {
      case "keypress":
        return `Press ${action.params.key}${action.params.modifiers?.length ? ` with ${action.params.modifiers.join('+')}` : ''}`;
      case "keyhold":
        return `Hold ${action.params.key} for ${action.params.duration}ms`;
      case "mouseclick":
        return `${action.params.button} click${action.params.hold ? ' (hold)' : ''}`;
      case "mouserelease":
        return `Release ${action.params.button} button`;
      case "mousemove":
        if (action.params.relative) {
          return `Move ${action.params.direction || 'right'} by ${action.params.distance || 100}px in ${action.params.duration}ms`;
        } else {
          return `Move to (${action.params.x}, ${action.params.y}) in ${action.params.duration}ms`;
        }
      case "mousedrag":
        return `Drag ${action.params.direction} by ${action.params.distance}px in ${action.params.duration}ms`;
      case "delay":
        return `Wait for ${action.params.duration}ms`;
      default:
        return "Unknown action";
    }
  };

  // Get all params for an action type
  const getActionParams = (action: Action): string[] => {
    if (!action) return [];
    
    // Return different params based on action type
    switch (action.type) {
      case "keypress":
        return ["key", "modifiers"];
      case "keyhold":
        return ["key", "modifiers", "duration"];
      case "mouseclick":
        return ["button", "hold"];
      case "mouserelease":
        return ["button"];
      case "mousemove":
        return action.params.relative 
          ? ["relative", "direction", "distance", "duration"] 
          : ["x", "y", "relative", "duration"];
      case "mousedrag":
        return ["button", "direction", "distance", "duration"];
      case "delay":
        return ["duration"];
      default:
        return Object.keys(action.params);
    }
  };

  // Get the section title
  const getSectionTitle = (section: string): string => {
    switch (section) {
      case "before": return "Before Actions";
      case "main": return "Main Actions";
      case "after": return "After Actions";
      case "decrement": return "Decrement Actions";
      case "click": return "Click Actions";
      default: return "Actions";
    }
  };

  return (
    <Card className="p-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold">Create Template from Macro</h2>
        <p className="text-foreground-500 text-sm">
          Select which fields should be editable when creating macros from this template
        </p>
      </div>

      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
        <div>
          <Input
            label="Template Name"
            placeholder="Enter a name for this template"
            value={templateName}
            onValueChange={setTemplateName}
            className="mb-3"
          />
          <Input
            label="Description (Optional)"
            placeholder="Describe what this template is for"
            value={templateDescription}
            onValueChange={setTemplateDescription}
          />
        </div>

        <div>
          <h3 className="text-lg font-medium mb-2">Template Options</h3>
          <div className="space-y-3">
            <Checkbox
              isSelected={includeCategoryInTemplate}
              onValueChange={setIncludeCategoryInTemplate}
            >
              Include Category ({macro.categoryId ? categories.find(c => c.id === macro.categoryId)?.name || 'None' : 'None'})
            </Checkbox>
            
            {/* MIDI values are always editable, so this checkbox is no longer needed */}
            <div className="pl-6 pt-2 text-sm text-foreground-500">
              <p>MIDI values will always be editable in templates.</p>
              <p>This includes channel, note/controller number, and CC values.</p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-medium mb-2">Editable Action Parameters</h3>
          <p className="text-sm text-foreground-500 mb-4">
            Select which parameters will be editable when using this template
          </p>

          {/* Check if this is an encoder macro to determine which sections to show */}
          {(() => {
            // Determine if this macro is an encoder macro
            const encoderGroup = (macro as any)._encoderGroup;
            const isEncoderGroup = !!encoderGroup;
            const isEncoder = isEncoderGroup || 
              (macro.groupId && (macro.type?.includes("encoder") || false));
            
            // Determine which sections to show
            const hasDecrement = isEncoder && 
              (isEncoderGroup ? !!encoderGroup.decrement : true);
            const hasClick = isEncoder && 
              (isEncoderGroup ? !!encoderGroup.click : macro.type === "encoder-click");
            
            // Create an array of sections to display
            const sectionsToShow = ["before", "main"];
            if (hasDecrement) sectionsToShow.push("decrement");
            if (hasClick) sectionsToShow.push("click");
            sectionsToShow.push("after");
            
            return (
              <>
                {sectionsToShow.map(section => {
                  const actionsForSection = editableActionParams.filter(item => item.section === section);
                  if (actionsForSection.length === 0) return null;

                  return (
                    <div key={section} className="mb-4">
                      <h4 className="font-medium mb-2">{getSectionTitle(section)}</h4>
                      <div className="space-y-4">
                        {actionsForSection.map((item, index) => {
                          const action = getAction(item.id, section);
                          if (!action) return null;
                          
                          const availableParams = getActionParams(action);

                          return (
                            <Card key={item.id} className="p-3">
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
                                      isSelected={item.params.includes(param)}
                                      onValueChange={() => handleActionParamToggle(item.id, item.section, param)}
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

      <div className="flex justify-end gap-2 mt-6">
        <Button variant="flat" onPress={onClose}>
          Cancel
        </Button>
        <Button color="primary" onPress={handleSaveTemplate}>
          Save Template
        </Button>
      </div>
    </Card>
  );
}; 