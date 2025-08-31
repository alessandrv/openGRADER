import React, { useEffect, useState, useRef, useCallback } from "react";
import { Button, Card, Chip, Divider, Switch, addToast, Accordion, AccordionItem, useDisclosure, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Input, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, Popover, PopoverTrigger, PopoverContent, Tooltip, Checkbox } from "@heroui/react";
import { Icon } from "@iconify/react";
import { invoke } from '@tauri-apps/api/core';
import { MacroDefinition, Action, MacroCategory } from "../types/macro";
import { registerMacro, MacroConfig, ActionType, ActionParams, MacroAction } from "../lib/tauri";
import { motion, AnimatePresence, Reorder, useDragControls, LayoutGroup } from "framer-motion";
import { MidiTriggerSelector } from "./midi-trigger-selector";

// Extended type for macros with additional properties for the UI
interface ExtendedMacroDefinition extends MacroDefinition {
  isGroupRoot?: boolean;
  groupItems?: MacroDefinition[];
}

// Context menu item interface
interface ContextMenuItem {
  key: string;
  label: string;
  description?: string;
  icon: string;
  color?: "default" | "primary" | "secondary" | "success" | "warning" | "danger";
  onPress: () => void;
}

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


export const MacrosList: React.FC<MacrosListProps> = ({ onEditMacro, onCreateTemplate }): JSX.Element => {
  const [macros, setMacros] = useState<MacroDefinition[]>([]);
  const [activeMacros, setActiveMacros] = useState<Set<string>>(new Set());
  // Removed expandedMacros state - no more expansion needed
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
  
  // Add loading state for categories
  const [categoryLoadingStates, setCategoryLoadingStates] = useState<Set<string>>(new Set());
  
  // Clean implementation of drag and drop state
  type DragItem = {
    id: string;
    type: 'macro' | 'group';
    sourceCategory: string;
    groupId?: string;
  };
  
  // Define the drop target type
  type DropTarget = {
    id: string;
    type: 'macro' | 'group' | 'category' | 'zone';
    category: string;
    position?: 'before' | 'after';
    beforeId?: string | null;
    afterId?: string | null;
    categoryId?: string;
  };
  
  // Track what's being dragged and where it can be dropped
  const [draggedItem, setDraggedItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  
  // Store macro order by category
  const [categoryOrders, setCategoryOrders] = useState<Record<string, string[]>>({});
  
  // Add state for tracking macro order within categories
  const [macroOrder, setMacroOrder] = useState<Record<string, string[]>>({});
  
 
  // Context menu state - now using HeroUI dropdown
  const [contextMenu, setContextMenu] = useState<{
    isOpen: boolean;
    macro?: MacroDefinition;
    isPageLevel: boolean;
    x: number;
    y: number;
  }>({
    isOpen: false,
    macro: undefined,
    isPageLevel: false,
    x: 0,
    y: 0
  });

  // Inject CSS for temporary highlight effect on navigated macro
  React.useEffect(() => {
    const id = 'macro-highlight-style';
    if (!document.getElementById(id)) {
      const style = document.createElement('style');
      style.id = id;
      style.textContent = `
        .macro-highlight {
          outline: 2px solid var(--heroui-colors-primary, #3b82f6);
          box-shadow: 0 0 0 4px rgba(59,130,246,0.25);
          transition: box-shadow 0.3s ease, outline-color 0.3s ease;
        }
      `;
      document.head.appendChild(style);
    }
    return () => {
      const el = document.getElementById(id);
      if (el) el.remove();
    };
  }, []);

  // Handle navigation from MIDI log: expand category, scroll to macro, highlight
  React.useEffect(() => {
    const onNavigate = () => {
      const macroId = localStorage.getItem('scrollToMacroId') || '';
      const expandCategoryId = localStorage.getItem('expandCategoryId') || '';
      if (!macroId) return;
      // Expand the requested category if present
      if (expandCategoryId) {
        setExpandedCategories(prev => {
          if (prev.has(expandCategoryId)) return prev;
          const next = new Set(prev);
          next.add(expandCategoryId);
          // Persist to localStorage to align with existing code
          const updated = categories.map(cat => ({ ...cat, isExpanded: next.has(cat.id) }));
          localStorage.setItem('macroCategories', JSON.stringify(updated));
          return next;
        });
      }
      // Give React time to render expanded content
      setTimeout(() => {
        const el = document.querySelector(`[data-macro-id="${macroId}"]`) as HTMLElement | null
          || document.getElementById(`macro-${macroId}`);
        if (el && 'scrollIntoView' in el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Apply temporary highlight
          el.classList.add('macro-highlight');
          setTimeout(() => el.classList.remove('macro-highlight'), 1400);
        }
        // Clear hints
        localStorage.removeItem('scrollToMacroId');
        // keep expandCategoryId so user sees it expanded
      }, 120);
    };
    window.addEventListener('navigate-to-macros' as any, onNavigate);
    return () => window.removeEventListener('navigate-to-macros' as any, onNavigate);
  }, [categories, setExpandedCategories]);
  
  // Calculate the displayed macro count, grouping by groupId
  const displayedMacroCount = React.useMemo(() => {
    const uniqueMacroEntities = new Set<string>();
    macros.forEach(macro => {
      if (macro.groupId) {
        uniqueMacroEntities.add(macro.groupId);
      } else {
        uniqueMacroEntities.add(macro.id);
      }
    });
    return uniqueMacroEntities.size;
  }, [macros]);
  
  // Add this to the render method, right before returning the JSX
  // Create a ghost element for drag preview
  React.useEffect(() => {
    // Create ghost element if it doesn't exist
    if (!document.getElementById('ghost-macro')) {
      const ghostElement = document.createElement('div');
      ghostElement.id = 'ghost-macro';
      document.body.appendChild(ghostElement);
    }
    
    // Clean up when component unmounts
    return () => {
      const ghostElement = document.getElementById('ghost-macro');
      if (ghostElement) {
        document.body.removeChild(ghostElement);
      }
    };
  }, []);
  
 
  // Context menu handlers
  const handleContextMenu = useCallback((e: React.MouseEvent, macro?: MacroDefinition) => {
    e.preventDefault();
    e.stopPropagation();
    
    setContextMenu({
      isOpen: true,
      macro,
      isPageLevel: !macro,
      x: e.clientX,
      y: e.clientY
    });
  }, []);
  
  const closeContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

  // Custom CSS styles for drag and drop (minimal now, mostly handled by Framer Motion)
  React.useEffect(() => {
    // Create style element
    const styleEl = document.createElement('style');
    styleEl.id = 'macro-drag-drop-styles';
    
    // Define minimal styles (most animations now handled by Framer Motion)
    styleEl.innerHTML = `
      .drag-handle {
        cursor: grab;
        touch-action: none;
        color: var(--foreground-400);
        transition: color 0.2s ease;
      }
      
      .drag-handle:hover {
        color: var(--foreground-600);
      }
      
      .dragging .drag-handle {
        cursor: grabbing;
      }
      
      /* Ensure proper stacking for dragged items */
      .framer-motion-drag-layer {
        z-index: 1000 !important;
      }
      
      /* Drop zone styling */
      .drop-zone {
        border: 2px dashed transparent;
        border-radius: 8px;
        min-height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 4px 0;
      }
      
      .drop-zone.active {
        border-color: rgba(var(--primary-rgb), 0.5);
        background-color: rgba(var(--primary-rgb), 0.05);
      }
    `;
    
    // Add to document
    document.head.appendChild(styleEl);
    
    // Clean up
    return () => {
      const existingStyle = document.getElementById('macro-drag-drop-styles');
      if (existingStyle) {
        document.head.removeChild(existingStyle);
      }
    };
  }, []);
  
  const handleDragOverDropZone = (
    e: React.DragEvent<HTMLDivElement>,
    categoryId: string,
    beforeId: string | null,
    afterId: string | null
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only allow if we have something being dragged
    if (!draggedItem) return;
    
    // Set the drop effect
    e.dataTransfer.dropEffect = "move";
    
    // Get target element
    const targetElement = e.currentTarget as HTMLElement;
    
    // Don't allow dropping onto itself or adjacent to itself
    if (draggedItem.id === beforeId || draggedItem.id === afterId) {
      return;
    }
    
    // Don't reprocess the same target
    if (
      dropTarget?.type === 'zone' && 
      dropTarget?.categoryId === categoryId && 
      dropTarget?.beforeId === beforeId && 
      dropTarget?.afterId === afterId
    ) {
      return;
    }
    
    // Clear existing drop position classes
    const existingDropTargets = document.querySelectorAll('.active');
    existingDropTargets.forEach(el => {
      el.classList.remove('active');
    });
    
    // Highlight this drop zone
    targetElement.classList.add('active');
    
    // If we're dragging a ghost macro, show it in the current zone
    const ghostMacro = document.getElementById('ghost-macro');
    if (ghostMacro) {
      ghostMacro.style.display = 'block';
      // Position the ghost inside the current drop zone
      // This is handled by CSS, just make sure it's visible
    }
    
    // Update the drop target
    setDropTarget({
      id: `zone-${categoryId}-${beforeId || 'start'}-${afterId || 'end'}`,
      type: 'zone',
      category: categoryId,
      categoryId,
      beforeId,
      afterId
    });
  };

  const handleDragLeaveDropZone = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only clear if we're leaving the actual target (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      const targetElement = e.currentTarget as HTMLElement;
      targetElement.classList.remove('active');
    }
  };

  const handleDropOnZone = (
    e: React.DragEvent<HTMLDivElement>,
    categoryId: string,
    beforeId: string | null,
    afterId: string | null
  ) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Ensure we have a dragged item
    if (!draggedItem) return;
    
    console.log('Drop on zone:', { draggedItem, categoryId, beforeId, afterId });
    
    // Get the dragged item ID from dataTransfer as a fallback
    let sourceId = draggedItem.id;
    try {
      const dataId = e.dataTransfer.getData("text/plain");
      if (dataId) sourceId = dataId;
    } catch (err) {
      console.warn("Could not get transfer data", err);
    }
    
    // Find the source macro
    const sourceMacro = macros.find(m => m.id === sourceId);
    if (!sourceMacro) {
      console.error("Source macro not found:", sourceId);
      return;
    }
    
    // Check if we're moving between categories
    const sourceCategoryId = sourceMacro.categoryId || 'default';
    if (sourceCategoryId !== categoryId) {
      // Handle category change
      handleDropOnCategory(sourceMacro, categoryId);
      
      // After changing category, also position within the new category
      // This can be a separate operation after the category change is complete
      setTimeout(() => {
        positionMacroInCategory(sourceMacro, categoryId, beforeId, afterId);
      }, 50);
    } else {
      // Position within the same category
      positionMacroInCategory(sourceMacro, categoryId, beforeId, afterId);
    }
    
    // Reset drag state
    setDraggedItem(null);
    setDropTarget(null);
    
    // Clear active states
    const activeElements = document.querySelectorAll('.active');
    activeElements.forEach(el => el.classList.remove('active'));
  };

  // Helper function to position a macro between two other macros in a category
  const positionMacroInCategory = (
    sourceMacro: MacroDefinition, 
    categoryId: string, 
    beforeId: string | null, 
    afterId: string | null
  ) => {
    console.log(`Positioning macro ${sourceMacro.name} in category ${categoryId} between ${beforeId} and ${afterId}`);
    
    // Determine the key to use (group ID or macro ID)
    const sourceKey = sourceMacro.groupId || sourceMacro.id;
    
    // Get current order or create new one
    let currentOrder = [...(macroOrder[categoryId] || [])];
    
    // If order is empty, build it from current macros
    if (currentOrder.length === 0) {
      // Get all macros in this category
      const categoryMacros = macros.filter(m => (m.categoryId || 'default') === categoryId);
      
      // Build a map of unique groups/macros
      const uniqueKeys = new Map<string, MacroDefinition>();
      categoryMacros.forEach(macro => {
        const key = macro.groupId || macro.id;
        if (!uniqueKeys.has(key)) {
          uniqueKeys.set(key, macro);
        }
      });
      
      // Create order from unique keys
      currentOrder = Array.from(uniqueKeys.keys());
    }
    
    // Remove source from current position
    currentOrder = currentOrder.filter(key => key !== sourceKey);
    
    // Find the position to insert based on beforeId and afterId
    if (!beforeId && !afterId) {
      // Empty category or drop at very beginning
      currentOrder.unshift(sourceKey);
    } else if (beforeId && !afterId) {
      // Drop at the very end
      currentOrder.push(sourceKey);
    } else if (beforeId) {
      // Find beforeId position
      const beforeIndex = currentOrder.indexOf(beforeId);
      if (beforeIndex !== -1) {
        // Insert after beforeId
        currentOrder.splice(beforeIndex + 1, 0, sourceKey);
      } else {
        // fallback: add to end
        currentOrder.push(sourceKey);
      }
    } else if (afterId) {
      // Find afterId position
      const afterIndex = currentOrder.indexOf(afterId);
      if (afterIndex !== -1) {
        // Insert before afterId
        currentOrder.splice(afterIndex, 0, sourceKey);
      } else {
        // fallback: add to beginning
        currentOrder.unshift(sourceKey);
      }
    }
    
    // Update orders state
    const newOrders = { ...macroOrder, [categoryId]: currentOrder };
    setMacroOrder(newOrders);
    localStorage.setItem("macroOrder", JSON.stringify(newOrders));
    
    // Show success message
    addToast({
      title: "Macro Reordered",
      description: `"${sourceMacro.name}" positioned in ${categories.find(c => c.id === categoryId)?.name || "category"}`,
      color: "success"
    });
  };
  
  // State for delete confirmation popovers
  const [deletePopoverOpen, setDeletePopoverOpen] = useState<string | null>(null);
  const [categoryDeletePopoverOpen, setCategoryDeletePopoverOpen] = useState<string | null>(null);
  
  // Added state for category management
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<MacroCategory | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedColor, setSelectedColor] = useState("primary");
  const [customColor, setCustomColor] = useState("#3b82f6"); // Default blue hex
  const [isCustomColor, setIsCustomColor] = useState(false);

  // Add state for MIDI conflict resolution
  const [conflictModal, setConflictModal] = useState<{
    isOpen: boolean;
    newMacro: MacroDefinition | null;
    conflictingMacros: MacroDefinition[];
    isCategoryActivation?: boolean;
    isInternalConflict?: boolean;
    categoryId?: string;
    categoryName?: string;
    macroName?: string;
    categoryMacros?: MacroDefinition[];
    selectedMacrosToKeep?: Set<string>;
  }>({
    isOpen: false,
    newMacro: null,
    conflictingMacros: [],
    isCategoryActivation: false,
    isInternalConflict: false,
    selectedMacrosToKeep: new Set()
  });
  
  // Add state for import preference modal
  const [importPreferenceModal, setImportPreferenceModal] = useState<{
    isOpen: boolean;
    importData: any;
    fileName: string;
  }>({
    isOpen: false,
    importData: null,
    fileName: ""
  });
  
  // Add state for MIDI redefinition process
  const [midiRedefinitionModal, setMidiRedefinitionModal] = useState<{
    isOpen: boolean;
    currentMacro: any;
    macroIndex: number;
    totalMacros: number;
    importData: any;
    redefinedMacros: any[];
    incrementTrigger: MacroDefinition['trigger'] | null;
    decrementTrigger: MacroDefinition['trigger'] | null;
    clickTrigger: MacroDefinition['trigger'] | null;
    lastProcessedTimestamp: number; // Add timestamp to prevent stale message processing
    autoAdvanceToNextGroup: boolean; // Auto-advance when all triggers are set
    stopListeningCounter: number; // Counter to force stop listening
  }>({
    isOpen: false,
    currentMacro: null,
    macroIndex: 0,
    totalMacros: 0,
    importData: null,
    redefinedMacros: [],
    incrementTrigger: null,
    decrementTrigger: null,
    clickTrigger: null,
    lastProcessedTimestamp: 0,
    autoAdvanceToNextGroup: false,
    stopListeningCounter: 0
  });

  // Add state for import summary modal
  const [importSummaryModal, setImportSummaryModal] = useState<{
    isOpen: boolean;
    importData: any;
    redefinedMacros: any[];
    duplicates: { originalId: string; importedMacro: any; }[];
    skipDuplicates: Set<string>; // Track which duplicates to skip by their identifier
  }>({
    isOpen: false,
    importData: null,
    redefinedMacros: [],
    duplicates: [],
    skipDuplicates: new Set()
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
    console.log(`Starting Thanos snap animation for element: ${elementId}`);
    const element = document.getElementById(elementId);
    
    if (!element) {
      console.error(`Element with ID ${elementId} not found for Thanos animation`);
      // If we can't find the element, still call onComplete so deletion proceeds
      onComplete();
      return;
    }
    
    if (elementsBeingDeleted.current.has(elementId)) {
      console.warn(`Element ${elementId} is already being deleted`);
      return;
    }
    
    elementsBeingDeleted.current.add(elementId);
    console.log(`Added ${elementId} to elements being deleted set`);
    
    const displacement = document.getElementById("dissolve-filter-displacement");
    if (!displacement) {
      console.error("Displacement filter element not found");
      // If filter element is missing, still call onComplete
      onComplete();
      return;
    }
    
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
        console.log(`Animation complete for ${elementId}, calling onComplete`);
        displacement.setAttribute("scale", "0");
        elementsBeingDeleted.current.delete(elementId);
        onComplete();
      }
    };

    requestAnimationFrame(animate);
  }, [easeOutCubic, setRandomSeed]);


  
  // Single initialization effect - loads everything once
  useEffect(() => {
    const loadMacrosFromStorage = () => {
      console.log("Loading MacrosList component");
      
      // Load categories first
      loadCategories();
      
      // Load macro order or initialize it
      const storedOrder = localStorage.getItem("macroOrder");
      if (storedOrder) {
        try {
          const parsedOrder = JSON.parse(storedOrder);
          setMacroOrder(parsedOrder);
        } catch (e) {
          console.error("Failed to parse macro order from localStorage:", e);
          setMacroOrder({});
        }
      }
      
      // Load macros from localStorage
    console.log("Loading macros from localStorage");
    const storedMacros = localStorage.getItem("midiMacros");
      let loadedMacros: MacroDefinition[] = [];
      
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
            
            // Filter out duplicates before setting state - keep only the first occurrence
            loadedMacros = parsedMacros.filter((macro: MacroDefinition, idx: number) => 
              macroIds.indexOf(macro.id) === idx
            );
            
            // Write back de-duplicated macros to localStorage
            localStorage.setItem("midiMacros", JSON.stringify(loadedMacros));
            console.log("De-duplicated macros saved back to localStorage");
        } else {
            loadedMacros = parsedMacros;
          console.log(`Loaded ${parsedMacros.length} macros from localStorage`);
        }
      } catch (e) {
        console.error("Failed to parse macros from localStorage:", e);
          loadedMacros = [];
      }
    } else {
      console.log("No macros found in localStorage");
        loadedMacros = [];
    }
  
      // Set macros state
      setMacros(loadedMacros);
    
      // Load active macros from localStorage to sync UI state
    const activeFromStorage = localStorage.getItem("activeMidiMacros");
    if (activeFromStorage) {
      try {
        const activeIds = JSON.parse(activeFromStorage);
          if (Array.isArray(activeIds) && activeIds.length > 0) {
            console.log(`Setting active macros from storage:`, activeIds);
          setActiveMacros(new Set(activeIds));
        }
      } catch (e) {
        console.error("Failed to parse active macros from storage:", e);
      }
    }
    };
    
    const initializeApp = async () => {
      loadMacrosFromStorage();
      
      // Check for macro update information and handle it after loading
      await handleMacroUpdateIfNeeded();
    };
    
    initializeApp();
  }, []); // Only run once on mount

  // Watch for new macros and auto-enable them
  useEffect(() => {
    // Skip auto-activation during initial load
    if (macros.length === 0) return;
    
    // Get the previous macro count from localStorage to detect new macros
    const previousMacrosString = localStorage.getItem("midiMacros");
    if (!previousMacrosString) {
      // If no previous macros in storage, update localStorage and skip auto-enable
      localStorage.setItem("midiMacros", JSON.stringify(macros));
      return;
    }
    
    try {
      const previousMacros = JSON.parse(previousMacrosString);
      const currentMacroIds = new Set(macros.map(m => m.id));
      const previousMacroIds = new Set(previousMacros.map((m: MacroDefinition) => m.id));
      
      // Find newly added macros
      const newMacroIds = [...currentMacroIds].filter(id => !previousMacroIds.has(id));
      
      // Always update localStorage with current macros after comparison
      localStorage.setItem("midiMacros", JSON.stringify(macros));
      
      if (newMacroIds.length > 0) {
        console.log(`Detected ${newMacroIds.length} new macros, auto-enabling them:`, newMacroIds);
        
        // Auto-enable new macros after a short delay to ensure UI is ready
        setTimeout(async () => {
          for (const newId of newMacroIds) {
            const newMacro = macros.find(m => m.id === newId);
            if (newMacro) {
              console.log(`Auto-enabling new macro: ${newMacro.name}`);
              await handleToggleMacro(newId, true, true);
            }
          }
        }, 100);
      }
    } catch (e) {
      console.error("Error checking for new macros:", e);
      // Even if there's an error, update localStorage to prevent issues
      localStorage.setItem("midiMacros", JSON.stringify(macros));
    }
  }, [macros]); // Watch macros array for changes

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

  // Removed toggleExpanded function - no more expansion needed

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
        
        // If there are conflicts, show the comprehensive conflict modal
        if (conflictingMacros.length > 0) {
          // Create a descriptive conflict scenario
          const macroName = macro.groupId ? 
            macro.name.replace(/ \(.*\)$/, "") : macro.name;
          const macroCategory = categories.find(c => c.id === (macro.categoryId || "default"))?.name || "General";
          
          setConflictModal({
            isOpen: true,
            newMacro: macro,
            conflictingMacros,
            isCategoryActivation: false,
            isInternalConflict: false,
            categoryId: macro.categoryId || "default",
            categoryName: macroCategory,
            macroName: macroName,
            categoryMacros: undefined,
            selectedMacrosToKeep: undefined
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
            try {
              const actionType = mapActionType(action.type, action.params);
              const actionParams = mapActionParams(action.type, action.params);
              
              console.log(`Converting action: ${action.type}`, { actionType, actionParams });
              
            return {
                action_type: actionType,
                action_params: actionParams
            };
            } catch (err) {
              console.error(`Error converting action ${action.type}:`, err, action);
              throw err;
            }
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
          console.log(`Registering macro configuration:`, config);
          await registerMacro(config);
          console.log(`Successfully registered macro: ${macroToActivate.id}`);
          
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
      const errorMessage = err instanceof Error ? err.message : String(err) || 'Unknown error occurred';
      addToast({
        title: "Error",
        description: `Failed to ${isActive ? "activate" : "deactivate"} macro: ${errorMessage}`,
        color: "danger"
      });
    }
  };

  // Helper function to deactivate conflicting macros and activate category
  const deactivateConflictingMacrosAndActivateCategory = async () => {
    if (!conflictModal.categoryId || !conflictModal.categoryMacros) return;
    
    // Deactivate conflicting macros
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
    
    // Update active macros set - remove conflicting ones
    const newActiveMacros = new Set(activeMacros);
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
    
    // Activate category macros
    for (const macro of conflictModal.categoryMacros) {
      try {
        const config = createMacroConfig(macro);
        await registerMacro(config);
        newActiveMacros.add(macro.id);
        console.log(`Activated category macro: ${macro.id}`);
      } catch (err) {
        console.error(`Error activating category macro ${macro.id}:`, err);
      }
    }
    
    // Update state
    setActiveMacros(newActiveMacros);
    localStorage.setItem("activeMidiMacros", JSON.stringify([...newActiveMacros]));
    
    addToast({
      title: "Category Activated",
      description: `${conflictModal.categoryName} macros are now active, conflicting macros deactivated`,
      color: "success"
    });
  };

  // New function to handle conflict resolution
  const handleResolveConflict = async (action: "new" | "existing" | "cancel" | "selected") => {
    // Handle internal category conflicts first
    if (conflictModal.isInternalConflict && action === "selected") {
      // Allow proceeding with no macros selected - this will disable all conflicting macros
      const selectedMacrosToKeep = conflictModal.selectedMacrosToKeep || new Set();
      
      try {
        // Get all macros in the category
        const allCategoryMacros = conflictModal.categoryMacros || [];
        console.log(`Processing category with ${allCategoryMacros.length} total macros`);
        
        // Get conflicting macro IDs
        const conflictingIds = new Set(conflictModal.conflictingMacros.map(m => m.id));
        
        // Get non-conflicting macros (these should all be activated)
        const nonConflictingMacros = allCategoryMacros.filter(m => !conflictingIds.has(m.id));
        
        // Get selected conflicting macros
        const selectedConflictingMacros = Array.from(selectedMacrosToKeep)
          .map(id => macros.find(m => m.id === id))
          .filter(m => m) as MacroDefinition[];
        
        // Get unselected conflicting macros (these need to be deactivated)
        const unselectedConflictingMacros = conflictModal.conflictingMacros.filter(m => !selectedMacrosToKeep.has(m.id));
        
        // Combine non-conflicting + selected conflicting macros
        const macrosToActivate = [...nonConflictingMacros, ...selectedConflictingMacros];
        console.log(`Activating ${nonConflictingMacros.length} non-conflicting + ${selectedConflictingMacros.length} selected = ${macrosToActivate.length} total macros`);
        console.log(`Deactivating ${unselectedConflictingMacros.length} unselected conflicting macros`);
        
        // Set loading state for the category
        setCategoryLoadingStates(prev => new Set([...prev, conflictModal.categoryId || ""]));
        
        // Start with current active macros (to preserve macros from other categories)
        const newActiveMacros = new Set(activeMacros);
        
        // First, deactivate unselected conflicting macros that are currently active
        for (const macro of unselectedConflictingMacros) {
          if (activeMacros.has(macro.id)) {
            try {
              await invoke('cancel_macro', { id: macro.id });
              newActiveMacros.delete(macro.id);
              console.log(`Deactivated unselected conflicting macro: ${macro.name}`);
            } catch (err) {
              console.error(`Error deactivating macro ${macro.id}:`, err);
            }
          }
        }
        
        // Group macros to activate by encoder groups to avoid duplicate activation
        const groupsToActivate = new Set<string | undefined>();
        const standaloneMacros: MacroDefinition[] = [];
        
        // Sort macros into groups and standalone macros
        macrosToActivate.forEach(macro => {
          if (macro.groupId) {
            groupsToActivate.add(macro.groupId);
          } else {
            standaloneMacros.push(macro);
          }
        });
        
        // Activate encoder groups
        for (const groupId of groupsToActivate) {
          if (!groupId) continue;
          
          // Get all macros in this group that should be activated
          const groupMacros = macrosToActivate.filter(m => m.groupId === groupId);
          console.log(`Activating group ${groupId} with ${groupMacros.length} macros`);
          
          // Activate each one
          for (const macro of groupMacros) {
            try {
              const config = createMacroConfig(macro);
              await registerMacro(config);
              newActiveMacros.add(macro.id);
              console.log(`Activated macro: ${macro.name}`);
            } catch (err) {
              console.error(`Error activating macro ${macro.id}:`, err);
            }
          }
        }
        
        // Activate standalone macros
        for (const macro of standaloneMacros) {
          try {
            const config = createMacroConfig(macro);
            await registerMacro(config);
            newActiveMacros.add(macro.id);
            console.log(`Activated standalone macro: ${macro.name}`);
          } catch (err) {
            console.error(`Error activating macro ${macro.id}:`, err);
          }
        }
        
        setActiveMacros(newActiveMacros);
        localStorage.setItem("activeMidiMacros", JSON.stringify([...newActiveMacros]));
        
        const toastMessage = selectedConflictingMacros.length === 0 
          ? `Activated ${nonConflictingMacros.length} macro(s), disabled ${unselectedConflictingMacros.length} conflicting macro(s)`
          : `Activated ${macrosToActivate.length} macro(s) from ${conflictModal.categoryName}`;
        
        addToast({
          title: "Category Activated",
          description: toastMessage,
          color: "success"
        });
      } catch (err) {
        console.error("Error processing conflict resolution:", err);
        addToast({
          title: "Activation Error",
          description: `Failed to process conflict resolution: ${(err as Error).message}`,
          color: "danger"
        });
      } finally {
        // Clear loading state
        setCategoryLoadingStates(prev => {
          const newSet = new Set(prev);
          newSet.delete(conflictModal.categoryId || "");
          return newSet;
        });
        
        setConflictModal({
          isOpen: false,
          newMacro: null,
          conflictingMacros: [],
          isCategoryActivation: false,
          isInternalConflict: false,
          selectedMacrosToKeep: new Set()
        });
      }
      return;
    }

    // Handle category activation conflicts
    if (conflictModal.isCategoryActivation) {
      try {
        if (action === "new") {
          // Deactivate conflicting macros and activate category
          await deactivateConflictingMacrosAndActivateCategory();
        } else if (action === "existing") {
          // Keep existing macros, don't activate category
          addToast({
            title: "Kept Existing Macros",
            description: "Existing macros remain active, category not activated",
            color: "primary"
          });
        }
        // Cancel does nothing
      } catch (err) {
        console.error("Error resolving category conflict:", err);
        addToast({
          title: "Error",
          description: `Failed to resolve category conflict: ${(err as Error).message}`,
          color: "danger"
        });
      } finally {
        // Close the modal
        setConflictModal({
          isOpen: false,
          newMacro: null,
          conflictingMacros: [],
          isCategoryActivation: false,
          isInternalConflict: false,
          selectedMacrosToKeep: new Set()
        });
      }
      return;
    }

    // Handle individual macro conflicts
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
            console.log(`Registering replacement macro configuration:`, config);
            await registerMacro(config);
            console.log(`Successfully registered replacement macro: ${macroToActivate.id}`);
            
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
        conflictingMacros: [],
        isCategoryActivation: false,
        isInternalConflict: false,
        selectedMacrosToKeep: new Set()
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
      case "keyrelease":
        return ActionType.KeyRelease;
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
          return { 
            keys,
            hold: params.hold || false  // Include hold parameter for combinations
          };
        } else {
          // Simple key press without modifiers
          return { 
            key: params.key || "",
            hold: params.hold || false  // Include hold parameter for simple keys
          };
        }
      case "keyrelease":
        return { key: params.key || "" };
      case "mouseclick":
        if (params.button === "scroll-up" || params.button === "scroll-down") {
          return {
            button: params.button,
            amount: params.amount || 3,
          };
        } else {
        return {
          button: params.button || "left",
          hold: params.hold || false, // Pass hold parameter
            x: params.x || 0,
            y: params.y || 0,
        };
        }
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
          const btn = (action.params.button || "left");
          const label = btn.charAt(0).toUpperCase() + btn.slice(1);
          return `${label} Click${action.params.hold ? ' (hold)' : ''}`;
        }
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
      case "delay":
        return `Wait for ${action.params.duration}ms`;
      default:
        return "Unknown action";
    }
  }

  // Helper function for showing trigger details
  function getTriggerDescription(trigger: MacroDefinition["trigger"]): string {
    if (trigger.type === "noteon") {
      let description = `Note ${trigger.note} Ch ${trigger.channel}`;
      if (trigger.value !== undefined) {
        description += ` / ${trigger.value}`;
      }
    
      return description;
    } else if (trigger.type === "noteoff") {
      let description = `Note Off ${trigger.note} Ch ${trigger.channel}`;
      if (trigger.value !== undefined) {
        description += ` / ${trigger.value}`;
      }
      
      return description;
    } else if (trigger.type === "controlchange") {
      let description = `CC ${trigger.controller} Ch ${trigger.channel}`;
      if (trigger.value !== undefined) {
        description += ` / ${trigger.value}`;
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
      case "note-increment":
        return "primary";
      case "note-decrement":
        return "warning";
      case "noteoff":
        return "danger";
      default:
        return "primary";
    }
  }

  // Helper function to convert action type to readable display name
  function getActionTypeDisplayName(actionType: string): string {
    switch (actionType) {
      case "keypress":
        return "Key Press";
      case "keyrelease":
        return "Key Release";
      case "mouseclick":
        return "Mouse Click";
      case "mouserelease":
        return "Mouse Release";
      case "mousemove":
        return "Mouse Move";
      case "mousedrag":
        return "Mouse Drag";
      case "delay":
        return "Delay";
      default:
        return actionType.charAt(0).toUpperCase() + actionType.slice(1);
    }
  }

  // Helper function to get detailed action information for tooltips
  function getDetailedActionInfo(action: Action): string {
    switch (action.type) {
      case "keypress":
        let keyInfo = `Key: ${action.params.key}`;
        if (action.params.modifiers?.length) {
          keyInfo += `\nModifiers: ${action.params.modifiers.join(' + ')}`;
        }
        if (action.params.hold) {
          keyInfo += `\nHold: ${action.params.duration || 500}ms`;
        }
        return keyInfo;
      case "keyrelease":
        return `Key: ${action.params.key}`;
      case "mouseclick":
        if (action.params.button?.startsWith("scroll")) {
          return `Button: ${action.params.button}\nAmount: ${action.params.amount || 3}`;
        } else {
          let clickInfo = `Button: ${action.params.button}`;
          if (action.params.x !== undefined && action.params.y !== undefined) {
            clickInfo += `\nPosition: (${action.params.x}, ${action.params.y})`;
          }
          if (action.params.hold) {
            clickInfo += `\nHold: ${action.params.duration || 500}ms`;
          }
          return clickInfo;
        }
      case "mouserelease":
        return `Button: ${action.params.button}`;
      case "mousemove":
        if (action.params.relative) {
          return `Direction: ${action.params.direction || 'right'}\nDistance: ${action.params.distance || 100}px\nDuration: ${action.params.duration || 500}ms`;
        } else {
          return `Position: (${action.params.x}, ${action.params.y})\nDuration: ${action.params.duration || 500}ms`;
        }
      case "mousedrag":
        return `Direction: ${action.params.direction}\nDistance: ${action.params.distance}px\nDuration: ${action.params.duration || 500}ms`;
      case "delay":
        return `Duration: ${action.params.duration || 500}ms`;
      default:
        return "Unknown action type";
    }
  }

  // Organize macros by category
  const macrosByCategory = React.useMemo(() => {
    const result: Record<string, MacroDefinition[]> = {};
    const counts: Record<string, number> = {}; // To store the unique counts
    
    // Initialize with all categories as keys (even empty ones)
    categories.forEach(category => {
      result[category.id] = [];
      counts[category.id] = 0;
    });
    
    // Ensure default category exists
    if (!result["default"]) {
      result["default"] = [];
      counts["default"] = 0;
    }
    
    // Group macros by their category and calculate unique counts
    for (const macro of macros) {
      const categoryId = macro.categoryId || "default";
      if (!result[categoryId]) {
        result[categoryId] = [];
        counts[categoryId] = 0;
      }
      result[categoryId].push(macro);
    }
    
    // Calculate unique counts for each category
    Object.keys(result).forEach(categoryId => {
      const uniqueEntities = new Set<string>();
      result[categoryId].forEach(macro => {
        if (macro.groupId) {
          uniqueEntities.add(macro.groupId);
        } else {
          uniqueEntities.add(macro.id);
        }
      });
      counts[categoryId] = uniqueEntities.size;
    });
    
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
    
    return { result, counts };
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
    
    // Don't allow multiple operations on the same category
    if (categoryLoadingStates.has(categoryId)) {
      console.log(`Category ${categoryId} is already being processed, ignoring request`);
      return;
    }
    
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
    // Set loading state
    setCategoryLoadingStates(prev => new Set([...prev, categoryId]));
    
    try {
      console.log(`Activating category ${categoryId}, exclusive: ${exclusive}`);
      
      // Get all macros in the specified category first
      const categoryMacros = macros.filter(m => (m.categoryId || "default") === categoryId);
      console.log(`Found ${categoryMacros.length} macros in category ${categoryId}`);
      
      // Check for conflicts with macros in this category
      const allConflictingMacros: MacroDefinition[] = [];
      const internalConflicts: MacroDefinition[] = [];
      
      // First, check for conflicts within the category itself - improved logic
      for (let i = 0; i < categoryMacros.length; i++) {
        for (let j = i + 1; j < categoryMacros.length; j++) {
          const macro1 = categoryMacros[i];
          const macro2 = categoryMacros[j];
          
          // Check if these two macros conflict with each other by comparing triggers
          const hasConflict = 
            macro1.trigger.type === macro2.trigger.type &&
            macro1.trigger.channel === macro2.trigger.channel &&
            (
              // For controlchange, check controller number and optionally value
              (macro1.trigger.type === "controlchange" && 
               macro1.trigger.controller === macro2.trigger.controller &&
               (macro1.trigger.value === undefined || macro2.trigger.value === undefined || 
                macro1.trigger.value === macro2.trigger.value)) ||
              // For note events, check note number
              (macro1.trigger.type === "noteon" && 
               macro1.trigger.note === macro2.trigger.note)
            );
          
          if (hasConflict) {
            // We found internal conflicts - add both macros
            if (!internalConflicts.some(m => m.id === macro1.id)) {
              internalConflicts.push(macro1);
            }
            if (!internalConflicts.some(m => m.id === macro2.id)) {
              internalConflicts.push(macro2);
            }
          }
        }
      }
      
      // If there are internal conflicts, show the conflict modal immediately
      if (internalConflicts.length > 0) {
        const categoryName = categories.find(c => c.id === categoryId)?.name || "Selected category";
        
        setConflictModal({
          isOpen: true,
          newMacro: null,
          conflictingMacros: internalConflicts,
          isCategoryActivation: true,
          isInternalConflict: true,
          categoryId,
          categoryName,
          categoryMacros,
          selectedMacrosToKeep: new Set()
        });
        return; // Don't proceed with activation
      }
      
      // Then check for conflicts with active macros from other categories
      for (const macro of categoryMacros) {
        const conflicts = findConflictingMacros(macro);
        // Only include conflicts that are currently active and not in the same category
        const activeConflicts = conflicts.filter(c => 
          activeMacros.has(c.id) && (c.categoryId || "default") !== categoryId
        );
        
        if (activeConflicts.length > 0) {
          allConflictingMacros.push(...activeConflicts);
        }
      }
      
      // Remove duplicates from conflicting macros
      const uniqueConflicts = allConflictingMacros.filter((macro, index, self) => 
        self.findIndex(m => m.id === macro.id) === index
      );
      
      // If there are conflicts and not exclusive mode, show conflict modal
      if (uniqueConflicts.length > 0 && !exclusive) {
        const categoryName = categories.find(c => c.id === categoryId)?.name || "Selected category";
        
        setConflictModal({
          isOpen: true,
          newMacro: null,
          conflictingMacros: uniqueConflicts,
          isCategoryActivation: true,
          isInternalConflict: false,
          categoryId,
          categoryName,
          categoryMacros,
          selectedMacrosToKeep: undefined
        });
        return; // Don't proceed with activation yet
      }
      
      // If exclusive, first deactivate all macros (this handles conflicts automatically)
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
    } finally {
      // Clear loading state
      setCategoryLoadingStates(prev => {
        const newSet = new Set(prev);
        newSet.delete(categoryId);
        return newSet;
      });
    }
  };

  // Function to deactivate all macros in a category
  const deactivateCategoryMacros = async (categoryId: string) => {
    // Set loading state
    setCategoryLoadingStates(prev => new Set([...prev, categoryId]));
    
    try {
      console.log(`Deactivating all macros in category ${categoryId}`);
      
      // Get all macros in the category
      const categoryMacros = macros.filter(m => (m.categoryId || "default") === categoryId);
      console.log(`Found ${categoryMacros.length} macros in category to deactivate`);
      
      // Get currently active macros from this category
      const activeIdsInCategory = categoryMacros
        .filter(m => activeMacros.has(m.id))
        .map(m => m.id);
      
      console.log(`Found ${activeIdsInCategory.length} active macros in category to deactivate`);
      
      // Create new active set by removing this category's macros
      const newActiveMacros = new Set(activeMacros);
      
      // Deactivate each active macro in the category
      for (const macro of categoryMacros) {
        if (activeMacros.has(macro.id)) {
          try {
            // Call the backend to cancel the macro
            await invoke('cancel_macro', { id: macro.id });
            console.log(`Deactivated macro ${macro.id}`);
            
            // Remove from tracking
            newActiveMacros.delete(macro.id);
          } catch (err) {
            console.error(`Error deactivating macro ${macro.id}:`, err);
          }
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
    } finally {
      // Clear loading state
      setCategoryLoadingStates(prev => {
        const newSet = new Set(prev);
        newSet.delete(categoryId);
        return newSet;
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

  // Function to handle macro updates from MacroBuilder
  const handleMacroUpdateIfNeeded = async () => {
    const updateInfoStr = localStorage.getItem("macroUpdateInfo");
    if (updateInfoStr) {
      try {
        const updateInfo = JSON.parse(updateInfoStr);
        console.log("Found macro update info:", updateInfo);
        
        if (updateInfo.wasActive && updateInfo.oldMacroIds && updateInfo.newMacroIds) {
          console.log("Handling macro update: deactivating old and reactivating new");
          
          // First, deactivate all old macro registrations
          for (const oldId of updateInfo.oldMacroIds) {
            try {
              await invoke('cancel_macro', { id: oldId });
              console.log(`Deactivated old macro registration: ${oldId}`);
            } catch (err) {
              console.error(`Error deactivating old macro ${oldId}:`, err);
            }
          }
          
          // Update active macros state - remove old IDs
          const activeFromStorage = localStorage.getItem("activeMidiMacros");
          if (activeFromStorage) {
            try {
              let activeIds = JSON.parse(activeFromStorage);
              
              // Remove old IDs
              activeIds = activeIds.filter((id: string) => !updateInfo.oldMacroIds.includes(id));
              
              // Add new IDs
              activeIds.push(...updateInfo.newMacroIds);
              
              // Remove duplicates
              activeIds = [...new Set(activeIds)];
              
              // Save back to storage
              localStorage.setItem("activeMidiMacros", JSON.stringify(activeIds));
              
              // Update component state
              setActiveMacros(new Set(activeIds));
              
              console.log("Updated active macros after macro update:", activeIds);
            } catch (e) {
              console.error("Error updating active macros after macro update:", e);
            }
          }
          
          // Now reactivate the new macros
          const allMacros: MacroDefinition[] = JSON.parse(localStorage.getItem("midiMacros") || "[]");
          for (const newId of updateInfo.newMacroIds) {
            const newMacro = allMacros.find(m => m.id === newId);
            if (newMacro) {
              try {
                const config = createMacroConfig(newMacro);
                await registerMacro(config);
                console.log(`Reactivated updated macro: ${newMacro.name} (${newId})`);
              } catch (err) {
                console.error(`Error reactivating updated macro ${newId}:`, err);
              }
            }
          }
          
          console.log("Macro update handling completed");
        }
        
        // Clean up the update info
        localStorage.removeItem("macroUpdateInfo");
      } catch (e) {
        console.error("Error handling macro update info:", e);
        localStorage.removeItem("macroUpdateInfo");
      }
    }
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

  // Function to handle saving category orders
  const saveCategoryOrders = useCallback((orders: Record<string, string[]>) => {
    localStorage.setItem("macroCategoryOrders", JSON.stringify(orders));
  }, []);

  // Load category orders from localStorage
  useEffect(() => {
    try {
      const storedOrders = localStorage.getItem("macroCategoryOrders");
      if (storedOrders) {
        setCategoryOrders(JSON.parse(storedOrders));
      }
    } catch (error) {
      console.error("Error loading category orders:", error);
    }
  }, []);
  
  // Update body class when dragging
  useEffect(() => {
    if (draggedItem) {
      document.body.classList.add("dragging-active");
    } else {
      document.body.classList.remove("dragging-active");
    }
    
    return () => {
      document.body.classList.remove("dragging-active");
    };
  }, [draggedItem]);
  
  // Drag and drop event handlers
  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, macro: MacroDefinition) => {
    e.stopPropagation();
    
    // Set the drag effect
    e.dataTransfer.effectAllowed = "move";
    
    // Set data for transfer - we'll use the macro ID
    e.dataTransfer.setData("text/plain", macro.id);
    
    // Try to add more data for browsers that support it
    try {
      const dragData = {
        id: macro.id,
        type: macro.groupId ? 'group' : 'macro',
        groupId: macro.groupId,
        sourceCategory: macro.categoryId || 'default',
      };
      e.dataTransfer.setData("application/json", JSON.stringify(dragData));
      } catch (err) {
      console.warn("Could not set complex data for drag operation", err);
    }
    
    // Mark the element as being dragged
    const element = e.currentTarget as HTMLElement;
    element.setAttribute("data-being-dragged", "true");
    
    // Set dragged item in state
    setDraggedItem({
      id: macro.id,
      type: macro.groupId ? 'group' : 'macro',
      sourceCategory: macro.categoryId || 'default',
      groupId: macro.groupId,
    });
    
    // Set up ghost element content
    const ghostMacro = document.getElementById('ghost-macro');
    if (ghostMacro) {
      // Create a simplified version of the macro for the ghost
      ghostMacro.innerHTML = `
        <div style="font-weight: 500; font-size: 14px; color: var(--foreground-600);">
          ${macro.name}
        </div>
        <div style="font-size: 12px; color: var(--foreground-400); margin-top: 4px;">
          ${getTriggerDescription(macro.trigger)}
        </div>
      `;
      
      // Hide it initially - will be shown by the drop zone handlers
      ghostMacro.style.display = 'none';
    }
    
    // Add delay to make the drag image look better
    setTimeout(() => {
      element.classList.add("dragging");
    }, 0);
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.stopPropagation();
    
    // Remove the dragging class and data attribute
    const element = e.currentTarget as HTMLElement;
    element.removeAttribute("data-being-dragged");
    element.classList.remove("dragging");
    
    // Hide ghost element
    const ghostElement = document.getElementById('ghost-macro');
    if (ghostElement) {
      ghostElement.style.display = 'none';
    }
    
    // Reset state
    setDraggedItem(null);
    setDropTarget(null);
    
    // Clear any active drop zones
    const activeZones = document.querySelectorAll('.macro-drop-zone.active');
    activeZones.forEach(zone => {
      zone.classList.remove('active');
    });
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, target: DropTarget) => {
    // Always prevent default to allow dropping
    e.preventDefault();
    e.stopPropagation();
    
    // Only allow if we have something being dragged
    if (!draggedItem) return;
    
    // Set the drop effect
    e.dataTransfer.dropEffect = "move";
    
    // Get target element and its position
    const targetElement = e.currentTarget as HTMLElement;
    const targetRect = targetElement.getBoundingClientRect();
    
    // Calculate if we're in the top half or bottom half of the element
    const mouseY = e.clientY;
    const relativePosition = mouseY - targetRect.top;
    const isTopHalf = relativePosition < targetRect.height / 2;
    
    // Store position info in the drop target
    const dropPosition = isTopHalf ? 'before' : 'after';
    
    // Prevent setting the same target repeatedly
    if (dropTarget?.id === target.id && 
        dropTarget?.type === target.type && 
        dropTarget?.position === dropPosition) return;
    
    // Don't allow dropping onto itself
    if (draggedItem.id === target.id && 
        (target.type === 'macro' || 
         (target.type === 'group' && draggedItem.type === 'group'))) {
      return;
    }
    
    // Clear existing drop position classes
    const existingDropTargets = document.querySelectorAll('.drop-target, .drop-before, .drop-after');
    existingDropTargets.forEach(el => {
      el.classList.remove('drop-target', 'drop-before', 'drop-after');
    });
    
    // Apply appropriate styling based on position
    if (target.type === 'category') {
      targetElement.classList.add('drop-target');
    } else {
      // For macros, apply position-specific class
      targetElement.classList.add(isTopHalf ? 'drop-before' : 'drop-after');
    }
    
    // Update the drop target with position information
    setDropTarget({
      ...target,
      position: dropPosition
    });
  };
  
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Only clear if we're leaving the actual target (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropTarget(null);
    }
  };
  
  const handleDrop = (e: React.DragEvent<HTMLDivElement>, target: DropTarget) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Ensure we have both source and target
    if (!draggedItem) return;
    
    console.log('Drop:', { draggedItem, target, dropTarget });
    
    // Get the dragged item ID from dataTransfer as a fallback
    let sourceId = draggedItem.id;
    try {
      const dataId = e.dataTransfer.getData("text/plain");
      if (dataId) sourceId = dataId;
      } catch (err) {
      console.warn("Could not get transfer data", err);
    }
    
    // Find the source macro
    const sourceMacro = macros.find(m => m.id === sourceId);
    if (!sourceMacro) {
      console.error("Source macro not found:", sourceId);
      return;
    }
    
    // Handle dropping on a category
    if (target.type === 'category') {
      handleDropOnCategory(sourceMacro, target.id);
    } 
    // Handle dropping on another macro (for reordering)
    else {
      // Use the position from the dropTarget state which includes before/after
      const position = dropTarget?.position || 'after';
      handleDropOnMacro(sourceMacro, {...target, position});
      
      // Add drop completion animation
      setTimeout(() => {
        const targetElement = document.getElementById(`macro-${target.id}`) || 
                             document.getElementById(`macro-group-${target.id}`);
        if (targetElement) {
          targetElement.classList.add('drop-complete');
          setTimeout(() => targetElement.classList.remove('drop-complete'), 600);
        }
      }, 50);
    }
    
    // Reset drag state
    setDraggedItem(null);
    setDropTarget(null);
  };
  
  // Handle dropping a macro on a category (move between categories)
  const handleDropOnCategory = (sourceMacro: MacroDefinition, targetCategoryId: string) => {
    // Don't do anything if it's already in this category
    const sourceCategoryId = sourceMacro.categoryId || 'default';
    if (sourceCategoryId === targetCategoryId) return;
    
    console.log(`Moving ${sourceMacro.name} from ${sourceCategoryId} to ${targetCategoryId}`);
    
    // Determine if this is a group or single macro
    const isGroup = !!sourceMacro.groupId;
    
    // Update all relevant macros
      const updatedMacros = macros.map(m => {
      if (isGroup && m.groupId === sourceMacro.groupId) {
        // Update all macros in the group
        return { ...m, categoryId: targetCategoryId };
      } 
      else if (m.id === sourceMacro.id) {
        // Update the single macro
        return { ...m, categoryId: targetCategoryId };
        }
        return m;
      });
      
    // Update state and localStorage
      setMacros(updatedMacros);
      localStorage.setItem("midiMacros", JSON.stringify(updatedMacros));
      
    // If we're moving to a new category, add to the order
    if (targetCategoryId) {
      const newOrders = { ...macroOrder };
      
      // Remove from source category order
      if (sourceCategoryId && newOrders[sourceCategoryId]) {
        const key = isGroup ? sourceMacro.groupId! : sourceMacro.id;
        newOrders[sourceCategoryId] = newOrders[sourceCategoryId].filter(id => id !== key);
      }
      
      // Add to target category order at the end
      if (!newOrders[targetCategoryId]) {
        newOrders[targetCategoryId] = [];
      }
      
      const key = isGroup ? sourceMacro.groupId! : sourceMacro.id;
      if (!newOrders[targetCategoryId].includes(key)) {
        newOrders[targetCategoryId].push(key);
      }
      
      // Save updated orders
      setMacroOrder(newOrders);
      localStorage.setItem("macroOrder", JSON.stringify(newOrders));
    }
      
      // Show success message
      addToast({
        title: "Macro Moved",
      description: `"${sourceMacro.name}" moved to ${categories.find(c => c.id === targetCategoryId)?.name || "category"}`,
        color: "success"
      });
  };

  // Handle dropping a macro on another macro (for reordering)
  const handleDropOnMacro = (sourceMacro: MacroDefinition, target: DropTarget & { position?: 'before' | 'after' }) => {
    // Determine source and target categories
    const sourceCategoryId = sourceMacro.categoryId || 'default';
    const targetCategoryId = target.category;
    
    // If different categories, treat as a category move
    if (sourceCategoryId !== targetCategoryId) {
      return handleDropOnCategory(sourceMacro, targetCategoryId);
    }
    
    console.log(`Reordering: Moving ${sourceMacro.name} ${target.position || 'after'} target in ${targetCategoryId}`);
    
    // Determine the keys to use (group ID or macro ID)
    const sourceKey = sourceMacro.groupId || sourceMacro.id;
    const targetKey = target.id;
    
    // Get current order or create new one
    let currentOrder = [...(macroOrder[targetCategoryId] || [])];
    
    // If order is empty, build it from current macros
    if (currentOrder.length === 0) {
      // Get all macros in this category
      const categoryMacros = macros.filter(m => (m.categoryId || 'default') === targetCategoryId);
      
      // Build a map of unique groups/macros
      const uniqueKeys = new Map<string, MacroDefinition>();
      categoryMacros.forEach(macro => {
        const key = macro.groupId || macro.id;
        if (!uniqueKeys.has(key)) {
          uniqueKeys.set(key, macro);
        }
      });
      
      // Create order from unique keys
      currentOrder = Array.from(uniqueKeys.keys());
    }
    
    // Remove source from current position
    currentOrder = currentOrder.filter(key => key !== sourceKey);
    
    // Find target position
    const targetIndex = currentOrder.indexOf(targetKey);
    if (targetIndex === -1) {
      // Target not found, add to end
      currentOrder.push(sourceKey);
    } else {
      // Insert before or after target based on position
      const insertIndex = target.position === 'before' ? targetIndex : targetIndex + 1;
      currentOrder.splice(insertIndex, 0, sourceKey);
    }
    
    // Update orders state
    const newOrders = { ...macroOrder, [targetCategoryId]: currentOrder };
    setMacroOrder(newOrders);
    localStorage.setItem("macroOrder", JSON.stringify(newOrders));
    
    // Show success message
    addToast({
      title: "Macro Reordered",
      description: `"${sourceMacro.name}" reordered within category`,
      color: "success"
    });
  };

  // Preserve isDraggingActive for backward compatibility
  const isDraggingActive = draggedItem !== null;
  
  // Create a file input ref for import functionality
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Add category handling functions
  const handleAddCategory = () => {
    setEditingCategory(null);
    setNewCategoryName("");
    setSelectedColor("primary");
    setCustomColor("#3b82f6");
    setIsCustomColor(false);
    setCategoryModalOpen(true);
  };

  const renderCategoryColor = (color: string) => {
    // Check if it's a predefined color or custom hex
    const presetColors = [
      "red", "rose", "pink", "fuchsia", "purple",
      "violet", "indigo", "blue", "sky", "cyan",
      "teal", "emerald", "green", "lime", "yellow",
      "amber", "orange", "coral", "salmon", "crimson"
    ];
    const isPresetColor = presetColors.includes(color);
    
    if (isPresetColor) {
      // Use Tailwind CSS classes for preset colors
      const colorMap: Record<string, string> = {
        "red": "bg-red-500",
        "rose": "bg-rose-500", 
        "pink": "bg-pink-500",
        "fuchsia": "bg-fuchsia-500",
        "purple": "bg-purple-500",
        "violet": "bg-violet-500",
        "indigo": "bg-indigo-500",
        "blue": "bg-blue-500",
        "sky": "bg-sky-500",
        "cyan": "bg-cyan-500",
        "teal": "bg-teal-500",
        "emerald": "bg-emerald-500",
        "green": "bg-green-500",
        "lime": "bg-lime-500",
        "yellow": "bg-yellow-500",
        "amber": "bg-amber-500",
        "orange": "bg-orange-500",
        "coral": "bg-orange-400",
        "salmon": "bg-orange-300",
        "crimson": "bg-red-600"
      };
      
      return (
        <div 
          className={`w-6 h-6 rounded-full border-2 border-white shadow-sm ${colorMap[color] || 'bg-gray-500'}`}
        ></div>
      );
    } else {
      // Custom hex color
      return (
        <div 
          className="w-6 h-6 rounded-full border-2 border-white shadow-sm"
          style={{ backgroundColor: color }}
        ></div>
      );
    }
  };

  // Helper function to get category background styles
  const getCategoryBackgroundStyle = (color: string) => {
    const presetColors = [
      "red", "rose", "pink", "fuchsia", "purple",
      "violet", "indigo", "blue", "sky", "cyan",
      "teal", "emerald", "green", "lime", "yellow",
      "amber", "orange", "coral", "salmon", "crimson"
    ];
    const isPresetColor = presetColors.includes(color);
    
    if (isPresetColor) {
      return {
        className: `bg-${color}-50 hover:bg-${color}-100 transition-colors duration-200`,
        style: {}
      };
    } else {
      // For custom hex colors, convert to RGB and apply transparency
      const hexToRgba = (hex: string, alpha: number) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return `rgba(59, 130, 246, ${alpha})`; // fallback to blue
        const r = parseInt(result[1], 16);
        const g = parseInt(result[2], 16);
        const b = parseInt(result[3], 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
      };
      
      return {
        className: 'transition-colors duration-200 custom-category-bg',
        style: {
          backgroundColor: hexToRgba(color, 0.1),
          '--hover-bg': hexToRgba(color, 0.2)
        } as React.CSSProperties
      };
    }
  };

  const handleEditCategory = (category: MacroCategory) => {
    setEditingCategory(category);
    setNewCategoryName(category.name);
    
    // Check if the color is a predefined color or custom
    const presetColors = [
      "red", "rose", "pink", "fuchsia", "purple",
      "violet", "indigo", "blue", "sky", "cyan",
      "teal", "emerald", "green", "lime", "yellow",
      "amber", "orange", "coral", "salmon", "crimson"
    ];
    const isPresetColor = presetColors.includes(category.color);
    
    if (isPresetColor) {
      setSelectedColor(category.color);
      setIsCustomColor(false);
    } else {
      // It's a custom hex color
      setCustomColor(category.color);
      setIsCustomColor(true);
    }
    
    setCategoryModalOpen(true);
  };

  const handleSaveCategory = () => {
    if (!newCategoryName.trim()) return;

    const finalColor = isCustomColor ? customColor : selectedColor;

    let updatedCategories: MacroCategory[];

    if (editingCategory) {
      // Update existing category
      updatedCategories = categories.map(cat => 
        cat.id === editingCategory.id 
          ? { ...cat, name: newCategoryName, color: finalColor }
          : cat
      );
    } else {
      // Create new category
      const newCategory: MacroCategory = {
        id: crypto.randomUUID(),
        name: newCategoryName,
        color: finalColor,
        isExpanded: true
      };
      updatedCategories = [...categories, newCategory];
    }

    setCategories(updatedCategories);
    localStorage.setItem("macroCategories", JSON.stringify(updatedCategories));
    setCategoryModalOpen(false);
    
    // Reset form
    setEditingCategory(null);
    setNewCategoryName("");
    setSelectedColor("primary");
    setCustomColor("#3b82f6");
    setIsCustomColor(false);
    
    // Show success toast
    addToast({
      title: editingCategory ? "Category Updated" : "Category Created",
      description: `Category "${newCategoryName}" has been ${editingCategory ? "updated" : "created"}`,
      color: "success"
    });
  };

  // Add delete macro functionality
  const handleDeleteMacro = (id: string) => {
    console.log(`Starting deletion process for macro ID: ${id}`);
    
    // Find the macro that's being deleted
    const macro = macros.find(m => m.id === id);
    if (!macro) {
      console.error(`Macro with ID ${id} not found for deletion`);
      return;
    }
    
    const isGroup = !!macro.groupId;
    console.log(`Deleting ${isGroup ? 'group' : 'single'} macro: ${macro.name} (ID: ${id})`);
    
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
    const elementId = isGroup ? 
      (macro.groupId ? `macro-${macro.groupId}` : `macro-${id}`) : 
      `macro-${id}`;
    
    console.log(`Trying to find element with ID: ${elementId}`, document.getElementById(elementId) ? "Found" : "Not found");
    
    // Get the display name before we delete everything
    const displayName = isGroup 
      ? macro.name.replace(/ \(.*\)$/, "") // Remove suffix for group macros
      : macro.name;

    // Try to use the animation first, which is purely visual
    useThanosSnap(elementId, () => {
      // After animation completes, update the state and storage
      setMacros(updatedMacros);
      setActiveMacros(newActiveMacros);
      
      // Update localStorage
      localStorage.setItem("midiMacros", JSON.stringify(updatedMacros));
      localStorage.setItem("activeMidiMacros", JSON.stringify([...newActiveMacros]));
      
      // Also update category orders if needed
      if (categoryOrders[macro.categoryId || 'default']) {
        const key = isGroup ? macro.groupId! : macro.id;
        const newOrders = { ...categoryOrders };
        newOrders[macro.categoryId || 'default'] = newOrders[macro.categoryId || 'default'].filter(id => id !== key);
        setCategoryOrders(newOrders);
        saveCategoryOrders(newOrders);
      }
      
      // Show success message
      addToast({
        title: "Macro Deleted",
        description: isGroup 
          ? `${displayName} group with ${deletedMacros.length} actions deleted`
          : `${displayName} deleted`,
        color: "danger"
      });
    });
  };
  
  // Export/Import functions
  const handleExportMacros = () => {
    try {
      // Group macros by groupId for better structure
      const groupedMacros: Record<string, any> = {};
      const standaloneMacros: MacroDefinition[] = [];
      
      macros.forEach(macro => {
        if (macro.groupId) {
          // This is part of a group
          if (!groupedMacros[macro.groupId]) {
            // Initialize group structure
            const firstMacro = macro;
            groupedMacros[macro.groupId] = {
              groupId: macro.groupId,
              category: macro.categoryId || 'default',
              name: firstMacro.name.replace(/ \(.*\)$/, ""), // Remove suffix
              type: 'standard', // Will be determined based on group contents
              beforeActions: firstMacro.beforeActions || [],
              afterActions: firstMacro.afterActions || [],
              timeout: firstMacro.timeout,
              incrementActions: null,
              decrementActions: null,
              clickActions: null
            };
          }
          
          // Add actions based on macro type
          const group = groupedMacros[macro.groupId];
          if (macro.type === 'encoder-increment') {
            group.incrementActions = {
              trigger: macro.trigger,
              actions: macro.actions
            };
            group.type = 'encoder';
          } else if (macro.type === 'encoder-decrement') {
            group.decrementActions = {
              trigger: macro.trigger,
              actions: macro.actions
            };
            group.type = 'encoder';
          } else if (macro.type === 'encoder-click') {
            group.clickActions = {
              trigger: macro.trigger,
              actions: macro.actions
            };
            group.type = 'encoder-click';
          } else {
            // Standard macro - add to actions
            if (!group.actions) group.actions = [];
            group.actions.push({
              trigger: macro.trigger,
              actions: macro.actions
            });
          }
        } else {
          // Standalone macro
          standaloneMacros.push(macro);
        }
      });
      
      // Convert grouped macros to array and add standalone macros
      const exportMacros = [
        ...Object.values(groupedMacros),
        ...standaloneMacros.map(macro => ({
          id: macro.id,
          category: macro.categoryId || 'default',
          name: macro.name,
          type: 'standard',
          trigger: macro.trigger,
          actions: macro.actions,
          beforeActions: macro.beforeActions || [],
          afterActions: macro.afterActions || [],
          timeout: macro.timeout
        }))
      ];
      
      // Prepare data to export with new structure
      const exportData = {
        macros: exportMacros,
        categories: categories,
        activeMacros: [...activeMacros],
        categoryOrders: categoryOrders,
        version: "1.1", // Updated version for new structure
        exportDate: new Date().toISOString(),
        totalGroups: Object.keys(groupedMacros).length,
        totalStandalone: standaloneMacros.length
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
      
      // Count total macro entities (groups and standalone macros)
      const totalMacroEntities = Object.keys(groupedMacros).length + standaloneMacros.length;
      
      addToast({
        title: "Export Successful",
        description: `Exported ${totalMacroEntities} macro${totalMacroEntities !== 1 ? 's' : ''}`,
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
  
  // Handle the import button click
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle file input change for import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        // Validate the data structure
        if (!data || typeof data !== 'object' || !Array.isArray(data.macros)) {
          throw new Error("Invalid import data format");
        }
        
        // Show import preference modal instead of directly importing
        setImportPreferenceModal({
          isOpen: true,
          importData: data,
          fileName: file.name
        });
        
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
  
  // Handle import as-is (original behavior)
  const handleImportAsIs = () => {
    if (importPreferenceModal.importData) {
      handleImportMacros(importPreferenceModal.importData);
      setImportPreferenceModal({ isOpen: false, importData: null, fileName: "" });
    }
  };
  
  // Handle import with MIDI redefinition
  const handleImportWithRedefinition = () => {
    if (importPreferenceModal.importData) {
      const data = importPreferenceModal.importData;
      
      // Process ALL macros - both grouped and standard macros need MIDI redefinition
      // This ensures we don't skip any macros that need new MIDI triggers
      const macrosToProcess = data.macros;
      
      console.log('Import with redefinition - macros to process:', macrosToProcess);
      console.log('Total macros in import:', data.macros.length);
      console.log('All macros will be processed for MIDI redefinition');
      
      if (macrosToProcess.length === 0) {
        // No macros to process
        console.log('No macros found, importing as-is');
        handleImportMacros(data);
        setImportPreferenceModal({ isOpen: false, importData: null, fileName: "" });
        return;
      }
      
      // Start MIDI redefinition process
      console.log('Starting MIDI redefinition for', macrosToProcess.length, 'macros');
      setMidiRedefinitionModal({
        isOpen: true,
        currentMacro: macrosToProcess[0],
        macroIndex: 0,
        totalMacros: macrosToProcess.length,
        importData: data,
        redefinedMacros: [],
        incrementTrigger: null,
        decrementTrigger: null,
        clickTrigger: null,
        lastProcessedTimestamp: Date.now(),
        autoAdvanceToNextGroup: localStorage.getItem('autoAdvanceToNextGroup') === 'true',
        stopListeningCounter: 0
      });
      
      setImportPreferenceModal({ isOpen: false, importData: null, fileName: "" });
    }
  };
  
  // Handle MIDI trigger updates during redefinition
  const handleMidiTriggerUpdate = (type: 'increment' | 'decrement' | 'click', trigger: MacroDefinition['trigger'] | null) => {
    if (!trigger) return; // Don't process null triggers
    
    console.log(`MIDI trigger detected for ${type}:`, trigger);
    
    setMidiRedefinitionModal(prev => {
      const updated = {
        ...prev,
        [type === 'increment' ? 'incrementTrigger' : type === 'decrement' ? 'decrementTrigger' : 'clickTrigger']: trigger,
        lastProcessedTimestamp: Date.now() // Update timestamp to prevent reprocessing
      };
      
      // Determine which triggers are required based on what's actually shown in the UI
      const currentMacro = prev.currentMacro; // Use prev.currentMacro instead of midiRedefinitionModal.currentMacro
      
      // Check what trigger UI components are actually rendered
      const showsIncrement = true; // Increment is always shown
      const showsDecrement = !!(currentMacro?.decrementActions); // Decrement shown if decrementActions exist
      const showsClick = !!(currentMacro?.clickActions); // Click shown if clickActions exist
      
      // For debugging: let's also check the old logic for comparison
      const isEncoderMacro = currentMacro?.type?.includes('encoder');
      const needsDecrement = isEncoderMacro && currentMacro?.decrementActions && currentMacro.decrementActions.length > 0;
      const needsClick = isEncoderMacro && currentMacro?.clickActions && currentMacro.clickActions.length > 0;
      
      console.log('Macro analysis:', {
        macroName: currentMacro?.name,
        macroType: currentMacro?.type,
        isEncoderMacro,
        hasIncrementActions: !!currentMacro?.incrementActions,
        hasDecrementActions: !!currentMacro?.decrementActions,
        hasClickActions: !!currentMacro?.clickActions,
        showsIncrement,
        showsDecrement,
        showsClick,
        oldLogic: { needsDecrement, needsClick }
      });
      
      // Check if all required triggers are detected BEFORE this update (using UI-based logic)
      const hadIncrementBefore = prev.incrementTrigger !== null;
      const hadDecrementBefore = !showsDecrement || prev.decrementTrigger !== null;
      const hadClickBefore = !showsClick || prev.clickTrigger !== null;
      const hadAllRequiredTriggersBefore = hadIncrementBefore && hadDecrementBefore && hadClickBefore;
      
      // Check if all required triggers are detected AFTER this update (using UI-based logic)
      const hasIncrement = updated.incrementTrigger !== null;
      const hasDecrement = !showsDecrement || updated.decrementTrigger !== null;
      const hasClick = !showsClick || updated.clickTrigger !== null;
      const hasAllRequiredTriggers = hasIncrement && hasDecrement && hasClick;
      
      console.log('Trigger requirements for macro:', currentMacro?.name, {
        isEncoderMacro,
        needsDecrement,
        needsClick,
        type: currentMacro?.type
      });
      console.log('Triggers before update:', {
        increment: prev.incrementTrigger,
        decrement: prev.decrementTrigger,
        click: prev.clickTrigger,
        hadAllBefore: hadAllRequiredTriggersBefore
      });
      console.log('Triggers after update:', {
        increment: updated.incrementTrigger,
        decrement: updated.decrementTrigger,
        click: updated.clickTrigger,
        hasAllAfter: hasAllRequiredTriggers
      });
      
      // Auto-advance only if:
      // 1. Checkbox is checked
      // 2. All required triggers are NOW set (after this update)
      // 3. NOT all triggers were set before this update (this is the completing trigger)
      if (hasAllRequiredTriggers && !hadAllRequiredTriggersBefore && updated.autoAdvanceToNextGroup) {
        console.log(`Auto-advancing to next macro - ${type} trigger was the last required trigger`);
        
        // Save current macro with redefined triggers
        const redefinedMacro = {
          ...updated.currentMacro,
          incrementTrigger: updated.incrementTrigger,
          decrementTrigger: updated.decrementTrigger,
          clickTrigger: updated.clickTrigger
        };
        
        const updatedRedefinedMacros = [...updated.redefinedMacros, redefinedMacro];
        
        if (updated.macroIndex + 1 >= updated.totalMacros) {
          // All macros processed, show summary modal
          setTimeout(() => {
            const duplicates = detectDuplicates(updated.importData.macros, updatedRedefinedMacros);
            
            // Default: skip all duplicates (safer default)
            const skipDuplicates = new Set(
              duplicates.map(d => d.importedMacro.groupId || d.importedMacro.name)
            );
            
            setImportSummaryModal({
              isOpen: true,
              importData: updated.importData,
              redefinedMacros: updatedRedefinedMacros,
              duplicates,
              skipDuplicates
            });
            
            // Close the redefinition modal
            setMidiRedefinitionModal({
              isOpen: false,
              currentMacro: null,
              macroIndex: 0,
              totalMacros: 0,
              importData: null,
              redefinedMacros: [],
              incrementTrigger: null,
              decrementTrigger: null,
              clickTrigger: null,
              lastProcessedTimestamp: 0,
              autoAdvanceToNextGroup: false,
              stopListeningCounter: 0
            });
          }, 50);
          
          // Return current state with cleared triggers
          return {
            ...updated,
            incrementTrigger: null,
            decrementTrigger: null,
            clickTrigger: null,
            lastProcessedTimestamp: Date.now()
          };
        } else {
          // Move to next macro in the same state update to prevent flash
          const nextIndex = updated.macroIndex + 1;
          const nextMacro = updated.importData.macros[nextIndex];
          
          return {
            ...updated,
            currentMacro: nextMacro,
            macroIndex: nextIndex,
            redefinedMacros: updatedRedefinedMacros,
            incrementTrigger: null,
            decrementTrigger: null,
            clickTrigger: null,
            lastProcessedTimestamp: Date.now()
          };
        }
      } else {
        console.log('Not auto-advancing because:', {
          hasAllRequiredTriggers,
          hadAllRequiredTriggersBefore,
          autoAdvanceEnabled: updated.autoAdvanceToNextGroup,
          shouldAdvance: hasAllRequiredTriggers && !hadAllRequiredTriggersBefore && updated.autoAdvanceToNextGroup
        });
      }
      
      return updated;
    });
  };
  
  // Function to detect duplicate macros by name and groupId
  const detectDuplicates = (importedMacros: any[], redefinedMacros: any[]) => {
    const existingMacros = JSON.parse(localStorage.getItem("midiMacros") || "[]");
    const duplicates: { originalId: string; importedMacro: any; }[] = [];
    
    // Only check macros that were actually processed (in redefinedMacros)
    // Find the corresponding original macro for each redefined macro
    redefinedMacros.forEach(redefinedMacro => {
      // Find the original macro from importedMacros that corresponds to this redefinedMacro
      const originalMacro = importedMacros.find(macro => {
        if (redefinedMacro.groupId && macro.groupId) {
          return redefinedMacro.groupId === macro.groupId;
        } else {
          return redefinedMacro.name === macro.name;
        }
      });
      
      if (!originalMacro) return; // Skip if no corresponding original macro found
      
      // Check for duplicates by name and groupId (for encoder macros) or just name (for standard macros)
      const isDuplicate = existingMacros.some((existing: any) => {
        if (originalMacro.groupId) {
          // For encoder macros, check groupId
          return existing.groupId === originalMacro.groupId;
        } else {
          // For standard macros, check name
          return existing.name === originalMacro.name;
        }
      });
      
      if (isDuplicate) {
        const existingMacro = existingMacros.find((existing: any) => {
          if (originalMacro.groupId) {
            return existing.groupId === originalMacro.groupId;
          } else {
            return existing.name === originalMacro.name;
          }
        });
        
        duplicates.push({
          originalId: existingMacro.id,
          importedMacro: originalMacro
        });
      }
    });
    
    return duplicates;
  };

  // Handle next macro in redefinition process
  const handleNextMacro = () => {
    const current = midiRedefinitionModal;
    
    // Save current macro with redefined triggers (even if some are missing)
    const redefinedMacro = {
      ...current.currentMacro,
      incrementTrigger: current.incrementTrigger,
      decrementTrigger: current.decrementTrigger,
      clickTrigger: current.clickTrigger
    };
    
    const updatedRedefinedMacros = [...current.redefinedMacros, redefinedMacro];
    
    if (current.macroIndex + 1 >= current.totalMacros) {
      // All macros processed, show summary modal
      const duplicates = detectDuplicates(current.importData.macros, updatedRedefinedMacros);
      
      // Default: skip all duplicates (safer default)
      const skipDuplicates = new Set(
        duplicates.map(d => d.importedMacro.groupId || d.importedMacro.name)
      );
      
      setImportSummaryModal({
        isOpen: true,
        importData: current.importData,
        redefinedMacros: updatedRedefinedMacros,
        duplicates,
        skipDuplicates
      });
      
      // Close the redefinition modal
      setMidiRedefinitionModal({
        isOpen: false,
        currentMacro: null,
        macroIndex: 0,
        totalMacros: 0,
        importData: null,
        redefinedMacros: [],
        incrementTrigger: null,
        decrementTrigger: null,
        clickTrigger: null,
        lastProcessedTimestamp: 0,
        autoAdvanceToNextGroup: false,
        stopListeningCounter: 0
      });
    } else {
      // Move to next macro
      const nextIndex = current.macroIndex + 1;
      const nextMacro = current.importData.macros[nextIndex]; // Get next macro by index, not filtered
      
      setMidiRedefinitionModal({
        ...current,
        currentMacro: nextMacro,
        macroIndex: nextIndex,
        redefinedMacros: updatedRedefinedMacros,
        incrementTrigger: null,
        decrementTrigger: null,
        clickTrigger: null,
        lastProcessedTimestamp: Date.now() // Reset timestamp when moving to next macro
      });
    }
  };
  
  // Handle skipping current macro
  const handleSkipMacro = () => {
    const current = midiRedefinitionModal;
    
    if (current.macroIndex + 1 >= current.totalMacros) {
      // All macros processed, show summary modal (but exclude the skipped macro)
      // Don't add the current skipped macro to redefinedMacros - just use existing ones
      const updatedRedefinedMacros = current.redefinedMacros; // Don't include the skipped macro
      
      const duplicates = detectDuplicates(current.importData.macros, updatedRedefinedMacros);
      
      // Default: skip all duplicates (safer default)
      const skipDuplicates = new Set(
        duplicates.map(d => d.importedMacro.groupId || d.importedMacro.name)
      );
      
      setImportSummaryModal({
        isOpen: true,
        importData: current.importData,
        redefinedMacros: updatedRedefinedMacros,
        duplicates,
        skipDuplicates
      });
      
      // Close the redefinition modal
      setMidiRedefinitionModal({
        isOpen: false,
        currentMacro: null,
        macroIndex: 0,
        totalMacros: 0,
        importData: null,
        redefinedMacros: [],
        incrementTrigger: null,
        decrementTrigger: null,
        clickTrigger: null,
        lastProcessedTimestamp: 0,
        autoAdvanceToNextGroup: false,
        stopListeningCounter: 0
      });
    } else {
      // Move to next macro (don't add the skipped macro to redefinedMacros)
      const nextIndex = current.macroIndex + 1;
      const nextMacro = current.importData.macros[nextIndex]; // Get next macro by index, not filtered
      
      setMidiRedefinitionModal({
        ...current,
        currentMacro: nextMacro,
        macroIndex: nextIndex,
        // Keep redefinedMacros as is - don't add the skipped macro
        incrementTrigger: null,
        decrementTrigger: null,
        clickTrigger: null,
        lastProcessedTimestamp: Date.now() // Reset timestamp when moving to next macro
      });
    }
  };
  
  // Add import function
  const handleImportMacros = (data: any) => {
    try {
      if (!data || typeof data !== 'object') {
        throw new Error("Invalid import data format");
      }
      
      // Validate the data structure
      if (!Array.isArray(data.macros)) {
        throw new Error("Import data does not contain macros array");
      }
      
      // Convert imported data back to the internal format
      const convertedMacros: MacroDefinition[] = [];
      
      data.macros.forEach((importedMacro: any) => {
        if (importedMacro.groupId) {
          // This is a grouped macro - convert back to individual macros
          const groupId = importedMacro.groupId;
          
                // Convert increment actions
      if (importedMacro.incrementActions) {
        convertedMacros.push({
          id: crypto.randomUUID(),
          name: `${importedMacro.name} (Increment)`,
          type: 'encoder-increment',
          groupId: groupId,
          categoryId: importedMacro.category,
          trigger: importedMacro.incrementTrigger || importedMacro.incrementActions.trigger,
          actions: importedMacro.incrementActions.actions,
          beforeActions: importedMacro.beforeActions,
          afterActions: importedMacro.afterActions,
          timeout: importedMacro.timeout,
          createdAt: new Date().toISOString()
        });
      }
      
      // Convert decrement actions
      if (importedMacro.decrementActions) {
        convertedMacros.push({
          id: crypto.randomUUID(),
          name: `${importedMacro.name} (Decrement)`,
          type: 'encoder-decrement',
          groupId: groupId,
          categoryId: importedMacro.category,
          trigger: importedMacro.decrementTrigger || importedMacro.decrementActions.trigger,
          actions: importedMacro.decrementActions.actions,
          beforeActions: importedMacro.beforeActions,
          afterActions: importedMacro.afterActions,
          timeout: importedMacro.timeout,
          createdAt: new Date().toISOString()
        });
      }
      
      // Convert click actions
      if (importedMacro.clickActions) {
        convertedMacros.push({
          id: crypto.randomUUID(),
          name: `${importedMacro.name} (Click)`,
          type: 'encoder-click',
          groupId: groupId,
          categoryId: importedMacro.category,
          trigger: importedMacro.clickTrigger || importedMacro.clickActions.trigger,
          actions: importedMacro.clickActions.actions,
          beforeActions: importedMacro.beforeActions,
          afterActions: importedMacro.afterActions,
          timeout: importedMacro.timeout,
          createdAt: new Date().toISOString()
        });
      }
          
          // Convert standard actions (if any)
          if (importedMacro.actions && Array.isArray(importedMacro.actions)) {
            importedMacro.actions.forEach((actionGroup: any, index: number) => {
              convertedMacros.push({
                id: crypto.randomUUID(),
                name: `${importedMacro.name} (Action ${index + 1})`,
                type: 'standard',
                groupId: groupId,
                categoryId: importedMacro.category,
                trigger: actionGroup.trigger,
                actions: actionGroup.actions,
                beforeActions: importedMacro.beforeActions,
                afterActions: importedMacro.afterActions,
                timeout: importedMacro.timeout,
                createdAt: new Date().toISOString()
              });
            });
          }
        } else {
          // This is a standalone macro
          convertedMacros.push({
            id: importedMacro.id || crypto.randomUUID(),
            name: importedMacro.name,
            type: importedMacro.type || 'standard',
            categoryId: importedMacro.category,
            trigger: importedMacro.trigger || importedMacro.incrementTrigger,
            actions: importedMacro.actions,
            beforeActions: importedMacro.beforeActions || [],
            afterActions: importedMacro.afterActions || [],
            timeout: importedMacro.timeout,
            createdAt: new Date().toISOString()
          });
        }
      });
      
      // Create maps for duplicate detection - check both individual IDs and group IDs
      const existingMacroIds = new Set(macros.map(m => m.id));
      const existingGroupIds = new Set(macros.filter(m => m.groupId).map(m => m.groupId));
      
      // Count skipped macros and filter out duplicates
      const skippedMacros: MacroDefinition[] = [];
      const newMacros: MacroDefinition[] = [];
      
      convertedMacros.forEach(macro => {
        if (macro.groupId) {
          // This is a grouped macro - check if the group already exists
          if (existingGroupIds.has(macro.groupId)) {
            skippedMacros.push(macro);
          } else {
            newMacros.push(macro);
          }
        } else {
          // This is a standalone macro - check if the individual macro already exists
          if (existingMacroIds.has(macro.id)) {
            skippedMacros.push(macro);
          } else {
            newMacros.push(macro);
          }
        }
      });
      
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
      
      // Import category orders if they exist
      if (data.categoryOrders && typeof data.categoryOrders === 'object') {
        const newOrders = { ...categoryOrders, ...data.categoryOrders };
        setCategoryOrders(newOrders);
        saveCategoryOrders(newOrders);
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
      
      // Count unique macro entities (groups and standalone macros)
      const uniqueMacros = new Set<string>();
      
      newMacros.forEach(macro => {
        if (macro.groupId) {
          uniqueMacros.add(macro.groupId);
        } else {
          uniqueMacros.add(macro.id);
        }
      });
      
      const totalMacroEntities = uniqueMacros.size;
      
      // Create appropriate success message based on how many were imported vs. skipped
      let successMessage = `Imported ${totalMacroEntities} new macro${totalMacroEntities !== 1 ? 's' : ''}`;
      
      if (skippedMacros.length > 0) {
        // Count unique skipped entities for better messaging
        const uniqueSkipped = new Set<string>();
        skippedMacros.forEach(macro => {
          if (macro.groupId) {
            uniqueSkipped.add(macro.groupId);
          } else {
            uniqueSkipped.add(macro.id);
          }
        });
        
        successMessage += `, skipped ${uniqueSkipped.size} existing macro${uniqueSkipped.size !== 1 ? 's' : ''}`;
      }
      
      addToast({
        title: "Import Successful",
        description: successMessage,
        color: "success"
      });
    } catch (err) {
      console.error("Error importing macros:", err);
      addToast({
        title: "Import Failed",
        description: "Failed to import macros: " + (err as Error).message,
        color: "danger"
      });
    }
  };
  
  // Get context menu items based on context
  const getContextMenuItems = useCallback((): ContextMenuItem[] => {
    if (contextMenu.macro) {
      // Macro-specific context menu
      const macro = contextMenu.macro;
      return [
        {
          key: 'edit',
          label: 'Edit Macro',
          description: 'Edit this macro',
          icon: 'lucide:edit',
          color: 'primary' as const,
          onPress: () => {
            onEditMacro(macro);
            closeContextMenu();
          }
        },
        {
          key: 'delete',
          label: 'Delete Macro',
          description: 'Delete this macro',
          icon: 'lucide:trash-2',
          color: 'danger' as const,
          onPress: () => {
            setDeletePopoverOpen(macro.id);
            closeContextMenu();
          }
        },
        ...(onCreateTemplate ? [{
          key: 'template',
          label: 'Create Template',
          description: 'Create a template from this macro',
          icon: 'lucide:copy-plus',
          color: 'secondary' as const,
          onPress: () => {
            onCreateTemplate(macro);
            closeContextMenu();
          }
        }] : []),
        {
          key: 'category',
          label: 'Change Category',
          description: 'Move this macro to a different category',
          icon: 'lucide:folder',
          color: 'warning' as const,
          onPress: () => {
            handleAssignCategory(macro);
            closeContextMenu();
          }
        }
      ];
    } else {
      // Page-level context menu
      return [
        {
          key: 'add-category',
          label: 'Add Category',
          description: 'Create a new category',
          icon: 'lucide:folder-plus',
          color: 'primary' as const,
          onPress: () => {
            setShowCategoryManager(true);
            closeContextMenu();
          }
        },
        {
          key: 'import',
          label: 'Import Macros',
          description: 'Import macros from a file',
          icon: 'lucide:upload',
          color: 'secondary' as const,
          onPress: () => {
            handleImportClick();
            closeContextMenu();
          }
        },
        {
          key: 'export',
          label: 'Export Macros',
          description: 'Export all your macros',
          icon: 'lucide:download',
          color: 'primary' as const,
          onPress: () => {
            handleExportMacros();
            closeContextMenu();
          }
        }
      ];
    }
  }, [contextMenu.macro, closeContextMenu, onEditMacro, onCreateTemplate, handleImportClick, handleExportMacros]);


  if (macros.length === 0) {
    return (
      <div className="" onContextMenu={(e) => handleContextMenu(e)}>
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
              <p className="text-foreground-500 text-sm mt-1">{displayedMacroCount} {displayedMacroCount === 1 ? "macro" : "macros"}</p>
          </div>
          
          <div className="flex gap-2">
          <Button 
                  className="rounded-full font-medium"
                  color="primary"
                  variant="solid"
                  startContent={<Icon icon="lucide:plus" />}
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
          const categoryMacros = macrosByCategory.result[category.id] || [];
          
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
            <div key={category.id} id={`category-${category.id}`} className=" rounded-lg overflow-hidden border border-default-200 backdrop-blur-sm shadow-sm">
              {/* Category header - simplified drag target */}
              <div 
                  className={`category-header z-30 relative flex justify-between items-center p-4 ${getCategoryBackgroundStyle(category.color).className} ${
                    dropTarget?.id === category.id && dropTarget?.type === 'category' ? 'drop-target' : ''
                  }`}
                  style={getCategoryBackgroundStyle(category.color).style}
                  onDragOver={(e) => handleDragOver(e, {
                    id: category.id,
                    type: 'category',
                    category: category.id
                  })}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, {
                    id: category.id,
                    type: 'category',
                    category: category.id
                  })}
                data-category-id={category.id}
              >
                <div 
                  className="flex-1 flex items-center gap-2 cursor-pointer"
                  onClick={() => toggleCategoryExpanded(category.id)}
                >
                  {renderCategoryColor(category.color)}
                  <h3 className="font-medium">{category.name}</h3>
                  <Chip size="sm" variant="flat" color={category.color as any}>
                    {macrosByCategory.counts[category.id]} macro{macrosByCategory.counts[category.id] !== 1 ? "s" : ""}
                  </Chip>
                </div>
                <div className="flex items-center gap-2">
                  {categoryLoadingStates.has(category.id) ? (
                    <div className="mr-1 w-8 h-5 flex items-center justify-center">
                      <Icon icon="lucide:loader-2" className="text-primary animate-spin text-sm" />
                    </div>
                  ) : (
                  <Switch
                    size="sm"
                    isSelected={isCategoryActive(category.id)}
                    onValueChange={(isSelected) => handleToggleCategory(category.id, isSelected)}
                    className="mr-1"
                  />
                  )}
                  
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
                          {/* Delete confirmation content */}
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
                  {(() => {
                    // Create grouped macros for this specific category
                    const groupedCategoryMacros: Record<string, MacroDefinition[]> = {};
                    
                    // Group the macros by their groupId or individual ID
                    categoryMacros.forEach(macro => {
                      const key = macro.groupId || macro.id;
                      if (!groupedCategoryMacros[key]) {
                        groupedCategoryMacros[key] = [];
                      }
                      groupedCategoryMacros[key].push(macro);
                    });

                    return Object.values(groupedCategoryMacros).length === 0 ? (
                      <div className="text-center p-5 flex flex-col items-center justify-center">
                        <div className="bg-primary/5 p-4 rounded-full mb-3">
                          <Icon icon="lucide:box" className="text-2xl text-foreground-400" />
                        </div>
                        <p className="text-sm text-foreground-400">No macros in this category yet</p>
                        <p className="text-xs text-foreground-300 mt-1">Drag macros here to add them to this category</p>
                        
                        {/* Add drop zone for empty category */}
                        <MacroDropZone
                          categoryId={category.id}
                          beforeId={null}
                          afterId={null}
                          onDragOver={(e) => handleDragOverDropZone(e, category.id, null, null)}
                          onDragLeave={handleDragLeaveDropZone}
                          onDrop={(e) => handleDropOnZone(e, category.id, null, null)}
                        />
                      </div>
                    ) : (
                      <div className="draggable-list-container">
                        {/* Process macros for each category - prepare data for draggable list */}
                        {(() => {
                          // Prepare data for the draggable list by organizing groups
                          const processedMacros: ExtendedMacroDefinition[] = [];
                          
                          // Group the macros by their groupId and promote the first in each group to be the root
                          const groupMap = new Map<string, MacroDefinition[]>();
                          
                          Object.values(groupedCategoryMacros).forEach((group: MacroDefinition[]) => {
                            if (group.length === 1) {
                              // Single macro - add directly
                              processedMacros.push(group[0] as ExtendedMacroDefinition);
                            } else {
                              // Group macros
                              const groupId = group[0].groupId;
                              if (groupId && !groupMap.has(groupId)) {
                                // First of group - make it the root
                                const rootMacro = { ...group[0], isGroupRoot: true } as ExtendedMacroDefinition;
                                rootMacro.groupItems = group;
                                processedMacros.push(rootMacro);
                                groupMap.set(groupId, group);
                              }
                            }
                          });
                          
                          // Get the current order for this category
                          const currentOrder = macroOrder[category.id] || [];
                          
                          // Sort processedMacros according to the order if it exists
                          if (currentOrder.length > 0) {
                            processedMacros.sort((a, b) => {
                              const aKey = a.groupId || a.id;
                              const bKey = b.groupId || b.id;
                              const aIndex = currentOrder.indexOf(aKey);
                              const bIndex = currentOrder.indexOf(bKey);
                              if (aIndex === -1 && bIndex === -1) return 0;
                              if (aIndex === -1) return 1;
                              if (bIndex === -1) return -1;
                              return aIndex - bIndex;
                            });
                          }
                          
                          return (
                            <Reorder.Group
                              axis="y"
                              values={processedMacros}
                              onReorder={(newList) => {
                                // Save the new order to state and localStorage
                                const newOrder = newList.map(macro => macro.groupId || macro.id);
                                const updatedOrder = { ...macroOrder, [category.id]: newOrder };
                                setMacroOrder(updatedOrder);
                                localStorage.setItem("macroOrder", JSON.stringify(updatedOrder));
                              }}
                              className="space-y-2"
                            >
                              {processedMacros.map((macro) => (
                                <Reorder.Item
                                  key={macro.groupId || macro.id}
                                  value={macro}
                                  className="cursor-move"
                                >
                                  <MacroItem
                                    macro={macro}
                                    activeMacros={activeMacros}
                                    onToggleMacro={handleToggleMacro}
                                    onEditMacro={onEditMacro}
                                    onCreateTemplate={onCreateTemplate}
                                    onDeleteMacro={handleDeleteMacro}
                                    handleAssignCategory={handleAssignCategory}
                                    getTriggerDescription={getTriggerDescription}
                                    getActionSummary={getActionSummary}
                                    getChipColor={getChipColor}
                                    getActionTypeDisplayName={getActionTypeDisplayName}
                                    getDetailedActionInfo={getDetailedActionInfo}
                                    deletePopoverOpen={deletePopoverOpen}
                                    setDeletePopoverOpen={setDeletePopoverOpen}
                                    handleContextMenu={handleContextMenu}
                                  />
                                </Reorder.Item>
                              ))}
                            </Reorder.Group>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
  }

  return (
    <div className={` ${isDraggingActive ? 'dragging-active' : ''}`} onContextMenu={(e) => handleContextMenu(e)}>
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
            <p className="text-foreground-500 text-sm mt-1">{displayedMacroCount} {displayedMacroCount === 1 ? "macro" : "macros"}</p>
          </div>
          
          <div className="flex gap-2">
                                    <Button
                  className="rounded-full font-medium"
                                    color="primary"
                  variant="solid"
                  startContent={<Icon icon="lucide:plus" />}
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
          const categoryMacros = macrosByCategory.result[category.id] || [];
          
                        return (
            <div key={category.id} id={`category-${category.id}`} className="rounded-lg overflow-hidden border border-default-200 backdrop-blur-sm shadow-sm transition-all duration-500 ease-in-out">
              {/* Category header - simplified drag target */}
              <div 
                className={`category-header flex justify-between items-center p-4 ${getCategoryBackgroundStyle(category.color).className} ${
                  dropTarget?.id === category.id && dropTarget?.type === 'category' ? 'drop-target' : ''
                }`}
                style={getCategoryBackgroundStyle(category.color).style}
                onDragOver={(e) => handleDragOver(e, {
                  id: category.id,
                  type: 'category',
                  category: category.id
                })}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, {
                  id: category.id,
                  type: 'category',
                  category: category.id
                })}
                onContextMenu={(e) => handleContextMenu(e)}
                data-category-id={category.id}
              >
                <div 
                  className="flex-1 flex items-center gap-2 cursor-pointer"
                  onClick={() => toggleCategoryExpanded(category.id)}
                >
                  {renderCategoryColor(category.color)}
                  <h3 className="font-medium">{category.name}</h3>
                  <Chip size="sm" variant="flat" color={category.color as any}>
                    {macrosByCategory.counts[category.id]} macro{macrosByCategory.counts[category.id] !== 1 ? "s" : ""}
                                    </Chip>
                                </div>
                <div className="flex items-center gap-2">
                                                {categoryLoadingStates.has(category.id) ? (
                  <div className="mr-1 w-8 h-5 flex items-center justify-center">
                    <Icon icon="lucide:loader-2" className="text-primary animate-spin text-sm" />
                  </div>
                ) : (
                                <Switch
                                  size="sm"
                    isSelected={isCategoryActive(category.id)}
                    onValueChange={(isSelected) => handleToggleCategory(category.id, isSelected)}
                    className="mr-1"
                                />
                )}
                  
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
                      <Icon icon="lucide:edit" className="text-primary" />
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
                        {/* Delete confirmation content */}
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
                  {(() => {
                    // Create grouped macros for this specific category
                    const groupedCategoryMacros: Record<string, MacroDefinition[]> = {};
                    
                    // Group the macros by their groupId or individual ID
                    categoryMacros.forEach(macro => {
                      const key = macro.groupId || macro.id;
                      if (!groupedCategoryMacros[key]) {
                        groupedCategoryMacros[key] = [];
                      }
                      groupedCategoryMacros[key].push(macro);
                    });

                    return Object.values(groupedCategoryMacros).length === 0 ? (
                      <div className="text-center p-5 flex flex-col items-center justify-center">
                        <div className="bg-primary/5 p-4 rounded-full mb-3">
                          <Icon icon="lucide:box" className="text-2xl text-foreground-400" />
                        </div>
                        <p className="text-sm text-foreground-400">No macros in this category yet</p>
                        <p className="text-xs text-foreground-300 mt-1">Drag macros here to add them to this category</p>
                        
                        {/* Add drop zone for empty category */}
                        <MacroDropZone
                          categoryId={category.id}
                          beforeId={null}
                          afterId={null}
                          onDragOver={(e) => handleDragOverDropZone(e, category.id, null, null)}
                          onDragLeave={handleDragLeaveDropZone}
                          onDrop={(e) => handleDropOnZone(e, category.id, null, null)}
                        />
                      </div>
                    ) : (
                      <div className="draggable-list-container">
                        {/* Process macros for each category - prepare data for draggable list */}
                        {(() => {
                          // Prepare data for the draggable list by organizing groups
                          const processedMacros: ExtendedMacroDefinition[] = [];
                          
                          // Group the macros by their groupId and promote the first in each group to be the root
                          const groupMap = new Map<string, MacroDefinition[]>();
                          
                          Object.values(groupedCategoryMacros).forEach((group: MacroDefinition[]) => {
                            if (group.length === 1) {
                              // Single macro - add directly
                              processedMacros.push(group[0] as ExtendedMacroDefinition);
                            } else {
                              // Group macros
                              const groupId = group[0].groupId;
                              if (groupId && !groupMap.has(groupId)) {
                                // First of group - make it the root
                                const rootMacro = { ...group[0], isGroupRoot: true } as ExtendedMacroDefinition;
                                rootMacro.groupItems = group;
                                processedMacros.push(rootMacro);
                                groupMap.set(groupId, group);
                              }
                            }
                          });
                          
                          // Get the current order for this category
                          const currentOrder = macroOrder[category.id] || [];
                          
                          // Sort processedMacros according to the order if it exists
                          if (currentOrder.length > 0) {
                            processedMacros.sort((a, b) => {
                              const aKey = a.groupId || a.id;
                              const bKey = b.groupId || b.id;
                              const aIndex = currentOrder.indexOf(aKey);
                              const bIndex = currentOrder.indexOf(bKey);
                              if (aIndex === -1 && bIndex === -1) return 0;
                              if (aIndex === -1) return 1;
                              if (bIndex === -1) return -1;
                              return aIndex - bIndex;
                            });
                          }
                          
                          return (
                            <Reorder.Group
                              axis="y"
                              values={processedMacros}
                              onReorder={(newList) => {
                                // Save the new order to state and localStorage
                                const newOrder = newList.map(macro => macro.groupId || macro.id);
                                const updatedOrder = { ...macroOrder, [category.id]: newOrder };
                                setMacroOrder(updatedOrder);
                                localStorage.setItem("macroOrder", JSON.stringify(updatedOrder));
                              }}
                              className="space-y-2"
                            >
                              {processedMacros.map((macro) => (
                                <Reorder.Item
                                  key={macro.groupId || macro.id}
                                  value={macro}
                                  className="cursor-move"
                                >
                                  <MacroItem
                                    macro={macro}
                                    activeMacros={activeMacros}
                                    onToggleMacro={handleToggleMacro}
                                    onEditMacro={onEditMacro}
                                    onCreateTemplate={onCreateTemplate}
                                    onDeleteMacro={handleDeleteMacro}
                                    handleAssignCategory={handleAssignCategory}
                                    getTriggerDescription={getTriggerDescription}
                                    getActionSummary={getActionSummary}
                                    getChipColor={getChipColor}
                                    getActionTypeDisplayName={getActionTypeDisplayName}
                                    getDetailedActionInfo={getDetailedActionInfo}
                                    deletePopoverOpen={deletePopoverOpen}
                                    setDeletePopoverOpen={setDeletePopoverOpen}
                                    handleContextMenu={handleContextMenu}
                                  />
                                </Reorder.Item>
                              ))}
                            </Reorder.Group>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* Conflict Resolution Modal */}
      <Modal isOpen={conflictModal.isOpen} onClose={() => setConflictModal(prev => ({ ...prev, isOpen: false }))}>
        <ModalContent>
          <ModalHeader>
            {conflictModal.isInternalConflict 
              ? "Internal Category Conflicts"
              : conflictModal.isCategoryActivation 
                ? "Category Activation Conflict" 
                : "MIDI Trigger Conflict"
            }
          </ModalHeader>
          <ModalBody>
            <div className="space-y-4">
              <div className="p-3 border border-warning-200 bg-warning-50 rounded-md">
                <div className="flex items-start gap-3">
                  <Icon icon="lucide:alert-triangle" className="text-warning text-xl mt-0.5" />
                  <div>
                    <p className="font-medium">
                      {conflictModal.isInternalConflict 
                        ? `Multiple macros in "${conflictModal.categoryName}" category have the same MIDI trigger:`
                        : conflictModal.isCategoryActivation 
                          ? `Macros in "${conflictModal.categoryName}" category conflict with active macros from other categories:`
                          : conflictModal.macroName
                            ? `"${conflictModal.macroName}" from "${conflictModal.categoryName}" conflicts with active macro(s) from other categories:`
                            : "The macro you're trying to activate conflicts with existing active macro(s):"
                      }
                    </p>
                    <ul className="mt-2 list-disc list-inside text-sm">
                      {conflictModal.conflictingMacros.map(m => {
                        const conflictingCategory = categories.find(c => c.id === (m.categoryId || "default"))?.name || "General";
                        return (
                          <li key={m.id}>
                            {m.name} {!conflictModal.isInternalConflict && (
                              <span className="text-foreground-400">({conflictingCategory})</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
              
              {conflictModal.isInternalConflict ? (
                // Special UI for internal conflicts - let user select which macros to keep
                <div className="space-y-3">
                  <p className="text-sm">Select which macros you want to keep active:</p>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                    {conflictModal.conflictingMacros.map(macro => (
                      <label key={macro.id} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-default-50">
                        <input
                          type="checkbox"
                          checked={conflictModal.selectedMacrosToKeep?.has(macro.id) || false}
                          onChange={(e) => {
                            const newSelected = new Set(conflictModal.selectedMacrosToKeep);
                            if (e.target.checked) {
                              newSelected.add(macro.id);
                            } else {
                              newSelected.delete(macro.id);
                            }
                            setConflictModal(prev => ({ 
                              ...prev, 
                              selectedMacrosToKeep: newSelected 
                            }));
                          }}
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <div className="font-medium">{macro.name}</div>
                          <div className="text-sm text-foreground-500">
                            {getTriggerDescription(macro.trigger)}
                          </div>
                          {macro.actions && macro.actions.length > 0 && (
                            <div className="text-xs text-foreground-400 mt-1">
                              {macro.actions.length} action{macro.actions.length !== 1 ? 's' : ''}
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-between pt-3">
                    <Button 
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        setConflictModal(prev => ({ 
                          ...prev, 
                          selectedMacrosToKeep: new Set(conflictModal.conflictingMacros.map(m => m.id))
                        }));
                      }}
                    >
                      Select All
                    </Button>
                    <Button 
                      size="sm"
                      variant="flat"
                      onPress={() => {
                        setConflictModal(prev => ({ 
                          ...prev, 
                          selectedMacrosToKeep: new Set()
                        }));
                      }}
                    >
                      Select None
                    </Button>
                  </div>
                </div>
              ) : (
                // Original UI for external conflicts
                <div className="space-y-3">
                  <p>
                    {conflictModal.isCategoryActivation 
                      ? "These macros use the same MIDI triggers as macros in the category. You can:"
                      : "These macros use the same MIDI trigger. You can:"
                    }
                  </p>
              
              <div className="space-y-2">
                <Button 
                  color="primary" 
                  variant="flat"
                  className="w-full justify-start p-3 h-auto"
                  onPress={() => handleResolveConflict("new")}
                  startContent={<Icon icon="lucide:replace" className="text-primary mr-2" />}
                >
                  <div>
                        <h4 className="font-medium text-left">
                          {conflictModal.isCategoryActivation 
                            ? "Replace and activate category"
                            : "Replace existing macro(s)"
                          }
                        </h4>
                    <p className="text-xs text-foreground-500 text-left">
                          {conflictModal.isCategoryActivation 
                            ? "Deactivate conflicting macros and activate the category"
                            : "Deactivate the conflicting macro(s) and activate the new one"
                          }
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
                          {conflictModal.isCategoryActivation 
                            ? "Leave existing macros active and don't activate the category"
                            : "Leave the existing macro(s) active and don't activate the new one"
                          }
                    </p>
                  </div>
                </Button>
              </div>
                </div>
              )}
            </div>
          </ModalBody>
          <ModalFooter>
            {conflictModal.isInternalConflict ? (
              <>
            <Button 
              variant="light" 
              onPress={() => handleResolveConflict("cancel")}
            >
              Cancel
            </Button>
                <Button 
                  color="primary"
                  onPress={() => handleResolveConflict("selected")}
                >
                  {(conflictModal.selectedMacrosToKeep?.size || 0) === 0 
                    ? "Disable All Conflicting Macros" 
                    : `Activate Selected (${conflictModal.selectedMacrosToKeep?.size || 0})`}
                </Button>
              </>
            ) : (
              <Button 
                variant="light" 
                onPress={() => handleResolveConflict("cancel")}
              >
                Cancel
              </Button>
            )}
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
                  
                  {/* Color type selector */}
                  <div className="flex gap-2 mb-4">
                    <Button
                      size="sm"
                      variant={!isCustomColor ? "solid" : "bordered"}
                      color={!isCustomColor ? "primary" : "default"}
                      onPress={() => setIsCustomColor(false)}
                    >
                      Preset Colors
                    </Button>
                    <Button
                      size="sm"
                      variant={isCustomColor ? "solid" : "bordered"}
                      color={isCustomColor ? "primary" : "default"}
                      onPress={() => setIsCustomColor(true)}
                    >
                      Custom Color
                    </Button>
                  </div>

                  {!isCustomColor ? (
                    // Preset colors grid
                    <div className="grid grid-cols-10 gap-2 max-h-[200px] overflow-y-auto p-2">
                      {[
                        "red", "rose", "pink", "fuchsia", "purple",
                        "violet", "indigo", "blue", "sky", "cyan",
                        "teal", "emerald", "green", "lime", "yellow",
                        "amber", "orange", "coral", "salmon", "crimson"
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
                  ) : (
                    // Custom color picker
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="color"
                          value={customColor}
                          onChange={(e) => setCustomColor(e.target.value)}
                          className="w-12 h-12 rounded-full border-2 border-white cursor-pointer"
                        />
                        <Input
                          label="Hex Color"
                          value={customColor}
                          onValueChange={setCustomColor}
                          placeholder="#3b82f6"
                          className="flex-1"
                        />
                      </div>
                     
                    </div>
                  )}
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
      
      {/* Category Assignment Modal */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onCloseModal) => (
            <>
              <ModalHeader>Assign Category</ModalHeader>
              <ModalBody>
                {currentEditMacro && (
                  <p className="my-4">
                    Assign <span className="font-large">{currentEditMacro.name}</span> to a category:
                  </p>
                )}
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {/* Category options */}
                  {categories.map((category) => {
                    const isCurrentCategory = currentEditMacro?.categoryId === category.id;
                    return (
                      <Button
                        key={category.id}
                        variant="light"
                        className=""
                        onPress={() => {
                          handleSaveCategoryAssignment(category.id);
                          onCloseModal();
                        }}
                        isDisabled={isCurrentCategory}
                      >
                        <div className="flex items-center gap-2">
                          {renderCategoryColor(category.color)}
                          <span className="font-medium">{category.name}</span>
                          {isCurrentCategory && (
                            <Chip size="sm" variant="flat" color="primary">Current</Chip>
                          )}
                        </div>
                      </Button>
                    );
                  })}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="light" onPress={onCloseModal}>
                  Cancel
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
      
      {/* Delete Confirmation Modal/Popover */}
      <Modal isOpen={deletePopoverOpen !== null} onOpenChange={(open) => {
        if (!open) {
          setDeletePopoverOpen(null);
        }
      }}>
        <ModalContent>
          {(onCloseModal) => {
            // Get the macro details if a macro is selected for deletion
            const macroToDelete = deletePopoverOpen ? macros.find(m => m.id === deletePopoverOpen) : null;
            const isGroup = macroToDelete?.groupId ? true : false;
            const macroName = macroToDelete ? 
              (isGroup ? macroToDelete.name.replace(/ \(.*\)$/, "") : macroToDelete.name) : 
              "this macro";
              
            return (
              <>
                <ModalHeader>{isGroup ? "Delete Macro Group" : "Delete Macro"}</ModalHeader>
                <ModalBody>
                  <div className="mt-2">
                    <p className="text-default-600">
                      Are you sure you want to delete <span className="font-semibold text-danger">{macroName}</span>? This action cannot be undone.
                    </p>
                  </div>
                </ModalBody>
                <ModalFooter>
                  <Button 
                    variant="flat"
                    onPress={onCloseModal}
                  >
                    Cancel
                  </Button>                                
                  <Button 
                    color="danger"
                    onPress={() => {
                      if (deletePopoverOpen) {
                        handleDeleteMacro(deletePopoverOpen);
                        onCloseModal();
                      }
                    }}
                  >
                    Delete
                  </Button>
                </ModalFooter>
              </>
            );
          }}
        </ModalContent>
      </Modal>
      
      {/* Import Preference Modal */}
      <Modal isOpen={importPreferenceModal.isOpen} onOpenChange={(open) => {
        if (!open) {
          setImportPreferenceModal({ isOpen: false, importData: null, fileName: "" });
        }
      }}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Import Macros</ModalHeader>
              <ModalBody>
                <div className="space-y-4">
                  <p className="text-sm text-foreground-600">
                    How would you like to import the macros from <span className="font-medium">{importPreferenceModal.fileName}</span>?
                  </p>
                  
                  <div className="space-y-3">
                    <Button
                      color="primary"
                      variant="flat"
                      className="w-full justify-start p-4 h-auto"
                      onPress={handleImportAsIs}
                      startContent={<Icon icon="lucide:download" className="text-primary mr-2" />}
                    >
                      <div>
                        <h4 className="font-medium text-left">Import as-is</h4>
                        <p className="text-xs text-foreground-500 text-left">
                          Import macros with their original MIDI triggers and settings
                        </p>
                      </div>
                    </Button>
                    
                    <Button
                      color="warning"
                      variant="flat"
                      className="w-full justify-start p-4 h-auto"
                      onPress={handleImportWithRedefinition}
                      startContent={<Icon icon="lucide:edit-3" className="text-warning mr-2" />}
                    >
                      <div>
                        <h4 className="font-medium text-left">Redefine MIDI triggers</h4>
                        <p className="text-xs text-foreground-500 text-left">
                          Go through each macro group and assign new MIDI triggers
                        </p>
                      </div>
                    </Button>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  Cancel
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
      
      {/* MIDI Redefinition Modal */}
      <Modal 
        isOpen={midiRedefinitionModal.isOpen} 
        onOpenChange={(open) => {
          console.log('MIDI Redefinition Modal onOpenChange:', open);
          // Only allow closing if we're not in the middle of processing
          if (!open && midiRedefinitionModal.currentMacro) {
            console.log('User requested to close modal, but macro is in progress');
            // Don't close - show a message that they need to complete or skip
            addToast({
              title: "Cannot Close",
              description: "Please complete the current macro or skip it before closing",
              color: "warning"
            });
            return;
          }
          
          if (!open) {
            console.log('Closing MIDI Redefinition Modal');
            setMidiRedefinitionModal({
              isOpen: false,
              currentMacro: null,
              macroIndex: 0,
              totalMacros: 0,
              importData: null,
              redefinedMacros: [],
              incrementTrigger: null,
              decrementTrigger: null,
              clickTrigger: null,
              lastProcessedTimestamp: 0,
              autoAdvanceToNextGroup: false,
              stopListeningCounter: 0
            });
          }
        }}
        isDismissable={false}
        hideCloseButton={true}
      >
        <ModalContent className="max-w-2xl">
          {(onClose) => (
            <>
              <ModalHeader>
                Redefine MIDI Triggers ({midiRedefinitionModal.macroIndex + 1} of {midiRedefinitionModal.totalMacros})
               
              </ModalHeader>
              <ModalBody>
                <div className="space-y-6">
                  <div className="text-center">
                    <h3 className="text-lg font-medium mb-2">
                      {midiRedefinitionModal.currentMacro?.name || "Unknown Macro"}
                    </h3>
                    <p className="text-sm text-foreground-500">
                      Assign new MIDI triggers for this macro group
                    </p>
                   
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Increment Trigger */}
                    <div className={`space-y-2 p-3 rounded-lg border-2 ${
                      midiRedefinitionModal.incrementTrigger === null && 
                      midiRedefinitionModal.decrementTrigger === null && 
                      midiRedefinitionModal.clickTrigger === null
                        ? 'border-primary bg-primary-50' 
                        : midiRedefinitionModal.incrementTrigger 
                          ? 'border-success bg-success-50' 
                          : 'border-default-200 bg-default-50'
                    }`}>
                      <h4 className="font-medium text-sm flex items-center gap-2">
                        Increment Trigger
                        
                        {midiRedefinitionModal.incrementTrigger && (
                          <span className="text-xs px-2 py-1 rounded-full bg-success text-white">
                            ✓
                          </span>
                        )}
                      </h4>
                      <MidiTriggerSelector
                        value={midiRedefinitionModal.incrementTrigger}
                        onChange={(trigger) => handleMidiTriggerUpdate('increment', trigger)}
                        forceDirection="increment"
                        externalListening={midiRedefinitionModal.incrementTrigger === null && 
                                         midiRedefinitionModal.decrementTrigger === null && 
                                         midiRedefinitionModal.clickTrigger === null}
                        onStopExternalListening={() => {
                          setMidiRedefinitionModal(prev => ({
                            ...prev,
                            lastProcessedTimestamp: Date.now(),
                            stopListeningCounter: prev.stopListeningCounter + 1
                          }));
                        }}
                        lastProcessedTimestamp={midiRedefinitionModal.lastProcessedTimestamp}
                      />
                    </div>
                    
                    {/* Decrement Trigger - only show if template has decrement actions */}
                    {midiRedefinitionModal.currentMacro?.decrementActions && (
                      <div className={`space-y-2 p-3 rounded-lg border-2 ${
                        midiRedefinitionModal.incrementTrigger !== null && 
                        midiRedefinitionModal.decrementTrigger === null && 
                        midiRedefinitionModal.clickTrigger === null
                          ? 'border-primary bg-primary-50' 
                          : midiRedefinitionModal.decrementTrigger 
                            ? 'border-success bg-success-50' 
                            : 'border-default-200 bg-default-50'
                      }`}>
                        <h4 className="font-medium text-sm flex items-center gap-2">
                          Decrement Trigger
                          
                          {midiRedefinitionModal.decrementTrigger && (
                            <span className="text-xs px-2 py-1 rounded-full bg-success text-white">
                              ✓
                            </span>
                          )}
                        </h4>
                        <MidiTriggerSelector
                          value={midiRedefinitionModal.decrementTrigger}
                          onChange={(trigger) => handleMidiTriggerUpdate('decrement', trigger)}
                          forceDirection="decrement"
                          externalListening={midiRedefinitionModal.incrementTrigger !== null && 
                                           midiRedefinitionModal.decrementTrigger === null && 
                                           midiRedefinitionModal.clickTrigger === null}
                          onStopExternalListening={() => {
                            setMidiRedefinitionModal(prev => ({
                              ...prev,
                              lastProcessedTimestamp: Date.now(),
                              stopListeningCounter: prev.stopListeningCounter + 1
                            }));
                          }}
                          isDisabled={midiRedefinitionModal.incrementTrigger === null}
                          lastProcessedTimestamp={midiRedefinitionModal.lastProcessedTimestamp}
                        />
                      </div>
                    )}
                    
                    {/* Click Trigger - only show if template has click actions */}
                    {midiRedefinitionModal.currentMacro?.clickActions && (
                      <div className={`space-y-2 p-3 rounded-lg border-2 ${
                        midiRedefinitionModal.incrementTrigger !== null && 
                        midiRedefinitionModal.decrementTrigger !== null && 
                        midiRedefinitionModal.clickTrigger === null
                          ? 'border-primary bg-primary-50' 
                          : midiRedefinitionModal.clickTrigger 
                            ? 'border-success bg-success-50' 
                            : 'border-default-200 bg-default-50'
                      }`}>
                        <h4 className="font-medium text-sm flex items-center gap-2">
                          Click Trigger
                          
                          {midiRedefinitionModal.clickTrigger && (
                            <span className="text-xs px-2 py-1 rounded-full bg-success text-white">
                              ✓
                          </span>
                          )}
                        </h4>
                        <MidiTriggerSelector
                          value={midiRedefinitionModal.clickTrigger}
                          onChange={(trigger) => handleMidiTriggerUpdate('click', trigger)}
                          externalListening={midiRedefinitionModal.incrementTrigger !== null && 
                                           midiRedefinitionModal.decrementTrigger !== null && 
                                           midiRedefinitionModal.clickTrigger === null}
                          onStopExternalListening={() => {
                            setMidiRedefinitionModal(prev => ({
                              ...prev,
                              lastProcessedTimestamp: Date.now(),
                              stopListeningCounter: prev.stopListeningCounter + 1
                            }));
                          }}
                          isDisabled={midiRedefinitionModal.incrementTrigger === null || midiRedefinitionModal.decrementTrigger === null}
                          lastProcessedTimestamp={midiRedefinitionModal.lastProcessedTimestamp}
                        />
                      </div>
                    )}
                  </div>
                  
                  {/* Auto-advance checkbox and manual controls */}
                  <div className="pt-4 border-t border-default-200 space-y-3">
                    {/* Auto-advance checkbox */}
                    <div className="flex items-center gap-2">
                      <Checkbox
                        isSelected={midiRedefinitionModal.autoAdvanceToNextGroup}
                        onValueChange={(checked) => {
                          setMidiRedefinitionModal(prev => ({
                            ...prev,
                            autoAdvanceToNextGroup: checked
                          }));
                          // Save preference to localStorage
                          localStorage.setItem('autoAdvanceToNextGroup', String(checked));
                        }}
                        size="sm"
                        color="primary"
                      >
                        Auto-advance to next group when all triggers are set
                      </Checkbox>
                    </div>
                    
                  
                  </div>
                </div>
              </ModalBody>
                <ModalFooter>
                <div className="flex w-full justify-between items-center">
                  <Button 
                  variant="flat" 
                  color="danger"
                  onPress={() => {
                    // Force close the modal
                    setMidiRedefinitionModal({
                    isOpen: false,
                    currentMacro: null,
                    macroIndex: 0,
                    totalMacros: 0,
                    importData: null,
                    redefinedMacros: [],
                    incrementTrigger: null,
                    decrementTrigger: null,
                    clickTrigger: null,
                    lastProcessedTimestamp: 0,
                    autoAdvanceToNextGroup: false,
                    stopListeningCounter: 0
                    });
                  }}
                  >
                  Cancel Import
                  </Button>
                  <div className="flex gap-2">
                  <Button 
                    variant="flat" 
                    onPress={handleSkipMacro}
                    color="warning"
                  >
                    Skip Macro
                  </Button>
                  
                  <Button 
                    color="primary"
                    onPress={handleNextMacro}
                    isDisabled={!midiRedefinitionModal.incrementTrigger && !midiRedefinitionModal.decrementTrigger && !midiRedefinitionModal.clickTrigger}
                  >
                    {midiRedefinitionModal.macroIndex + 1 >= midiRedefinitionModal.totalMacros ? 'Finish Import' : 'Next Macro'}
                  </Button>
                  </div>
                </div>
                </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
      
      {/* Import Summary Modal */}
      <Modal 
        isOpen={importSummaryModal.isOpen} 
        onOpenChange={(open) => {
          if (!open) {
            setImportSummaryModal({
              isOpen: false,
              importData: null,
              redefinedMacros: [],
              duplicates: [],
              skipDuplicates: new Set()
            });
          }
        }}
        size="3xl"
        scrollBehavior="inside"
      >
        <ModalContent className="max-w-4xl">
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">
                <h2 className="text-xl font-bold">Import Summary</h2>
                <p className="text-sm text-foreground-500">
                  Review the macros that will be imported with their assigned MIDI triggers
                </p>
              </ModalHeader>
              <ModalBody>
                {/* Duplicates Warning - Simple version */}
               
                
                <div className="space-y-4">
                  {importSummaryModal.redefinedMacros?.map((macro, index) => {
                    // Check if this macro is a duplicate
                    const originalMacro = importSummaryModal.importData?.macros?.find(
                      (m: any) => m.groupId === macro.groupId || (!m.groupId && !macro.groupId && m.name === macro.name)
                    );
                    
                    const isDuplicate = originalMacro && importSummaryModal.duplicates.some(d => 
                      (d.importedMacro.groupId && d.importedMacro.groupId === originalMacro.groupId) ||
                      (!d.importedMacro.groupId && d.importedMacro.name === originalMacro.name)
                    );
                    
                    const identifier = originalMacro ? (originalMacro.groupId || originalMacro.name) : '';
                    const isSkipped = isDuplicate && importSummaryModal.skipDuplicates.has(identifier);
                    
                    return (
                      <Card key={index} className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold">{macro.name}</h3>
                            <div className="flex items-center gap-2">
                              {/* Duplicate indicator */}
                              {isDuplicate && (
                                <Tooltip content="Duplicate" placement="top" color="warning">
                                  <Chip variant="flat" color="warning" size="sm">
                                    <Icon icon="lucide:alert-triangle" className="w-3 h-3 " />
                                  </Chip>
                                </Tooltip>
                              )}
                              <Chip variant="flat" color="primary" size="sm">
                                {macro.type ? macro.type.charAt(0).toUpperCase() + macro.type.slice(1) : 'Standard'}
                              </Chip>
                            </div>
                          </div>
                          
                          {/* Duplicate control section */}
                          {isDuplicate && (
                            <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="text-sm font-medium text-warning-800">
                                    This macro already exists in your library
                                  </p>
                                  <p className="text-xs text-warning-600">
                                    {isSkipped ? 'Will be skipped during import' : 'Will be imported with a new ID'}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-warning-700">
                                    {isSkipped ? 'Skip' : 'Import'}
                                  </span>
                                  <Switch
                                    size="sm"
                                    isSelected={!isSkipped}
                                    onValueChange={(checked) => {
                                      setImportSummaryModal(prev => {
                                        const newSkipDuplicates = new Set(prev.skipDuplicates);
                                        if (checked) {
                                          newSkipDuplicates.delete(identifier);
                                        } else {
                                          newSkipDuplicates.add(identifier);
                                        }
                                        return {
                                          ...prev,
                                          skipDuplicates: newSkipDuplicates
                                        };
                                      });
                                    }}
                                    color="warning"
                                  />
                                </div>
                              </div>
                            </div>
                          )}
                        
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          {/* Increment Trigger */}
                          {macro.incrementTrigger && (
                            <div className="p-3 bg-success-50 border border-success-200 rounded-lg">
                              <h4 className="font-medium text-sm text-success-700 mb-1">Increment Trigger</h4>
                              <p className="text-sm text-success-600">
                                {getTriggerDescription(macro.incrementTrigger)}
                              </p>
                            </div>
                          )}
                          
                          {/* Decrement Trigger */}
                          {macro.decrementTrigger && (
                            <div className="p-3 bg-warning-50 border border-warning-200 rounded-lg">
                              <h4 className="font-medium text-sm text-warning-700 mb-1">Decrement Trigger</h4>
                              <p className="text-sm text-warning-600">
                                {getTriggerDescription(macro.decrementTrigger)}
                              </p>
                            </div>
                          )}
                          
                          {/* Click Trigger */}
                          {macro.clickTrigger && (
                            <div className="p-3 bg-secondary-50 border border-secondary-200 rounded-lg">
                              <h4 className="font-medium text-sm text-secondary-700 mb-1">Click Trigger</h4>
                              <p className="text-sm text-secondary-600">
                                {getTriggerDescription(macro.clickTrigger)}
                              </p>
                            </div>
                          )}
                        </div>
                        
                        
                      </div>
                    </Card>
                  );
                  })}
                  
                  {(!importSummaryModal.redefinedMacros || importSummaryModal.redefinedMacros.length === 0) && (
                    <div className="text-center py-8 text-foreground-400">
                      No macros to import
                    </div>
                  )}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button 
                  variant="flat" 
                  onPress={onClose}
                  color="danger"
                >
                  Cancel Import
                </Button>
                <Button 
                  color="primary"
                  onPress={() => {
                    // Filter macros based on individual selections
                    let macrosToImport = importSummaryModal.redefinedMacros;
                    
                    if (importSummaryModal.duplicates.length > 0) {
                      // Filter and process duplicates based on individual selections
                      macrosToImport = importSummaryModal.redefinedMacros.map(macro => {
                        // Find if this macro is a duplicate
                        const originalMacro = importSummaryModal.importData?.macros?.find(
                          (m: any) => m.groupId === macro.groupId || (!m.groupId && !macro.groupId && m.name === macro.name)
                        );
                        
                        if (!originalMacro) return macro;
                        
                        const isDuplicate = importSummaryModal.duplicates.some(d => 
                          (d.importedMacro.groupId && d.importedMacro.groupId === originalMacro.groupId) ||
                          (!d.importedMacro.groupId && d.importedMacro.name === originalMacro.name)
                        );
                        
                        if (isDuplicate) {
                          const identifier = originalMacro.groupId || originalMacro.name;
                          const isSkipped = importSummaryModal.skipDuplicates.has(identifier);
                          
                          if (isSkipped) {
                            return null; // Mark for filtering out
                          } else {
                            // Import with new ID
                            const timestamp = Date.now();
                            const random = Math.floor(Math.random() * 10000);
                            if (originalMacro.groupId) {
                              return { ...macro, groupId: `${originalMacro.groupId}_${timestamp}_${random}` };
                            } else {
                              return { ...macro, id: `${originalMacro.id || 'macro'}_${timestamp}_${random}`, name: `${originalMacro.name} (Imported)` };
                            }
                          }
                        }
                        
                        return macro;
                      }).filter(macro => macro !== null); // Remove skipped macros
                    }
                    
                    // Proceed with the import
                    const finalImportData = {
                      ...importSummaryModal.importData,
                      macros: importSummaryModal.importData.macros
                        .filter((macro: any) => {
                          // Only include macros that are in macrosToImport
                          return macrosToImport.some(m => {
                            if (m.groupId && macro.groupId) {
                              return m.groupId === macro.groupId || m.groupId.startsWith(macro.groupId + '_');
                            } else {
                              return m.name === macro.name || m.name.startsWith(macro.name);
                            }
                          });
                        })
                        .map((macro: any) => {
                          const redefined = macrosToImport.find(r => {
                            if (r.groupId && macro.groupId) {
                              return r.groupId === macro.groupId || r.groupId.startsWith(macro.groupId + '_');
                            } else {
                              return r.name === macro.name || r.name.startsWith(macro.name);
                            }
                          });
                          
                          if (redefined) {
                            return {
                              ...macro,
                              id: redefined.id || macro.id,
                              groupId: redefined.groupId || macro.groupId,
                              name: redefined.name || macro.name,
                              incrementTrigger: redefined.incrementTrigger,
                              decrementTrigger: redefined.decrementTrigger,
                              clickTrigger: redefined.clickTrigger
                            };
                          }
                          return macro;
                        })
                    };
                    
                    handleImportMacros(finalImportData);
                    onClose();
                  }}
                  isDisabled={!importSummaryModal.redefinedMacros?.length || (
                    importSummaryModal.duplicates.length > 0 && 
                    importSummaryModal.skipDuplicates.size === importSummaryModal.duplicates.length && 
                    importSummaryModal.duplicates.length === importSummaryModal.redefinedMacros.length
                  )}
                >
                  {(() => {
                    const totalMacros = importSummaryModal.redefinedMacros?.length || 0;
                    const duplicates = importSummaryModal.duplicates.length;
                    const skippedDuplicates = importSummaryModal.skipDuplicates.size;
                    const willImport = totalMacros - skippedDuplicates;
                    
                    if (duplicates > 0 && skippedDuplicates > 0) {
                      return `Import ${willImport} Macro${willImport !== 1 ? 's' : ''} (${skippedDuplicates} skipped)`;
                    } else {
                      return `Import ${willImport} Macro${willImport !== 1 ? 's' : ''}`;
                    }
                  })()}
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
      
      {/* Context Menu - Now using HeroUI Dropdown */}
      <Dropdown 
        isOpen={contextMenu.isOpen} 
        onOpenChange={(open) => {
          if (!open) {
            closeContextMenu();
          }
        }}
        placement="bottom-start"
        shouldCloseOnInteractOutside={() => true}
        classNames={{
          base: "before:bg-default-200", // change arrow background
          content:
            "py-1 px-1 border border-default-200 bg-black",
        }}
      >
        <DropdownTrigger>
          <div 
            className="fixed pointer-events-none bg-black"
            
            style={{
              left: contextMenu.x,
              top: contextMenu.y,
              width: '1px',
              height: '1px'
            }}
          />
        </DropdownTrigger>
        <DropdownMenu 
        
          aria-label="Context menu"
          variant="flat"
          className="min-w-[200px]"
          onAction={(key) => {
            const item = getContextMenuItems().find(item => item.key === key);
            if (item) {
              item.onPress();
            }
          }}
        >
          {getContextMenuItems().map((item) => (
            <DropdownItem
              key={item.key}
              description={item.description}
              startContent={<Icon icon={item.icon} className={`text-${item.color || 'default'}`} />}
              color={item.color}
            >
              {item.label}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </Dropdown>
    </div>
  );
};

// Define MacroDropZone component before MacrosList
interface MacroDropZoneProps {
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  categoryId: string;
  beforeId: string | null;
  afterId: string | null;
  isActive?: boolean;
}

const MacroDropZone: React.FC<MacroDropZoneProps> = ({ 
  onDragOver,
  onDragLeave, 
  onDrop, 
  categoryId, 
  beforeId, 
  afterId, 
  isActive = false
}) => {
  const dropZoneVariants = {
    inactive: { 
      backgroundColor: "transparent",
      borderColor: "transparent",
      scale: 1,
      transition: { duration: 0.2, ease: "easeOut" as const }
    },
          active: { 
        backgroundColor: "rgba(var(--primary-rgb), 0.1)",
        borderColor: "rgba(var(--primary-rgb), 0.3)",
        scale: 1.02,
        transition: { duration: 0.2, ease: "easeOut" as const }
      }
  };

  return (
    <motion.div 
      className="drop-zone"
      data-before-id={beforeId}
      data-after-id={afterId}
      data-category-id={categoryId}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      variants={dropZoneVariants}
      animate={isActive ? "active" : "inactive"}
      style={{
        border: "2px dashed transparent",
        borderRadius: "8px",
        minHeight: "40px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        margin: "4px 0"
      }}
    >
      <motion.div 
        className="drop-zone-placeholder"
        initial={{ opacity: 0 }}
        animate={{ opacity: isActive ? 0.7 : 0 }}
        transition={{ duration: 0.2 }}
      >
        {isActive && (
          <motion.div 
            className="placeholder-content text-sm text-foreground-400"
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            Drop here
          </motion.div>
        )}
      </motion.div>
    </motion.div>
  );
};

// MacroItem component for Reorder
interface MacroItemProps {
  macro: ExtendedMacroDefinition;
  activeMacros: Set<string>;
  onToggleMacro: (id: string, isActive: boolean) => void;
  onEditMacro: (macro: MacroDefinition) => void;
  onCreateTemplate?: (macro: MacroDefinition) => void;
  onDeleteMacro: (id: string) => void;
  handleAssignCategory: (macro: MacroDefinition) => void;
  getTriggerDescription: (trigger: MacroDefinition["trigger"]) => string;
  getActionSummary: (action: Action) => string;
  getChipColor: (type?: string) => "primary" | "secondary" | "warning" | "danger";
  getActionTypeDisplayName: (actionType: string) => string;
  getDetailedActionInfo: (action: Action) => string;
  deletePopoverOpen: string | null;
  setDeletePopoverOpen: React.Dispatch<React.SetStateAction<string | null>>;
  handleContextMenu: (e: React.MouseEvent, macro?: MacroDefinition) => void;
}

class MacroItem extends React.Component<MacroItemProps> {
  render() {
    const { 
      macro,
      activeMacros, 
      onToggleMacro,
      onEditMacro,
      onCreateTemplate,
      onDeleteMacro,
      handleAssignCategory,
      getTriggerDescription,
      getActionSummary,
      getChipColor,
      getActionTypeDisplayName,
      getDetailedActionInfo,
      deletePopoverOpen,
      setDeletePopoverOpen,
      handleContextMenu
    } = this.props;
    
    const scale = 1;
    const shadow = 1;
    const dragged = false;
    
    // Define motion variants for macro cards
    const macroCardVariants = {
      idle: { 
        scale: 1, 
        opacity: 1, 
        boxShadow: "0px 1px 3px rgba(0, 0, 0, 0.1)",
        transition: { duration: 0.2, ease: "easeOut" as const }
      },
      dragging: { 
        scale: 1.05, 
        opacity: 0.9, 
        boxShadow: "0px 8px 25px rgba(0, 0, 0, 0.3)",
        zIndex: 1000,
        transition: { duration: 0.2, ease: "easeOut" as const }
      },
      hover: {
        scale: 1.02,
        boxShadow: "0px 4px 12px rgba(0, 0, 0, 0.15)",
        transition: { duration: 0.2, ease: "easeOut" as const }
      }
    };
    
    if (macro.groupId && !macro.isGroupRoot) {
      // Skip rendering non-root group items as they'll be shown with the root item
      return null;
    }
    
    // For grouped macros like encoders
    if (macro.groupId && macro.isGroupRoot) {
      // This is the root of a group
      return (
        <motion.div
          variants={macroCardVariants}
          initial="idle"
          animate={dragged ? "dragging" : "idle"}
          whileHover={!dragged ? "hover" : undefined}
          layout
          layoutId={macro.groupId || macro.id}
        >
          <Card 
            id={macro.groupId ? `macro-${macro.groupId}` : `macro-${macro.id}`}
            className="macro-card"
            onContextMenu={(e) => handleContextMenu(e, macro)}
          >
            <div className="p-3">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <motion.span 
                      className="drag-handle cursor-grab" 
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Icon icon="lucide:grip-vertical" className="w-4 h-4" />
                    </motion.span>
                    <h3 className="text-base font-medium">
                      {macro.name.replace(/ \(.*\)$/, "")}
                    </h3>
                  </div>
                  {/* Show MIDI triggers inline for grouped macros - compact view */}
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-foreground-500">
                    {/* Before Actions Icon - only once at the beginning */}
                    {macro.groupItems?.[0]?.beforeActions && macro.groupItems[0].beforeActions.length > 0 && (
                      <Tooltip
                        content={
                          <div className="p-2">
                            <div className="font-medium mb-2">Before Actions ({macro.groupItems[0].beforeActions.length})</div>
                            <div className="text-xs space-y-1">
                              {macro.groupItems[0].beforeActions.map((action, idx) => (
                                <div key={idx}>• {getActionSummary(action)}</div>
                              ))}
                              
                            </div>
                          </div>
                        }
                        placement="top"
                        color="success"
                        delay={500}
                        closeDelay={100}
                      >
                        <Chip 
                          size="sm" 
                          variant="flat" 
                          color="success"
                          className="text-xs h-5 px-2 flex items-center gap-1 cursor-help"
                        >
                          <Icon icon="lucide:arrow-left" className="w-3 h-3" />
                        </Chip>
                      </Tooltip>
                    )}
                    
                    {/* Dot separator after before actions */}
                    {macro.groupItems?.[0]?.beforeActions && macro.groupItems[0].beforeActions.length > 0 && (
                      <span className="text-foreground-300 mx-1">•</span>
                    )}
                    
                    {macro.groupItems?.map((groupMacro, index) => (
                      <div key={groupMacro.id} className="flex items-center gap-1">
                        
                        
                        {["encoder-increment", "encoder-decrement", "encoder-click"].map((type) => {
                          if (groupMacro.type !== type) return null;
                          const color =
                            type === "encoder-increment"
                              ? "primary"
                              : type === "encoder-decrement"
                              ? "warning"
                              : type === "encoder-click"
                              ? "secondary"
                              : "primary";
                          const label =
                            type === "encoder-increment"
                              ? "Increment"
                              : type === "encoder-decrement"
                              ? "Decrement"
                              : type === "encoder-click"
                              ? "Click"
                              : "Main";
                          const icon =
                            type === "encoder-increment"
                              ? "lucide:rotate-cw"
                              : type === "encoder-decrement"
                              ? "lucide:rotate-ccw"
                              : type === "encoder-click"
                              ? "lucide:mouse-pointer-click"
                              : "lucide:circle";
                          return (
                            <Tooltip
                              key={type}
                              content={
                                <div className="p-2">
                                  <div className="text-sm ">
                                      <div className="font-medium text-white">
                                        {label} Actions ({groupMacro.actions.length})
                                      </div>
                                      <div className="border-b border-white-200 pb-1">
                                        <div className="text-xs opacity-80 text-white">
                                          {getTriggerDescription(groupMacro.trigger)}
                                        </div>
                                      </div>
                                      <div className="text-xs opacity-80 text-white">
                                        {groupMacro.actions.map((action, idx) => (
                                          <div key={idx}>• {getActionSummary(action)}</div>
                                        ))}
                                      </div>
                                    </div>
                                   
                                  
                                </div>
                              }
                              placement="top"
                              color={color}
                              delay={500}
                              closeDelay={100}
                            >
                              <Chip
                                size="sm"
                                variant="flat"
                                color={color}
                                className="text-xs h-5 px-2 flex items-center gap-1 cursor-help"
                              >
                                <Icon icon={icon} className="w-3 h-3" />
                              </Chip>
                            </Tooltip>
                          );
                        })}
                        {index < (macro.groupItems?.length || 0) - 1 && (
                          <span className="text-foreground-300 mx-1">•</span>
                        )}
                      </div>
                    ))}
                    
                    {/* Dot separator before after actions */}
                    {macro.groupItems?.[0]?.afterActions && macro.groupItems[0].afterActions.length > 0 && (
                      <span className="text-foreground-300 mx-1">•</span>
                    )}
                    
                    {/* After Actions Icon - only once at the end */}
                    {macro.groupItems?.[0]?.afterActions && macro.groupItems[0].afterActions.length > 0 && (
                      <Tooltip
                        content={
                          <div className="p-2">
                            <div className="font-medium mb-2">After Actions ({macro.groupItems[0].afterActions.length})</div>
                            <div className="text-xs space-y-1">
                              {macro.groupItems[0].afterActions.map((action, idx) => (
                                <div key={idx}>• {getActionSummary(action)}</div>
                              ))}
                             
                            </div>
                          </div>
                        }
                        placement="top"
                        color="success"
                        delay={500}
                        closeDelay={100}
                      >
                        <Chip 
                          size="sm" 
                          variant="flat" 
                          color="success"
                          className="text-xs h-5 px-2 flex items-center gap-1 cursor-help"
                        >
                          <Icon icon="lucide:arrow-right" className="w-3 h-3" />
                        </Chip>
                      </Tooltip>
                    )}
                  </div>
                  
                </div>
                <div className="flex items-center gap-1">
                  {/* Removed expansion button - no more expansion needed */}
                  
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Switch
                      isSelected={macro.groupItems?.every(m => activeMacros.has(m.id))}
                      onValueChange={(isSelected) => {
                        // Just toggle the first macro - the group handling logic will take care of the rest
                        onToggleMacro(macro.id, isSelected);
                      }}
                      size="sm"
                    />
                  </motion.div>
                  <Button
                                      isIconOnly
                                      size="sm"
                                      variant="light"
                          className="opacity-80 hover:opacity-100 bg-transparent"
                          onClick={() => onEditMacro(macro)}
                                    >
                          <Icon icon="lucide:edit" className="text-primary" />
                                    </Button>
                    <Button
                                      isIconOnly
                                      size="sm"
                                      variant="light"
                                      color="danger"
                          className="opacity-80 hover:opacity-100 bg-transparent"
                          onClick={() => setDeletePopoverOpen(macro.id)}
                                    >
                          <Icon icon="lucide:trash-2" className="text-danger-500" />
                                    </Button>
                  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                    <Dropdown>
                      <DropdownTrigger>
                        <Button
                          isIconOnly
                          size="sm"
                          variant="light"
                          color="default"
                        >
                          <Icon icon="lucide:more-vertical" className="text-foreground-500" />
                        </Button>
                      </DropdownTrigger>
                      <DropdownMenu aria-label="Macro group actions" variant="flat">
                        <DropdownItem
                          key="edit"
                          description="Edit this macro group"
                          startContent={<Icon icon="lucide:edit" className="text-primary" />}
                          onPress={() => onEditMacro(macro)}
                        >
                          Edit Group
                        </DropdownItem>
                        
                        <DropdownItem
                      key="delete"
                      description="Delete this macro"
                      color="danger"
                      startContent={<Icon icon="lucide:trash-2" className="text-danger" />}
                      onPress={() => setDeletePopoverOpen(macro.id)}
                    >
                      Delete Macro
                    </DropdownItem>
                        
                        {onCreateTemplate ? (
                          <DropdownItem
                            key="template"
                            description="Create a template from this macro"
                            startContent={<Icon icon="lucide:copy-plus" className="text-secondary" />}
                            onPress={() => onCreateTemplate(macro)}
                          >
                            Create Template
                          </DropdownItem>
                        ) : null}
                        
                        <DropdownItem
                          key="category"
                          description="Move this macro group to a different category"
                          startContent={<Icon icon="lucide:folder" className="text-warning" />}
                          onPress={() => handleAssignCategory(macro)}
                        >
                          Change Category
                        </DropdownItem>
                      </DropdownMenu>
                    </Dropdown>
                  </motion.div>
                </div>
              </div>
              
              {/* Removed expanded content - showing MIDI info inline instead */}
            </div>
          </Card>
        </motion.div>
      );
    }
    
    // For single macros
    return (
      <motion.div
        variants={macroCardVariants}
        initial="idle"
        animate={dragged ? "dragging" : "idle"}
        whileHover={!dragged ? "hover" : undefined}
        layout
        layoutId={macro.id}
      >
        <Card 
          id={`macro-${macro.id}`}
          data-macro-id={macro.id}
          className="macro-card"
          onContextMenu={(e) => handleContextMenu(e, macro)}
        >
          <div className="p-3">
            <div className="flex justify-between items-center">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <motion.span 
                    className="drag-handle cursor-grab" 
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    <Icon icon="lucide:grip-vertical" className="w-4 h-4" />
                  </motion.span>
                  <h3 className="text-base font-medium">{macro.name}</h3>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1, duration: 0.2 }}
                  >
                   
                  </motion.div>
                </div>
                {/* Show MIDI trigger and actions inline for standard macros - compact view */}
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-foreground-500">
                  {/* Before Actions Icon - only if populated */}
                  {macro.beforeActions && macro.beforeActions.length > 0 && (
                    <Tooltip
                      content={
                        <div className="p-2">
                          <div className="font-medium mb-2">Before Actions ({macro.beforeActions.length})</div>
                          <div className="text-xs space-y-1">
                            {macro.beforeActions.map((action, idx) => (
                              <div key={idx}> {getActionSummary(action)}</div>
                            ))}
                           
                          </div>
                        </div>
                      }
                      placement="top"
                      color="primary"
                      delay={500}
                      closeDelay={100}
                    >
                      <Chip 
                        size="sm" 
                        variant="flat" 
                        color="success"
                        className="text-xs h-5 px-2 flex items-center gap-1 cursor-help"
                      >
                        <Icon icon="lucide:arrow-left" className="w-3 h-3" />
                      </Chip>
                    </Tooltip>
                  )}
                  
                  {/* Dot separator after before actions */}
                  {macro.beforeActions && macro.beforeActions.length > 0 && (
                    <span className="text-foreground-300 mx-1">•</span>
                  )}
                  
                  
                  
                 
                  
                  {/* Main Actions with click action icon */}
                  {macro.actions && macro.actions.length > 0 && (
                    <Tooltip
                      content={
                        <div className="p-2">
                          <div className="text-sm">
                              <div className="font-medium text-white">Main Actions ({macro.actions.length})</div>
                              <div className="border-b border-white-200 pb-1">
                                <div className="text-xs opacity-80">
                                  {getTriggerDescription(macro.trigger)}
                                </div>
                              </div>
                              <div className="text-xs opacity-80">
                                {macro.actions.map((action, idx) => (
                                  <div key={idx}>{getActionSummary(action)}</div>
                                ))}
                                
                              </div>
                            </div>
                            
                            {macro.timeout && (
                              <div className="text-xs opacity-60">
                                <strong>Timeout:</strong> {macro.timeout}ms
                              </div>
                            )}
                        </div>
                      }
                      placement="top"
                      color="danger"
                      delay={500}
                      closeDelay={100}
                    >
                      <Chip 
                        size="sm" 
                        variant="flat" 
                        color="danger"
                        className="text-xs h-5 px-2 flex items-center gap-1 cursor-help"
                      >
                        <Icon icon="lucide:mouse-pointer-click" className="w-3 h-3" />
                      </Chip>
                    </Tooltip>
                  )}
                  
                  {/* Dot separator before after actions */}
                  {macro.afterActions && macro.afterActions.length > 0 && (
                    <span className="text-foreground-300 mx-1">•</span>
                  )}
                  
                  {/* After Actions Icon - only if populated */}
                  {macro.afterActions && macro.afterActions.length > 0 && (
                    <Tooltip
                      content={
                        <div className="p-2">
                          <div className="font-medium mb-2">After Actions ({macro.afterActions.length})</div>
                          <div className="text-xs space-y-1">
                            {macro.afterActions.map((action, idx) => (
                              <div key={idx}> {getActionSummary(action)}</div>
                            ))}
                            
                          </div>
                        </div>
                      }
                      placement="top"
                      color="primary"
                      delay={500}
                      closeDelay={100}
                    >
                      <Chip 
                        size="sm" 
                        variant="flat" 
                        color="success"
                        className="text-xs h-5 px-2 flex items-center gap-1 cursor-help"
                      >
                        <Icon icon="lucide:arrow-right" className="w-3 h-3" />
                      </Chip>
                    </Tooltip>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                {/* Removed expansion button - no more expansion needed */}
                
                <Switch
                  isSelected={activeMacros.has(macro.id)}
                  onValueChange={(isSelected) => {
                    onToggleMacro(macro.id, isSelected);
                  }}
                  size="sm"
                /> <Button
                isIconOnly
                size="sm"
                variant="light"
    className="opacity-80 hover:opacity-100 bg-transparent"
    onClick={() => onEditMacro(macro)}
              >
    <Icon icon="lucide:edit" className="text-primary" />
              </Button>
<Button
                isIconOnly
                size="sm"
                variant="light"
                color="danger"
    className="opacity-80 hover:opacity-100 bg-transparent"
    onClick={() => setDeletePopoverOpen(macro.id)}
              >
    <Icon icon="lucide:trash-2" className="text-danger-500" />
              </Button>
                <Dropdown>
                  <DropdownTrigger>
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="default"
                    >
                      <Icon icon="lucide:more-vertical" className="text-foreground-500" />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu aria-label="Macro actions" variant="flat">
                    <DropdownItem
                      key="edit"
                      description="Edit this macro"
                      startContent={<Icon icon="lucide:edit" className="text-primary" />}
                      onPress={() => onEditMacro(macro)}
                    >
                      Edit Macro
                    </DropdownItem>
                    
                    <DropdownItem
                      key="delete"
                      description="Delete this macro"
                      color="danger"
                      startContent={<Icon icon="lucide:trash-2" className="text-danger" />}
                      onPress={() => setDeletePopoverOpen(macro.id)}
                    >
                      Delete Macro
                    </DropdownItem>
                    
                    {onCreateTemplate ? (
                      <DropdownItem
                        key="template"
                        description="Create a template from this macro"
                        startContent={<Icon icon="lucide:copy-plus" className="text-secondary" />}
                        onPress={() => onCreateTemplate(macro)}
                      >
                        Create Template
                      </DropdownItem>
                    ) : null}
                    
                    <DropdownItem
                      key="category"
                      description="Move this macro to a different category"
                      startContent={<Icon icon="lucide:folder" className="text-warning" />}
                      onPress={() => handleAssignCategory(macro)}
                    >
                      Change Category
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </div>
            </div>
            
            {/* Removed expanded content - showing action summary inline instead */}
          </div>
        </Card>
      </motion.div>
    );
  }
}

export function getActionTypeDisplayName(actionType: string): string {
    switch (actionType) {
      case "keyboard-macro": return "Keyboard Macro";
      case "text-macro": return "Text Macro";
      case "open-app": return "Open App";
      case "open-website": return "Open Website";
      case "media-key": return "Media Key";
      case "run-command": return "Run Command";
      case "mouse-click": return "Mouse Click";
      case "mouse-move": return "Mouse Move";
      case "scroll": return "Scroll";
      case "system-command": return "System Command";
      default: return actionType;
    }
  }

  export function getDetailedActionInfo(action: Action): string {
    switch (action.type) {
      case "keyboard-macro":
        return `Keys: ${action.params.keys?.join(" + ") || "N/A"}`;
      case "text-macro":
        return `Text: ${action.params.text || "N/A"}`;
      case "open-app":
        return `App: ${action.params.appName || "N/A"}`;
      case "open-website":
        return `Website: ${action.params.websiteUrl || "N/A"}`;
      case "media-key":
        return `Key: ${action.params.mediaKey || "N/A"}`;
      case "run-command":
        return `Command: ${action.params.command || "N/A"}`;
      case "mouse-click":
        return `Button: ${action.params.button || "N/A"}, Position: (${action.params.x || "N/A"}, ${action.params.y || "N/A"}), Hold: ${action.params.hold ? "Yes" : "No"}`;
      case "mouse-move":
        return `Direction: ${action.params.direction || "N/A"}, Distance: ${action.params.distance || "N/A"}px, Duration: ${action.params.duration || "N/A"}ms`;
      case "scroll":
        return `Direction: ${action.params.direction || "N/A"}, Amount: ${action.params.amount || "N/A"}`;
      case "system-command":
        return `Command: ${action.params.command || "N/A"}`;
      default: return "Unknown action type";
    }
  }