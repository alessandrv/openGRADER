import React, { useState, useEffect } from "react";
import { Button, Card, Input, Select, SelectItem, Chip, Divider, Switch, addToast, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter } from "@heroui/react";
import { Icon } from "@iconify/react";
import { MacroTemplate, MacroDefinition, MacroCategory, Action } from "../types/macro";
import { useMidi } from "../contexts/midi-context";
import { MidiTriggerSelector } from "./midi-trigger-selector";

interface BulkEncoderInitializerProps {
  template: MacroTemplate;
  categories: MacroCategory[];
  onCancel: () => void;
  onCreateMacros: (macros: MacroDefinition[]) => void;
}

interface EncoderGroup {
  id: string;
  name: string;
  categoryId?: string;
  incrementTrigger?: MacroDefinition["trigger"];
  decrementTrigger?: MacroDefinition["trigger"];
  clickTrigger?: MacroDefinition["trigger"];
  randomizedFields: Record<string, any>;
}

export const BulkEncoderInitializer: React.FC<BulkEncoderInitializerProps> = ({
  template,
  categories,
  onCancel,
  onCreateMacros
}) => {
  const { lastReceivedMessage } = useMidi();
  const [baseName, setBaseName] = useState("Encoder");
  const [selectedCategory, setSelectedCategory] = useState<string>(categories[0]?.id || "default");
  const [randomizeKeys, setRandomizeKeys] = useState(true);
  const [encoderGroups, setEncoderGroups] = useState<EncoderGroup[]>([]);
  const [currentGroup, setCurrentGroup] = useState<EncoderGroup>({
    id: crypto.randomUUID(),
    name: "",
    randomizedFields: {} // Will be populated when recording starts
  });

  // Recording mode state
  const [isRecording, setIsRecording] = useState(false);
  const [currentTriggerIndex, setCurrentTriggerIndex] = useState(0);
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);
  const [recordingStartTime, setRecordingStartTime] = useState<number>(0);
  const [triggerDetectionStartTime, setTriggerDetectionStartTime] = useState<number>(0);
  const [recordingStatus, setRecordingStatus] = useState<string>("");
  const [usedKeysInSession, setUsedKeysInSession] = useState<Set<string>>(new Set());

  const availableKeys = [
    // Letters (lowercase only - uppercase would be the same shortcut)
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
    // Numbers (main row only - numpad not reliably detected)
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
    // Function keys (reliably detected)
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
    // Extended function keys (now supported in our backend)
    'F13', 'F14', 'F15', 'F16', 'F17', 'F18', 'F19', 'F20', 'F21', 'F22', 'F23', 'F24',
    // Additional less common but supported keys
    'Insert', 'Pause', 'NumLock',
    // Windows/Cmd keys (often work)
    'Meta', 'LWin', 'RWin', 'Menu',
    // Special characters and punctuation (commonly supported)
    '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_', '=', '+',
    '[', ']', '{', '}', '\\', '|', ';', ':', "'", '"', ',', '.', '<', '>',
    '/', '?', '`', '~',
    // Navigation keys (reliably detected)
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown',
    // Common control keys (reliably detected)
    'Space', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete',

  ];

  // Get existing macros to avoid conflicts
  const getExistingMacros = (): MacroDefinition[] => {
    const existingMacros = localStorage.getItem("midiMacros");
    return existingMacros ? JSON.parse(existingMacros) : [];
  };

  // Check if a key is already in use
  const isKeyInUse = (key: string): boolean => {
    const existingMacros = getExistingMacros();
    const usedInExisting = existingMacros.some(macro => 
      macro.actions.some(action => 
        action.type === "keypress" && action.params.key === key
      )
    );
    
    // Also check in current groups and current group being built
    const usedInGroups = encoderGroups.some(group =>
      Object.values(group.randomizedFields).includes(key)
    );
    
    const usedInCurrentGroup = Object.values(currentGroup.randomizedFields || {}).includes(key);
    
    // Check in session-tracked keys
    const usedInSession = usedKeysInSession.has(key);
    
    return usedInExisting || usedInGroups || usedInCurrentGroup || usedInSession;
  };

  // Check if a MIDI trigger is already used in current session
  const isMidiTriggerUsed = (newTrigger: MacroDefinition["trigger"]): { isUsed: boolean; conflictInfo?: string } => {
    // Check against already created groups in this session
    for (const group of encoderGroups) {
      const triggers = [group.incrementTrigger, group.decrementTrigger, group.clickTrigger].filter(Boolean);
      
      for (const trigger of triggers) {
        if (trigger && doTriggersConflict(trigger, newTrigger)) {
          const triggerType = 
            trigger === group.incrementTrigger ? "increment" :
            trigger === group.decrementTrigger ? "decrement" : "click";
          return { 
            isUsed: true, 
            conflictInfo: `${group.name} (${triggerType})` 
          };
        }
      }
    }

    // Check against the current group being built
    const currentTriggers = [currentGroup.incrementTrigger, currentGroup.decrementTrigger, currentGroup.clickTrigger].filter(Boolean);
    for (const trigger of currentTriggers) {
      if (trigger && doTriggersConflict(trigger, newTrigger)) {
        return { 
          isUsed: true, 
          conflictInfo: "current group" 
        };
      }
    }

    return { isUsed: false };
  };

  // Helper function to check if two triggers conflict
  const doTriggersConflict = (trigger1: MacroDefinition["trigger"], trigger2: MacroDefinition["trigger"]): boolean => {
    // Must be the same type and channel
    if (trigger1.type !== trigger2.type || trigger1.channel !== trigger2.channel) {
      return false;
    }

    if (trigger1.type === "controlchange") {
      // For control change, check controller and value (if specified)
      const controllerMatches = trigger1.controller === trigger2.controller;
      
      // If both have specific values, they conflict only if values match
      if (controllerMatches && trigger1.value !== undefined && trigger2.value !== undefined) {
        return trigger1.value === trigger2.value;
      }
      
      // If either doesn't have a specific value, they conflict on controller match
      return controllerMatches;
    }

    if (trigger1.type === "noteon" || trigger1.type === "noteoff") {
      // For notes, check if note numbers match
      return trigger1.note === trigger2.note;
    }

    return false;
  };

  // Get the number of macros per group based on template type
  const getMacrosPerGroup = (): number => {
    if (template.decrementActions && template.clickActions) return 3; // increment + decrement + click
    if (template.decrementActions) return 2; // increment + decrement
    return 1; // basic macro
  };

  // Get required triggers based on template type
  const getRequiredTriggers = (): string[] => {
    if (template.decrementActions && template.clickActions) return ["increment", "decrement", "click"];
    if (template.decrementActions) return ["increment", "decrement"];
    return ["main"];
  };

  // Randomize action parameters for keys only
  const randomizeActionParams = (action: Action, usedKeys: Set<string>): Record<string, any> => {
    const randomizedParams: Record<string, any> = {};
    
    // Get editable params for this action from template
    const editableParams = template.editableFields.actionParams
      .find(p => p.id === action.id);
    
    if (!editableParams) return {};

    editableParams.params.forEach(paramName => {
      if (paramName === 'key' && randomizeKeys && action.type === 'keypress') {
        // Find an unused key
        const availableUnusedKeys = availableKeys.filter(key => 
          !usedKeys.has(key) && !isKeyInUse(key)
        );
        
        if (availableUnusedKeys.length > 0) {
          const randomKey = availableUnusedKeys[Math.floor(Math.random() * availableUnusedKeys.length)];
          usedKeys.add(randomKey);
          randomizedParams[paramName] = randomKey;
        } else {
          console.warn(`No available keys left. Total available: ${availableKeys.length}, Currently used: ${usedKeys.size}`);
          // Fallback: use the original template key
          randomizedParams[paramName] = action.params.key;
        }
      } else {
        // Keep original value for other parameters
        randomizedParams[paramName] = action.params[paramName];
      }
    });

    return randomizedParams;
  };

  // Generate randomized fields for a group
  const generateRandomizedFields = (): Record<string, any> => {
    const randomizedFields: Record<string, any> = {};
    
    if (randomizeKeys) {
      // Get all currently used keys from existing state
      const currentlyUsedKeys = new Set([
        ...usedKeysInSession,
        ...encoderGroups.flatMap(group => Object.values(group.randomizedFields).filter(v => typeof v === 'string')),
        ...Object.values(currentGroup.randomizedFields || {}).filter(v => typeof v === 'string')
      ]);
      
      // Generate keys for all action parameters that need randomization
      const processActions = (actions: Action[], prefix: string = "") => {
        actions.forEach((action, actionIndex) => {
          const actionKey = `${prefix}action_${actionIndex}`;
          
          if (action.type === "keypress" && action.params.key) {
            const fieldKey = `${actionKey}_key`;
            
            // Generate a random key that's not already in use
            let randomKey: string;
            let attempts = 0;
            do {
              randomKey = availableKeys[Math.floor(Math.random() * availableKeys.length)];
              attempts++;
            } while ((currentlyUsedKeys.has(randomKey) || isKeyInUse(randomKey)) && attempts < 100);
            
            if (attempts < 100) {
              randomizedFields[fieldKey] = randomKey;
              // Add to currently used keys for this generation session
              currentlyUsedKeys.add(randomKey);
              // Update the session state
              setUsedKeysInSession(prev => new Set([...prev, randomKey]));
            } else {
              console.warn(`Could not find available key after ${attempts} attempts. Total available: ${availableKeys.length}, Currently used: ${currentlyUsedKeys.size}`);
              // Fallback: use the original template key
              randomizedFields[fieldKey] = action.params.key;
            }
          }
          
          // Generate random coordinates for mouse actions
          if ((action.type === "mousemove" || action.type === "mouseclick") && 
              action.params.x !== undefined && action.params.y !== undefined) {
            const xFieldKey = `${actionKey}_x`;
            const yFieldKey = `${actionKey}_y`;
            
            randomizedFields[xFieldKey] = Math.floor(Math.random() * 1920);
            randomizedFields[yFieldKey] = Math.floor(Math.random() * 1080);
          }
        });
      };
      
      // Process all action sections
      processActions(template.actions, "main_");
      if (template.beforeActions) processActions(template.beforeActions, "before_");
      if (template.afterActions) processActions(template.afterActions, "after_");
      if (template.decrementActions) processActions(template.decrementActions, "decrement_");
      if (template.clickActions) processActions(template.clickActions, "click_");
    }
    
    return randomizedFields;
  };

  // Check if current group is valid
  const isCurrentGroupValid = (): boolean => {
    if (template.decrementActions) {
      return !!(currentGroup.incrementTrigger && currentGroup.decrementTrigger &&
        (!template.clickActions || currentGroup.clickTrigger));
    }
    
    return !!currentGroup.incrementTrigger; // For basic macros, use incrementTrigger as main trigger
  };

  // Auto-add group when all required triggers are set
  const checkAndAutoAddGroup = () => {
    if (isCurrentGroupValid()) {
      // Check if we can add more groups
      const remainingGroups = getRemainingGroupsAllowed();
      
      if (remainingGroups <= 0) {
        // Stop recording as we've reached the limit
        setIsRecording(false);
        addToast({
          title: "Maximum Groups Reached",
          description: `Recording stopped. Maximum ${getMaxAllowedGroups()} groups created.`,
          color: "warning"
        });
        return;
      }
      
      // Auto-add the group
      finalizeCurrentGroup(currentGroup);
    }
  };

  const handleAddGroup = () => {
    const remainingGroups = getRemainingGroupsAllowed();
    
    if (remainingGroups <= 0) {
      const maxGroups = getMaxAllowedGroups();
      const keysPerGroup = getMacrosPerGroup();
      
      addToast({
        title: "Maximum Groups Reached",
        description: `Cannot create more groups. Maximum ${maxGroups} groups allowed (${availableKeys.length} available keys ÷ ${keysPerGroup} keys per ${template.type} = ${maxGroups} groups)`,
        color: "warning"
      });
      return;
    }

    // Finalize current group if it has valid triggers
    if (isCurrentGroupValid() && encoderGroups.length === 0 && currentGroupIndex === 0) {
      // This is the first group being added
      const effectiveBaseName = baseName.trim() || "Encoder";
      const finalizedGroup: EncoderGroup = {
        ...currentGroup,
        name: `${effectiveBaseName} ${currentGroupIndex + 1}`,
        categoryId: selectedCategory
      };
      
      setEncoderGroups([finalizedGroup]);
      setCurrentGroupIndex(1);
      setCurrentGroup({
        id: crypto.randomUUID(),
        name: "",
        randomizedFields: generateRandomizedFields()
      });
      setCurrentTriggerIndex(0);
    } else if (isCurrentGroupValid()) {
      // Finalize the current group and create a new one
      finalizeCurrentGroup(currentGroup);
    } else {
      // Just create a new group without finalizing current (if current is empty/invalid)
      const nextGroupIndex = encoderGroups.length;
      setCurrentGroupIndex(nextGroupIndex);
      setCurrentGroup({
        id: crypto.randomUUID(),
        name: "",
        randomizedFields: generateRandomizedFields()
      });
      setCurrentTriggerIndex(0);
    }

    addToast({
      title: "Group Added",
      description: `Group ${encoderGroups.length + 1} created. ${remainingGroups - 1} more groups can be added.`,
      color: "success"
    });
  };

  // Remove a group from the list
  const handleRemoveGroup = (groupId: string) => {
    setEncoderGroups(prev => prev.filter(g => g.id !== groupId));
  };

  // Handle creating all macros
  const handleCreateMacros = () => {
    if (encoderGroups.length === 0) {
      addToast({
        title: "No Groups",
        description: "Please add at least one encoder group",
        color: "warning"
      });
      return;
    }

    const allMacros: MacroDefinition[] = [];

    encoderGroups.forEach(group => {
      const groupId = crypto.randomUUID();
      
      // Apply randomized values to actions
      const applyRandomizedValues = (actions: Action[], section: string): Action[] => {
        return actions.map((action, actionIndex) => {
          const updatedAction = { ...action };
          const actionKey = `${section}_action_${actionIndex}`;
          
          // Apply randomized values from the group
          Object.entries(group.randomizedFields).forEach(([fieldKey, value]) => {
            if (fieldKey.startsWith(`${actionKey}_`)) {
              const paramName = fieldKey.split('_').pop();
              if (paramName) {
                updatedAction.params = {
                  ...updatedAction.params,
                  [paramName]: value
                };
              }
            }
          });
          
          return updatedAction;
        });
      };

      // Create increment macro (or main macro for basic type)
      if (group.incrementTrigger) {
        const incrementMacro: MacroDefinition = {
          id: crypto.randomUUID(),
          name: template.decrementActions 
            ? `${group.name} (Increment)` 
            : group.name,
          type: template.decrementActions 
            ? "encoder-increment" 
            : undefined,
          groupId: template.decrementActions ? groupId : undefined,
          trigger: group.incrementTrigger,
          actions: applyRandomizedValues(template.actions, "main"),
          beforeActions: template.beforeActions ? applyRandomizedValues(template.beforeActions, "before") : undefined,
          afterActions: template.afterActions ? applyRandomizedValues(template.afterActions, "after") : undefined,
          timeout: template.timeout,
          categoryId: group.categoryId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        allMacros.push(incrementMacro);
      }

      // Create decrement macro
      if (group.decrementTrigger && template.decrementActions) {
        const decrementMacro: MacroDefinition = {
          id: crypto.randomUUID(),
          name: `${group.name} (Decrement)`,
          type: "encoder-decrement",
          groupId,
          trigger: group.decrementTrigger,
          actions: applyRandomizedValues(template.decrementActions, "decrement"),
          beforeActions: template.beforeActions ? applyRandomizedValues(template.beforeActions, "before") : undefined,
          afterActions: template.afterActions ? applyRandomizedValues(template.afterActions, "after") : undefined,
          timeout: template.timeout,
          categoryId: group.categoryId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        allMacros.push(decrementMacro);
      }

      // Create click macro
      if (group.clickTrigger && template.clickActions) {
        const clickMacro: MacroDefinition = {
          id: crypto.randomUUID(),
          name: `${group.name} (Click)`,
          type: "encoder-click",
          groupId,
          trigger: group.clickTrigger,
          actions: applyRandomizedValues(template.clickActions, "click"),
          beforeActions: template.beforeActions ? applyRandomizedValues(template.beforeActions, "before") : undefined,
          afterActions: template.afterActions ? applyRandomizedValues(template.afterActions, "after") : undefined,
          timeout: template.timeout,
          categoryId: group.categoryId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        allMacros.push(clickMacro);
      }
    });

    onCreateMacros(allMacros);
  };

  const getActionSummary = (action: Action): string => {
    switch (action.type) {
      case "keypress":
        return `Press ${action.params.key}${action.params.modifiers?.length ? ` with ${action.params.modifiers.join('+')}` : ''}`;
      case "mouseclick":
        return `${action.params.button} click`;
      case "mousemove":
        return `Move to (${action.params.x}, ${action.params.y})`;
      case "delay":
        return `Wait ${action.params.duration}ms`;
      default:
        return action.type;
    }
  };

  const getTriggerDescription = (trigger: MacroDefinition["trigger"]): string => {
    if (trigger.type === "controlchange") {
      let description = `CC ${trigger.controller} Ch ${trigger.channel}`;
      if (trigger.value !== undefined) {
        description += ` / ${trigger.value}`;
      }
      if (trigger.direction) {
        description += ` (${trigger.direction === 'increment' ? '↑' : '↓'})`;
      }
      return description;
    }
    if (trigger.type === "noteon") {
      let description = `Note ${trigger.note} Ch ${trigger.channel}`;
      if (trigger.value !== undefined) {
        description += ` / ${trigger.value}`;
      }
      if (trigger.direction) {
        description += ` (${trigger.direction === 'increment' ? '↑' : '↓'})`;
      }
      return description;
    }
    if (trigger.type === "noteoff") {
      let description = `Note Off ${trigger.note} Ch ${trigger.channel}`;
      if (trigger.value !== undefined) {
        description += ` / ${trigger.value}`;
      }
      if (trigger.direction) {
        description += ` (${trigger.direction === 'increment' ? '↑' : '↓'})`;
      }
      return description;
    }
    return trigger.type;
  };

  const resetRecording = () => {
    setIsRecording(false);
    setCurrentTriggerIndex(0);
    setCurrentGroupIndex(0);
    setEncoderGroups([]);
    setUsedKeysInSession(new Set());
    setCurrentGroup({
      id: crypto.randomUUID(),
      name: "",
      randomizedFields: generateRandomizedFields() // Generate initial randomized fields
    });
    setRecordingStatus("Ready to start recording MIDI triggers");
    
    addToast({
      title: "Recording Reset",
      description: "Ready to start fresh recording session",
      color: "success"
    });
  };

  // Recording mode functions
  const startRecording = () => {
    setIsRecording(true);
    setRecordingStartTime(Date.now());
    setTriggerDetectionStartTime(Date.now());
    
    // If current group doesn't have randomized fields, generate them
    if (Object.keys(currentGroup.randomizedFields || {}).length === 0) {
      setCurrentGroup(prev => ({
        ...prev,
        randomizedFields: generateRandomizedFields()
      }));
    }
    
    // Don't reset currentTriggerIndex and currentGroupIndex - continue from where we left off
    updateRecordingStatus();
    
    addToast({
      title: "Recording Started",
      description: "Send MIDI signals to detect triggers",
      color: "success"
    });
  };

  const stopRecording = () => {
    setIsRecording(false);
    
    const requiredTriggers = getRequiredTriggers();
    const currentTriggerType = requiredTriggers[currentTriggerIndex];
    
    addToast({
      title: "Recording Paused",
      description: `Stopped at ${currentTriggerType} trigger for group ${currentGroupIndex + 1}. Click "Start Recording" to continue from here.`,
      color: "warning"
    });
  };

  const updateRecordingStatus = () => {
    const requiredTriggers = getRequiredTriggers();
    const currentTriggerType = requiredTriggers[currentTriggerIndex];
    
    if (isRecording) {
      setRecordingStatus(`Waiting for ${currentTriggerType.toUpperCase()} trigger for group ${currentGroupIndex + 1}...`);
    } else {
      if (currentTriggerIndex === 0 && currentGroupIndex === 0 && encoderGroups.length === 0) {
        setRecordingStatus("Ready to start recording MIDI triggers");
      } else {
        setRecordingStatus(`Paused at ${currentTriggerType.toUpperCase()} trigger for group ${currentGroupIndex + 1}. Click "Start Recording" to continue.`);
      }
    }
  };

  // Process incoming MIDI messages during recording
  useEffect(() => {
    if (isRecording && lastReceivedMessage && lastReceivedMessage.timestamp > triggerDetectionStartTime) {
      const trigger: MacroDefinition["trigger"] = {
        type: lastReceivedMessage.type as "noteon" | "noteoff" | "controlchange",
        channel: lastReceivedMessage.channel || 0,
        note: lastReceivedMessage.note,
        controller: lastReceivedMessage.controller,
        value: lastReceivedMessage.value,
      };
      
      // Check for conflicts before processing
      const conflictCheck = isMidiTriggerUsed(trigger);
      if (conflictCheck.isUsed) {
        addToast({
          title: "MIDI Trigger Conflict",
          description: `This MIDI trigger is already used by ${conflictCheck.conflictInfo}. Please use a different MIDI control.`,
          color: "warning"
        });
        return; // Don't process this trigger
      }
      
      processRecordedTrigger(trigger);
      
      // Reset detection timestamp for next trigger
      setTriggerDetectionStartTime(Date.now());
    }
  }, [lastReceivedMessage, isRecording, triggerDetectionStartTime, currentTriggerIndex, currentGroupIndex]);

  // Process a recorded trigger and move to next
  const processRecordedTrigger = (trigger: MacroDefinition["trigger"]) => {
    const requiredTriggers = getRequiredTriggers();
    const currentTriggerType = requiredTriggers[currentTriggerIndex];
    
    // Update current group with the new trigger
    let updatedGroup = { ...currentGroup };
    
    if (currentTriggerType === "increment" || currentTriggerType === "main") {
      updatedGroup.incrementTrigger = trigger;
    } else if (currentTriggerType === "decrement") {
      updatedGroup.decrementTrigger = trigger;
    } else if (currentTriggerType === "click") {
      updatedGroup.clickTrigger = trigger;
    }
    
    setCurrentGroup(updatedGroup);
    
    // Check if this completes the current group
    const nextTriggerIndex = currentTriggerIndex + 1;
    if (nextTriggerIndex >= requiredTriggers.length) {
      // Current group is complete
      finalizeCurrentGroup(updatedGroup);
    } else {
      // Move to next trigger
      setCurrentTriggerIndex(nextTriggerIndex);
      // Update status immediately for the next trigger
      const nextTriggerType = requiredTriggers[nextTriggerIndex];
      setRecordingStatus(`Recording Group ${currentGroupIndex + 1}: Waiting for ${nextTriggerType} trigger...`);
    }
  };

  const finalizeCurrentGroup = (group: EncoderGroup) => {
    const effectiveBaseName = baseName.trim() || "Encoder";
    
    const finalizedGroup: EncoderGroup = {
      ...group,
      name: `${effectiveBaseName} ${currentGroupIndex + 1}`,
      categoryId: selectedCategory
      // Don't regenerate randomizedFields - use the ones already in the group
    };
    
    // Add to the groups list
    setEncoderGroups(prev => [...prev, finalizedGroup]);
    
    // Start next group
    const nextGroupIndex = currentGroupIndex + 1;
    setCurrentGroupIndex(nextGroupIndex);
    setCurrentTriggerIndex(0);
    setCurrentGroup({
      id: crypto.randomUUID(),
      name: "",
      randomizedFields: generateRandomizedFields() // Generate new fields for the next group
    });
    
    // Reset detection timestamp for the next group's first trigger
    setTriggerDetectionStartTime(Date.now());
    
    // Update status immediately for next group
    const requiredTriggers = getRequiredTriggers();
    if (requiredTriggers.length > 0) {
      const firstTriggerType = requiredTriggers[0];
      const triggerLabel = firstTriggerType === "increment" || firstTriggerType === "main" ? "increment" :
                          firstTriggerType === "decrement" ? "decrement" : "click";
      setRecordingStatus(`Set ${triggerLabel} trigger for ${effectiveBaseName} ${nextGroupIndex + 1}`);
    }
  };

  // Add useEffect to update recording status when relevant state changes
  useEffect(() => {
    if (isRecording) {
      updateRecordingStatus();
    }
  }, [currentTriggerIndex, currentGroupIndex, isRecording]);

  const getMaxAllowedGroups = (): number => {
    const keysPerGroup = getMacrosPerGroup();
    return Math.floor(availableKeys.length / keysPerGroup);
  };

  const getRemainingGroupsAllowed = (): number => {
    const maxGroups = getMaxAllowedGroups();
    const currentGroups = encoderGroups.length + (currentGroup.id ? 1 : 0);
    return Math.max(0, maxGroups - currentGroups);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-semibold">Bulk Initialize: {template.name}</h2>
          <p className="text-foreground-500 text-sm">
            Record MIDI values to quickly create multiple {template.decrementActions && template.clickActions ? "encoder groups (3 macros each)" : 
                            template.decrementActions ? "encoder groups (2 macros each)" : 
                            "macros"} from this template
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="flat" onPress={onCancel} isDisabled={isRecording}>
            Cancel
          </Button>
          {encoderGroups.length > 0 && !isRecording && (
            <Button 
              color="success" 
              startContent={<Icon icon="lucide:check" />}
              onPress={handleCreateMacros}
            >
              Create {encoderGroups.length * getMacrosPerGroup()} Macros
            </Button>
          )}
        </div>
      </div>

      {/* Configuration Section */}
      <Card className="p-6">
        <h3 className="text-lg font-medium mb-4">Configuration</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Base Name"
            placeholder="e.g., Volume, Filter, etc."
            value={baseName}
            onValueChange={setBaseName}
            description="Names will be: Base Name 1, Base Name 2, etc."
          />
          
          <Select
            label="Category"
            selectedKeys={selectedCategory ? [selectedCategory] : []}
            onSelectionChange={(keys) => {
              const selectedKey = Array.from(keys)[0] as string;
              setSelectedCategory(selectedKey);
            }}
          >
            {categories.map((category) => (
              <SelectItem key={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </Select>
          
          <div className="flex items-center gap-3">
            <Switch
              isSelected={randomizeKeys}
              onValueChange={setRandomizeKeys}
            />
            <div>
              <p className="text-sm font-medium">Randomize Keys</p>
              <p className="text-xs text-foreground-500">
                Assign random keys to avoid conflicts
              </p>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <p className="text-sm text-gray-600">
            Randomize keyboard shortcuts automatically for faster setup.
          </p>
          <p className="text-sm text-gray-500">
            Max {getMaxAllowedGroups()} groups allowed ({availableKeys.length} keys ÷ {getMacrosPerGroup()} keys per group)
          </p>
        </div>
      </Card>

      {/* Manual Add Group Section */}
      <Card className="p-6">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-medium">Manual Group Management</h3>
            <p className="text-sm text-foreground-500 mt-1">
              Add groups manually or use the recording mode below to auto-configure MIDI triggers
            </p>
          </div>
          <Button 
            onClick={handleAddGroup}
            color="primary"
            isDisabled={getRemainingGroupsAllowed() <= 0}
            startContent={<Icon icon="material-symbols:add" />}
          >
            Add Group ({getRemainingGroupsAllowed()} remaining)
          </Button>
        </div>
      </Card>

      {/* Recording Section */}
      {!isRecording ? (
        <Card className="p-6">
          <div className="text-center space-y-4">
            <div className="bg-primary/5 p-4 rounded-full w-fit mx-auto">
              <Icon icon="lucide:radio" className="text-3xl text-primary" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Start Recording MIDI Values</h3>
              <p className="text-foreground-500 mt-2">
                Click start and then send MIDI signals for each trigger. The system will automatically
                cycle through increment, decrement{template.clickActions ? ", and click" : ""} triggers for each encoder group.
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                color={isRecording ? "danger" : "primary"}
                variant="solid"
                onPress={isRecording ? stopRecording : startRecording}
                startContent={<Icon icon={isRecording ? "lucide:stop" : "lucide:play"} />}
              >
                {isRecording ? "Stop Recording" : "Start Recording"}
              </Button>
              
              {!isRecording && (currentTriggerIndex > 0 || currentGroupIndex > 0 || encoderGroups.length > 0) && (
                <Button
                  color="warning"
                  variant="flat"
                  onPress={resetRecording}
                  startContent={<Icon icon="lucide:rotate-ccw" />}
                >
                  Reset
                </Button>
              )}
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-6">
          <div className="text-center space-y-4">
            <div className="bg-danger/5 p-4 rounded-full w-fit mx-auto animate-pulse">
              <Icon icon="lucide:radio" className="text-3xl text-danger" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-danger">Recording Active</h3>
              <p className="text-lg font-medium mt-2">{recordingStatus}</p>
              <p className="text-sm text-foreground-500 mt-1">
                Send the MIDI signal now. The system will automatically move to the next trigger.
              </p>
            </div>
            <div className="flex gap-2 justify-center">
              <Button
                color="danger"
                variant="flat"
                startContent={<Icon icon="lucide:square" />}
                onPress={stopRecording}
              >
                Stop Recording
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Groups List */}
      {encoderGroups.length > 0 && (
        <Card className="p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-medium">Configured Groups ({encoderGroups.length})</h3>
            <div className="text-sm text-foreground-500">
              MIDI triggers in use - avoid duplicating these
            </div>
          </div>
          
          <div className="space-y-3">
            {encoderGroups.map((group, index) => (
              <div key={group.id} className="border rounded-lg p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h4 className="font-medium">{group.name}</h4>
                    <div className="mt-2 space-y-1">
                      {group.incrementTrigger && (
                        <div className="text-sm text-foreground-600 flex items-center gap-2">
                          <Chip size="sm" color="primary" variant="flat">Increment</Chip>
                          <span className="font-mono bg-primary-50 px-2 py-1 rounded text-primary-600">
                            {getTriggerDescription(group.incrementTrigger)}
                          </span>
                        </div>
                      )}
                      {group.decrementTrigger && (
                        <div className="text-sm text-foreground-600 flex items-center gap-2">
                          <Chip size="sm" color="warning" variant="flat">Decrement</Chip>
                          <span className="font-mono bg-warning-50 px-2 py-1 rounded text-warning-600">
                            {getTriggerDescription(group.decrementTrigger)}
                          </span>
                        </div>
                      )}
                      {group.clickTrigger && (
                        <div className="text-sm text-foreground-600 flex items-center gap-2">
                          <Chip size="sm" color="secondary" variant="flat">Click</Chip>
                          <span className="font-mono bg-secondary-50 px-2 py-1 rounded text-secondary-600">
                            {getTriggerDescription(group.clickTrigger)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    color="danger"
                    onPress={() => handleRemoveGroup(group.id)}
                    isDisabled={isRecording}
                  >
                    <Icon icon="lucide:trash-2" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}; 