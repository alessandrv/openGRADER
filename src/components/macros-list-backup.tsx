import React, { useEffect, useState, useRef, useCallback } from "react";
import { Button, Card, Chip, Divider, Switch, addToast, Accordion, AccordionItem, useDisclosure, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Popover, PopoverTrigger, PopoverContent } from "@heroui/react";
import { Icon } from "@iconify/react";
import { invoke } from '@tauri-apps/api/core';
import { MacroDefinition, Action, MacroCategory } from "../types/macro";
import { registerMacro, MacroConfig, ActionType, ActionParams, MacroAction } from "../lib/tauri";

interface MacrosListProps {
  onEditMacro: (macro: MacroDefinition) => void;
  onCreateTemplate?: (macro: MacroDefinition) => void;
}

interface EncoderGroupTabsProps {
  group: MacroDefinition[];
  activeMacros: Set<string>;
  handleToggleMacro: (id: string, isActive: boolean) => void;
  getActionSummary: (action: Action) => string;
  getTriggerDescription: (trigger: MacroDefinition["trigger"]) => string;
}

const EncoderGroupTabs: React.FC<EncoderGroupTabsProps> = ({ 
  group, 
  activeMacros, 
  handleToggleMacro,
  getActionSummary,
  getTriggerDescription
}) => {
  // State for active tab
  const [activeTab, setActiveTab] = React.useState<string>(group[0]?.id || "");
  const [showShared, setShowShared] = React.useState(false);
  
  // Get active macro
  const activeMacro = group.find(m => m.id === activeTab);
  
  return (
    <>
      {/* Tabs Header */}
      <div className="flex border-b border-default-200">
        {group.map(macro => (
          <div 
            key={macro.id}
            className={`cursor-pointer px-3 py-1.5 text-sm font-medium border-b-2 ${
              macro.id === activeTab ? 
                (macro.type === 'encoder-increment' ? 'border-primary text-primary' :
                macro.type === 'encoder-decrement' ? 'border-warning text-warning' :
                'border-secondary text-secondary') : 
                'border-transparent hover:border-default-200'
            }`}
            onClick={() => setActiveTab(macro.id)}
          >
            <div className="flex items-center gap-1.5">
              <Icon icon={
                macro.type === "encoder-increment" ? "lucide:rotate-cw" :
                macro.type === "encoder-decrement" ? "lucide:rotate-ccw" :
                "lucide:mouse-pointer-click"
              } 
              className={
                macro.id === activeTab ?
                  (macro.type === "encoder-increment" ? "text-primary" :
                  macro.type === "encoder-decrement" ? "text-warning" :
                  "text-secondary") :
                  "text-foreground-400"
              } 
              width={16}
              height={16}
              />
              {macro.type ? 
                macro.type.replace("encoder-", "").charAt(0).toUpperCase() + 
                macro.type.replace("encoder-", "").slice(1) : "Standard"
              }
            </div>
          </div>
        ))}
        
        {/* Shared Tab if there are shared actions */}
        {((group[0].beforeActions && group[0].beforeActions.length > 0) || 
         (group[0].afterActions && group[0].afterActions.length > 0)) && (
          <div
            className={`cursor-pointer px-3 py-1.5 text-sm font-medium border-b-2 ml-auto ${
              showShared ? 'border-default-600 text-default-600' : 'border-transparent hover:border-default-200'
            }`}
            onClick={() => setShowShared(!showShared)}
          >
            <div className="flex items-center gap-1.5">
              <Icon 
                icon="lucide:layers" 
                className={showShared ? "text-default-600" : "text-foreground-400"}
                width={16}
                height={16}
              />
              Shared
            </div>
          </div>
        )}
      </div>

      {/* Active Tab Content */}
      {activeMacro && (
        <div className="py-1">
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2">
              <Icon icon={
                activeMacro.type === "encoder-increment" ? "lucide:rotate-cw" :
                activeMacro.type === "encoder-decrement" ? "lucide:rotate-ccw" :
                "lucide:mouse-pointer-click"
              } className={
                activeMacro.type === "encoder-increment" ? "text-primary" :
                activeMacro.type === "encoder-decrement" ? "text-warning" :
                "text-secondary"
              } />
              <div className="font-medium">{getTriggerDescription(activeMacro.trigger)}</div>
            </div>
            
            <Switch
              isSelected={activeMacros.has(activeMacro.id)}
              onValueChange={(isSelected) => handleToggleMacro(activeMacro.id, isSelected)}
              size="sm"
            />
          </div>
          
          {activeMacro.actions.length > 0 && (
            <div className="space-y-1">
              {activeMacro.actions.map((action, index) => (
                <div key={`${activeMacro.id}-action-${index}`} className="text-xs p-2 bg-default-50 rounded-md flex items-center">
                  <span className="text-foreground-500 mr-2">{index + 1}.</span>
                  <span className="capitalize font-medium">{action.type}</span>
                  <span className="mx-1">-</span>
                  <span>{getActionSummary(action)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Shared Actions (expandable) */}
      {showShared && (
        <div className="mt-2">
          {group[0].beforeActions && group[0].beforeActions.length > 0 && (
            <div className="mb-3">
              <div className="flex items-center gap-2 mb-2 pb-1 border-b border-default-100">
                <Icon icon="lucide:chevrons-left" className="text-primary" />
                <span className="font-medium">Before Actions</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-default-100">
                  {group[0].beforeActions.length}
                </span>
              </div>
              <div className="space-y-1">
                {group[0].beforeActions.map((action, index) => (
                  <div key={`before-${index}`} className="text-xs p-2 bg-default-50 rounded-md flex items-center">
                    <span className="text-foreground-500 mr-2">{index + 1}.</span>
                    <span className="capitalize font-medium">{action.type}</span>
                    <span className="mx-1">-</span>
                    <span>{getActionSummary(action)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {group[0].afterActions && group[0].afterActions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2 pb-1 border-b border-default-100">
                <Icon icon="lucide:chevrons-right" className="text-primary" />
                <span className="font-medium">After Actions</span>
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-default-100">
                  {group[0].afterActions.length}
                </span>
                {group[0].timeout && (
                  <span className="text-xs rounded px-1.5 py-0.5 bg-foreground-100 text-foreground-600 ml-auto">
                    {group[0].timeout}ms timeout
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {group[0].afterActions.map((action, index) => (
                  <div key={`after-${index}`} className="text-xs p-2 bg-default-50 rounded-md flex items-center">
                    <span className="text-foreground-500 mr-2">{index + 1}.</span>
                    <span className="capitalize font-medium">{action.type}</span>
                    <span className="mx-1">-</span>
                    <span>{getActionSummary(action)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
};

export const MacrosList: React.FC<MacrosListProps> = ({ onEditMacro, onCreateTemplate }): JSX.Element => {
  const [macros, setMacros] = useState<MacroDefinition[]>([]);
  const [activeMacros, setActiveMacros] = useState<Set<string>>(new Set());
  const [expandedMacros, setExpandedMacros] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<MacroCategory[]>([]);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showCategoryManager, setShowCategoryManager] = useState<boolean>(false);
  const [currentEditMacro, setCurrentEditMacro] = useState<MacroDefinition | null>(null);
  const { isOpen, onOpen, onClose, onOpenChange } = useDisclosure();
  const [categoryActivationModal, setCategoryActivationModal] = useState<{
    isOpen: boolean;
    categoryId: string;
    isActive: boolean;
  } | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  
  // State for delete confirmation popovers
  const [deletePopoverOpen, setDeletePopoverOpen] = useState<string | null>(null);
  const [categoryDeletePopoverOpen, setCategoryDeletePopoverOpen] = useState<string | null>(null);
  
  // Category management state
  const categoryManagementState = {
    modalOpen: useState(false),
    editingCategory: useState<MacroCategory | null>(null),
    name: useState(""),
    color: useState("primary")
  };
  
  // Destructure for easier access
  const [categoryModalOpen, setCategoryModalOpen] = categoryManagementState.modalOpen;
  const [editingCategory, setEditingCategory] = categoryManagementState.editingCategory;
  const [newCategoryName, setNewCategoryName] = categoryManagementState.name;
  const [selectedColor, setSelectedColor] = categoryManagementState.color;
  
  // Drag and drop state
  type DragItem = {
    id: string;
    type: 'macro' | 'group';
    sourceId?: string; // groupId for grouped macros
    sourceCategoryId: string;
  };
  
  type DropTarget = {
    id: string;
    type: 'macro' | 'group' | 'category';
    targetCategoryId: string;
  } | null;
  
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  const [macroOrder, setMacroOrder] = useState<Record<string, string[]>>({}); // Category ID -> ordered IDs
  const [isDragging, setIsDragging] = useState(false);
  
  // Add CSS for drag and drop
  React.useEffect(() => {
    const style = document.createElement('style');
    style.id = 'macro-dnd-styles';
    style.innerHTML = `
      .macro-card {
        transition: all 0.2s ease-out;
        user-select: none;
      }
      
      .dragging .macro-card:not(.being-dragged) {
        opacity: 0.6;
      }
      
      .macro-card.being-dragged {
        opacity: 0.8;
        transform: scale(1.02);
        cursor: grabbing !important;
      }
      
      .macro-card.drop-target {
        border: 2px dashed var(--primary-400) !important;
        background-color: var(--primary-50) !important;
        position: relative;
        z-index: 1;
      }
      
      .macro-card.drop-target::before {
        content: '';
        position: absolute;
        top: -6px;
        left: 0;
        right: 0;
        height: 4px;
        background-color: var(--primary-500);
        border-radius: 4px;
        z-index: 2;
      }
      
      .category-header {
        transition: all 0.2s ease-out;
      }
      
      .category-header.drop-target {
        border: 2px dashed var(--primary-400) !important;
        background-color: var(--primary-50) !important;
        padding: 16px;
      }
      
      [draggable=true] {
        cursor: grab;
      }
    `;
    document.head.appendChild(style);
    
    return () => {
      const element = document.getElementById('macro-dnd-styles');
      if (element) {
        document.head.removeChild(element);
      }
    };
  }, []);
  
  // Load macro order from localStorage
  useEffect(() => {
    try {
      const storedOrder = localStorage.getItem('macroOrder');
      if (storedOrder) {
        setMacroOrder(JSON.parse(storedOrder));
      }
    } catch (error) {
      console.error('Failed to load macro order:', error);
    }
  }, []);
  
  // Save macro order to localStorage when it changes
  useEffect(() => {
    if (Object.keys(macroOrder).length > 0) {
      localStorage.setItem('macroOrder', JSON.stringify(macroOrder));
    }
  }, [macroOrder]);
  
  // Utility function to get a unique key for ordering
  const getOrderKey = (macro: MacroDefinition): string => {
    return macro.groupId || macro.id;
  };
  
  // Calculate a sorted list of macros for a category
  const getSortedMacros = (categoryId: string, macrosInCategory: MacroDefinition[]): MacroDefinition[] => {
    const orderForCategory = macroOrder[categoryId];
    
    if (!orderForCategory || orderForCategory.length === 0) {
      return macrosInCategory;
    }
    
    // Group macros by their order key (groupId or id)
    const macrosByKey: Record<string, MacroDefinition[]> = {};
    
    macrosInCategory.forEach(macro => {
      const key = getOrderKey(macro);
      if (!macrosByKey[key]) {
        macrosByKey[key] = [];
      }
      macrosByKey[key].push(macro);
    });
    
    // Create the sorted list according to the order
    const result: MacroDefinition[] = [];
    
    // First add all ordered macros
    orderForCategory.forEach(key => {
      if (macrosByKey[key]) {
        result.push(...macrosByKey[key]);
        delete macrosByKey[key];
      }
    });
    
    // Then add any remaining macros not in the order
    Object.values(macrosByKey).forEach(macros => {
      result.push(...macros);
    });
    
    return result;
  };
  
  // Add state for MIDI conflict resolution
  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    newMacro: MacroDefinition | null;
    conflictingMacros: MacroDefinition[];
  }>({
    isOpen: false,
    newMacro: null,
    conflictingMacros: []
  });
  
  // Reference to track elements being deleted with animation
  const elementsBeingDeleted = useRef(new Set<string>());
  
  // Thanos snap animation functions
  const setRandomSeed = useCallback(() => {
    const turbulence = document.getElementById("dissolve-filter-turbulence");
    if (turbulence) {
      turbulence.setAttribute("seed", (Math.random() * 1000).toString());
    }
  }, []);

  const easeOutCubic = useCallback((t: number) => {
    return 1 - Math.pow(1 - t, 3);
  }, []);

  const maxDisplacementScale = 2000;

  const useThanosSnap = useCallback((elementId: string, onComplete: () => void) => {
    const element = document.getElementById(elementId);
    if (!element || elementsBeingDeleted.current.has(elementId)) return;
    
    elementsBeingDeleted.current.add(elementId);
    
    const displacement = document.getElementById("dissolve-filter-displacement");
    if (!displacement) return;
    
    setRandomSeed();
    element.style.filter = "url(#dissolve-filter)";

    const duration = 1000;
    const startTime = performance.now();
    element.setAttribute("data-being-destroyed", "true");

    const animate = (currentTime: number) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1);
      const displacementScale = easeOutCubic(progress) * maxDisplacementScale;

      displacement.setAttribute("scale", displacementScale.toString());
      element.style.transform = `scale(${1 + 0.1 * progress})`;
      element.style.opacity = progress < 0.5 ? "1" : `${1 - ((progress - 0.5) * 2)}`;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        displacement.setAttribute("scale", "0");
        elementsBeingDeleted.current.delete(elementId);
        onComplete();
      }
    };

    requestAnimationFrame(animate);
  }, [easeOutCubic, setRandomSeed]);

  useEffect(() => {
    // Load macros from localStorage
    const storedMacros = localStorage.getItem("midiMacros");
    if (storedMacros) {
      try {
        const parsedMacros = JSON.parse(storedMacros);
        
        // Debug: Check for duplicates in loaded macros
        const macroIds = parsedMacros.map((m: MacroDefinition) => m.id);
        const uniqueIds = new Set(macroIds);
        const hasDuplicates = macroIds.length !== uniqueIds.size;
        
        if (hasDuplicates) {
          console.warn("Found duplicate macro IDs in localStorage!");
          
          // Find the duplicates
          const duplicateIds = macroIds.filter((id: string, idx: number) => 
            macroIds.indexOf(id) !== idx
          );
          
          console.warn(`Duplicate IDs: ${duplicateIds.join(", ")}`);
          
          // Find duplicate groups
          const groupedMacros = parsedMacros.reduce((acc: Record<string, any[]>, macro: MacroDefinition) => {
            if (!acc[macro.id]) acc[macro.id] = [];
            acc[macro.id].push(macro);
            return acc;
          }, {});
          
          // Log details about duplicates
          Object.entries(groupedMacros)
            .filter(([_, macros]) => (macros as any[]).length > 1)
            .forEach(([id, macros]) => {
              console.warn(`Duplicate ID ${id}:`);
              (macros as any[]).forEach((m, i) => {
                console.warn(`  ${i+1}: ${m.name} (${m.type}) - Group: ${m.groupId || "none"}`);
              });
            });
            
            // Filter out duplicates before setting state - keep only the first occurrence
            const uniqueMacros = parsedMacros.filter((macro: MacroDefinition, idx: number) => 
              macroIds.indexOf(macro.id) === idx
            );
            
            setMacros(uniqueMacros);
            
            // Write back de-duplicated macros to localStorage
            localStorage.setItem("midiMacros", JSON.stringify(uniqueMacros));
            console.log("De-duplicated macros saved back to localStorage");
        } else {
          // No duplicates, proceed normally
          setMacros(parsedMacros);
        }
      } catch (e) {
        console.error("Failed to parse macros from localStorage:", e);
        setMacros([]);
      }
    }
    
    // Load active macros from localStorage
    const activeFromStorage = localStorage.getItem("activeMidiMacros");
    if (activeFromStorage) {
      try {
        const activeIds = JSON.parse(activeFromStorage);
        if (Array.isArray(activeIds)) {
          setActiveMacros(new Set(activeIds));
          
          // Activate these macros in the backend
          if (activeIds.length > 0) {
            // We'll activate them slightly delayed to ensure everything is initialized
            setTimeout(() => {
              activeIds.forEach(id => {
                handleToggleMacro(id, true, false); // The false prevents saving to storage again
              });
            }, 1000); // 1-second delay to ensure app is fully loaded
          }
        }
      } catch (e) {
        console.error("Failed to parse active macros from storage:", e);
      }
    }
    
    // Load categories
    loadCategories();
    
    // Load macro order or initialize it
    const storedOrder = localStorage.getItem("macroOrder");
    if (storedOrder) {
      try {
        const parsedOrder = JSON.parse(storedOrder);
        setMacroOrder(parsedOrder);
      } catch (e) {
        console.error("Failed to parse macro order from localStorage:", e);
        // Initialize empty order
        setMacroOrder({});
      }
    }
  }, []);

  // Load categories from localStorage
  const loadCategories = () => {
    const storedCategories = localStorage.getItem("macroCategories");
    if (storedCategories) {
      try {
        const parsedCategories = JSON.parse(storedCategories);
        setCategories(parsedCategories);
        
        // Initialize expanded state for categories
        const expanded = new Set<string>();
        parsedCategories.forEach((cat: MacroCategory) => {
          if (cat.isExpanded) {
            expanded.add(cat.id);
          }
        });
        //setExpandedCategories(expanded);
      } catch (e) {
        console.error("Failed to parse categories from localStorage", e);
        initializeDefaultCategories();
      }
    } else {
      initializeDefaultCategories();
    }
  };
  
  // Initialize with default categories if none exist
  const initializeDefaultCategories = () => {
    const defaultCategories: MacroCategory[] = [
      { id: "default", name: "General", color: "default", isExpanded: true }
    ];
    setCategories(defaultCategories);
    setExpandedCategories(new Set(["default"]));
    localStorage.setItem("macroCategories", JSON.stringify(defaultCategories));
  };
  
  // Handle category expansion toggle
  const toggleCategoryExpanded = (categoryId: string) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId);
      } else {
        newSet.add(categoryId);
      }
      
      // Update localStorage with new expanded state
      const updatedCategories = categories.map(cat => ({
        ...cat,
        isExpanded: newSet.has(cat.id)
      }));
      localStorage.setItem("macroCategories", JSON.stringify(updatedCategories));
      
      return newSet;
    });
  };
  
  // Handle categories change from CategoryManager
  const handleCategoriesChange = (updatedCategories: MacroCategory[]) => {
    setCategories(updatedCategories);
    
    // Update expanded state based on isExpanded property
    const expanded = new Set<string>();
    updatedCategories.forEach(cat => {
      if (cat.isExpanded) {
        expanded.add(cat.id);
      }
    });
    setExpandedCategories(expanded);
  };

  const toggleExpanded = (id: string) => {
    setExpandedMacros(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Add function to check for MIDI trigger conflicts
  const findConflictingMacros = (macro: MacroDefinition): MacroDefinition[] => {
    // Only check among active macros
    const activeIds = Array.from(activeMacros);
    const activeMacroObjects = macros.filter(m => activeIds.includes(m.id));
    
    // Check for conflicts based on MIDI trigger
    return activeMacroObjects.filter(activeMacro => {
      // Skip if it's the same macro
      if (activeMacro.id === macro.id) return false;
      
      // For macros in the same group, they don't conflict with each other
      if (macro.groupId && activeMacro.groupId === macro.groupId) return false;
      
      // Check if triggers match
      const triggerMatches = 
        activeMacro.trigger.type === macro.trigger.type &&
        activeMacro.trigger.channel === macro.trigger.channel;
      
      if (triggerMatches) {
        // For note on/off, check if the note number matches
        if (activeMacro.trigger.type === "noteon" || activeMacro.trigger.type === "noteoff") {
          return activeMacro.trigger.note === macro.trigger.note;
        }
        
        // For control change, check if controller and value match (if specified)
        if (activeMacro.trigger.type === "controlchange") {
          const controllerMatches = activeMacro.trigger.controller === macro.trigger.controller;
          
          // If both have specific values, they conflict only if values match
          if (controllerMatches && activeMacro.trigger.value !== undefined && macro.trigger.value !== undefined) {
            return activeMacro.trigger.value === macro.trigger.value;
          }
          
          // If either doesn't have a specific value, they conflict on controller match
          return controllerMatches;
        }
      }
      
      return false;
    });
  };

  const handleToggleMacro = async (id: string, isActive: boolean, saveToStorage = true) => {
    try {
      // Find the macro in our list
      const macro = macros.find(m => m.id === id);
      if (!macro) return;
      
      // If enabling, check for conflicts
      if (isActive) {
        const conflictingMacros = findConflictingMacros(macro);
        
        // If there are conflicts, show the modal instead of activating immediately
        if (conflictingMacros.length > 0) {
          setConflictModal({
            isOpen: true,
            newMacro: macro,
            conflictingMacros
          });
          return; // Don't proceed with activation yet
        }
      }
      
      // Continue with macro activation/deactivation as before
      const macrosToToggle: MacroDefinition[] = [];
      
      if (macro.groupId) {
        // Get all macros in this group
        const groupMacros = macros.filter(m => m.groupId === macro.groupId);
        macrosToToggle.push(...groupMacros);
        
        console.log(`Toggling all ${groupMacros.length} macros in group ${macro.groupId}`);
      } else {
        // Just a single macro
        macrosToToggle.push(macro);
      }
      
      // New Set to track activated IDs
      const newActiveMacros = new Set(activeMacros);
      
      if (isActive) {
        // Activate macros
        for (const macroToActivate of macrosToToggle) {
          // Helper function to map Action to MacroAction
          const convertAction = (action: Action): MacroAction => {
            return {
              action_type: mapActionType(action.type, action.params),
              action_params: mapActionParams(action.type, action.params)
            };
          };
          
          // Convert to a format suitable for Tauri
          const config: MacroConfig = {
            id: macroToActivate.id,
            name: macroToActivate.name,
            // Include groupId for encoder macros to ensure shared state
            groupId: macroToActivate.groupId,
            midi_note: macroToActivate.trigger.controller || macroToActivate.trigger.note || 0,
            midi_channel: macroToActivate.trigger.channel || 0,
            midi_value: macroToActivate.trigger.type === "controlchange" ? macroToActivate.trigger.value : undefined,
            actions: macroToActivate.actions.map(convertAction),
            // Include before actions if they exist
            before_actions: macroToActivate.beforeActions && macroToActivate.beforeActions.length > 0 
              ? macroToActivate.beforeActions.map(convertAction)
              : undefined,
            // Include after actions if they exist
            after_actions: macroToActivate.afterActions && macroToActivate.afterActions.length > 0
              ? macroToActivate.afterActions.map(convertAction)
              : undefined,
            // Include timeout if it exists
            timeout: macroToActivate.timeout
          };
          
          // Register with Tauri backend
          await registerMacro(config);
          
          // Update UI state
          newActiveMacros.add(macroToActivate.id);
        }
        
        const displayName = macro.groupId 
          ? macro.name.replace(/ \(.*\)$/, "") // Remove the suffix for group macros
          : macro.name;
        
        if (!saveToStorage) {
          console.log(`Silently activated ${displayName}`);
        } else {
          addToast({
            title: "Macro Activated",
            description: `${displayName} ${macrosToToggle.length > 1 ? 'group' : ''} is now active`,
            color: "success"
          });
        }
      } else {
        // Deactivate macros
        for (const macroToDeactivate of macrosToToggle) {
          try {
            // Call the backend to cancel the macro
            await invoke('cancel_macro', { id: macroToDeactivate.id });
            
            // Update UI state
            newActiveMacros.delete(macroToDeactivate.id);
            
            console.log(`Successfully deactivated macro: ${macroToDeactivate.id}`);
          } catch (cancelErr) {
            console.error(`Error deactivating macro ${macroToDeactivate.id}:`, cancelErr);
          }
        }
        
        const displayName = macro.groupId 
          ? macro.name.replace(/ \(.*\)$/, "") // Remove the suffix for group macros
          : macro.name;
        
        if (!saveToStorage) {
          console.log(`Silently deactivated ${displayName}`);
        } else {
          addToast({
            title: "Macro Deactivated",
            description: `${displayName} ${macrosToToggle.length > 1 ? 'group' : ''} has been deactivated`,
            color: "warning"
          });
        }
      }
      
      // Update the state with all the changes
      setActiveMacros(newActiveMacros);
      
      // Save active macros to localStorage for persistence
      if (saveToStorage) {
        localStorage.setItem("activeMidiMacros", JSON.stringify([...newActiveMacros]));
      }
    } catch (err) {
      console.error("Error toggling macro:", err);
      addToast({
        title: "Error",
        description: `Failed to ${isActive ? "activate" : "deactivate"} macro: ${(err as Error).message}`,
        color: "danger"
      });
    }
  };

  // New function to handle conflict resolution
  const handleResolveConflict = async (action: "new" | "existing" | "cancel") => {
    if (!conflictModal.newMacro) return;
    
    try {
      if (action === "new") {
        // Deactivate the conflicting macros first
        for (const conflictingMacro of conflictModal.conflictingMacros) {
          // If this is part of a group, deactivate all macros in the group
          if (conflictingMacro.groupId) {
            const groupMacros = macros.filter(m => m.groupId === conflictingMacro.groupId);
            for (const groupMacro of groupMacros) {
              await invoke('cancel_macro', { id: groupMacro.id });
              console.log(`Deactivated conflicting group macro: ${groupMacro.id}`);
            }
    } else {
            await invoke('cancel_macro', { id: conflictingMacro.id });
            console.log(`Deactivated conflicting macro: ${conflictingMacro.id}`);
          }
        }
        
        // Create a new Set with updated active macros
        const newActiveMacros = new Set(activeMacros);
        
        // Remove conflicting macros from active set
        for (const conflictingMacro of conflictModal.conflictingMacros) {
          if (conflictingMacro.groupId) {
            const groupMacros = macros.filter(m => m.groupId === conflictingMacro.groupId);
            for (const groupMacro of groupMacros) {
              newActiveMacros.delete(groupMacro.id);
            }
          } else {
            newActiveMacros.delete(conflictingMacro.id);
          }
        }
        
        // Update active macros state and storage
        setActiveMacros(newActiveMacros);
        localStorage.setItem("activeMidiMacros", JSON.stringify([...newActiveMacros]));
        
        // Now activate the new macro directly without going through handleToggleMacro
        // since that function would check for conflicts again
        const newMacro = conflictModal.newMacro;
        const macrosToActivate: MacroDefinition[] = [];
        
        if (newMacro.groupId) {
          // Get all macros in this group
          const groupMacros = macros.filter(m => m.groupId === newMacro.groupId);
          macrosToActivate.push(...groupMacros);
          console.log(`Activating all ${groupMacros.length} macros in group ${newMacro.groupId}`);
        } else {
          // Just a single macro
          macrosToActivate.push(newMacro);
        }
        
        // Update newActiveMacros with the new additions
        const updatedActiveMacros = new Set(newActiveMacros);
        
        // Activate each macro in the backend and track in state
        for (const macroToActivate of macrosToActivate) {
          try {
            // Helper function to map Action to MacroAction
            const convertAction = (action: Action): MacroAction => {
              return {
                action_type: mapActionType(action.type, action.params),
                action_params: mapActionParams(action.type, action.params)
              };
            };
            
            // Convert to a format suitable for Tauri
            const config: MacroConfig = {
              id: macroToActivate.id,
              name: macroToActivate.name,
              groupId: macroToActivate.groupId,
              midi_note: macroToActivate.trigger.controller || macroToActivate.trigger.note || 0,
              midi_channel: macroToActivate.trigger.channel || 0,
              midi_value: macroToActivate.trigger.type === "controlchange" ? macroToActivate.trigger.value : undefined,
              actions: macroToActivate.actions.map(convertAction),
              before_actions: macroToActivate.beforeActions && macroToActivate.beforeActions.length > 0 
                ? macroToActivate.beforeActions.map(convertAction)
                : undefined,
              after_actions: macroToActivate.afterActions && macroToActivate.afterActions.length > 0
                ? macroToActivate.afterActions.map(convertAction)
                : undefined,
              timeout: macroToActivate.timeout
            };
            
            // Register with Tauri backend
            await registerMacro(config);
            console.log(`Activated macro ${macroToActivate.id} directly`);
            
            // Update tracking
            updatedActiveMacros.add(macroToActivate.id);
          } catch (err) {
            console.error(`Error activating replacement macro ${macroToActivate.id}:`, err);
          }
        }
        
        // Update state with the newly activated macros
        setActiveMacros(updatedActiveMacros);
        localStorage.setItem("activeMidiMacros", JSON.stringify([...updatedActiveMacros]));
        
        const displayName = newMacro.groupId 
          ? newMacro.name.replace(/ \(.*\)$/, "") // Remove the suffix for group macros
          : newMacro.name;
    
    addToast({
          title: "Conflict Resolved",
          description: `Replaced conflicting macro(s) with ${displayName}`,
          color: "success"
        });
      } else if (action === "existing") {
        // Keep existing macros, do nothing with the new one
        addToast({
          title: "Kept Existing Macro",
          description: "Existing macro remains active",
          color: "primary"
        });
      } else {
        // Cancel operation, do nothing
      }
    } catch (err) {
      console.error("Error resolving conflict:", err);
      addToast({
        title: "Error",
        description: `Failed to resolve macro conflict: ${(err as Error).message}`,
      color: "danger"
    });
    } finally {
      // Close the modal
      setConflictModal({
        isOpen: false,
        newMacro: null,
        conflictingMacros: []
      });
    }
  };

  // Helper functions to map to Tauri types
  const mapActionType = (actionType: string, params: Record<string, any>): ActionType => {
    switch (actionType) {
      case "keypress":
      case "keyhold":
        // If there are modifiers, use KeyCombination instead of KeyPress
        if (params.modifiers && params.modifiers.length > 0) {
          return ActionType.KeyCombination;
        }
        return ActionType.KeyPress;
      case "mouseclick":
        return ActionType.MouseClick;
      case "mouserelease":
        return ActionType.MouseRelease;
      case "mousemove":
        return ActionType.MouseMove;
      case "mousedrag":
        return ActionType.MouseDrag;
      case "delay":
        return ActionType.Delay;
      default:
        // Fallback or error handling
        console.warn(`Unknown action type in mapActionType: ${actionType}, defaulting to KeyPress`);
        return ActionType.KeyPress; 
    }
  };

  const mapActionParams = (actionType: string, params: Record<string, any>): ActionParams => {
    switch (actionType) {
      case "keypress":
      case "keyhold":
        // Check if we have modifiers
        if (params.modifiers && params.modifiers.length > 0) {
          // For key combinations (key + modifiers), format as a keys array
          const keys = [...params.modifiers, params.key];
          console.log(`Creating key combination with keys:`, keys);
          return { keys };
        } else {
          // Simple key press without modifiers
          return { key: params.key || "" };
        }
      case "mouseclick":
        return {
          button: params.button || "left",
          hold: params.hold || false, // Pass hold parameter
        };
      case "mouserelease":
        return {
          button: params.button || "left",
        };
      case "mousemove": // For registration, perhaps only initial point or it's not registered directly for trigger
        if (params.relative === true) {
          // When relative movement is enabled, use direction and distance
          let dx = 0;
          let dy = 0;
          const distance = typeof params.distance === 'number' ? params.distance : 100;
          switch (params.direction) {
            case "up":    dy = -distance; break;
            case "down":  dy = distance;  break;
            case "left":  dx = -distance; break;
            case "right": dx = distance;  break;
          }
          return {
            x: dx,
            y: dy,
            relative: true
          };
        } else {
          // Normal absolute coordinates
          return {
            x: params.x || 0,
            y: params.y || 0,
            relative: false
          };
        }
      case "mousedrag":
        let dx = 0;
        let dy = 0;
        const distance = typeof params.distance === 'number' ? params.distance : 0;
        switch (params.direction) {
          case "up":    dy = -distance; break;
          case "down":  dy = distance;  break;
          case "left":  dx = -distance; break;
          case "right": dx = distance;  break;
        }
        return {
          button: params.button || "left",
          x: dx, // dx mapped to x for ActionParams
          y: dy, // dy mapped to y for ActionParams
          duration: typeof params.duration === 'number' ? params.duration : 0,
        };
      case "delay":
        return {
          duration: typeof params.duration === 'number' ? params.duration : 0,
        };
      default:
        return {};
    }
  };

  // Helper function to generate a summary of the action
  function getActionSummary(action: Action): string {
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
          return `Move ${action.params.direction || 'right'} by ${action.params.distance || 100}px`;
        } else {
          return `Move to (${action.params.x}, ${action.params.y})`;
        }
      case "mousedrag":
        return `Drag ${action.params.direction} by ${action.params.distance}px in ${action.params.duration}ms`;
      case "mousescroll":
        return `Scroll ${action.params.direction} at (${action.params.x}, ${action.params.y})`;
      case "delay":
        return `Wait for ${action.params.duration}ms`;
      default:
        return "Unknown action";
    }
  }

  // Helper function for showing trigger details
  function getTriggerDescription(trigger: MacroDefinition["trigger"]): string {
    if (trigger.type === "noteon") {
      return `Note ${trigger.note} Ch ${trigger.channel}`;
    } else if (trigger.type === "controlchange") {
      let description = `CC ${trigger.controller} Ch ${trigger.channel}`;
      if (trigger.value !== undefined) {
        description += ` / ${trigger.value}`;
      }
      if (trigger.direction) {
        description += ` (${trigger.direction === 'increment' ? '↑' : '↓'})`;
      }
      return description;
    }
    return trigger.type;
  }

  // Helper for determining chip color based on type
  function getChipColor(type?: string): "primary" | "secondary" | "warning" | "danger" {
    switch (type) {
      case "encoder-increment":
        return "primary";
      case "encoder-decrement":
        return "warning";
      case "encoder-click":
        return "secondary";
      default:
        return "primary";
    }
  }

  // Organize macros by category
  const macrosByCategory = React.useMemo(() => {
    const result: Record<string, MacroDefinition[]> = {};
    
    // Initialize with all categories as keys (even empty ones)
    categories.forEach(category => {
      result[category.id] = [];
    });
    
    // Ensure default category exists
    if (!result["default"]) {
      result["default"] = [];
    }
    
    // Group macros by their category
    for (const macro of macros) {
      const categoryId = macro.categoryId || "default";
      if (!result[categoryId]) {
        result[categoryId] = [];
      }
      result[categoryId].push(macro);
    }
    
    // Sort macros according to the order in macroOrder
    Object.keys(result).forEach(categoryId => {
      const orderForCategory = macroOrder[categoryId];
      
      if (orderForCategory && orderForCategory.length > 0) {
        // Create a map of group IDs to arrays of macros in that group
        const macroGroups: Record<string, MacroDefinition[]> = {};
        
        // Group macros by their groupId or individual ID
        result[categoryId].forEach(macro => {
          const key = macro.groupId || macro.id;
          if (!macroGroups[key]) {
            macroGroups[key] = [];
          }
          macroGroups[key].push(macro);
        });
        
        // Create a new sorted array based on the order
        const sortedMacros: MacroDefinition[] = [];
        
        // Add macros in the order specified
        orderForCategory.forEach(id => {
          if (macroGroups[id]) {
            sortedMacros.push(...macroGroups[id]);
            delete macroGroups[id];
          }
        });
        
        // Add any remaining macros that weren't in the order
        Object.values(macroGroups).forEach(group => {
          sortedMacros.push(...group);
        });
        
        // Replace the unsorted array with the sorted one
        result[categoryId] = sortedMacros;
      }
    });
    
    return result;
  }, [macros, categories, macroOrder]);

  // Group macros by their groupId or put singles in their own group
  const groupedMacros = React.useMemo(() => {
    const groups: Record<string, MacroDefinition[]> = {};
    
    macros.forEach(macro => {
      const key = macro.groupId || macro.id;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(macro);
    });
    
    return Object.values(groups);
  }, [macros]);

  // Add the category assignment modal function
  const handleAssignCategory = (macro: MacroDefinition) => {
    setCurrentEditMacro(macro);
    onOpen();
  };

  // Handle saving the category assignment
  const handleSaveCategoryAssignment = (categoryId: string) => {
    if (!currentEditMacro) return;
    
    // Update the macro with the new category
    const updatedMacros = macros.map(m => {
      // If this is part of a group, update all macros in the group
      if (currentEditMacro.groupId && m.groupId === currentEditMacro.groupId) {
        return { ...m, categoryId };
      }
      // Otherwise just update the selected macro
      else if (m.id === currentEditMacro.id) {
        return { ...m, categoryId };
      }
      return m;
    });
    
    // Save to localStorage
    setMacros(updatedMacros);
    localStorage.setItem("midiMacros", JSON.stringify(updatedMacros));
    
    // Close the modal
    onClose();
    setCurrentEditMacro(null);
    
    // Show success message
    const categoryName = categories.find(c => c.id === categoryId)?.name || "selected category";
    addToast({
      title: "Category Assigned",
      description: `Macro assigned to "${categoryName}"`,
      color: "success"
    });
  };

  // Add this function for category-level activation handling
  const handleToggleCategory = (categoryId: string, isActive: boolean) => {
    console.log(`Toggle category ${categoryId}, active: ${isActive}`);
    
    // First check if we need to prompt the user for exclusive mode
    if (isActive) {
      console.log(`Opening category activation modal for ${categoryId}`);
      setCategoryActivationModal({
        isOpen: true,
        categoryId,
        isActive
      });
    } else {
      // When deactivating, we don't need to ask about exclusivity
      console.log(`Direct deactivation of category ${categoryId}`);
      deactivateCategoryMacros(categoryId);
    }
  };

  // Function to activate macros in a category, with exclusive option
  const activateCategoryMacros = async (categoryId: string, exclusive: boolean) => {
    try {
      console.log(`Activating category ${categoryId}, exclusive: ${exclusive}`);
      
      // If exclusive, first deactivate all macros
      if (exclusive) {
        console.log("Exclusive mode - deactivating all active macros first");
        
        // Get all current active IDs
        const activeIds = [...activeMacros];
        console.log(`Found ${activeIds.length} active macros to deactivate`);
        
        // Create a new set for tracking
        const newActiveMacros = new Set<string>();
        setActiveMacros(newActiveMacros);
        
        // Deactivate all active macros
        for (const id of activeIds) {
          try {
            // Call the backend to cancel the macro
            await invoke('cancel_macro', { id });
            console.log(`Deactivated macro ${id}`);
          } catch (err) {
            console.error(`Error deactivating macro ${id}:`, err);
          }
        }
      }
      
      // Get all macros in the specified category
      const categoryMacros = macros.filter(m => (m.categoryId || "default") === categoryId);
      console.log(`Found ${categoryMacros.length} macros in category ${categoryId}`);
      
      // Group by encoder groups to avoid duplicate activation
      const groupsToActivate = new Set<string | undefined>();
      const standaloneMacros: MacroDefinition[] = [];
      
      // Sort macros into groups and standalone macros
      categoryMacros.forEach(macro => {
        if (macro.groupId) {
          groupsToActivate.add(macro.groupId);
        } else {
          standaloneMacros.push(macro);
        }
      });
      
      console.log(`Activating ${groupsToActivate.size} encoder groups and ${standaloneMacros.length} standalone macros`);
      
      // Activate all macros in the category
      const newActiveMacros = new Set(exclusive ? [] : [...activeMacros]);
      
      // First activate encoder groups
      for (const groupId of groupsToActivate) {
        if (!groupId) continue;
        
        // Get all macros in this group
        const groupMacros = macros.filter(m => m.groupId === groupId);
        console.log(`Activating group ${groupId} with ${groupMacros.length} macros`);
        
        // Activate each one
        for (const macro of groupMacros) {
          try {
            // Convert to a format suitable for Tauri
            const config = createMacroConfig(macro);
            
            // Register with Tauri backend
            await registerMacro(config);
            console.log(`Registered macro ${macro.id}`);
            
            // Update tracking
            newActiveMacros.add(macro.id);
          } catch (err) {
            console.error(`Error activating macro ${macro.id}:`, err);
          }
        }
      }
      
      // Then activate standalone macros
      for (const macro of standaloneMacros) {
        try {
          // Convert to a format suitable for Tauri
          const config = createMacroConfig(macro);
          
          // Register with Tauri backend
          await registerMacro(config);
          console.log(`Registered standalone macro ${macro.id}`);
          
          // Update tracking
          newActiveMacros.add(macro.id);
        } catch (err) {
          console.error(`Error activating macro ${macro.id}:`, err);
        }
      }
      
      // Update state with all activated macros
      setActiveMacros(newActiveMacros);
      console.log(`Updated activeMacros state with ${newActiveMacros.size} active macros`);
      
      // Save active macros to localStorage
      localStorage.setItem("activeMidiMacros", JSON.stringify([...newActiveMacros]));
      
      // Show success message
      const categoryName = categories.find(c => c.id === categoryId)?.name || "Selected category";
      addToast({
        title: exclusive ? "Category Activated Exclusively" : "Category Activated",
        description: `${categoryName} macros are now active${exclusive ? ", all others deactivated" : ""}`,
        color: "success"
      });
    } catch (err) {
      console.error("Error activating category macros:", err);
      addToast({
        title: "Activation Error",
        description: `Failed to activate category macros: ${(err as Error).message}`,
        color: "danger"
      });
    }
  };

  // Function to deactivate all macros in a category
  const deactivateCategoryMacros = async (categoryId: string) => {
    try {
      console.log(`Deactivating all macros in category ${categoryId}`);
      
      // Get all macros in the category
      const categoryMacros = macros.filter(m => (m.categoryId || "default") === categoryId);
      console.log(`Found ${categoryMacros.length} macros to deactivate`);
      
      // Group by encoder groups to avoid duplicate deactivation
      const groupsToDeactivate = new Set<string | undefined>();
      const standaloneMacros: MacroDefinition[] = [];
      
      // Sort macros into groups and standalone macros
      categoryMacros.forEach(macro => {
        if (macro.groupId) {
          groupsToDeactivate.add(macro.groupId);
        } else {
          standaloneMacros.push(macro);
        }
      });
      
      console.log(`Deactivating ${groupsToDeactivate.size} encoder groups and ${standaloneMacros.length} standalone macros`);
      
      // Track new active macros
      const newActiveMacros = new Set([...activeMacros]);
      
      // Deactivate all group macros
      for (const groupId of groupsToDeactivate) {
        if (!groupId) continue;
        
        // Get all macros in this group
        const groupMacros = macros.filter(m => m.groupId === groupId);
        console.log(`Deactivating group ${groupId} with ${groupMacros.length} macros`);
        
        // Deactivate each one
        for (const macro of groupMacros) {
          try {
            // Call the backend to cancel the macro
            await invoke('cancel_macro', { id: macro.id });
            
            // Remove from tracking
            newActiveMacros.delete(macro.id);
            console.log(`Deactivated macro ${macro.id}`);
          } catch (err) {
            console.error(`Error deactivating macro ${macro.id}:`, err);
          }
        }
      }
      
      // Deactivate standalone macros
      for (const macro of standaloneMacros) {
        try {
          // Call the backend to cancel the macro
          await invoke('cancel_macro', { id: macro.id });
          
          // Remove from tracking
          newActiveMacros.delete(macro.id);
          console.log(`Deactivated standalone macro ${macro.id}`);
        } catch (err) {
          console.error(`Error deactivating macro ${macro.id}:`, err);
        }
      }
      
      // Update state with remaining active macros
      setActiveMacros(newActiveMacros);
      console.log(`Updated activeMacros state with ${newActiveMacros.size} remaining active macros`);
      
      // Save active macros to localStorage
      localStorage.setItem("activeMidiMacros", JSON.stringify([...newActiveMacros]));
      
      // Show success message
      const categoryName = categories.find(c => c.id === categoryId)?.name || "Selected category";
      addToast({
        title: "Category Deactivated",
        description: `${categoryName} macros have been deactivated`,
        color: "warning"
      });
    } catch (err) {
      console.error("Error deactivating category macros:", err);
      addToast({
        title: "Deactivation Error",
        description: `Failed to deactivate category macros: ${(err as Error).message}`,
        color: "danger"
      });
    }
  };

  // Helper function to create a MacroConfig from a MacroDefinition
  const createMacroConfig = (macro: MacroDefinition): MacroConfig => {
    // Helper function to map Action to MacroAction
    const convertAction = (action: Action): MacroAction => {
      return {
        action_type: mapActionType(action.type, action.params),
        action_params: mapActionParams(action.type, action.params)
      };
    };
    
    return {
      id: macro.id,
      name: macro.name,
      // Include groupId for encoder macros to ensure shared state
      groupId: macro.groupId,
      midi_note: macro.trigger.controller || macro.trigger.note || 0,
      midi_channel: macro.trigger.channel || 0,
      midi_value: macro.trigger.type === "controlchange" ? macro.trigger.value : undefined,
      actions: macro.actions.map(convertAction),
      // Include before actions if they exist
      before_actions: macro.beforeActions && macro.beforeActions.length > 0 
        ? macro.beforeActions.map(convertAction)
        : undefined,
      // Include after actions if they exist
      after_actions: macro.afterActions && macro.afterActions.length > 0
        ? macro.afterActions.map(convertAction)
        : undefined,
      // Include timeout if it exists
      timeout: macro.timeout
    };
  };

  // Add a function to check if all macros in a category are active
  const isCategoryActive = (categoryId: string): boolean => {
    const categoryMacros = macros.filter(m => (m.categoryId || "default") === categoryId);
    if (categoryMacros.length === 0) return false;
    
    // For each macro group, check if at least one macro is active
    const checkedGroups = new Set<string>();
    let allActive = true;
    
    for (const macro of categoryMacros) {
      // For encoder groups, we only need to check once
      if (macro.groupId) {
        if (checkedGroups.has(macro.groupId)) {
          continue;
        }
        checkedGroups.add(macro.groupId);
        
        // For encoder groups, check if all macros in the group are active
        const groupMacros = categoryMacros.filter(m => m.groupId === macro.groupId);
        if (!groupMacros.every(m => activeMacros.has(m.id))) {
          allActive = false;
          break;
        }
      } else {
        // For single macros, just check if they're active
        if (!activeMacros.has(macro.id)) {
          allActive = false;
          break;
        }
      }
    }
    
    return allActive;
  };

  // Drag and drop event handlers
  const handleDragStart = (e: React.DragEvent, macro: MacroDefinition) => {
    // Set drag data
    e.dataTransfer.setData('text/plain', macro.id);
    e.dataTransfer.effectAllowed = 'move';
    
    // Add visual indicator to dragged element
    const element = e.currentTarget as HTMLElement;
    element.classList.add('being-dragged');
    
    // Set dragged item state
    setDraggedItem({
      id: macro.id,
      type: macro.groupId ? 'group' : 'macro',
      sourceId: macro.groupId,
      sourceCategoryId: macro.categoryId || 'default'
    });
    
    // Add dragging class to body
    document.body.classList.add('dragging');
    setIsDragging(true);
    
    // This timeout helps ensure the grabbing cursor stays visible during drag
    setTimeout(() => {
      if (element) element.style.cursor = 'grabbing';
    }, 0);
  };
  
  const handleDragEnd = (e: React.DragEvent) => {
    // Remove visual indicators
    const element = e.currentTarget as HTMLElement;
    element.classList.remove('being-dragged');
    element.style.cursor = '';
    
    // Clean up state
    setDraggedItem(null);
    setDropTarget(null);
    document.body.classList.remove('dragging');
    setIsDragging(false);
    
    // Remove drop target highlights from all elements
    document.querySelectorAll('.drop-target').forEach(el => {
      el.classList.remove('drop-target');
    });
  };
  
  const handleDragOver = (e: React.DragEvent, target: DropTarget) => {
    // Prevent default to allow drop
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    // Skip if target is null or we're dragging over the same item
    if (!target || (draggedItem?.id === target.id && target.type !== 'category')) {
      return;
    }
    
    // Update drop target state
    setDropTarget(target);
    
    // Add visual indicator to drop target
    const element = e.currentTarget as HTMLElement;
    element.classList.add('drop-target');
  };
  
  const handleDragLeave = (e: React.DragEvent) => {
    // Only remove class from the direct target, not from parent elements
    if (e.currentTarget === e.target) {
      e.currentTarget.classList.remove('drop-target');
      setDropTarget(null);
    }
  };
  
  const handleDrop = (e: React.DragEvent, target: DropTarget) => {
    // Prevent default browser behavior
    e.preventDefault();
    e.stopPropagation();
    
    // Skip if target is null
    if (!target) return;
    
    // Get dragged item ID from data transfer
    let itemId: string | null = null;
    try {
      itemId = e.dataTransfer.getData('text/plain');
    } catch (err) {
      console.error('Error getting drag data:', err);
    }
    
    // Use state if data transfer failed
    if (!itemId && draggedItem) {
      itemId = draggedItem.id;
    }
    
    // Validate we have an item ID and target
    if (!itemId || !draggedItem) {
      return;
    }
    
    // Find the dragged macro
    const draggedMacro = macros.find(m => m.id === itemId);
    if (!draggedMacro) return;
    
    // Get the key used for ordering (groupId or id)
    const draggedKey = getOrderKey(draggedMacro);
    
    // Different behavior based on target type
    if (target.type === 'category') {
      // Move to category (no ordering)
      handleMoveToCategory(draggedMacro, target.targetCategoryId);
    } else {
      // Find the target macro
      const targetMacro = macros.find(m => m.id === target.id);
      if (!targetMacro) return;
      
      const targetKey = getOrderKey(targetMacro);
      const targetCategoryId = target.targetCategoryId;
      
      // If moving between categories
      if (draggedItem.sourceCategoryId !== targetCategoryId) {
        handleMoveToCategory(draggedMacro, targetCategoryId, targetKey);
      } else {
        // Reorder within the same category
        handleReorderMacro(draggedKey, targetKey, targetCategoryId);
      }
    }
    
    // Clean up
    setDraggedItem(null);
    setDropTarget(null);
    document.body.classList.remove('dragging');
    setIsDragging(false);
    
    // Remove drop target highlights
    document.querySelectorAll('.drop-target').forEach(el => {
      el.classList.remove('drop-target');
    });
  };
  
  // Move a macro to a different category
  const handleMoveToCategory = (draggedMacro: MacroDefinition, targetCategoryId: string, beforeKey?: string) => {
    // Determine if we're moving a group or a single macro
    const isGroup = !!draggedMacro.groupId;
    const groupId = draggedMacro.groupId;
    
    // Update all relevant macros with the new category
    const updatedMacros = macros.map(m => {
      if ((isGroup && m.groupId === groupId) || (!isGroup && m.id === draggedMacro.id)) {
        return { ...m, categoryId: targetCategoryId };
      }
      return m;
    });
    
    // Save the updated macros
    setMacros(updatedMacros);
    localStorage.setItem("midiMacros", JSON.stringify(updatedMacros));
    
    // Update the order in the target category if beforeKey is provided
    if (beforeKey) {
      const draggedKey = getOrderKey(draggedMacro);
      handleReorderMacro(draggedKey, beforeKey, targetCategoryId);
    }
    
    // Notification
    addToast({
      title: "Macro Moved",
      description: `${draggedMacro.name} moved to ${categories.find(c => c.id === targetCategoryId)?.name || "category"}`,
      color: "success"
    });
  };
  
  // Reorder a macro within a category
  const handleReorderMacro = (draggedKey: string, targetKey: string, categoryId: string) => {
    // Get current order or create a new one
    let currentOrder = [...(macroOrder[categoryId] || [])];
    
    // If order is empty, initialize it from current macros
    if (currentOrder.length === 0) {
      const categoryMacros = macros.filter(m => (m.categoryId || "default") === categoryId);
      
      // Create a map to track which keys we've already added
      const addedKeys = new Set<string>();
      
      // Add each unique key to the order
      categoryMacros.forEach(macro => {
        const key = getOrderKey(macro);
        if (!addedKeys.has(key)) {
          currentOrder.push(key);
          addedKeys.add(key);
        }
      });
    }
    
    // Remove dragged item from current position if it exists
    currentOrder = currentOrder.filter(id => id !== draggedKey);
    
    // Find target position
    const targetIndex = currentOrder.indexOf(targetKey);
    
    if (targetIndex === -1) {
      // If target not found, add to end
      currentOrder.push(draggedKey);
    } else {
      // Insert at target position
      currentOrder.splice(targetIndex, 0, draggedKey);
    }
    
    // Update order state
    const newOrder = { ...macroOrder, [categoryId]: currentOrder };
    setMacroOrder(newOrder);
    
    // Save to localStorage
    localStorage.setItem("macroOrder", JSON.stringify(newOrder));
    
    // Notification
    addToast({
      title: "Order Updated",
      description: "Macros reordered successfully",
      color: "success"
    });
  };

  if (macros.length === 0) {
    return (
      <div className="">
        {/* Header with settings button */}
        <div className="sticky top-0 z-10 backdrop-blur-md bg-background/80 p-5 rounded-xl border border-default-200/30 shadow-sm mb-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-semibold text-foreground">My Macros</h2>
              <p className="text-foreground-500 text-sm mt-1">0 macros</p>
            </div>
            
            <div className="flex gap-2">
             <Button 
                  className="rounded-full font-medium"
                  color="primary"
                  variant="solid"
                  startContent={<Icon icon="lucide:list" />}
                  onPress={handleAddCategory}

                >
                Add Category
              </Button>
              
              <Dropdown>
                <DropdownTrigger>
                  <Button 
                    isIconOnly
                    className="rounded-full" 
                    variant="flat" 
                    color="default"
                  >
                    <Icon icon="lucide:settings" className="text-lg" />
                  </Button>
                </DropdownTrigger>
                <DropdownMenu aria-label="Macro management options" variant="faded">
                  <DropdownItem
                    key="import"
                    description="Import macros from a file"
                    startContent={<Icon icon="lucide:upload" />}
                    onPress={handleImportClick}
                  >
                    Import Macros
                  </DropdownItem>
                  <DropdownItem
                    key="export"
                    description="Export all your macros"
                    startContent={<Icon icon="lucide:download" />}
                    onPress={handleExportMacros}
                  >
                    Export Macros
                  </DropdownItem>
                </DropdownMenu>
              </Dropdown>
              
              {/* Hidden file input for import */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".json"
                className="hidden"
              />
            </div>
          </div>
        </div>
        
        <Card className="p-6 border-dashed border-2 border-default-200 bg-transparent flex flex-col items-center justify-center text-center backdrop-blur-sm">
          <div className="bg-primary/5 p-6 rounded-full mb-4">
            <Icon icon="lucide:list-plus" className="text-4xl text-primary/70" />
          </div>
          <p className="text-foreground-500 font-medium">No macros created yet</p>
          <p className="text-foreground-400 text-sm mt-1">Create macros to automate your MIDI workflow</p>
        </Card>
      </div>
    );
  }

  return (
    <div className={` ${isDragging ? 'dragging-active' : ''}`}>
      {/* SVG Filter Definition for Thanos Snap effect */}
      <svg xmlns="http://www.w3.org/2000/svg" style={{ display: 'none' }}>
        <defs>
          <filter id="dissolve-filter" x="-200%" y="-200%" width="500%" height="500%" color-interpolation-filters="sRGB" overflow="visible">
            <feTurbulence 
              id="dissolve-filter-turbulence"
              type="fractalNoise" 
              baseFrequency="0.004" 
              numOctaves="1" 
              result="bigNoise" 
              seed="0"
            />
            <feComponentTransfer in="bigNoise" result="bigNoiseAdjusted">
              <feFuncR type="linear" slope="3" intercept="-1" />
              <feFuncG type="linear" slope="3" intercept="-1" />
            </feComponentTransfer>
            <feTurbulence type="fractalNoise" baseFrequency="1" numOctaves="1" result="fineNoise" />
            <feMerge result="mergedNoise">
              <feMergeNode in="bigNoiseAdjusted" />
              <feMergeNode in="fineNoise" />
            </feMerge>
            <feDisplacementMap 
              id="dissolve-filter-displacement"
              in="SourceGraphic" 
              in2="mergedNoise" 
              scale="0" 
              xChannelSelector="R" 
              yChannelSelector="G" 
            />
          </filter>
        </defs>
      </svg>

      {/* Header section with iOS-like design */}
      <div className="sticky top-0 z-10 backdrop-blur-md bg-background/80 p-5 rounded-xl border border-default-200/30 shadow-sm mb-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">My Macros</h2>
            <p className="text-foreground-500 text-sm mt-1">{macros.length} macro{macros.length !== 1 ? "s" : ""}</p>
          </div>
          
          <div className="flex gap-2">
          <Button 
                  className="rounded-full font-medium"
                  color="primary"
                  variant="solid"
                  startContent={<Icon icon="lucide:list" />}
                  onPress={handleAddCategory}

                >
                Add Category
              </Button>
            
            <Dropdown>
              <DropdownTrigger>
                <Button 
                  isIconOnly
                  className="rounded-full" 
                  variant="flat" 
                  color="default"
                >
                  <Icon icon="lucide:settings" className="text-lg" />
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="Macro management options" variant="faded">
                <DropdownItem
                  key="import"
                  description="Import macros from a file"
                  startContent={<Icon icon="lucide:upload" />}
                  onPress={handleImportClick}
                >
                  Import Macros
                </DropdownItem>
                <DropdownItem
                  key="export"
                  description="Export all your macros"
                  startContent={<Icon icon="lucide:download" />}
                  onPress={handleExportMacros}
                >
                  Export Macros
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
            
            {/* Hidden file input for import */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />
          </div>
        </div>
      </div>
      
      {/* Display macros grouped by category */}
      <div className="space-y-6">
        {categories.map(category => {
          const categoryMacros = macrosByCategory[category.id] || [];
          
          // Group macros within this category by encoder groups
          const groupedCategoryMacros: Record<string, MacroDefinition[]> = {};
          categoryMacros.forEach(macro => {
            const key = macro.groupId || macro.id;
            if (!groupedCategoryMacros[key]) {
              groupedCategoryMacros[key] = [];
            }
            groupedCategoryMacros[key].push(macro);
          });
          
          return (
            <div key={category.id} id={`category-${category.id}`} className="rounded-lg overflow-hidden border border-default-200 backdrop-blur-sm shadow-sm">
              {/* Category header - simplified drag target */}
              <div 
                className={`category-header flex justify-between items-center p-4 bg-${category.color}-50 hover:bg-${category.color}-100 transition-colors duration-200`}
                onDragOver={(e) => handleDragOver(e, {
                  id: category.id,
                  type: 'category',
                  targetCategoryId: category.id
                })}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, {
                  id: category.id,
                  type: 'category',
                  targetCategoryId: category.id
                })}
                data-droppable="true"
                data-category-id={category.id}
              >
                <div 
                  className="flex-1 flex items-center gap-2 cursor-pointer"
                  onClick={() => toggleCategoryExpanded(category.id)}
                >
                  <div className={`category-color category-color-${category.color}`}></div>
                  <h3 className="font-medium">{category.name}</h3>
                  <Chip size="sm" variant="flat" color={category.color as any}>
                    {categoryMacros.length} macro{categoryMacros.length !== 1 ? "s" : ""}
                  </Chip>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    size="sm"
                    isSelected={isCategoryActive(category.id)}
                    onValueChange={(isSelected) => handleToggleCategory(category.id, isSelected)}
                    className="mr-1"
                  />
                  
                  {/* Edit category button */}
                  {category.id !== "default" && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      className="opacity-80 hover:opacity-100 bg-transparent"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEditCategory(category);
                      }}
                    >
                      <Icon icon="lucide:edit" className="text-foreground-500" />
                    </Button>
                  )}
                  
                  {/* Delete category button */}
                  {category.id !== "default" && (
                    <Popover 
                      isOpen={categoryDeletePopoverOpen === category.id} 
                      onOpenChange={(open) => {
                        if (open) {
                          setCategoryDeletePopoverOpen(category.id);
                        } else {
                          setCategoryDeletePopoverOpen(null);
                        }
                      }}
                      backdrop="blur"
                      placement="top"
                    >
                      <PopoverTrigger>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="danger"
                          className="opacity-80 hover:opacity-100 bg-transparent"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Icon icon="lucide:trash-2" className="text-danger-500" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[240px]">
                        <div className="px-1 py-2 w-full">
                          <p className="text-small font-bold text-foreground">
                            Delete Category
                          </p>
                          <div className="mt-2">
                            <p className="text-small text-default-500">
                              Are you sure you want to delete "{category.name}"? All macros will be moved to the default category.
                            </p>
                          </div>
                          <div className="mt-4 flex justify-end gap-2">
                            <Button 
                              size="sm" 
                              variant="flat"
                              onPress={() => setCategoryDeletePopoverOpen(null)} 
                            >
                              Cancel
                            </Button>                                
                            <Button 
                              size="sm"
                              color="danger"
                              onPress={() => {
                                // Get the element ID for animation
                                const categoryElement = document.querySelector(`[data-category-id="${category.id}"]`);
                                const elementId = categoryElement?.closest('[id]')?.id || `category-${category.id}`;
                                
                                // Apply Thanos snap animation
                                useThanosSnap(elementId, () => {
                                  // Delete the category
                                  const updatedCategories = categories.filter(cat => cat.id !== category.id);
                                  setCategories(updatedCategories);
                                  localStorage.setItem("macroCategories", JSON.stringify(updatedCategories));
                                  
                                  // Move all macros from this category to default
                                  const updatedMacros = macros.map(macro => 
                                    macro.categoryId === category.id ? {...macro, categoryId: "default"} : macro
                                  );
                                  setMacros(updatedMacros);
                                  localStorage.setItem("midiMacros", JSON.stringify(updatedMacros));
                                  
                                  // Show toast notification
                                  addToast({
                                    title: "Category Deleted",
                                    description: `Category "${category.name}" has been deleted`,
                                    color: "warning"
                                  });
                                });
                                
                                // Close popover
                                setCategoryDeletePopoverOpen(null);
                              }}
                            >
                              Delete
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                  
                  <Button
                    isIconOnly
                    size="sm"
                    variant="light"
                    className="opacity-80 hover:opacity-100 bg-transparent"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleCategoryExpanded(category.id);
                    }}
                  >
                    <Icon 
                      icon={expandedCategories.has(category.id) ? "lucide:chevron-up" : "lucide:chevron-down"} 
                      className="text-foreground-500" 
                    />
                  </Button>
                </div>
              </div>
              
              {/* Category content */}
              {expandedCategories.has(category.id) && (
                <div className="p-4 border-t border-default-200 bg-background/50 backdrop-blur-sm">
                  {Object.values(groupedCategoryMacros).length === 0 ? (
                    <div className="text-center p-5 flex flex-col items-center justify-center">
                      <div className="bg-primary/5 p-4 rounded-full mb-3">
                        <Icon icon="lucide:box" className="text-2xl text-foreground-400" />
                      </div>
                      <p className="text-sm text-foreground-400">No macros in this category yet</p>
                      <p className="text-xs text-foreground-300 mt-1">Drag macros here to add them to this category</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.values(groupedCategoryMacros).map((group, groupIndex) => {
                        // For single macros
                        if (group.length === 1) {
                          const macro = group[0];
                          return (
                            <Card 
                              key={macro.id}
                              id={`macro-${macro.id}`}
                              className="macro-card p-4 hover:shadow-lg hover:border-primary/30 transition-all duration-200 transform hover:scale-[1.01] group"
                              draggable="true"
                              onDragStart={(e) => handleDragStart(e, macro)}
                              onDragEnd={handleDragEnd}
                              onDragOver={(e) => handleDragOver(e, {
                                id: macro.id,
                                type: 'macro',
                                targetCategoryId: macro.categoryId || 'default'
                              })}
                              onDragLeave={handleDragLeave}
                              onDrop={(e) => handleDrop(e, {
                                id: macro.id,
                                type: 'macro',
                                targetCategoryId: macro.categoryId || 'default'
                              })}
                            >
                              <div className="flex justify-between items-center">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h3 className="text-lg font-medium">{macro.name}</h3>
                                    <Chip size="sm" variant="flat" color="primary">
                                      {macro.actions.length} action{macro.actions.length !== 1 ? "s" : ""}
                                    </Chip>
                                  </div>
                                  <p className="text-sm text-foreground-500 mt-1">
                                    {getTriggerDescription(macro.trigger)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    color="default"
                                    className="bg-transparent"
                                    onPress={() => toggleExpanded(macro.id)}
                                  >
                                    <Icon icon={expandedMacros.has(macro.id) ? "lucide:chevron-up" : "lucide:chevron-down"} />
                                  </Button>
                                  
                                  <Switch
                                    isSelected={activeMacros.has(macro.id)}
                                    onValueChange={(isSelected) => {
                                      handleToggleMacro(macro.id, isSelected);
                                    }}
                                    size="sm"
                                  />
                                  {onCreateTemplate && (
                                    <Button
                                      isIconOnly
                                      size="sm"
                                      variant="light"
                                      color="secondary"
                                      className="opacity-80 hover:opacity-100"
                                      onPress={() => onCreateTemplate(macro)}
                                      title="Create template from this macro"
                                    >
                                      <Icon icon="lucide:copy-plus" className="text-secondary" />
                                    </Button>
                                  )}
                                  <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    color="primary"
                                    className="opacity-80 hover:opacity-100"
                                    onPress={() => onEditMacro(macro)}
                                  >
                                    <Icon icon="lucide:edit" />
                                  </Button>
                                  <Popover 
                                    isOpen={deletePopoverOpen === macro.id} 
                                    onOpenChange={(open) => {
                                      if (open) {
                                        setDeletePopoverOpen(macro.id);
                                      } else {
                                        setDeletePopoverOpen(null);
                                      }
                                    }}
                                    backdrop="blur"
                                    placement="top"
                                  >
                                    <PopoverTrigger>
                                      <Button
                                        isIconOnly
                                        size="sm"
                                        variant="light"
                                        color="danger"
                                        className="opacity-80 hover:opacity-100"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        <Icon icon="lucide:trash-2" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-[240px]">
                                      <div className="px-1 py-2 w-full">
                                        <p className="text-small font-bold text-foreground">
                                          Delete Macro
                                        </p>
                                        <div className="mt-2">
                                          <p className="text-small text-default-500">
                                            Are you sure you want to delete "{macro.name}"? This action cannot be undone.
                                          </p>
                                        </div>
                                        <div className="mt-4 flex justify-end gap-2">
                                          <Button 
                                            size="sm" 
                                            variant="flat"
                                            onPress={() => setDeletePopoverOpen(null)}
                                          >
                                            Cancel
                                          </Button>                                
                                          <Button 
                                            size="sm"
                                            color="danger"
                                            onPress={() => {
                                              handleDeleteMacro(macro.id);
                                              setDeletePopoverOpen(null);
                                            }}
                                          >
                                            Delete
                                          </Button>
                                        </div>
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              </div>
                              
                              {expandedMacros.has(macro.id) && (
                                <>
                                  <Divider className="my-3" />
                                  <div className="space-y-3">
                                    {/* Before Actions Section */}
                                    {macro.beforeActions && macro.beforeActions.length > 0 && (
                                      <div>
                                        <div className="flex items-center gap-2 mb-2">
                                          <Icon icon="lucide:chevrons-left" className="text-primary" />
                                          <h4 className="text-sm font-medium">Before Actions</h4>
                                        </div>
                                        <div className="space-y-1">
                                          {macro.beforeActions.map((action, index) => (
                                            <div key={`before-${index}`} className="text-xs p-2 bg-default-50 rounded-md flex items-center">
                                              <span className="text-foreground-500 mr-2">{index + 1}.</span>
                                              <span className="capitalize font-medium">{action.type}</span>
                                              <span className="mx-1">-</span>
                                              <span>{getActionSummary(action)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Main Actions Section */}
                                    <div>
                                      <div className="flex items-center gap-2 mb-2">
                                        <Icon icon="lucide:play" className="text-primary" />
                                        <h4 className="text-sm font-medium">Main Actions</h4>
                                      </div>
                                      <div className="space-y-1">
                                        {macro.actions.map((action, index) => (
                                          <div key={`main-${index}`} className="text-xs p-2 bg-default-50 rounded-md flex items-center">
                                            <span className="text-foreground-500 mr-2">{index + 1}.</span>
                                            <span className="capitalize font-medium">{action.type}</span>
                                            <span className="mx-1">-</span>
                                            <span>{getActionSummary(action)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                    
                                    {/* After Actions Section */}
                                    {macro.afterActions && macro.afterActions.length > 0 && (
                                      <div>
                                        <div className="flex items-center gap-2 mb-2">
                                          <Icon icon="lucide:chevrons-right" className="text-primary" />
                                          <h4 className="text-sm font-medium">After Actions</h4>
                                          {macro.timeout && (
                                            <span className="text-xs bg-default-100 px-2 py-0.5 rounded-full text-foreground-600">
                                              {macro.timeout}ms timeout
                                            </span>
                                          )}
                                        </div>
                                        <div className="space-y-1">
                                          {macro.afterActions.map((action, index) => (
                                            <div key={`after-${index}`} className="text-xs p-2 bg-default-50 rounded-md flex items-center">
                                              <span className="text-foreground-500 mr-2">{index + 1}.</span>
                                              <span className="capitalize font-medium">{action.type}</span>
                                              <span className="mx-1">-</span>
                                              <span>{getActionSummary(action)}</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </Card>
                          );
                        }
                        
                        // For grouped macros like encoders
                        return (
                          <Card 
                            key={group[0].groupId || groupIndex}
                            id={`macro-group-${group[0].groupId || group[0].id}`}
                            className="macro-card p-4 hover:shadow-lg hover:border-primary/30 transition-all duration-200 transform hover:scale-[1.01] group"
                            draggable="true"
                            onDragStart={(e) => handleDragStart(e, group[0])}
                            onDragEnd={handleDragEnd}
                            onDragOver={(e) => handleDragOver(e, {
                              id: group[0].groupId || group[0].id,
                              type: 'group',
                              targetCategoryId: group[0].categoryId || 'default'
                            })}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, {
                              id: group[0].groupId || group[0].id,
                              type: 'group',
                              targetCategoryId: group[0].categoryId || 'default'
                            })}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h3 className="text-lg font-medium">
                                  {group[0].name.replace(/ \(.*\)$/, "")}
                                </h3>
                                <div className="flex flex-wrap gap-2 mt-2">
                                  {group.map(macro => (
                                    <Chip 
                                      key={macro.id} 
                                      variant="flat" 
                                      color={getChipColor(macro.type)}
                                      className="text-xs"
                                    >
                                      {macro.type ? 
                                        macro.type.replace("encoder-", "").charAt(0).toUpperCase() + 
                                        macro.type.replace("encoder-", "").slice(1) 
                                        : "Standard"}
                                    </Chip>
                                  ))}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  color="default"
                                  className="bg-transparent"
                                  onPress={() => toggleExpanded(group[0].groupId || group[0].id)}
                                >
                                  <Icon icon={expandedMacros.has(group[0].groupId || group[0].id) ? "lucide:chevron-up" : "lucide:chevron-down"} />
                                </Button>
                               
                                <Switch
                                  isSelected={group.every(m => activeMacros.has(m.id))}
                                  onValueChange={(isSelected) => {
                                    // Just toggle the first macro - the group handling logic will take care of the rest
                                    handleToggleMacro(group[0].id, isSelected);
                                  }}
                                  size="sm"
                                />
                                {onCreateTemplate && (
                                  <Button
                                    isIconOnly
                                    size="sm"
                                    variant="light"
                                    color="secondary"
                                    className="opacity-80 hover:opacity-100"
                                    onPress={() => onCreateTemplate(group[0])}
                                    title="Create template from this macro group"
                                  >
                                    <Icon icon="lucide:copy-plus" className="text-secondary" />
                                  </Button>
                                )}
                                <Button
                                  isIconOnly
                                  size="sm"
                                  variant="light"
                                  color="primary"
                                  className="opacity-80 hover:opacity-100"
                                  onPress={() => onEditMacro(group[0])}
                                >
                                  <Icon icon="lucide:edit" />
                                </Button>
                                <Popover 
                                  isOpen={deletePopoverOpen === group[0].id} 
                                  onOpenChange={(open) => {
                                    if (open) {
                                      setDeletePopoverOpen(group[0].id);
                                    } else {
                                      setDeletePopoverOpen(null);
                                    }
                                  }}
                                  backdrop="blur"
                                  placement="top"
                                >
                                  <PopoverTrigger>
                                    <Button
                                      isIconOnly
                                      size="sm"
                                      variant="light"
                                      color="danger"
                                      className="opacity-80 hover:opacity-100"
                                    >
                                      <Icon icon="lucide:trash-2" />
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-[240px]">
                                    <div className="px-1 py-2 w-full">
                                      <p className="text-small font-bold text-foreground">
                                        Delete Encoder Group
                                      </p>
                                      <div className="mt-2">
                                        <p className="text-small text-default-500">
                                          Are you sure you want to delete the "{group[0].name.replace(/ \(.*\)$/, "")}" group with all its actions? This cannot be undone.
                                        </p>
                                      </div>
                                      <div className="mt-4 flex justify-end gap-2">
                                        <Button 
                                          size="sm" 
                                          variant="flat"
                                          onPress={() => setDeletePopoverOpen(null)}
                                        >
                                          Cancel
                                        </Button>                                
                                        <Button 
                                          size="sm"
                                          color="danger"
                                          onPress={() => {
                                            handleDeleteMacro(group[0].id);
                                            setDeletePopoverOpen(null);
                                          }}
                                        >
                                          Delete
                                        </Button>
                                      </div>
                                    </div>
                                  </PopoverContent>
                                </Popover>
                              </div>
                            </div>
                            
                            {expandedMacros.has(group[0].groupId || group[0].id) && (
                              <>
                                <Divider className="my-3" />
                                
                                <div className="space-y-4">
                                  {/* Encoder Actions with Tab System */}
                                  <EncoderGroupTabs
                                    group={group}
                                    activeMacros={activeMacros}
                                    handleToggleMacro={handleToggleMacro}
                                    getActionSummary={getActionSummary}
                                    getTriggerDescription={getTriggerDescription}
                                  />
                                </div>
                              </>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Conflict Resolution Modal */}
      <Modal isOpen={conflictModal.isOpen} onClose={() => setConflictModal(prev => ({ ...prev, isOpen: false }))}>
        <ModalContent>
          <ModalHeader>MIDI Trigger Conflict</ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="p-3 border border-warning-200 bg-warning-50 rounded-md">
                <div className="flex items-start gap-3">
                  <Icon icon="lucide:alert-triangle" className="text-warning text-xl mt-0.5" />
                  <div>
                    <p className="font-medium">The macro you're trying to activate conflicts with existing active macro(s):</p>
                    <ul className="mt-2 list-disc list-inside text-sm">
                      {conflictModal.conflictingMacros.map(m => (
                        <li key={m.id}>{m.name}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              
              <p>These macros use the same MIDI trigger. You can:</p>
              
              <div className="space-y-2">
                <Button 
                  color="primary" 
                  variant="flat"
                  className="w-full justify-start p-3 h-auto"
                  onPress={() => handleResolveConflict("new")}
                  startContent={<Icon icon="lucide:replace" className="text-primary mr-2" />}
                >
                  <div>
                    <h4 className="font-medium text-left">Replace existing macro(s)</h4>
                    <p className="text-xs text-foreground-500 text-left">
                      Deactivate the conflicting macro(s) and activate the new one
                    </p>
                  </div>
                </Button>
                
                <Button 
                  color="warning" 
                  variant="flat"
                  className="w-full justify-start p-3 h-auto"
                  onPress={() => handleResolveConflict("existing")}
                  startContent={<Icon icon="lucide:shield" className="text-warning mr-2" />}
                >
                  <div>
                    <h4 className="font-medium text-left">Keep existing macro(s)</h4>
                    <p className="text-xs text-foreground-500 text-left">
                      Leave the existing macro(s) active and don't activate the new one
                    </p>
                  </div>
                </Button>
              </div>
            </div>
          </ModalBody>
          <ModalFooter>
            <Button 
              variant="light" 
              onPress={() => handleResolveConflict("cancel")}
            >
              Cancel
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
      
      {/* Category Modal (Add/Edit) */}
      <Modal isOpen={categoryModalOpen} onOpenChange={setCategoryModalOpen}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>
                {editingCategory ? "Edit Category" : "Add Category"}
              </ModalHeader>
              <ModalBody>
                <Input
                  label="Category Name"
                  placeholder="e.g., Photoshop, DaVinci Resolve"
                  value={newCategoryName}
                  onValueChange={setNewCategoryName}
                  className="mb-4"
                />
                <div>
                  <p className="text-sm font-medium mb-2">Category Color</p>
                  <div className="grid grid-cols-8 gap-3 max-h-[150px] overflow-y-auto p-2">
                    {[
                      "primary", "secondary", "warning", "danger", 
                      "default", "purple", "pink", "red",
                      "orange", "yellow", "green", "teal", 
                      "blue", "indigo", "violet", "cyan"
                    ].map(color => (
                      <div 
                        key={color}
                        className={`category-color category-color-${color} cursor-pointer transition-transform ${
                          selectedColor === color ? 'ring-2 ring-offset-2 ring-primary transform scale-125' : 'hover:scale-110'
                        }`}
                        onClick={() => setSelectedColor(color)}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button color="primary" onPress={handleSaveCategory}>
                  Save
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
      
      {/* Category activation modal */}
      {categoryActivationModal && (
        <Modal 
          isOpen={categoryActivationModal.isOpen} 
          onOpenChange={() => {
            console.log("Modal onOpenChange triggered");
            setCategoryActivationModal(null);
          }}
        >
          <ModalContent>
            {(onClose) => (
              <>
                <ModalHeader>Activate Category</ModalHeader>
                <ModalBody>
                  <p>How would you like to activate this category?</p>
                  <div className="space-y-3 mt-3">
                    <Button
                      color="primary"
                      variant="flat"
                      className="w-full justify-start p-3 h-auto"
                      onPress={() => {
                        console.log("Add to active macros clicked");
                        const catId = categoryActivationModal.categoryId;
                        console.log(`Activating category ${catId}`);
                        activateCategoryMacros(catId, false);
                        setCategoryActivationModal(null);
                      }}
                      startContent={<Icon icon="lucide:plus" className="text-success mr-2" />}
                    >
                      <div>
                        <h4 className="font-medium text-left">Add to active macros</h4>
                        <p className="text-xs text-foreground-500 text-left">Keep other active macros enabled</p>
                      </div>
                    </Button>
                    
                    <Button
                      color="warning"
                      variant="flat"
                      className="w-full justify-start p-3 h-auto"
                      onPress={() => {
                        console.log("Exclusive activation clicked");
                        const catId = categoryActivationModal.categoryId;
                        console.log(`Activating category ${catId} exclusively`);
                        activateCategoryMacros(catId, true);
                        setCategoryActivationModal(null);
                      }}
                      startContent={<Icon icon="lucide:replace" className="text-warning mr-2" />}
                    >
                      <div>
                        <h4 className="font-medium text-left">Exclusive activation</h4>
                        <p className="text-xs text-foreground-500 text-left">Deactivate all other macros</p>
                      </div>
                    </Button>
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button 
                    variant="flat" 
                    onPress={() => {
                      console.log("Cancel button clicked");
                      setCategoryActivationModal(null);
                    }}
                  >
                    Cancel
                  </Button>
                </ModalFooter>
              </>
            )}
          </ModalContent>
        </Modal>
      )}
    </div>
  );
};

// Add category handling functions
const handleAddCategory = () => {
  setEditingCategory(null);
  setNewCategoryName("");
  setSelectedColor("primary");
  setCategoryModalOpen(true);
};

const handleEditCategory = (category: MacroCategory) => {
  setEditingCategory(category);
  setNewCategoryName(category.name);
  setSelectedColor(category.color);
  setCategoryModalOpen(true);
};

const handleSaveCategory = () => {
  if (!newCategoryName.trim()) return;

  let updatedCategories: MacroCategory[];

  if (editingCategory) {
    // Update existing category
    updatedCategories = categories.map(cat => 
      cat.id === editingCategory.id 
        ? { ...cat, name: newCategoryName, color: selectedColor }
        : cat
    );
  } else {
    // Create new category
    const newCategory: MacroCategory = {
      id: crypto.randomUUID(),
      name: newCategoryName,
      color: selectedColor,
      isExpanded: true
    };
    updatedCategories = [...categories, newCategory];
  }

  setCategories(updatedCategories);
  localStorage.setItem("macroCategories", JSON.stringify(updatedCategories));
  setCategoryModalOpen(false);
  
  // Show success toast
  addToast({
    title: editingCategory ? "Category Updated" : "Category Created",
    description: `Category "${newCategoryName}" has been ${editingCategory ? "updated" : "created"}`,
    color: "success"
  });
};

// Macro deletion
const handleDeleteMacro = (id: string) => {
  // Find the macro that's being deleted
  const macro = macros.find(m => m.id === id);
  if (!macro) {
    console.error(`Macro with ID ${id} not found for deletion`);
    return;
  }
  
  const isGroup = !!macro.groupId;
  console.log(`Deleting ${isGroup ? 'group' : 'single'} macro: ${macro.name}`);
  
  // If this is part of a group, we need to delete all macros in the group
  let deletedMacros: MacroDefinition[];
  let updatedMacros: MacroDefinition[];
  
  if (isGroup) {
    deletedMacros = macros.filter(m => m.groupId === macro.groupId);
    updatedMacros = macros.filter(m => m.groupId !== macro.groupId);
    console.log(`Deleting ${deletedMacros.length} macros in group ${macro.groupId}`);
  } else {
    deletedMacros = [macro];
    updatedMacros = macros.filter(m => m.id !== id);
    console.log(`Deleting single macro with ID ${id}`);
  }
  
  // Deactivate any active macros before removing them
  for (const macroToDeactivate of deletedMacros) {
    if (activeMacros.has(macroToDeactivate.id)) {
      try {
        // Try to deactivate in the backend
        invoke('cancel_macro', { id: macroToDeactivate.id })
          .catch(e => console.error(`Error deactivating macro ${macroToDeactivate.id}:`, e));
      } catch (err) {
        console.error(`Error canceling macro ${macroToDeactivate.id}:`, err);
      }
    }
  }
  
  // Update the active macros set
  const newActiveMacros = new Set([...activeMacros].filter(activeId => 
    !deletedMacros.some(m => m.id === activeId)
  ));
  
  // Get the element ID for animation
  const elementId = isGroup ? `macro-group-${macro.groupId || id}` : `macro-${id}`;
  
  // Apply the Thanos snap animation
  useThanosSnap(elementId, () => {
    // Update state after animation completes
    setMacros(updatedMacros);
    setActiveMacros(newActiveMacros);
    
    // Update localStorage
    localStorage.setItem("midiMacros", JSON.stringify(updatedMacros));
    localStorage.setItem("activeMidiMacros", JSON.stringify([...newActiveMacros]));
    
    // Show success message
    const displayName = isGroup 
      ? macro.name.replace(/ \(.*\)$/, "") // Remove suffix for group macros
      : macro.name;
    
    addToast({
      title: "Macro Deleted",
      description: isGroup 
        ? `${displayName} group with ${deletedMacros.length} actions deleted`
        : `${displayName} deleted`,
      color: "danger"
    });
  });
};

// Export and import functions
const fileInputRef = React.useRef<HTMLInputElement>(null);

const handleExportMacros = () => {
  try {
    // Prepare data to export (macros and categories)
    const exportData = {
      macros: macros,
      categories: categories,
      activeMacros: [...activeMacros],
      version: "1.0" // Add version to help with future imports
    };
    
    // Convert to JSON
    const jsonData = JSON.stringify(exportData, null, 2);
    
    // Create download link
    const blob = new Blob([jsonData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `opengrader-macros-${new Date().toISOString().slice(0, 10)}.json`;
    
    // Trigger download and cleanup
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    addToast({
      title: "Export Successful",
      description: "Your macros have been exported successfully",
      color: "success"
    });
  } catch (err) {
    console.error("Error exporting macros:", err);
    addToast({
      title: "Export Failed",
      description: "Failed to export macros: " + (err as Error).message,
      color: "danger"
    });
  }
};

const handleImportClick = () => {
  if (fileInputRef.current) {
    fileInputRef.current.click();
  }
};

const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = JSON.parse(event.target?.result as string);
      handleImportMacros(data);
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error("Error parsing import file:", error);
      addToast({
        title: "Import Error",
        description: "Invalid JSON file format",
        color: "danger"
      });
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };
  
  reader.onerror = () => {
    addToast({
      title: "Import Error",
      description: "Error reading file",
      color: "danger"
    });
    
    // Reset the file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };
  
  reader.readAsText(file);
};

const handleImportMacros = (data: any) => {
  try {
    if (!data || typeof data !== 'object') {
      throw new Error("Invalid import data format");
    }
    
    // Validate the data structure
    if (!Array.isArray(data.macros)) {
      throw new Error("Import data does not contain macros array");
    }
    
    // First, create a map of existing macro IDs for quick lookup
    const existingMacroIds = new Set(macros.map(m => m.id));
    
    // Count skipped macros
    const skippedMacros = data.macros.filter((m: MacroDefinition) => existingMacroIds.has(m.id));
    
    // Filter out macros that already exist (by ID)
    const newMacros = data.macros.filter((m: MacroDefinition) => !existingMacroIds.has(m.id));
    
    // Merge with existing macros
    const mergedMacros = [...macros, ...newMacros];
    
    // Update state and localStorage
    setMacros(mergedMacros);
    localStorage.setItem("midiMacros", JSON.stringify(mergedMacros));
    
    // Also import categories if they exist
    if (Array.isArray(data.categories)) {
      // Create a map of existing category IDs
      const existingCategoryIds = new Set(categories.map(c => c.id));
      
      // Count skipped categories
      const skippedCategories = data.categories.filter((c: MacroCategory) => existingCategoryIds.has(c.id));
      
      // Filter out categories that already exist (by ID)
      const newCategories = data.categories.filter((c: MacroCategory) => !existingCategoryIds.has(c.id));
      
      // Merge with existing categories
      const mergedCategories = [...categories, ...newCategories];
      
      // Update state and localStorage
      setCategories(mergedCategories);
      localStorage.setItem("macroCategories", JSON.stringify(mergedCategories));
    }
    
    // Optionally import active macros
    if (Array.isArray(data.activeMacros)) {
      // We'll just add to the existing active macros, not replace
      const newActiveSet = new Set([...activeMacros]);
      
      // Add each imported active macro ID that exists in our merged macro list
      data.activeMacros.forEach((id: string) => {
        // Only activate macros that actually exist after the merge
        if (mergedMacros.some(m => m.id === id)) {
          newActiveSet.add(id);
        }
      });
      
      // Update state and localStorage
      setActiveMacros(newActiveSet);
      localStorage.setItem("activeMidiMacros", JSON.stringify([...newActiveSet]));
    }
    
    // Create appropriate success message based on how many were imported vs. skipped
    let successMessage = `Imported ${newMacros.length} new macros`;
    if (skippedMacros.length > 0) {
      successMessage += `, skipped ${skippedMacros.length} existing macros`;
    }
    
    addToast({
      title: "Import Successful",
      description: successMessage,
      color: "success"
    });
    
    // If macros were skipped, show an additional info message
    if (skippedMacros.length > 0) {
      setTimeout(() => {
        addToast({
          title: "Macros Skipped",
          description: `${skippedMacros.length} macros were skipped because they already exist`,
          color: "primary"
        });
      }, 300);
    }
  } catch (err) {
    console.error("Error importing macros:", err);
    addToast({
      title: "Import Failed",
      description: "Failed to import macros: " + (err as Error).message,
      color: "danger"
    });
  }
};