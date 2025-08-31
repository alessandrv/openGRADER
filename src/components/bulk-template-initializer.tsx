import React, { useState, useEffect, useRef, useCallback } from "react";
import { Button, Card, Input, Chip, Checkbox, Select, SelectItem, addToast, Kbd } from "@heroui/react";
import { Icon } from "@iconify/react";
import { MacroTemplate, MacroDefinition, Action, MacroCategory } from "../types/macro";
import { MidiTriggerSelector } from "./midi-trigger-selector";
import { KeySelectorModal } from "./key-selector-modal";
import { useMidi } from "../contexts/midi-context";

interface BulkConfig {
  categoryId: string | null;
  midiTriggerGroups: MidiTriggerGroup[];
  selectedKeys: string[];
  modifierRules: ModifierRule[];
  assignmentOrder: "modifier-first" | "key-first" | "balanced";
  excludedCombinations: KeyCombination[];
  selectedActions: string[]; // New: which actions to apply key combinations to
}

interface ModifierRule {
  modifiers: string[];
  priority: number;
}

interface KeyCombination {
  key: string;
  modifiers: string[];
}

interface MidiTriggerGroup {
  id: string;
  name: string;
  triggers: {
    triggerId: string;
    trigger: MacroDefinition['trigger'] | null;
  }[];
}

interface BulkTemplateInitializerProps {
  template: MacroTemplate;
  categories: MacroCategory[];
  onCancel: () => void;
  onBulkCreate: (macros: MacroDefinition[]) => void;
  onCreateReady?: (createFn: () => void, canCreate: boolean, previewCount: number, validationMessage: string) => void;
}

export const BulkTemplateInitializer: React.FC<BulkTemplateInitializerProps> = ({
  template,
  categories,
  onCancel,
  onBulkCreate,
  onCreateReady
}) => {
  const { lastReceivedMessage, isEnabled, selectedInput } = useMidi(); // Add MIDI context
  const [config, setConfig] = useState<BulkConfig>({
    categoryId: template.categoryId || null,
    midiTriggerGroups: [],
    selectedKeys: [],
    modifierRules: [
      { modifiers: ["Ctrl"], priority: 1 },
      { modifiers: ["Alt"], priority: 2 },
      { modifiers: ["Shift"], priority: 3 },
      { modifiers: ["Ctrl", "Shift"], priority: 4 },
      { modifiers: ["Ctrl", "Alt"], priority: 5 },
      { modifiers: ["Shift", "Alt"], priority: 6 },
      { modifiers: ["Ctrl", "Shift", "Alt"], priority: 7 }
    ],
    assignmentOrder: "modifier-first",
    excludedCombinations: [],
    selectedActions: [] // Initialize as empty, will be populated when template loads
  });
  const [isKeySelectorOpen, setIsKeySelectorOpen] = useState(false);
  const [isExclusionSelectorOpen, setIsExclusionSelectorOpen] = useState(false);
  const [isListeningForMidi, setIsListeningForMidi] = useState(false);
  const [midiDetectionCount, setMidiDetectionCount] = useState(0);
  const lastProcessedMidiRef = useRef<string | null>(null); // Track last processed MIDI
  const [listeningStartTime, setListeningStartTime] = useState<number | null>(null);
  const [currentDetectionTarget, setCurrentDetectionTarget] = useState<{groupId: string, triggerId: string} | null>(null);
  const [editingGroupName, setEditingGroupName] = useState<string | null>(null);
  const lastProcessedTimestampRef = useRef<number>(0); // Track last processed MIDI timestamp
  
  // Use refs to store the latest state values to avoid stale closures
  const configRef = useRef(config);
  const currentDetectionTargetRef = useRef(currentDetectionTarget);
  const activeGroupRefs = useRef<Map<string, HTMLElement>>(new Map());
  
  // Add debouncing for MIDI detection to prevent rapid group creation
  const midiDetectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMidiDetectionTimeRef = useRef<number>(0);
  
  // Update refs when state changes
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  
  // Debug effect to track all MIDI messages
  useEffect(() => {
    if (lastReceivedMessage) {
      console.log("🎹 New MIDI message received:", lastReceivedMessage);
    }
  }, [lastReceivedMessage]);
  
  // Debug effect to track MIDI setup
  useEffect(() => {
    console.log("🎹 MIDI Status:", {
      isEnabled,
      selectedInput: selectedInput?.name || 'None',
      isListeningForMidi
    });
  }, [isEnabled, selectedInput, isListeningForMidi]);
  
  useEffect(() => {
    currentDetectionTargetRef.current = currentDetectionTarget;
    
    // Scroll to active group when detection target changes
    if (currentDetectionTarget && isListeningForMidi) {
      const activeGroupElement = activeGroupRefs.current.get(currentDetectionTarget.groupId);
      if (activeGroupElement) {
        activeGroupElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        });
      }
    }
  }, [currentDetectionTarget, isListeningForMidi]);
  
  // Cleanup timeouts when component unmounts
  useEffect(() => {
    return () => {
      if (midiDetectionTimeoutRef.current) {
        clearTimeout(midiDetectionTimeoutRef.current);
      }
    };
  }, []);

  // Determine if this is an encoder template
  const isEncoderTemplate = ["encoder-increment", "encoder-decrement", "encoder-click"].includes(template.type);
  const hasDecrementActions = isEncoderTemplate && template.decrementActions && template.decrementActions.length > 0;
  const hasClickActions = isEncoderTemplate && template.clickActions && template.clickActions.length > 0;

  // Calculate required MIDI triggers based on template type
  const getRequiredMidiTriggers = () => {
    if (isEncoderTemplate) {
      const triggers = ["increment"];
      if (hasDecrementActions) triggers.push("decrement");
      if (hasClickActions) triggers.push("click");
      return triggers;
    }
    return ["base"];
  };

  // Add a new MIDI trigger group
  const addMidiTriggerGroup = () => {
    const requiredTriggers = getRequiredMidiTriggers();
    const newGroup: MidiTriggerGroup = {
      id: crypto.randomUUID(),
      name: `Group ${config.midiTriggerGroups.length + 1}`,
      triggers: requiredTriggers.map(triggerId => ({
        triggerId,
        trigger: null
      }))
    };
    
    setConfig(prev => ({
      ...prev,
      midiTriggerGroups: [...prev.midiTriggerGroups, newGroup]
    }));
  };

  // Remove a MIDI trigger group
  const removeMidiTriggerGroup = (groupId: string) => {
    // If we're currently detecting MIDI and this group is the current target, stop detection
    if (isListeningForMidi && currentDetectionTarget?.groupId === groupId) {
      stopIterativeMidiDetection();
    }
    
    setConfig(prev => ({
      ...prev,
      midiTriggerGroups: prev.midiTriggerGroups.filter(g => g.id !== groupId)
    }));
  };

  // Handle MIDI trigger changes
  const handleMidiTriggerChange = (groupId: string, triggerId: string, trigger: MacroDefinition['trigger'] | null) => {
    console.log("handleMidiTriggerChange called with:", { groupId, triggerId, trigger });
    
    setConfig(prev => {
      console.log("Previous config:", prev);
      
      const newConfig = {
        ...prev,
        midiTriggerGroups: prev.midiTriggerGroups.map(g => 
          g.id === groupId 
            ? {
                ...g,
                triggers: g.triggers.map(t => 
                  t.triggerId === triggerId ? { ...t, trigger } : t
                )
              }
            : g
        )
      };
      
      console.log("New config:", newConfig);
      return newConfig;
    });
    
    // If a trigger was set (not cleared) and we're in auto-detection mode, move to next target
    if (trigger && isListeningForMidi) {
      handleAutoDetectTriggerSet(groupId, triggerId);
    }
  };

  // Start iterative MIDI detection
  const startIterativeMidiDetection = () => {
    // Check if MIDI is properly set up
    if (!isEnabled) {
      addToast({
        title: "MIDI Not Available",
        description: "MIDI is not enabled. Please check your MIDI setup.",
        color: "danger"
      });
      return;
    }
    
    if (!selectedInput) {
      addToast({
        title: "No MIDI Device Selected",
        description: "Please select a MIDI input device before using auto-detect.",
        color: "danger"
      });
      return;
    }
    
    console.log("🎹 Starting auto-detect with MIDI setup:", { isEnabled, selectedInput: selectedInput.name });
    
    setIsListeningForMidi(true);
    setMidiDetectionCount(0);
    setListeningStartTime(Date.now());
    
    // Clear message tracking completely to ensure first MIDI input isn't ignored
    lastProcessedMidiRef.current = null;
    // Reset timestamp to current time to ignore any stale MIDI messages
    lastProcessedTimestampRef.current = Date.now();
    console.log("🔄 Reset MIDI tracking, timestamp:", lastProcessedTimestampRef.current);
    
    // Reset the debouncing timer to allow immediate processing of the first MIDI message
    lastMidiDetectionTimeRef.current = 0;
    
    // Set the initial detection target
    setTimeout(() => {
      const currentConfig = configRef.current;
      let initialTarget: {groupId: string, triggerId: string} | null = null;
      
      if (currentConfig.midiTriggerGroups.length === 0) {
        // No groups exist, create the first one
        const requiredTriggers = getRequiredMidiTriggers();
        const newGroupId = crypto.randomUUID();
        const newGroupName = "Group 1";
        
        const newGroup: MidiTriggerGroup = {
          id: newGroupId,
          name: newGroupName,
          triggers: requiredTriggers.map(triggerId => ({
            triggerId,
            trigger: null
          }))
        };
        
        setConfig(prev => {
          const newConfig = {
            ...prev,
            midiTriggerGroups: [newGroup]
          };
          configRef.current = newConfig;
          return newConfig;
        });
        
        initialTarget = {
          groupId: newGroupId,
          triggerId: requiredTriggers[0]
        };
      } else {
        // Find the first empty trigger in existing groups
        initialTarget = findNextDetectionTarget(currentConfig);
      }
      
      if (initialTarget) {
        setCurrentDetectionTarget(initialTarget);
        currentDetectionTargetRef.current = initialTarget;
        // Reset MIDI tracking to ensure we wait for fresh input
        lastProcessedMidiRef.current = null;
        lastProcessedTimestampRef.current = Date.now();
        console.log("🎯 Initial detection target set:", initialTarget, "timestamp:", lastProcessedTimestampRef.current);
      }
    }, 0);
    
    // Show instructions
    addToast({
      title: "MIDI Detection Mode Active",
      description: "Press any MIDI controller to create groups. Press Ctrl+C to stop.",
      color: "primary"
    });
  };

  // Stop iterative MIDI detection
  const stopIterativeMidiDetection = () => {
    setIsListeningForMidi(false);
    setCurrentDetectionTarget(null);
    
    // Clear any pending MIDI detection timeout
    if (midiDetectionTimeoutRef.current) {
      clearTimeout(midiDetectionTimeoutRef.current);
      midiDetectionTimeoutRef.current = null;
    }
    
    // Check if the last group is completely empty and delete it if so
    if (config.midiTriggerGroups.length > 0) {
      const lastGroup = config.midiTriggerGroups[config.midiTriggerGroups.length - 1];
      const isLastGroupEmpty = lastGroup.triggers.every(trigger => trigger.trigger === null);
      
      if (isLastGroupEmpty) {
        console.log("Last group is empty, removing it:", lastGroup.id);
        setConfig(prev => ({
          ...prev,
          midiTriggerGroups: prev.midiTriggerGroups.slice(0, -1)
        }));
        
        addToast({
          title: "MIDI Detection Stopped",
          description: `Created ${midiDetectionCount} groups total. Removed empty last group.`,
          color: "success"
        });
        return;
      }
    }
    
    addToast({
      title: "MIDI Detection Stopped",
      description: `Created ${midiDetectionCount} groups total`,
      color: "success"
    });
  };

  // Find the next available detection target
  const findNextDetectionTarget = (currentConfig?: BulkConfig): {groupId: string, triggerId: string} | null => {
    const requiredTriggers = getRequiredMidiTriggers();
    const configToUse = currentConfig || configRef.current;
    
    // First, check if there's an incomplete group that needs more triggers
    for (const group of configToUse.midiTriggerGroups) {
      const nextEmptyIndex = group.triggers.findIndex(t => t.trigger === null);
      if (nextEmptyIndex !== -1) {
        return {
          groupId: group.id,
          triggerId: group.triggers[nextEmptyIndex].triggerId
        };
      }
    }
    
    // If no incomplete groups, we need to create a new group
    const newGroupId = crypto.randomUUID();
    const newGroupName = `Group ${configToUse.midiTriggerGroups.length + 1}`;
    
    const newGroup: MidiTriggerGroup = {
      id: newGroupId,
      name: newGroupName,
      triggers: requiredTriggers.map((triggerId) => ({
        triggerId,
        trigger: null
      }))
    };
    
    // Add the new group
    setConfig(prev => {
      const newConfig = {
        ...prev,
        midiTriggerGroups: [...prev.midiTriggerGroups, newGroup]
      };
      configRef.current = newConfig; // Update ref immediately
      return newConfig;
    });
    
    // Return the first trigger of the new group
    return {
      groupId: newGroupId,
      triggerId: requiredTriggers[0]
    };
  };

  // Handle keyboard shortcut to stop MIDI detection
  useEffect(() => {
    if (!isListeningForMidi) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        console.log("Ctrl+C detected, stopping MIDI detection");
        stopIterativeMidiDetection();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isListeningForMidi, midiDetectionCount]);

  // Effect to handle MIDI detection when listening - SIMPLIFIED VERSION
  useEffect(() => {
    // Auto-detect simply sets the current detection target
    // The actual MIDI processing is handled by the MidiTriggerSelector components
    // This effect just manages moving to the next target when a trigger is set
  }, [isListeningForMidi]);

  // Function to move to the next detection target
  const moveToNextDetectionTarget = useCallback(() => {
    if (!isListeningForMidi) return;
    
    console.log("🎯 Moving to next detection target...");
    
    // Reset MIDI tracking to ensure we wait for new MIDI input
    lastProcessedMidiRef.current = null;
    // Update timestamp to current time so next selector waits for fresh MIDI
    lastProcessedTimestampRef.current = Date.now();
    console.log("🔄 Reset MIDI tracking and updated timestamp to:", lastProcessedTimestampRef.current);
    
    const currentConfig = configRef.current;
    const requiredTriggers = getRequiredMidiTriggers();
    
    // Find the next empty trigger in existing groups
    for (const group of currentConfig.midiTriggerGroups) {
      const nextEmptyTrigger = group.triggers.find(t => t.trigger === null);
      if (nextEmptyTrigger) {
        const nextTarget = {
          groupId: group.id,
          triggerId: nextEmptyTrigger.triggerId
        };
        setCurrentDetectionTarget(nextTarget);
        currentDetectionTargetRef.current = nextTarget;
        console.log("✅ Set next target in existing group:", nextTarget);
        return;
      }
    }
    
    // If no empty triggers found, create a new group
    console.log("� Creating new group for detection...");
    const newGroupId = crypto.randomUUID();
    const newGroupName = `Group ${currentConfig.midiTriggerGroups.length + 1}`;
    
    const newGroup: MidiTriggerGroup = {
      id: newGroupId,
      name: newGroupName,
      triggers: requiredTriggers.map(triggerId => ({
        triggerId,
        trigger: null
      }))
    };
    
    // Add the new group
    setConfig(prev => {
      const newConfig = {
        ...prev,
        midiTriggerGroups: [...prev.midiTriggerGroups, newGroup]
      };
      configRef.current = newConfig;
      return newConfig;
    });
    
    // Set target to the first trigger of the new group
    const newTarget = {
      groupId: newGroupId,
      triggerId: requiredTriggers[0]
    };
    setCurrentDetectionTarget(newTarget);
    currentDetectionTargetRef.current = newTarget;
    
    // Reset MIDI tracking for the new detection target
    lastProcessedMidiRef.current = null;
    lastProcessedTimestampRef.current = Date.now();
    console.log("🔄 Reset MIDI tracking for new group, timestamp:", lastProcessedTimestampRef.current);
    
    setMidiDetectionCount(prev => prev + 1);
    
    console.log("✅ Created new group and set target:", newTarget);
    
    addToast({
      title: "New Group Created",
      description: `Group "${newGroupName}" created automatically`,
      color: "success"
    });
  }, [isListeningForMidi, getRequiredMidiTriggers]);

  // Handle when a MIDI trigger is set during auto-detection
  const handleAutoDetectTriggerSet = useCallback((groupId: string, triggerId: string) => {
    if (!isListeningForMidi) return;
    if (currentDetectionTarget?.groupId !== groupId || currentDetectionTarget?.triggerId !== triggerId) return;
    
    console.log("🎯 Trigger set during auto-detection:", { groupId, triggerId });
    
    // Small delay to ensure state is updated
    setTimeout(() => {
      moveToNextDetectionTarget();
    }, 100);
  }, [isListeningForMidi, currentDetectionTarget, moveToNextDetectionTarget]);

  // Add selected key
  const addSelectedKey = (key: string | string[] | KeyCombination) => {
    if (typeof key === 'string') {
      if (!config.selectedKeys.includes(key)) {
        setConfig(prev => ({
          ...prev,
          selectedKeys: [...prev.selectedKeys, key]
        }));
      }
    } else if (Array.isArray(key)) {
      // Handle array of strings
      key.forEach(k => {
        if (!config.selectedKeys.includes(k)) {
          setConfig(prev => ({
            ...prev,
            selectedKeys: [...prev.selectedKeys, k]
          }));
        }
      });
    }
    // Ignore KeyCombination type for now as it's not used in key selection
  };

  // Remove selected key
  const removeSelectedKey = (key: string) => {
    setConfig(prev => ({
      ...prev,
      selectedKeys: prev.selectedKeys.filter(k => k !== key)
    }));
  };

  // Add excluded combination
  const addExcludedCombination = (combination: KeyCombination) => {
    setConfig(prev => ({
      ...prev,
      excludedCombinations: [...prev.excludedCombinations, combination]
    }));
  };

  // Remove excluded combination
  const removeExcludedCombination = (index: number) => {
    setConfig(prev => ({
      ...prev,
      excludedCombinations: prev.excludedCombinations.filter((_, i) => i !== index)
    }));
  };

  // Generate all possible key combinations
  const allCombinations: KeyCombination[] = [];
  config.selectedKeys.forEach(key => {
    config.modifierRules.forEach(rule => {
      const combination = {
        key,
        modifiers: rule.modifiers
      };

      // Check if this combination should be excluded
      const isExcluded = config.excludedCombinations.some(exclusion =>
        exclusion.key === combination.key &&
        exclusion.modifiers.length === combination.modifiers.length &&
        exclusion.modifiers.every(m => combination.modifiers.includes(m))
      );

      if (!isExcluded) {
        allCombinations.push(combination);
      }
    });
  });

  // Sort combinations by priority
  allCombinations.sort((a, b) => {
    const ruleA = config.modifierRules.find(r => 
      r.modifiers.length === a.modifiers.length && 
      r.modifiers.every(m => a.modifiers.includes(m))
    );
    const ruleB = config.modifierRules.find(r => 
      r.modifiers.length === b.modifiers.length && 
      r.modifiers.every(m => b.modifiers.includes(m))
    );
    
    if (!ruleA || !ruleB) return 0;
    return ruleA.priority - ruleB.priority;
  });

  // Apply key combination to selected actions only
  const applyKeyCombinationToActions = (
    actions: Action[], 
    combination: KeyCombination,
    editableParams: any[],
    section: string
  ): Action[] => {
    return actions.map(action => {
      // Only apply if this action is selected
      if (!config.selectedActions.includes(action.id)) {
        return action;
      }
      
      const editableParam = editableParams.find(p => p.id === action.id && p.section === section);
      if (editableParam && editableParam.params.includes("key")) {
        return {
          ...action,
          params: {
            ...action.params,
            key: combination.key,
            modifiers: combination.modifiers
          }
        };
      }
      return action;
    });
  };

  // Create macros
  const createMacros = () => {
    if (!canCreate()) {
      addToast({
        title: "Configuration Incomplete",
        description: getValidationMessage(),
        color: "danger"
      });
      return;
    }

      // Calculate total combinations needed across all groups
  let totalCombinationsNeeded = 0;
  if (isEncoderTemplate) {
    config.midiTriggerGroups.forEach(group => {
      if (group.triggers.find(t => t.triggerId === "increment")) totalCombinationsNeeded++;
      if (group.triggers.find(t => t.triggerId === "decrement") && template.decrementActions) totalCombinationsNeeded++;
      if (group.triggers.find(t => t.triggerId === "click") && template.clickActions) totalCombinationsNeeded++;
    });
  } else {
    totalCombinationsNeeded = config.midiTriggerGroups.length;
  }
  
  // Check if we have enough unique combinations for all groups
  if (allCombinations.length < totalCombinationsNeeded) {
    addToast({
      title: "Not Enough Unique Combinations",
      description: `You need ${totalCombinationsNeeded} unique key combinations but only have ${allCombinations.length}. Please add more keys or modifier rules.`,
      color: "danger"
    });
    return;
  }

    const macros: MacroDefinition[] = [];
    const timestamp = new Date().toISOString();
    const categoryId = config.categoryId;

    // Apply key combination to selected actions only
    const applyKeyCombinationToActions = (
      actions: Action[], 
      combination: KeyCombination,
      editableParams: any[],
      section: string
    ): Action[] => {
      return actions.map(action => {
        // Only apply if this action is selected
        if (!config.selectedActions.includes(action.id)) {
          return action;
        }
        
        const editableParam = editableParams.find(p => p.id === action.id && p.section === section);
        if (editableParam && editableParam.params.includes("key")) {
          return {
            ...action,
            params: {
              ...action.params,
              key: combination.key,
              modifiers: combination.modifiers
            }
          };
        }
        return action;
      });
    };

    if (isEncoderTemplate) {
      // Create encoder macros
      let availableCombinations = [...allCombinations]; // Create a copy to modify
      
      config.midiTriggerGroups.forEach((group, groupIndex) => {
        // Calculate how many combinations this group needs
        const groupNeedsCombinations = [];
        if (group.triggers.find(t => t.triggerId === "increment")) groupNeedsCombinations.push("increment");
        if (group.triggers.find(t => t.triggerId === "decrement") && template.decrementActions) groupNeedsCombinations.push("decrement");
        if (group.triggers.find(t => t.triggerId === "click") && template.clickActions) groupNeedsCombinations.push("click");
        
        // Check if we have enough combinations for this group
        if (availableCombinations.length < groupNeedsCombinations.length) {
          addToast({
            title: "Not Enough Combinations",
            description: `Group "${group.name}" needs ${groupNeedsCombinations.length} combinations but only ${availableCombinations.length} are available.`,
            color: "danger"
          });
          return;
        }
        
        // Assign different combinations to each part of the group
        const groupCombinations: { [key: string]: KeyCombination } = {};
        groupNeedsCombinations.forEach((part, partIndex) => {
          const combination = availableCombinations.shift(); // Remove and get the first available combination
          if (combination) {
            groupCombinations[part] = combination;
          }
        });

        // Create increment macro
        const incrementTrigger = group.triggers.find(t => t.triggerId === "increment");
        if (incrementTrigger?.trigger && groupCombinations.increment) {
          const incrementMacro: MacroDefinition = {
            id: crypto.randomUUID(),
            groupId: group.id,
            name: `${group.name} (Increment)`,
            type: "encoder-increment",
            categoryId: categoryId || undefined,
            trigger: incrementTrigger.trigger,
            midi_value: incrementTrigger.trigger.type === "controlchange" ? incrementTrigger.trigger.value : undefined,
            actions: applyKeyCombinationToActions(template.actions, groupCombinations.increment, template.editableFields.actionParams, "main"),
            beforeActions: template.beforeActions ? applyKeyCombinationToActions(template.beforeActions, groupCombinations.increment, template.editableFields.actionParams, "before") : undefined,
            afterActions: template.afterActions ? applyKeyCombinationToActions(template.afterActions, groupCombinations.increment, template.editableFields.actionParams, "after") : undefined,
            timeout: template.timeout,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          
          macros.push(incrementMacro);
        }
        
        // Handle decrement actions
        const decrementTrigger = group.triggers.find(t => t.triggerId === "decrement");
        if (template.decrementActions && decrementTrigger?.trigger && groupCombinations.decrement) {
          const decrementMacro: MacroDefinition = {
            id: crypto.randomUUID(),
            groupId: group.id,
            name: `${group.name} (Decrement)`,
            type: "encoder-decrement",
            categoryId: categoryId || undefined,
            trigger: decrementTrigger.trigger,
            midi_value: decrementTrigger.trigger.type === "controlchange" ? decrementTrigger.trigger.value : undefined,
            actions: applyKeyCombinationToActions(template.decrementActions, groupCombinations.decrement, template.editableFields.actionParams, "decrement"),
            beforeActions: template.beforeActions ? applyKeyCombinationToActions(template.beforeActions, groupCombinations.decrement, template.editableFields.actionParams, "before") : undefined,
            afterActions: template.afterActions ? applyKeyCombinationToActions(template.afterActions, groupCombinations.decrement, template.editableFields.actionParams, "after") : undefined,
            timeout: template.timeout,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          
          macros.push(decrementMacro);
        }
        
        // Handle click actions
        const clickTrigger = group.triggers.find(t => t.triggerId === "click");
        if (template.clickActions && clickTrigger?.trigger && groupCombinations.click) {
          const clickMacro: MacroDefinition = {
            id: crypto.randomUUID(),
            groupId: group.id,
            name: `${group.name} (Click)`,
            type: "encoder-click",
            categoryId: categoryId || undefined,
            trigger: clickTrigger.trigger,
            midi_value: clickTrigger.trigger.type === "controlchange" ? clickTrigger.trigger.value : undefined,
            actions: applyKeyCombinationToActions(template.clickActions, groupCombinations.click, template.editableFields.actionParams, "click"),
            beforeActions: template.beforeActions ? applyKeyCombinationToActions(template.beforeActions, groupCombinations.click, template.editableFields.actionParams, "before") : undefined,
            afterActions: template.afterActions ? applyKeyCombinationToActions(template.afterActions, groupCombinations.click, template.editableFields.actionParams, "after") : undefined,
            timeout: template.timeout,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          
          macros.push(clickMacro);
        }
      });
    } else {
      // Create standard macros
      config.midiTriggerGroups.forEach((group, groupIndex) => {
        const combination = allCombinations[groupIndex % allCombinations.length];
        if (!combination) return;

        const baseTrigger = group.triggers.find(t => t.triggerId === "base");
        if (baseTrigger?.trigger) {
          const macro: MacroDefinition = {
            id: crypto.randomUUID(),
            name: group.name,
            type: template.type,
            categoryId: categoryId || undefined,
            trigger: baseTrigger.trigger,
            midi_value: baseTrigger.trigger.type === "controlchange" ? baseTrigger.trigger.value : undefined,
            actions: applyKeyCombinationToActions(template.actions, combination, template.editableFields.actionParams, "main"),
            beforeActions: template.beforeActions ? applyKeyCombinationToActions(template.beforeActions, combination, template.editableFields.actionParams, "before") : undefined,
            afterActions: template.afterActions ? applyKeyCombinationToActions(template.afterActions, combination, template.editableFields.actionParams, "after") : undefined,
            timeout: template.timeout,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
          macros.push(macro);
        }
      });
    }

    if (macros.length > 0) {
      onBulkCreate(macros);
    } else {
      addToast({
        title: "No Macros Created",
        description: "Please check your configuration",
        color: "warning"
      });
    }
  };

  // Get all available actions from the template that can receive key combinations
  const getAvailableActions = (): Array<{id: string, section: string, type: string, description: string}> => {
    const actions: Array<{id: string, section: string, type: string, description: string}> = [];
    
    // Helper to get action description
    const getActionDescription = (action: any, section: string) => {
      const sectionName = section === "main" ? (isEncoderTemplate ? "Increment" : "Main") : 
                         section === "before" ? "Before" :
                         section === "after" ? "After" :
                         section === "decrement" ? "Decrement" :
                         section === "click" ? "Click" : section;
      return `${sectionName}: ${action.type}`;
    };
    
    // Get actions that have editable key parameters
    template.editableFields.actionParams.forEach(editableParam => {
      // Only include actions that have "key" parameter (keypress actions)
      if (editableParam.params.includes("key")) {
        const action = findTemplateAction(editableParam.id, editableParam.section);
        if (action) {
          actions.push({
            id: editableParam.id,
            section: editableParam.section,
            type: action.type,
            description: getActionDescription(action, editableParam.section)
          });
        }
      }
    });
    
    return actions;
  };

  // Find template action by ID and section
  const findTemplateAction = (id: string, section: string) => {
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

  // Toggle action selection
  const toggleActionSelection = (actionId: string) => {
    setConfig(prev => ({
      ...prev,
      selectedActions: prev.selectedActions.includes(actionId)
        ? prev.selectedActions.filter(id => id !== actionId)
        : [...prev.selectedActions, actionId]
    }));
  };

  // Select all actions
  const selectAllActions = () => {
    const allActionIds = getAvailableActions().map(action => action.id);
    setConfig(prev => ({
      ...prev,
      selectedActions: allActionIds
    }));
  };

  // Deselect all actions
  const deselectAllActions = () => {
    setConfig(prev => ({
      ...prev,
      selectedActions: []
    }));
  };

  // Calculate how many macros will be created
  const calculatePreviewCount = () => {
    if (config.selectedActions.length === 0) {
      return 0;
    }
    
    const keyCount = allCombinations.length;
    const midiCount = config.midiTriggerGroups.length;
    return Math.min(keyCount, midiCount);
  };

  // Validation
  const canCreate = () => {
    if (config.selectedActions.length === 0) {
      return false;
    }
    
    if (config.midiTriggerGroups.length === 0) {
      return false;
    }
    
    if (allCombinations.length === 0) {
      return false;
    }
    
    // Check if all groups have assigned MIDI triggers
    for (const group of config.midiTriggerGroups) {
      if (group.triggers.length === 0) {
        return false;
      }
      
      // For encoder templates, check if required triggers are assigned
      if (["encoder-increment", "encoder-decrement", "encoder-click"].includes(template.type)) {
        const hasIncrement = group.triggers.find(t => t.triggerId === "increment");
        const hasDecrement = group.triggers.find(t => t.triggerId === "decrement");
        const hasClick = group.triggers.find(t => t.triggerId === "click");
        
        // Check if required triggers are assigned based on template type
        if (template.type === "encoder-click" && (!hasIncrement || !hasDecrement || !hasClick)) {
          return false;
        } else if (template.type === "encoder-increment" && !hasIncrement) {
          return false;
        } else if (template.type === "encoder-decrement" && !hasDecrement) {
          return false;
        }
      } else {
        // For standard templates, check if base trigger is assigned
        const hasBase = group.triggers.find(t => t.triggerId === "base");
        if (!hasBase) {
          return false;
        }
      }
    }
    
    // Calculate total combinations needed across all groups
    let totalCombinationsNeeded = 0;
    if (["encoder-increment", "encoder-decrement", "encoder-click"].includes(template.type)) {
      config.midiTriggerGroups.forEach(group => {
        if (group.triggers.find(t => t.triggerId === "increment")) totalCombinationsNeeded++;
        if (group.triggers.find(t => t.triggerId === "decrement") && template.decrementActions) totalCombinationsNeeded++;
        if (group.triggers.find(t => t.triggerId === "click") && template.clickActions) totalCombinationsNeeded++;
      });
    } else {
      totalCombinationsNeeded = config.midiTriggerGroups.length;
    }
    
    // Ensure we have enough unique combinations for all groups
    if (allCombinations.length < totalCombinationsNeeded) {
      return false;
    }
    
    return true;
  };

  const getValidationMessage = () => {
    if (config.selectedActions.length === 0) {
      return "Please select at least one action to apply key combinations to.";
    }
    
    if (config.midiTriggerGroups.length === 0) {
      return "Please add at least one MIDI trigger group.";
    }
    
    if (allCombinations.length === 0) {
      return "Please add some key combinations (selected keys + modifiers).";
    }
    
    // Check if all groups have assigned MIDI triggers
    for (const group of config.midiTriggerGroups) {
      if (group.triggers.length === 0) {
        return `Group "${group.name}" has no MIDI triggers assigned. Please assign MIDI triggers to all groups.`;
      }
      
      // For encoder templates, check if required triggers are assigned
      if (["encoder-increment", "encoder-decrement", "encoder-click"].includes(template.type)) {
        const hasIncrement = group.triggers.find(t => t.triggerId === "increment");
        const hasDecrement = group.triggers.find(t => t.triggerId === "decrement");
        const hasClick = group.triggers.find(t => t.triggerId === "click");
        
        // Check if required triggers are assigned based on template type
        if (template.type === "encoder-click" && (!hasIncrement || !hasDecrement || !hasClick)) {
          return `Group "${group.name}" is missing required MIDI triggers. Encoder-click templates need increment, decrement, and click triggers.`;
        } else if (template.type === "encoder-increment" && !hasIncrement) {
          return `Group "${group.name}" is missing increment MIDI trigger.`;
        } else if (template.type === "encoder-decrement" && !hasDecrement) {
          return `Group "${group.name}" is missing decrement MIDI trigger.`;
        }
      } else {
        // For standard templates, check if base trigger is assigned
        const hasBase = group.triggers.find(t => t.triggerId === "base");
        if (!hasBase) {
          return `Group "${group.name}" is missing base MIDI trigger.`;
        }
      }
    }
    
    const keyCount = allCombinations.length;
    
    // Calculate total combinations needed across all groups
    let totalCombinationsNeeded = 0;
    if (["encoder-increment", "encoder-decrement", "encoder-click"].includes(template.type)) {
      config.midiTriggerGroups.forEach(group => {
        if (group.triggers.find(t => t.triggerId === "increment")) totalCombinationsNeeded++;
        if (group.triggers.find(t => t.triggerId === "decrement") && template.decrementActions) totalCombinationsNeeded++;
        if (group.triggers.find(t => t.triggerId === "click") && template.clickActions) totalCombinationsNeeded++;
      });
    } else {
      totalCombinationsNeeded = config.midiTriggerGroups.length;
    }
    
    if (keyCount < totalCombinationsNeeded) {
      return `Not enough key combinations (${keyCount}) for all macro parts (${totalCombinationsNeeded}). Add more keys or enable more modifiers.`;
    }
    
    return "";
  };

  const previewCount = calculatePreviewCount();

  // Notify parent about create state changes
  useEffect(() => {
    if (onCreateReady) {
      onCreateReady(createMacros, canCreate(), previewCount, getValidationMessage());
    }
  }, [config, allCombinations, onCreateReady]);

  return (
    <div className="space-y-6">
     

      {/* Category Selection */}
      <div>
        <label className="text-sm font-medium mb-2 block">Category</label>
        <select 
          aria-label="Select macro category"
          className="w-full rounded-md border-default-200 p-2"
          value={config.categoryId || ""}
          onChange={(e) => setConfig(prev => ({ ...prev, categoryId: e.target.value || null }))}
        >
          <option value="">None</option>
          {categories.map(category => (
            <option key={category.id} value={category.id}>{category.name}</option>
          ))}
        </select>
      </div>
   {/* Action Selection Section */}
   <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Actions to Apply</h3>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="flat"
              onPress={selectAllActions}
              startContent={<Icon icon="lucide:check-circle" />}
            >
              Select All
            </Button>
            <Button
              size="sm"
              variant="flat"
              onPress={deselectAllActions}
              startContent={<Icon icon="lucide:x-circle" />}
            >
              Deselect All
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          {getAvailableActions().map(action => (
            <div key={action.id} className="flex items-center justify-between p-2 bg-default-50 rounded-md">
              <div className="flex-1">
                <p className="text-sm font-medium">{action.description}</p>
              </div>
              <Checkbox
                isSelected={config.selectedActions.includes(action.id)}
                onValueChange={() => toggleActionSelection(action.id)}
              />
            </div>
          ))}
          {getAvailableActions().length === 0 && (
            <p className="text-sm text-foreground-400">No actions available to apply key combinations.</p>
          )}
        </div>
      </Card>
      {/* MIDI Triggers Section */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon icon="lucide:music" className="text-primary" />
            <h3 className="text-lg font-semibold">MIDI Trigger Groups</h3>
            <Chip size="sm" variant="flat" color="primary">
              {config.midiTriggerGroups.length}
            </Chip>
          </div>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              color="secondary" 
              variant="flat"
              onPress={startIterativeMidiDetection}
              isDisabled={isListeningForMidi}
              startContent={<Icon icon="lucide:radio" />}
            >
              {isListeningForMidi ? "Listening..." : "Auto-Detect MIDI"}
            </Button>
            <Button 
              size="sm" 
              color="primary" 
              variant="flat"
              onPress={addMidiTriggerGroup}
              startContent={<Icon icon="lucide:plus" />}
            >
              Add Group
            </Button>
          </div>
        </div>
        
        {isListeningForMidi && (
          <div className="mb-4 p-3 bg-primary-50 border border-primary-200 rounded-md">
            <div className="flex items-center gap-2 text-primary-700">
              <Icon icon="lucide:radio" className="animate-pulse" />
              <span className="font-medium">MIDI Detection Active</span>
              <Chip size="sm" variant="flat" color="primary">
                {midiDetectionCount} groups created
              </Chip>
            </div>
            <p className="text-sm text-primary-600 mt-1">
              Press any MIDI controller to create groups automatically. Press <Kbd keys={['ctrl']}>C</Kbd> to stop.
            </p>
            <div className="mt-2">
              <Button 
                size="sm" 
                variant="flat" 
                color="secondary"
                onPress={() => {
                  // Test MIDI event for debugging
                  const testEvent = new CustomEvent('midi_event', {
                    detail: {
                      channel: 0,
                      controller: 1,
                      value: 127
                    }
                  });
                  window.dispatchEvent(testEvent);
                }}
              >
                Test MIDI Event
              </Button>
            </div>
          </div>
        )}
        
        {config.midiTriggerGroups.length === 0 ? (
          <div className="text-center py-8 text-foreground-500">
            <Icon icon="lucide:music" className="text-4xl mx-auto mb-2" />
            <p>No MIDI trigger groups added yet</p>
            <p className="text-sm">Use "Auto-Detect MIDI" for quick setup or "Add Group" to configure manually</p>
          </div>
        ) : (
          <div className="space-y-4">
            {config.midiTriggerGroups.map((group, groupIndex) => {
              const isActiveGroup = currentDetectionTarget?.groupId === group.id && isListeningForMidi;
              
              return (
                <Card 
                  key={group.id} 
                  className={`p-4 border transition-all duration-300 ${
                    isActiveGroup 
                      ? 'border-primary-500 bg-primary-50 shadow-lg ring-2 ring-primary-200' 
                      : 'border-default-200'
                  }`}
                  ref={el => {
                    if (el) activeGroupRefs.current.set(group.id, el);
                  }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full transition-all duration-300 ${
                        isActiveGroup 
                          ? 'bg-primary-500 animate-pulse' 
                          : 'bg-default-300'
                      }`}></div>
                      <div>
                        <h4 className={`font-medium transition-colors duration-300 ${
                          isActiveGroup ? 'text-primary-700' : 'text-foreground'
                        }`}>
                          {editingGroupName === group.id ? (
                            <Input
                              variant="bordered"
                              value={group.name}
                              onValueChange={(e) => {
                                setConfig(prev => ({
                                  ...prev,
                                  midiTriggerGroups: prev.midiTriggerGroups.map(g =>
                                    g.id === group.id ? { ...g, name: e } : g
                                  )
                                }));
                              }}
                              onBlur={() => setEditingGroupName(null)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  setEditingGroupName(null);
                                }
                              }}
                              autoFocus
                            />
                          ) : (
                            <span
                              onClick={() => setEditingGroupName(group.id)}
                              className="cursor-pointer hover:underline"
                            >
                              {group.name}
                            </span>
                          )}
                          {isActiveGroup && currentDetectionTarget && (
                            <span className="ml-2 text-sm font-normal text-primary-600">
                              → Detecting: {currentDetectionTarget.triggerId}
                            </span>
                          )}
                        </h4>
                        <div className="flex items-center gap-1 mt-1">
                          <Chip size="sm" variant="flat" color="primary">
                            {group.triggers.filter(t => t.trigger).length}/{group.triggers.length}
                          </Chip>
                        </div>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="light"
                      color="danger"
                      isIconOnly
                      onPress={() => removeMidiTriggerGroup(group.id)}
                    >
                      <Icon icon="lucide:trash-2" />
                    </Button>
                  </div>
                  
                  <div className="space-y-3">
                    {group.triggers.map((trigger, index) => (
                      <div key={trigger.triggerId} className="flex items-center gap-3">
                        <div className="w-24 text-sm font-medium text-foreground-600">
                          {trigger.triggerId}
                        </div>
                        <div className="flex-1">
                          <MidiTriggerSelector
                            value={trigger.trigger}
                            onChange={(newTrigger) => handleMidiTriggerChange(group.id, trigger.triggerId, newTrigger)}
                            forceDirection={isEncoderTemplate ? 
                              (index === 0 ? "increment" : 
                               index === 1 ? "decrement" : 
                               undefined) : 
                              undefined}
                            externalListening={isListeningForMidi && currentDetectionTarget?.groupId === group.id && currentDetectionTarget?.triggerId === trigger.triggerId} // Only this specific trigger
                            onStopExternalListening={() => {
                              // When external listening stops (MIDI trigger is set), this will be called
                              // But we don't want to stop the entire auto-detection process
                              console.log("MIDI trigger set, auto-detection will continue to next trigger");
                            }}
                            autoListen={isListeningForMidi && currentDetectionTarget?.groupId === group.id && currentDetectionTarget?.triggerId === trigger.triggerId}
                            lastProcessedTimestamp={lastProcessedTimestampRef.current}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
        
        <p className="text-xs text-foreground-500 mt-3">
          {isEncoderTemplate 
            ? `Each group requires ${config.midiTriggerGroups.length > 0 ? config.midiTriggerGroups[0].triggers.length : 1} MIDI trigger${config.midiTriggerGroups.length > 0 && config.midiTriggerGroups[0].triggers.length > 1 ? 's' : ''}`
            : "Each group requires 1 MIDI trigger"
          }
        </p>
      </Card>

      {/* Key Combinations Section */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Key Combinations</h3>
          <Button
            size="sm"
            variant="flat"
            onPress={() => setIsKeySelectorOpen(true)}
            startContent={<Icon icon="lucide:keyboard" />}
          >
            Select Keys
          </Button>
        </div>
        
        {/* Selected Keys */}
        <div className="mb-4">
          <p className="text-sm font-medium mb-2">Selected Keys ({config.selectedKeys.length})</p>
          <div className="flex flex-wrap gap-2">
            {config.selectedKeys.map(key => (
              <Chip
                key={key}
                variant="bordered"
                onClose={() => removeSelectedKey(key)}
                className="cursor-pointer"
              >
                {key.toUpperCase()}
              </Chip>
            ))}
            {config.selectedKeys.length === 0 && (
              <p className="text-sm text-foreground-400">No keys selected</p>
            )}
          </div>
        </div>

        {/* Excluded Combinations */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Excluded Combinations ({config.excludedCombinations.length})</p>
            <Button
              size="sm"
              variant="flat"
              onPress={() => setIsExclusionSelectorOpen(true)}
              startContent={<Icon icon="lucide:ban" />}
            >
              Add Exclusion
            </Button>
          </div>
          
          <div className="space-y-2">
            {config.excludedCombinations.map((exclusion, index) => (
              <div key={index} className="flex items-center gap-2 p-2 bg-danger-50 rounded-md">
                <div className="flex-1">
                  <span className="text-sm font-medium">
                    {exclusion.modifiers.length > 0 ? (
                      <Kbd keys={exclusion.modifiers.map(m => {
                        // Map modifiers to OS-aware KbdKey values
                        switch (m.toLowerCase()) {
                          case 'ctrl':
                            return 'ctrl';
                          case 'shift':
                            return 'shift';
                          case 'alt':
                            return 'alt';
                          case 'meta':
                            // Detect OS and map accordingly
                            return navigator.platform.includes('Mac') ? 'command' : 'win';
                          default:
                            return m.toLowerCase() as any;
                        }
                      })}>
                        {exclusion.key.toUpperCase()}
                      </Kbd>
                    ) : (
                      <Kbd>
                        {exclusion.key.toUpperCase()}
                      </Kbd>
                    )}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  isIconOnly
                  onPress={() => removeExcludedCombination(index)}
                >
                  <Icon icon="lucide:x" />
                </Button>
              </div>
            ))}
            {config.excludedCombinations.length === 0 && (
              <p className="text-sm text-foreground-400">No combinations excluded</p>
            )}
          </div>
        </div>
      </Card>

      {/* Modifier Rules Section */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon icon="lucide:settings" className="text-warning" />
            <h3 className="text-lg font-semibold">Modifier Rules</h3>
            <Chip size="sm" variant="flat" color="warning">
              {config.modifierRules.filter(r => r.modifiers.length > 0).length}
            </Chip>
          </div>
          <Button 
            size="sm" 
            color="primary" 
            variant="flat"
            onPress={() => {
              const newRule: ModifierRule = {
                modifiers: ["Ctrl"], // Default to Ctrl for new rules
                priority: 1
              };
              setConfig(prev => ({
                ...prev,
                modifierRules: [...prev.modifierRules, newRule]
              }));
            }}
            startContent={<Icon icon="lucide:plus" />}
          >
            Add Rule
          </Button>
        </div>

        <div className="space-y-3">
          {config.modifierRules.map((rule, index) => (
            <Card key={index} className="p-3 border border-default-200">
              <div className="flex items-center gap-3">
                <Checkbox
                  isSelected={rule.modifiers.length > 0}
                  onValueChange={() => {
                    setConfig(prev => ({
                      ...prev,
                      modifierRules: prev.modifierRules.map((r, i) => 
                        i === index ? { ...r, modifiers: r.modifiers.length === 0 ? ["Ctrl"] : [] } : r
                      )
                    }));
                  }}
                />
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium">Priority {rule.priority}:</span>
                    <Chip size="sm" variant="flat" color={rule.modifiers.length > 0 ? "success" : "default"}>
                      {rule.modifiers.length > 0 ? rule.modifiers.map(m => m.toUpperCase()).join('+') : "Disabled"}
                    </Chip>
                  </div>
                  
                  <div className="flex flex-wrap gap-1">
                    {["Ctrl", "Shift", "Alt", "Meta"].map((modifier) => (
                      <Checkbox
                        key={modifier}
                        size="sm"
                        isSelected={rule.modifiers.includes(modifier)}
                        onValueChange={() => {
                          const newModifiers = rule.modifiers.includes(modifier)
                            ? rule.modifiers.filter(m => m !== modifier)
                            : [...rule.modifiers, modifier];
                          setConfig(prev => ({
                            ...prev,
                            modifierRules: prev.modifierRules.map((r, i) => 
                              i === index ? { ...r, modifiers: newModifiers } : r
                            )
                          }));
                        }}
                        isDisabled={rule.modifiers.length === 0}
                      >
                        {modifier}
                      </Checkbox>
                    ))}
                  </div>
                </div>
                
                <Button
                  size="sm"
                  variant="light"
                  color="danger"
                  isIconOnly
                  onPress={() => {
                    setConfig(prev => ({
                      ...prev,
                      modifierRules: prev.modifierRules.filter((_, i) => i !== index)
                    }));
                  }}
                >
                  <Icon icon="lucide:trash-2" />
                </Button>
              </div>
            </Card>
          ))}
        </div>

        <div className="mt-4">
          <label className="text-sm font-medium mb-2 block">Assignment Priority</label>
          <Select
            aria-label="Assignment priority order"
            selectedKeys={[config.assignmentOrder]}
            onSelectionChange={(keys) => {
              const priority = Array.from(keys)[0] as string;
              setConfig(prev => ({ ...prev, assignmentOrder: priority as any }));
            }}
          >
            <SelectItem key="modifier-first">Modifier Priority First</SelectItem>
            <SelectItem key="key-first">Key Priority First</SelectItem>
            <SelectItem key="balanced">Balanced Distribution</SelectItem>
          </Select>
          <p className="text-xs text-foreground-500 mt-1">
            {config.assignmentOrder === "modifier-first" && "Prioritize modifier combinations (Ctrl+Key first, then Shift+Key, etc.)"}
            {config.assignmentOrder === "key-first" && "Prioritize keys (all Ctrl+Key combinations first, then all Shift+Key, etc.)"}
            {config.assignmentOrder === "balanced" && "Distribute combinations evenly across all triggers"}
          </p>
        </div>
      </Card>

      {/* Preview Section */}
      <Card className={`p-4 ${previewCount < 0 ? 'bg-warning-50 border-warning-200' : previewCount > 0 ? 'bg-primary-50 border-primary-200' : 'bg-default-50 border-default-200'}`}>
        <div className="text-center">
          {previewCount < 0 ? (
            <>
              <h3 className="text-lg font-semibold text-warning-800 mb-2">
                <Icon icon="lucide:alert-triangle" className="text-warning-800" /> Not Enough Key Combinations
              </h3>
              <p className="text-sm text-warning-700">
                You have {Math.abs(config.midiTriggerGroups.reduce((sum, group) => sum + group.triggers.filter(t => t.trigger).length, 0))} MIDI triggers but only {Math.abs(previewCount)} key combinations.
              </p>
              <div className="mt-3 text-xs text-warning-600">
                <p>Available combinations: {config.selectedKeys.length} keys × {config.modifierRules.filter(r => r.modifiers.length > 0).length} modifier rules = {Math.abs(previewCount)} total</p>
                <p>Required: {Math.abs(config.midiTriggerGroups.reduce((sum, group) => sum + group.triggers.filter(t => t.trigger).length, 0))} MIDI triggers</p>
                <p className="font-medium mt-2">Please add more keys or enable more modifier rules to continue.</p>
              </div>
            </>
          ) : previewCount > 0 ? (
            <>
              <h3 className="text-lg font-semibold text-primary-800 mb-2">
                <Icon icon="lucide:check-circle" className="text-primary-800" /> Ready to Create {previewCount} Macros
              </h3>
              
              <div className="mt-3 text-xs text-primary-600">
                <p>Distribution: {config.selectedKeys.length} keys × {config.modifierRules.filter(r => r.modifiers.length > 0).length} modifier rules = {config.selectedKeys.length * config.modifierRules.filter(r => r.modifiers.length > 0).length} total combinations</p>
                <p>Available MIDI triggers: {config.midiTriggerGroups.reduce((sum, group) => sum + group.triggers.filter(t => t.trigger).length, 0)}</p>
              </div>
            </>
          ) : (
            <>
              <h3 className="text-lg font-semibold text-default-800 mb-2">
                <Icon icon="lucide:file-text" className="text-default-800" /> Configuration Incomplete
              </h3>
              <p className="text-sm text-default-700">
                Please complete the MIDI triggers, key selection, and modifier rules above.
              </p>
            </>
          )}
        </div>
      </Card>

      {/* Key Selector Modal */}
      <KeySelectorModal
        isOpen={isKeySelectorOpen}
        onOpenChange={setIsKeySelectorOpen}
        onKeySelect={addSelectedKey}
        currentKey=""
        allowMultiple={true}
      />

      {/* Exclusion Key Selector Modal */}
      <KeySelectorModal
        isOpen={isExclusionSelectorOpen}
        onOpenChange={setIsExclusionSelectorOpen}
        onKeySelect={(key: string | string[] | any) => {
          if (typeof key === 'string') {
            addExcludedCombination({ key, modifiers: [] });
          } else if (Array.isArray(key)) {
            // Check if it's an array of strings or an array of KeyCombination objects
            if (key.length > 0 && typeof key[0] === 'object' && key[0].key) {
              // Array of KeyCombination objects from exclusion mode
              key.forEach((combination: KeyCombination) => addExcludedCombination(combination));
            } else {
              // Array of strings
              key.forEach(k => addExcludedCombination({ key: k, modifiers: [] }));
            }
          } else if (key && typeof key === 'object' && key.key) {
            // Single KeyCombination object
            addExcludedCombination(key);
          }
          setIsExclusionSelectorOpen(false);
        }}
        currentKey=""
        allowMultiple={true}
        title="Select Keys to Exclude"
        description="Choose keys that should not be assigned during bulk initialization"
        exclusionMode={true}
      />
    </div>
  );
}; 