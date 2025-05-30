import React, { useState, useEffect } from "react";
import { Button, Card, Input, Modal, addToast, ModalContent, ModalHeader, ModalBody, ModalFooter, Select, SelectItem, useDisclosure, Checkbox } from "@heroui/react";
import { Icon } from "@iconify/react";
import { MacroTemplate, MacroDefinition, Action, MacroCategory } from "../types/macro";
import { MidiTriggerSelector } from "./midi-trigger-selector";
import { getCursorPosition } from "../lib/tauri";

interface TemplateApplyProps {
  template: MacroTemplate;
  categories: MacroCategory[];
  onCancel: () => void;
  onApplyTemplate: (macro: MacroDefinition) => void;
  onEditBeforeSaving: (macro: MacroDefinition) => void;
}

export const TemplateApply: React.FC<TemplateApplyProps> = ({
  template,
  categories,
  onCancel,
  onApplyTemplate,
  onEditBeforeSaving
}) => {
  const [macroName, setMacroName] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>(template.categoryId);
  const [midiTrigger, setMidiTrigger] = useState<MacroDefinition['trigger'] | null>(null);
  const [decrementTrigger, setDecrementTrigger] = useState<MacroDefinition['trigger'] | null>(null);
  const [clickTrigger, setClickTrigger] = useState<MacroDefinition['trigger'] | null>(null);
  const [editableFields, setEditableFields] = useState<Record<string, any>>({});
  const [isDetectingKey, setIsDetectingKey] = useState(false);
  const [coordCaptureActive, setCoordCaptureActive] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [activeCoordinateField, setActiveCoordinateField] = useState<string | null>(null);
  
  // Initialize form on mount
  useEffect(() => {
    setMacroName("");
    
    // Initialize field values from template
    const initialFields: Record<string, any> = {};
    
    // Pre-fill editable fields with default values from the template
    template.editableFields.actionParams.forEach(param => {
      const action = findTemplateAction(param.id, param.section);
      if (action) {
        param.params.forEach(paramName => {
          const key = `${param.section}_${param.id}_${paramName}`;
          // Set default value from the action
          initialFields[key] = action.params[paramName];
        });
      }
    });
    
    setEditableFields(initialFields);
  }, [template]);
  
  // Add effect for coordinate detection
  useEffect(() => {
    if (!coordCaptureActive) return;
    
    const checkInterval = setInterval(async () => {
      try {
        // Get the actual screen cursor position from Tauri backend
        const [x, y] = await getCursorPosition();
        setMousePosition({ x, y });
      } catch (error) {
        console.error("Failed to get cursor position:", error);
      }
    }, 100); // Update every 100ms
    
    // Handle keyboard shortcuts for coordinate capture
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Escape cancels the detection
      if (e.key === "Escape") {
        setCoordCaptureActive(false);
        setActiveCoordinateField(null);
        addToast({
          title: "Coordinates Capture Cancelled",
          description: "Coordinate detection mode was cancelled",
          color: "warning"
        });
      }
      
      // Ctrl+C captures the current coordinates
      if (e.key === "c" && e.ctrlKey) {
        e.preventDefault(); // Prevent normal copy behavior
        try {
          const [x, y] = await getCursorPosition();
          console.log("Captured coordinates from backend:", x, y);
          
          if (activeCoordinateField) {
            // Update the specific field with coordinates
            setEditableFields(prev => ({
              ...prev,
              [`${activeCoordinateField}_x`]: x,
              [`${activeCoordinateField}_y`]: y
            }));
            
            // Exit capture mode
            setCoordCaptureActive(false);
            setActiveCoordinateField(null);
            
            // Show confirmation toast
            addToast({
              title: "Coordinates Captured",
              description: `Captured coordinates: X: ${x}, Y: ${y}`,
              color: "success"
            });
          }
        } catch (error) {
          console.error("Failed to capture cursor position:", error);
          addToast({
            title: "Capture Failed",
            description: "Could not get cursor position from system",
            color: "danger"
          });
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    
    return () => {
      clearInterval(checkInterval);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [coordCaptureActive, activeCoordinateField, addToast]);
  
  // Add handler for coordinate capture
  const handleCoordinateCapture = (fieldKey: string) => {
    // Start coordinate capture mode
    setCoordCaptureActive(true);
    setActiveCoordinateField(fieldKey);
    
    // Show a toast with instructions
    addToast({
      title: "Coordinate Capture Mode Activated",
      description: "Press Ctrl+C to capture coordinates or ESC to cancel",
      color: "primary"
    });
  };
  
  // Handle key detection for keypress actions
  const handleKeyDetection = (fieldKey: string) => {
    setIsDetectingKey(true);
    
    // Add a one-time event listener for the keydown event
    const keyHandler = (e: KeyboardEvent) => {
      e.preventDefault();
      handleFieldChange(fieldKey, e.key);
      // Clear the detecting state
      setIsDetectingKey(false);
      // Remove the event listener
      window.removeEventListener("keydown", keyHandler);
    };
    
    // Add the event listener
    window.addEventListener("keydown", keyHandler);
  };
  
  // Function to toggle a modifier in the array
  const toggleModifier = (fieldKey: string, modifier: string) => {
    const currentModifiers = [...(editableFields[fieldKey] || [])];
    const index = currentModifiers.indexOf(modifier);
    
    if (index >= 0) {
      currentModifiers.splice(index, 1);
    } else {
      currentModifiers.push(modifier);
    }
    
    handleFieldChange(fieldKey, currentModifiers);
  };
  
  const handleFieldChange = (key: string, value: any) => {
    setEditableFields(prev => ({
      ...prev,
      [key]: value
    }));
  };
  
  // Determine if this is an encoder template
  const isEncoderTemplate = ["encoder-increment", "encoder-decrement", "encoder-click"].includes(template.type);
  const hasDecrementActions = isEncoderTemplate && template.decrementActions && template.decrementActions.length > 0;
  const hasClickActions = isEncoderTemplate && template.clickActions && template.clickActions.length > 0;
  
  // Apply the template to create a new macro
  const applyTemplate = (editBeforeSaving: boolean) => {
    if (!macroName.trim()) {
      addToast({
        title: "Error",
        description: "Macro name cannot be empty",
        color: "danger"
      });
      return;
    }
    
    // Check for required MIDI triggers
    if (!midiTrigger) {
      addToast({
        title: "Error",
        description: isEncoderTemplate ? "Increment MIDI trigger required" : "MIDI trigger required",
        color: "danger"
      });
      return;
    }
    
    // For encoder templates, check for decrement trigger
    if (isEncoderTemplate && hasDecrementActions && !decrementTrigger) {
      addToast({
        title: "Error",
        description: "Decrement MIDI trigger required",
        color: "danger"
      });
      return;
    }
    
    // For encoder-click templates, check for click trigger
    if (isEncoderTemplate && hasClickActions && !clickTrigger) {
      addToast({
        title: "Error",
        description: "Click MIDI trigger required",
        color: "danger"
      });
      return;
    }
    
    // Clone all actions and apply the editable field values
    const newActions = template.actions.map(action => {
      const newAction = { ...action, id: crypto.randomUUID() };
      
      // Check if this action has editable params - use "main" for all template types
      const editableParams = template.editableFields.actionParams
        .find(p => p.id === action.id && p.section === "main");
      
      if (editableParams) {
        const newParams = { ...newAction.params };
        
        // Apply editable field values
        editableParams.params.forEach(paramName => {
          const key = `main_${action.id}_${paramName}`;
          if (key in editableFields) {
            newParams[paramName] = editableFields[key];
          }
        });
        
        newAction.params = newParams;
      }
      
      return newAction;
    });
    
    const newBeforeActions = template.beforeActions ? 
      template.beforeActions.map(action => {
        const newAction = { ...action, id: crypto.randomUUID() };
        
        // Check if this action has editable params
        const editableParams = template.editableFields.actionParams
          .find(p => p.id === action.id && p.section === "before");
        
        if (editableParams) {
          const newParams = { ...newAction.params };
          
          // Apply editable field values
          editableParams.params.forEach(paramName => {
            const key = `before_${action.id}_${paramName}`;
            if (key in editableFields) {
              newParams[paramName] = editableFields[key];
            }
          });
          
          newAction.params = newParams;
        }
        
        return newAction;
      }) : undefined;
    
    const newAfterActions = template.afterActions ?
      template.afterActions.map(action => {
        const newAction = { ...action, id: crypto.randomUUID() };
        
        // Check if this action has editable params
        const editableParams = template.editableFields.actionParams
          .find(p => p.id === action.id && p.section === "after");
        
        if (editableParams) {
          const newParams = { ...newAction.params };
          
          // Apply editable field values
          editableParams.params.forEach(paramName => {
            const key = `after_${action.id}_${paramName}`;
            if (key in editableFields) {
              newParams[paramName] = editableFields[key];
            }
          });
          
          newAction.params = newParams;
        }
        
        return newAction;
      }) : undefined;
      
    // Process decrement actions if this is an encoder template
    const newDecrementActions = template.decrementActions ? 
      template.decrementActions.map(action => {
        const newAction = { ...action, id: crypto.randomUUID() };
        
        // Check if this action has editable params
        const editableParams = template.editableFields.actionParams
          .find(p => p.id === action.id && p.section === "decrement");
        
        if (editableParams) {
          const newParams = { ...newAction.params };
          
          // Apply editable field values
          editableParams.params.forEach(paramName => {
            const key = `decrement_${action.id}_${paramName}`;
            if (key in editableFields) {
              newParams[paramName] = editableFields[key];
            }
          });
          
          newAction.params = newParams;
        }
        
        return newAction;
      }) : undefined;
      
    // Process click actions if this is an encoder-click template
    const newClickActions = template.clickActions ? 
      template.clickActions.map(action => {
        const newAction = { ...action, id: crypto.randomUUID() };
        
        // Check if this action has editable params
        const editableParams = template.editableFields.actionParams
          .find(p => p.id === action.id && p.section === "click");
        
        if (editableParams) {
          const newParams = { ...newAction.params };
          
          // Apply editable field values
          editableParams.params.forEach(paramName => {
            const key = `click_${action.id}_${paramName}`;
            if (key in editableFields) {
              newParams[paramName] = editableFields[key];
            }
          });
          
          newAction.params = newParams;
        }
        
        return newAction;
      }) : undefined;
    
    const timestamp = new Date().toISOString();
    let macrosToCreate: MacroDefinition[] = [];
    
    if (isEncoderTemplate && (hasDecrementActions || hasClickActions)) {
      // Create a shared group ID for all encoder-related macros
      const groupId = crypto.randomUUID();
      
      // Log for debugging
      console.log("Creating encoder template with:");
      console.log(`- Increment actions: ${newActions.length}`);
      console.log(`- Decrement actions: ${hasDecrementActions ? newDecrementActions!.length : 0}`);
      console.log(`- Click actions: ${hasClickActions ? newClickActions!.length : 0}`);
      
      // Create the increment macro - don't add suffix for edit before saving
      const incrementMacro: MacroDefinition = {
        id: crypto.randomUUID(),
        groupId: groupId,
        name: editBeforeSaving ? macroName : `${macroName}`,
        type: "encoder-increment",
        categoryId: selectedCategory,
        trigger: midiTrigger!,
        actions: newActions,
        beforeActions: newBeforeActions,
        afterActions: newAfterActions,
        timeout: template.timeout,
        createdAt: timestamp
      };
      macrosToCreate.push(incrementMacro);
      
      // Create the decrement macro if needed
      if (hasDecrementActions) {
        const decrementMacro: MacroDefinition = {
          id: crypto.randomUUID(),
          groupId: groupId,
          name: `${macroName} (Decrement)`,
          type: "encoder-decrement",
          categoryId: selectedCategory,
          trigger: decrementTrigger!,
          actions: newDecrementActions || [],
          beforeActions: newBeforeActions,
          afterActions: newAfterActions,
          timeout: template.timeout,
          createdAt: timestamp
        };
        macrosToCreate.push(decrementMacro);
      }
      
      // Create the click macro if needed
      if (hasClickActions) {
        const clickMacro: MacroDefinition = {
          id: crypto.randomUUID(),
          groupId: groupId,
          name: `${macroName} (Click)`,
          type: "encoder-click",
          categoryId: selectedCategory,
          trigger: clickTrigger!,
          actions: newClickActions || [],
          beforeActions: newBeforeActions,
          afterActions: newAfterActions,
          timeout: template.timeout,
          createdAt: timestamp
        };
        macrosToCreate.push(clickMacro);
      }
    } else {
      // Create a single standard macro
      const newMacro: MacroDefinition = {
        id: crypto.randomUUID(),
        name: macroName,
        type: template.type,
        categoryId: selectedCategory,
        trigger: midiTrigger!,
        actions: newActions,
        beforeActions: newBeforeActions,
        afterActions: newAfterActions,
        timeout: template.timeout,
        createdAt: timestamp
      };
      
      macrosToCreate.push(newMacro);
    }
    
    if (editBeforeSaving) {
      // If editing before saving, pass all the data needed
      // For encoder macros, create a complete macro with all the parts
      if (isEncoderTemplate && (hasDecrementActions || hasClickActions)) {
        // Pass the first macro but include special properties to access all the parts
        const completeMacro = {
          ...macrosToCreate[0],
          // Add special properties for the macro builder to access all parts
          _encoderGroup: {
            increment: macrosToCreate[0],
            decrement: hasDecrementActions ? macrosToCreate.find(m => m.type === "encoder-decrement") : undefined,
            click: hasClickActions ? macrosToCreate.find(m => m.type === "encoder-click") : undefined
          }
        };
        onEditBeforeSaving(completeMacro);
      } else {
        // For standard macros, just pass the created macro
        onEditBeforeSaving(macrosToCreate[0]);
      }
    } else {
      // Add all macros to localStorage
      const existingMacros: MacroDefinition[] = JSON.parse(localStorage.getItem("midiMacros") || "[]");
      
      // Debug: Check for macros with the same ID or same groupId that might cause duplicates
      const allIds = existingMacros.map(m => m.id);
      const allGroupIds = existingMacros.filter(m => m.groupId).map(m => m.groupId);
      const newIds = macrosToCreate.map(m => m.id);
      const newGroupIds = macrosToCreate.filter(m => m.groupId).map(m => m.groupId);
      
      // Check for duplicate IDs
      const duplicateIds = newIds.filter(id => allIds.includes(id));
      const duplicateGroupIds = newGroupIds.filter(id => allGroupIds.includes(id));
      
      console.log("Duplicate check:");
      console.log(`- Duplicate IDs: ${duplicateIds.length > 0 ? duplicateIds.join(", ") : "None"}`);
      console.log(`- Duplicate Group IDs: ${duplicateGroupIds.length > 0 ? duplicateGroupIds.join(", ") : "None"}`);
      console.log(`- Creating ${macrosToCreate.length} new macros`);
      console.log(`- Existing macros: ${existingMacros.length}`);
      
      // Filter out existing macros with the same groupId as any of our new macros
      // This ensures we don't have multiple encoder groups with the same actions
      let filteredExistingMacros = existingMacros;
      if (macrosToCreate.length > 0 && macrosToCreate[0].groupId) {
        const newGroupId = macrosToCreate[0].groupId;
        // Remove any existing macros with the same groupId to avoid duplication
        filteredExistingMacros = existingMacros.filter(m => m.groupId !== newGroupId);
        
        if (filteredExistingMacros.length !== existingMacros.length) {
          console.log(`Removed ${existingMacros.length - filteredExistingMacros.length} existing macros with groupId ${newGroupId}`);
        }
      }
      
      const updatedMacros = [...filteredExistingMacros, ...macrosToCreate];
      localStorage.setItem("midiMacros", JSON.stringify(updatedMacros));
      
      // Only pass the first macro to the callback - the UI will handle showing related macros
      onApplyTemplate(macrosToCreate[0]);
      
      addToast({
        title: "Macro Created",
        description: isEncoderTemplate ? 
          `Encoder macro "${macroName}" created with ${macrosToCreate.length} parts` : 
          `Macro "${macroName}" created from template`,
        color: "success"
      });
    }
  };
  
  // Find the action in the template
  const findTemplateAction = (id: string, section: string): Action | undefined => {
    if (section === "main") {
      return template.actions.find(a => a.id === id);
    } else if (section === "before" && template.beforeActions) {
      return template.beforeActions.find(a => a.id === id);
    } else if (section === "after" && template.afterActions) {
      return template.afterActions.find(a => a.id === id);
    } else if (section === "decrement" && template.decrementActions) {
      return template.decrementActions.find(a => a.id === id);
    } else if (section === "click" && template.clickActions) {
      return template.clickActions.find(a => a.id === id);
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
  
  // Get the action summary for display
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
  
  // Modify renderParamInput to add the coordinate capture button for mouse coordinates
  const renderParamInput = (action: Action, paramName: string, fieldKey: string) => {
    // Special handling for mouse coordinates
    if ((action.type === "mousemove" || action.type === "mousescroll") && 
        (paramName === "x" || paramName === "y")) {
      
      // For x/y coordinates, show them as a pair with a capture button
      if (paramName === "x") {
        const xValue = editableFields[fieldKey] || action.params[paramName] || 0;
        const yFieldKey = fieldKey.replace("_x", "_y");
        const yValue = editableFields[yFieldKey] || action.params.y || 0;
        
        return (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">Coordinates (X, Y)</label>
              <Button 
                size="sm" 
                variant="flat" 
                color="primary"
                startContent={<Icon icon="lucide:mouse-pointer-click" />}
                onPress={() => handleCoordinateCapture(fieldKey.replace("_x", ""))}
                isDisabled={coordCaptureActive}
                className="h-7"
              >
                {coordCaptureActive && activeCoordinateField === fieldKey.replace("_x", "") 
                  ? "Detecting..." 
                  : "Capture"}
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="X position"
                value={xValue.toString()}
                onValueChange={(value) => handleFieldChange(fieldKey, parseInt(value) || 0)}
                size="sm"
              />
              <Input
                type="number"
                placeholder="Y position"
                value={yValue.toString()}
                onValueChange={(value) => handleFieldChange(yFieldKey, parseInt(value) || 0)}
                size="sm"
              />
            </div>
            
            {coordCaptureActive && activeCoordinateField === fieldKey.replace("_x", "") && (
              <div className="mt-2 bg-black/80 text-white p-2 rounded-md text-xs">
                <div className="flex items-center justify-center gap-2">
                  <Icon icon="lucide:mouse-pointer" className="text-white animate-pulse" />
                  <div>
                    <p>Press <kbd className="px-1 py-0.5 bg-white/20 rounded">Ctrl+C</kbd> to capture or <kbd className="px-1 py-0.5 bg-white/20 rounded">ESC</kbd> to cancel</p>
                  </div>
                </div>
                {mousePosition.x !== 0 && mousePosition.y !== 0 && (
                  <p className="mt-1 font-mono text-center">Current: X: {mousePosition.x}, Y: {mousePosition.y}</p>
                )}
              </div>
            )}
          </div>
        );
      } else {
        // Skip the Y parameter since we're handling both X and Y together
        return null;
      }
    }
    
    // Continue with the original code for other parameter types
    if (action.type === "keypress" || action.type === "keyhold") {
      if (paramName === "key") {
        return (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">{getParamFriendlyName(paramName)}</label>
              <Button
                size="sm"
                variant="flat"
                onPress={() => handleKeyDetection(fieldKey)}
                isDisabled={isDetectingKey}
                className="h-7"
              >
                {isDetectingKey ? "Detecting..." : "Detect Key"}
              </Button>
            </div>
            <Input
              placeholder="e.g. a, b, Enter, Space"
              value={editableFields[fieldKey] || action.params[paramName] || ""}
              onValueChange={(value) => handleFieldChange(fieldKey, value)}
              size="sm"
            />
          </div>
        );
      } else if (paramName === "modifiers") {
        const selectedModifiers = editableFields[fieldKey] || action.params[paramName] || [];
        return (
          <div>
            <label className="text-sm font-medium mb-1 block">{getParamFriendlyName(paramName)}</label>
            <div className="flex flex-wrap gap-2">
              {["Ctrl", "Alt", "Shift", "Meta"].map((modifier) => (
                <Checkbox
                  key={modifier}
                  size="sm"
                  isSelected={selectedModifiers.includes(modifier)}
                  onValueChange={() => toggleModifier(fieldKey, modifier)}
                >
                  {modifier}
                </Checkbox>
              ))}
            </div>
          </div>
        );
      }
    }
    
    // Default input for other types
    return (
      <div>
        <label className="text-sm font-medium mb-1 block">{getParamFriendlyName(paramName)}</label>
        <Input
          type={typeof action.params[paramName] === 'number' ? "number" : "text"}
          placeholder={`Enter ${paramName}`}
          value={(editableFields[fieldKey] ?? action.params[paramName] ?? "").toString()}
          onValueChange={(value) => {
            const parsedValue = typeof action.params[paramName] === 'number' 
              ? (parseInt(value) || 0) 
              : value;
            handleFieldChange(fieldKey, parsedValue);
          }}
          size="sm"
        />
      </div>
    );
  };
  
  return (
    <Card className="p-4">
      <div className="mb-6">
        <h2 className="text-xl font-bold">Create Macro from Template</h2>
        <p className="text-foreground-500 text-sm">
          {template.description || `Apply the "${template.name}" template to create a new macro`}
        </p>
      </div>
      
      <div className="space-y-6 max-h-[70vh] overflow-y-auto pr-2">
        <div>
          <Input
            label="Macro Name"
            placeholder="Enter a name for this macro"
            value={macroName}
            onValueChange={setMacroName}
          />
        </div>
        
        {template.editableFields.category && (
          <div>
            <p className="text-sm font-medium mb-2">Category</p>
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
        )}
        
        {/* MIDI trigger selectors - show different selectors based on template type */}
        {isEncoderTemplate ? (
          <>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Icon icon="lucide:rotate-cw" className="text-primary" />
                <p className="text-sm font-medium">Increment MIDI Trigger</p>
              </div>
              <MidiTriggerSelector
                value={midiTrigger}
                onChange={setMidiTrigger}
                forceDirection="increment"
              />
            </div>
            
            {hasDecrementActions && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Icon icon="lucide:rotate-ccw" className="text-warning" />
                  <p className="text-sm font-medium">Decrement MIDI Trigger</p>
                </div>
                <MidiTriggerSelector
                  value={decrementTrigger}
                  onChange={setDecrementTrigger}
                  forceDirection="decrement"
                />
              </div>
            )}
            
            {hasClickActions && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Icon icon="lucide:mouse-pointer-click" className="text-secondary" />
                  <p className="text-sm font-medium">Click MIDI Trigger</p>
                </div>
                <MidiTriggerSelector
                  value={clickTrigger}
                  onChange={setClickTrigger}
                />
              </div>
            )}
          </>
        ) : (
          <div>
            <p className="text-sm font-medium mb-2">MIDI Trigger</p>
            <MidiTriggerSelector
              value={midiTrigger}
              onChange={setMidiTrigger}
            />
          </div>
        )}
        
        {/* Group editable parameters by section */}
        {(() => {
          // Determine if this is an encoder template
          const isEncoder = ["encoder-increment", "encoder-decrement", "encoder-click"].includes(template.type);
          
          // Create an array of sections to display
          const sectionsToShow = ["before", "main"];
          if (isEncoder && template.decrementActions) sectionsToShow.push("decrement");
          if (isEncoder && template.clickActions) sectionsToShow.push("click");
          sectionsToShow.push("after");
          
          return (
            <>
              {sectionsToShow.map(section => {
                const editableParamsForSection = template.editableFields.actionParams
                  .filter(param => param.section === section && param.params.length > 0);
                
                if (editableParamsForSection.length === 0) return null;
                
                return (
                  <div key={section} className="space-y-4">
                    <h3 className="font-medium">
                      {section === "before" ? "Before Actions" : 
                       section === "main" ? (isEncoder ? "Increment Actions" : "Main Actions") : 
                       section === "decrement" ? "Decrement Actions" :
                       section === "click" ? "Click Actions" : "After Actions"}
                    </h3>
                    
                    {editableParamsForSection.map(param => {
                      const action = findTemplateAction(param.id, section);
                      if (!action || param.params.length === 0) return null;
                      
                      return (
                        <Card key={param.id} className="p-3">
                          <div className="mb-3">
                            <span className="font-medium capitalize">{action.type}</span>
                            <p className="text-xs text-foreground-500 mt-1">
                              {getActionSummary(action)}
                            </p>
                          </div>
                          
                          <div className="space-y-3">
                            {param.params.map(paramName => {
                              const fieldKey = `${section}_${param.id}_${paramName}`;
                              return (
                                <div key={fieldKey}>
                                  {renderParamInput(action, paramName, fieldKey)}
                                </div>
                              );
                            })}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                );
              })}
            </>
          );
        })()}
      </div>
      
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="flat" onPress={onCancel}>
          Cancel
        </Button>
        <Button variant="flat" color="primary" onPress={() => applyTemplate(true)}>
          Edit Before Saving
        </Button>
        <Button color="primary" onPress={() => applyTemplate(false)}>
          Save Macro
        </Button>
      </div>
    </Card>
  );
}; 