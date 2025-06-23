import React, { useState, useEffect } from "react";
import { Button, Input, Card,  CardBody, Divider, Chip, Accordion, AccordionItem, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, Dropdown, DropdownTrigger, DropdownMenu, DropdownItem, addToast } from "@heroui/react";
import { Icon } from "@iconify/react";
import DraggableList from "react-draggable-list";
import { ActionEditor } from "./action-editor";
import { MidiTriggerSelector } from "./midi-trigger-selector";
import { MacroTypeSelector } from "./macro-type-selector";
import { Action, MacroDefinition, MacroCategory } from "../types/macro";
import { useSettings } from "../hooks/use-settings";

interface MacroBuilderProps {
  macroToEdit?: MacroDefinition | null;
  onEditComplete?: () => void;
  onNewMacroCreated?: () => void;
}

export const MacroBuilder: React.FC<MacroBuilderProps> = ({ macroToEdit, onEditComplete, onNewMacroCreated }) => {
  const { settings } = useSettings();
  const [macroName, setMacroName] = useState("");
  const [actions, setActions] = useState<Action[]>([]);
  const [beforeActions, setBeforeActions] = useState<Action[]>([]);
  const [afterActions, setAfterActions] = useState<Action[]>([]);
  const [midiTrigger, setMidiTrigger] = useState<MacroDefinition['trigger'] | null>(null);
  const [decrementTrigger, setDecrementTrigger] = useState<MacroDefinition['trigger'] | null>(null);
  const [clickTrigger, setClickTrigger] = useState<MacroDefinition['trigger'] | null>(null);
  const [decrementActions, setDecrementActions] = useState<Action[]>([]);
  const [clickActions, setClickActions] = useState<Action[]>([]);
  const [isEditing, setIsEditing] = useState<{section: string, index: number} | null>(null);
  const [macroType, setMacroType] = useState<"standard" | "encoder" | "encoder-click">("standard");
  const [sharedTimeout, setSharedTimeout] = useState<number>(1000);
  const [categories, setCategories] = useState<MacroCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  

  // Define state to track section visibility
  const [expandedSections, setExpandedSections] = useState<{
    before: boolean,
    main: boolean,
    decrement: boolean,
    click: boolean,
    after: boolean
  }>({
    before: false,
    main: false,  // Main section expanded by default
    decrement: false,
    click: false,
    after: false
  });



  useEffect(() => {
    // Load categories
    const storedCategories = localStorage.getItem("macroCategories");
    if (storedCategories) {
      try {
        const parsedCategories = JSON.parse(storedCategories);
        setCategories(parsedCategories);
      } catch (e) {
        console.error("Failed to parse categories from localStorage", e);
      }
    }
  }, []);

  // Update default timeout when settings change
  useEffect(() => {
    if (!macroToEdit) {
      setSharedTimeout(settings.defaultTimeout);
    }
  }, [settings.defaultTimeout, macroToEdit]);

  useEffect(() => {
    if (macroToEdit) {
      // Check if this is a merged macro object from a template (has _encoderGroup field)
      if ((macroToEdit as any)._encoderGroup) {
        const encoderGroup = (macroToEdit as any)._encoderGroup;
        console.log("Loading merged macro from template with encoder group:", encoderGroup);
        
        // Get parts from the encoder group
        const incrementPart = encoderGroup.increment;
        const decrementPart = encoderGroup.decrement;
        const clickPart = encoderGroup.click;
        
        // Set the name without any suffix
        setMacroName(macroToEdit.name);
        
        // Determine macro type based on available parts
        if (clickPart) {
          setMacroType("encoder-click");
        } else if (incrementPart || decrementPart) {
          setMacroType("encoder");
        } else {
          setMacroType("standard");
        }
        
        // Set trigger and actions for increment part
        if (incrementPart) {
          setMidiTrigger(incrementPart.trigger);
          setActions(incrementPart.actions);
        } else {
          setMidiTrigger(macroToEdit.trigger);
          setActions(macroToEdit.actions);
        }
        
        // Set trigger and actions for decrement part
        if (decrementPart) {
          setDecrementTrigger(decrementPart.trigger);
          setDecrementActions(decrementPart.actions);
        } else {
          setDecrementTrigger(null);
          setDecrementActions([]);
        }
        
        // Set trigger and actions for click part
        if (clickPart) {
          setClickTrigger(clickPart.trigger);
          setClickActions(clickPart.actions);
        } else {
          setClickTrigger(null);
          setClickActions([]);
        }
        
        // Use common properties from the main macro
        setBeforeActions(macroToEdit.beforeActions || []);
        setAfterActions(macroToEdit.afterActions || []);
        setSharedTimeout(macroToEdit.timeout || 1000);
        setSelectedCategory(macroToEdit.categoryId || null);
      }
      else if (macroToEdit.groupId && macroToEdit.type?.startsWith("encoder-")) {
        const allMacros: MacroDefinition[] = JSON.parse(localStorage.getItem("midiMacros") || "[]");
        const groupMacros = allMacros.filter(m => m.groupId === macroToEdit.groupId);
        const incrementPart = groupMacros.find(m => m.type === "encoder-increment");
        const decrementPart = groupMacros.find(m => m.type === "encoder-decrement");
        const clickPart = groupMacros.find(m => m.type === "encoder-click");

        let baseName = "";
        if (incrementPart) baseName = incrementPart.name.replace(/ \(Increment\)$/, "");
        else if (decrementPart) baseName = decrementPart.name.replace(/ \(Decrement\)$/, "");
        else if (clickPart) baseName = clickPart.name.replace(/ \(Click\)$/, "");
        else baseName = macroToEdit.name; // Fallback
        setMacroName(baseName);

        if (clickPart) setMacroType("encoder-click");
        else if (incrementPart || decrementPart) setMacroType("encoder");
        else setMacroType("standard");

        if (incrementPart) {
          setMidiTrigger(incrementPart.trigger);
          setActions(incrementPart.actions);
        } else {
          setMidiTrigger(null);
          setActions([]);
        }
        if (decrementPart) {
          setDecrementTrigger(decrementPart.trigger);
          setDecrementActions(decrementPart.actions);
        } else {
          setDecrementTrigger(null);
          setDecrementActions([]);
        }
        if (clickPart) {
          setClickTrigger(clickPart.trigger);
          setClickActions(clickPart.actions);
        } else {
          setClickTrigger(null);
          setClickActions([]);
        }
        const anyEncoderPart = incrementPart || decrementPart || clickPart;
        setBeforeActions(anyEncoderPart?.beforeActions || []);
        setAfterActions(anyEncoderPart?.afterActions || []);
        setSharedTimeout(anyEncoderPart?.timeout || 1000);
        
        // Set the category
        setSelectedCategory(anyEncoderPart?.categoryId || null);

      } else { // Standard macro
        setMacroName(macroToEdit.name);
        setActions(macroToEdit.actions || []);
        setBeforeActions(macroToEdit.beforeActions || []);
        setAfterActions(macroToEdit.afterActions || []);
        setSharedTimeout(macroToEdit.timeout || 1000);
        setMidiTrigger(macroToEdit.trigger || null);
        
        // Set the macro type based on the type property
        if (macroToEdit.type === "encoder-increment" || macroToEdit.type === "encoder-decrement") {
          setMacroType("encoder");
        } else if (macroToEdit.type === "encoder-click") {
          setMacroType("encoder-click");
        } else {
          setMacroType("standard");
        }
        
        // Clear encoder fields for standard macro
        setDecrementTrigger(null); 
        setDecrementActions([]);
        setClickTrigger(null); 
        setClickActions([]);
        
        // Set the category
        setSelectedCategory(macroToEdit.categoryId || null);
      }
    } else {
      setMacroName(""); setActions([]); setBeforeActions([]); setAfterActions([]);
      setSharedTimeout(1000); setMidiTrigger(null); setMacroType("standard");
      setDecrementTrigger(null); setDecrementActions([]);
      setClickTrigger(null); setClickActions([]);
      setIsEditing(null);
      setSelectedCategory(null);
    }
  }, [macroToEdit]);

  const handleAddAction = (type: string, section: string = "main") => {
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
  };

  const getDefaultParamsForType = (type: string): Record<string, any> => {
    switch (type) {
      case "keypress":
        return { key: "", modifiers: [], hold: false, duration: 500 };
      case "keyrelease":
        return { key: "" };
      case "mouseclick":
        return { button: "left", hold: false, x: 0, y: 0 };
      case "mouserelease":
        return { button: "left" };
      case "mousemove":
        return { 
          x: 0, 
          y: 0,
          relative: false,
          direction: "right", 
          distance: 10,
          duration: 500 
        };
      case "delay":
        return { duration: 500 };
      default:
        return {};
    }
  };

  const handleUpdateAction = (index: number, updatedAction: Action, section: string = "main") => {
    // Add validation for key press actions
    if ((updatedAction.type === "keypress" || updatedAction.type === "keyhold") && 
        (!updatedAction.params.key || updatedAction.params.key === "")) {
      addToast({
        title: "Invalid Action",
        description: "Key press actions must have a key specified",
        color: "danger"
      });
      return;
    }

    if (section === "before") {
      const newBeforeActions = [...beforeActions];
      newBeforeActions[index] = updatedAction;
      setBeforeActions(newBeforeActions);
    } else if (section === "after") {
      const newAfterActions = [...afterActions];
      newAfterActions[index] = updatedAction;
      setAfterActions(newAfterActions);
    } else if (section === "decrement") {
      const newDecrementActions = [...decrementActions];
      newDecrementActions[index] = updatedAction;
      setDecrementActions(newDecrementActions);
    } else if (section === "click") {
      const newClickActions = [...clickActions];
      newClickActions[index] = updatedAction;
      setClickActions(newClickActions);
    } else {
      const newActions = [...actions];
      newActions[index] = updatedAction;
      setActions(newActions);
    }
    
    setIsEditing(null);
  };

  const handleDeleteAction = (index: number, section: string = "main") => {
    if (section === "before") {
      setBeforeActions(beforeActions.filter((_, i) => i !== index));
      if (isEditing?.section === "before" && isEditing.index === index) {
        setIsEditing(null);
      }
    } else if (section === "after") {
      setAfterActions(afterActions.filter((_, i) => i !== index));
      if (isEditing?.section === "after" && isEditing.index === index) {
        setIsEditing(null);
      }
    } else if (section === "decrement") {
      setDecrementActions(decrementActions.filter((_, i) => i !== index));
      if (isEditing?.section === "decrement" && isEditing.index === index) {
        setIsEditing(null);
      }
    } else if (section === "click") {
      setClickActions(clickActions.filter((_, i) => i !== index));
      if (isEditing?.section === "click" && isEditing.index === index) {
        setIsEditing(null);
      }
    } else {
      setActions(actions.filter((_, i) => i !== index));
      if (isEditing?.section === "main" && isEditing.index === index) {
        setIsEditing(null);
      }
    }
  };

  const handleOrderChange = (newList: Action[], section: string = "main") => {
    if (section === "before") {
      setBeforeActions(newList);
    } else if (section === "after") {
      setAfterActions(newList);
    } else if (section === "decrement") {
      setDecrementActions(newList);
    } else if (section === "click") {
      setClickActions(newList);
    } else {
      setActions(newList);
    }
  };

  const handleStartSave = () => {
    if (!macroName.trim()) {
      // Consider adding a toast message for user feedback
      console.error("Macro name cannot be empty.");
      return;
    }
    
    // More specific validations
    if (macroType === "standard" && (!midiTrigger || actions.length === 0)) {
      console.error("Standard macro requires a MIDI trigger and at least one action.");
      return;
    }
    if (macroType === "encoder" && (!midiTrigger || !decrementTrigger || actions.length === 0 || decrementActions.length === 0)) {
      console.error("Encoder macro requires triggers and actions for both increment and decrement.");
      return;
    }
    if (macroType === "encoder-click" && (!midiTrigger || !decrementTrigger || !clickTrigger || actions.length === 0 || decrementActions.length === 0 || clickActions.length === 0)) {
      console.error("Encoder-click macro requires triggers and actions for increment, decrement, and click.");
      return;
    }
    
    // If we're editing a macro, and it already has a category, don't prompt
    if (macroToEdit && macroToEdit.categoryId) {
      handleSaveMacro(macroToEdit.categoryId);
    } else {
      // Show category selection modal
      onOpen();
    }
  };

  const handleSaveMacro = (categoryId: string | null) => {
    const allMacros: MacroDefinition[] = JSON.parse(localStorage.getItem("midiMacros") || "[]");

    const newMacrosToSave: MacroDefinition[] = [];
    const timestamp = new Date().toISOString();
    let effectiveGroupId = macroToEdit?.groupId;

    // Track old macro IDs that need to be deactivated
    const oldMacroIds: string[] = [];
    
    // If we're editing an existing macro, collect IDs that need to be deactivated
    if (macroToEdit) {
      if (macroToEdit.groupId) {
        // For encoder groups, collect all related macro IDs
        const groupMacros = allMacros.filter(m => m.groupId === macroToEdit.groupId);
        oldMacroIds.push(...groupMacros.map(m => m.id));
        console.log(`Macro update: Will deactivate ${oldMacroIds.length} old group macros:`, oldMacroIds);
      } else {
        // For single macros, just the macro ID
        oldMacroIds.push(macroToEdit.id);
        console.log(`Macro update: Will deactivate old macro:`, macroToEdit.id);
      }
    }

    if (macroType === "standard") {
      const macro: MacroDefinition = {
        id: (macroToEdit && macroToEdit.type === "standard" && macroToEdit.id) ? macroToEdit.id : crypto.randomUUID(),
        name: macroName,
        type: "standard",
        categoryId: categoryId || undefined,
        trigger: midiTrigger!,
        midi_value: midiTrigger?.type === "controlchange" ? midiTrigger.value : undefined,
        actions: actions,
        beforeActions: beforeActions.length > 0 ? beforeActions : undefined,
        afterActions: afterActions.length > 0 ? afterActions : undefined,
        timeout: (beforeActions.length > 0 || afterActions.length > 0) ? sharedTimeout : undefined,
        createdAt: (macroToEdit && macroToEdit.type === "standard" && macroToEdit.createdAt) ? macroToEdit.createdAt : timestamp,
        updatedAt: timestamp,
      };
      newMacrosToSave.push(macro);
    } else if (macroType === "encoder" || macroType === "encoder-click") {
      effectiveGroupId = effectiveGroupId || crypto.randomUUID();

      if (midiTrigger && actions.length > 0) {
        // Find existing increment macro to preserve its ID if editing
        const existingIncrementMacro = macroToEdit?.groupId ? 
          allMacros.find(m => m.groupId === effectiveGroupId && m.type === 'encoder-increment') : null;
        
        const incrementMacro: MacroDefinition = {
          id: existingIncrementMacro?.id || crypto.randomUUID(),
          groupId: effectiveGroupId,
          categoryId: categoryId || undefined,
          name: `${macroName}`,
          type: "encoder-increment",
          trigger: midiTrigger!,
          midi_value: midiTrigger?.type === "controlchange" ? midiTrigger.value : undefined,
          actions: actions,
          beforeActions: beforeActions.length > 0 ? beforeActions : undefined,
          afterActions: afterActions.length > 0 ? afterActions : undefined,
          timeout: sharedTimeout,
          createdAt: existingIncrementMacro?.createdAt || timestamp,
          updatedAt: timestamp,
        };
        newMacrosToSave.push(incrementMacro);
      }

      if (decrementTrigger && decrementActions.length > 0) {
        // Find existing decrement macro to preserve its ID if editing
        const existingDecrementMacro = macroToEdit?.groupId ? 
          allMacros.find(m => m.groupId === effectiveGroupId && m.type === 'encoder-decrement') : null;
        
        const decrementMacro: MacroDefinition = {
          id: existingDecrementMacro?.id || crypto.randomUUID(),
          groupId: effectiveGroupId,
          categoryId: categoryId || undefined,
          name: `${macroName}`,
          type: "encoder-decrement",
          trigger: decrementTrigger!,
          midi_value: decrementTrigger?.type === "controlchange" ? decrementTrigger.value : undefined,
          actions: decrementActions,
          beforeActions: beforeActions.length > 0 ? beforeActions : undefined,
          afterActions: afterActions.length > 0 ? afterActions : undefined,
          timeout: sharedTimeout,
          createdAt: existingDecrementMacro?.createdAt || timestamp,
          updatedAt: timestamp,
        };
        newMacrosToSave.push(decrementMacro);
      }

      if (macroType === "encoder-click" && clickTrigger && clickActions.length > 0) {
        // Find existing click macro to preserve its ID if editing
        const existingClickMacro = macroToEdit?.groupId ? 
          allMacros.find(m => m.groupId === effectiveGroupId && m.type === 'encoder-click') : null;
        
        const clickMacro: MacroDefinition = {
          id: existingClickMacro?.id || crypto.randomUUID(),
          groupId: effectiveGroupId,
          categoryId: categoryId || undefined,
          name: `${macroName}`,
          type: "encoder-click",
          trigger: clickTrigger!,
          midi_value: clickTrigger?.type === "controlchange" ? clickTrigger.value : undefined,
          actions: clickActions,
          beforeActions: beforeActions.length > 0 ? beforeActions : undefined,
          afterActions: afterActions.length > 0 ? afterActions : undefined,
          timeout: sharedTimeout,
          createdAt: existingClickMacro?.createdAt || timestamp,
          updatedAt: timestamp,
        };
        newMacrosToSave.push(clickMacro);
      }
    }

    let updatedMacrosArray;
    if (macroToEdit) {
      if (macroToEdit.groupId) {
        updatedMacrosArray = allMacros.filter(m => m.groupId !== macroToEdit.groupId);
      } else {
        updatedMacrosArray = allMacros.filter(m => m.id !== macroToEdit.id);
      }
      updatedMacrosArray.push(...newMacrosToSave);
    } else {
      updatedMacrosArray = [...allMacros, ...newMacrosToSave];
    }

    localStorage.setItem("midiMacros", JSON.stringify(updatedMacrosArray));

    // If we're editing a macro, we need to signal that old registrations should be cleaned up
    // and potentially reactivate the updated macro if it was previously active
    if (macroToEdit && oldMacroIds.length > 0) {
      // Check if any of the old macros were active
      const activeFromStorage = localStorage.getItem("activeMidiMacros");
      let wasActive = false;
      let activeIds: string[] = [];
      
      if (activeFromStorage) {
        try {
          activeIds = JSON.parse(activeFromStorage);
          wasActive = oldMacroIds.some(id => activeIds.includes(id));
        } catch (e) {
          console.error("Failed to parse active macros from storage:", e);
        }
      }
      
      if (wasActive) {
        console.log("Updated macro was previously active, will need reactivation");
        // Store information about the macro update for the parent component
        const updateInfo = {
          oldMacroIds,
          newMacroIds: newMacrosToSave.map(m => m.id),
          wasActive: true
        };
        
        // Store this temporarily for the parent to pick up
        localStorage.setItem("macroUpdateInfo", JSON.stringify(updateInfo));
      }
    }

    setMacroName("");
    setActions([]);
    setBeforeActions([]);
    setAfterActions([]);
    setSharedTimeout(1000);
    setMidiTrigger(null);
    setMacroType("standard");
    setDecrementTrigger(null);
    setDecrementActions([]);
    setClickTrigger(null);
    setClickActions([]);
    setIsEditing(null);
    setSelectedCategory(null);

    if (macroToEdit && onEditComplete) {
      onEditComplete();
    } else if (!macroToEdit && onNewMacroCreated) {
      onNewMacroCreated();
    }
  };

  const renderActionList = (actionsList: Action[], section: string) => {
    if (actionsList.length === 0) {
      return (
        <Card className="p-6 border-dashed border-2 border-default-200 bg-transparent flex flex-col items-center justify-center text-center">
          <Icon icon="lucide:list-plus" className="text-4xl text-default-400 mb-2" />
          <p className="text-foreground-500">No actions added yet</p>
          <p className="text-foreground-400 text-sm mt-1">Add actions to build your macro sequence</p>
          {renderActionButtons(section)}
        </Card>
      );
    }

    return (
      <div className="space-y-2">
        <DraggableList
          list={actionsList}
          itemKey="id"
          template={ActionItem}
          onMoveEnd={(newList: readonly unknown[]) => handleOrderChange([...(newList as Action[])], section)}
          container={() => document.body}
          commonProps={{
            section,
            isEditing,
            setIsEditing,
            handleUpdateAction,
            handleDeleteAction,
            handleCancelEdit,
            getActionTypeDisplayName,
            getActionSummary,
            actionsList
          }}
        />
      </div>
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
            <DropdownItem key="scroll-up" onPress={() => {
              const scrollUpAction: Action = {
                id: crypto.randomUUID(),
                type: "mouseclick",
                params: { button: "scroll-up", amount: 3 },
              };
              
              if (section === "before") {
                setBeforeActions([...beforeActions, scrollUpAction]);
                setIsEditing({section: "before", index: beforeActions.length});
              } else if (section === "after") {
                setAfterActions([...afterActions, scrollUpAction]);
                setIsEditing({section: "after", index: afterActions.length});
              } else if (section === "decrement") {
                setDecrementActions([...decrementActions, scrollUpAction]);
                setIsEditing({section: "decrement", index: decrementActions.length});
              } else if (section === "click") {
                setClickActions([...clickActions, scrollUpAction]);
                setIsEditing({section: "click", index: clickActions.length});
              } else {
                setActions([...actions, scrollUpAction]);
                setIsEditing({section: "main", index: actions.length});
              }
            }}>
              Scroll Up
            </DropdownItem>
            <DropdownItem key="scroll-down" onPress={() => {
              const scrollDownAction: Action = {
                id: crypto.randomUUID(),
                type: "mouseclick",
                params: { button: "scroll-down", amount: 3 },
              };
              
              if (section === "before") {
                setBeforeActions([...beforeActions, scrollDownAction]);
                setIsEditing({section: "before", index: beforeActions.length});
              } else if (section === "after") {
                setAfterActions([...afterActions, scrollDownAction]);
                setIsEditing({section: "after", index: afterActions.length});
              } else if (section === "decrement") {
                setDecrementActions([...decrementActions, scrollDownAction]);
                setIsEditing({section: "decrement", index: decrementActions.length});
              } else if (section === "click") {
                setClickActions([...clickActions, scrollDownAction]);
                setIsEditing({section: "click", index: clickActions.length});
              } else {
                setActions([...actions, scrollDownAction]);
                setIsEditing({section: "main", index: actions.length});
              }
            }}>
              Scroll Down
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
        
        <Button size="sm" variant="flat" onPress={() => handleAddAction("delay", section)}>
          + Delay
        </Button>
      </div>
    );
  };

  // Add handleCancelEdit function 
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
    <Card className="h-full flex flex-col">
      <div className="p-1 flex-grow overflow-y-auto">
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-medium mb-4">Create New Macro</h2>
            
            <div className="space-y-4">
              <Input
                label="Macro Name"
                placeholder="Enter a name for your macro"
                value={macroName}
                onValueChange={setMacroName}
              />
              
              <MacroTypeSelector 
                value={macroType}
                onChange={setMacroType}
              />
              
             
              
              {macroType === "standard" ? (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-2">MIDI Trigger</p>
                    <MidiTriggerSelector
                      value={midiTrigger}
                      onChange={(value) => {
                        setMidiTrigger(value);
                      }}
                    />
                  </div>
                  
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
              ) : macroType === "encoder" ? (
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:rotate-cw" className="text-foreground-500" />
                      <p className="text-sm font-medium mb-2">Encoder MIDI Trigger (Increment)</p>
                    </div>
                    <MidiTriggerSelector
                      value={midiTrigger}
                      onChange={(value) => {
                        setMidiTrigger(value);
                        if (value?.type === "controlchange") {
                          value.direction = "increment";
                        }
                      }}
                      forceDirection="increment"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:rotate-ccw" className="text-foreground-500" />
                      <p className="text-sm font-medium mb-2">Encoder MIDI Trigger (Decrement)</p>
                    </div>
                    <MidiTriggerSelector
                      value={decrementTrigger}
                      onChange={setDecrementTrigger}
                      forceDirection="decrement"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Shared Timeout (ms)</p>
                    <Input
                      type="number"
                      placeholder="Timeout in milliseconds"
                      value={sharedTimeout.toString()}
                      onValueChange={(value) => setSharedTimeout(parseInt(value) || 1000)}
                    />
                    <p className="text-xs text-foreground-500 mt-1">
                      Time before after-actions are triggered when encoder is inactive
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Encoder MIDI Trigger (Increment)</p>
                    <MidiTriggerSelector
                      value={midiTrigger}
                      onChange={(value) => {
                        setMidiTrigger(value);
                        if (value?.type === "controlchange") {
                          value.direction = "increment";
                        }
                      }}
                      forceDirection="increment"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Encoder MIDI Trigger (Decrement)</p>
                    <MidiTriggerSelector
                      value={decrementTrigger}
                      onChange={setDecrementTrigger}
                      forceDirection="decrement"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Encoder MIDI Trigger (Click)</p>
                    <MidiTriggerSelector
                      value={clickTrigger}
                      onChange={setClickTrigger}
                    />
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Shared Timeout (ms)</p>
                    <Input
                      type="number"
                      placeholder="Timeout in milliseconds"
                      value={sharedTimeout.toString()}
                      onValueChange={(value) => setSharedTimeout(parseInt(value) || 1000)}
                    />
                    <p className="text-xs text-foreground-500 mt-1">
                      Time before after-actions are triggered when encoder is inactive
                    </p>
                  </div>
                </div>
              )}
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
                    {beforeActions.length > 0 && renderActionButtons("before")}
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
                    {actions.length > 0 && renderActionButtons("main")}
                  </CardBody>
                </Card>
              </AccordionItem>
              
              {/* Conditional sections */}
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
                      {decrementActions.length > 0 && renderActionButtons("decrement")}
                    </CardBody>
                  </Card>
                </AccordionItem>
              ) : null}
              
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
                  subtitle="Actions to execute when the click trigger is triggered"
                >
                  <Card className="mt-4 border-none shadow-none">
                    <CardBody>
                      {renderActionList(clickActions, "click")}
                      {clickActions.length > 0 && renderActionButtons("click")}
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
                    <Chip size="sm" variant="flat" color="primary">{afterActions.length}</Chip>
                  </div>
                }
                subtitle="Actions to execute after the main sequence"
              >
                <Card className="mt-4 border-none shadow-none">
                  <CardBody>
                    {renderActionList(afterActions, "after")}
                    {afterActions.length > 0 && renderActionButtons("after")}
                  </CardBody>
                </Card>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </div>
      <div className="p-4 border-t border-default-200">
        <Button onPress={handleStartSave} color="primary" className="w-full">
          {macroToEdit ? "Update Macro" : (macroType === "standard" ? "Save Macro" : macroType === "encoder" ? "Save Encoder Macro" : "Save Encoder Click Macro")}
        </Button>
      </div>

      {/* Modal for selecting a category */}
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Select Category</ModalHeader>
              <ModalBody>
                <p className="text-sm mb-4">Choose a category for your macro:</p>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {categories.map(category => (
                    <div 
                      key={category.id}
                      className={`flex items-center gap-2 p-3 rounded-md cursor-pointer hover:bg-${category.color}-50 ${
                        selectedCategory === category.id ? `bg-${category.color}-100` : ''
                      }`}
                      onClick={() => setSelectedCategory(category.id)}
                    >
                      <div className={`category-color category-color-${category.color}`}></div>
                      <span>{category.name}</span>
                    </div>
                  ))}
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="flat" onPress={onClose}>
                  Cancel
                </Button>
                <Button 
                  color="primary" 
                  onPress={() => {
                    handleSaveMacro(selectedCategory);
                    onClose();
                  }}
                >
                  Save Macro
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </Card>
  );
};

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
    case "delay":
      return "Delay";
    default:
      return actionType.charAt(0).toUpperCase() + actionType.slice(1);
  }
}

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
      } else if (action.params.button === "scroll-left") {
        return `Scroll left (amount: ${action.params.amount || 3})`;
      } else if (action.params.button === "scroll-right") {
        return `Scroll right (amount: ${action.params.amount || 3})`;
      } else {
        return `${action.params.button.charAt(0).toUpperCase() + action.params.button.slice(1)} click${action.params.hold ? ' (hold)' : ''}`;
      }
      case "mouserelease":
        return `${action.params.button} release`;
      
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

// ActionItem component for draggable actions
interface ActionItemProps {
  item: Action;
  itemSelected: number;
  dragHandleProps: object;
  commonProps: {
    section: string;
    isEditing: {section: string, index: number} | null;
    setIsEditing: React.Dispatch<React.SetStateAction<{section: string, index: number} | null>>;
    handleUpdateAction: (index: number, updatedAction: Action, section: string) => void;
    handleDeleteAction: (index: number, section: string) => void;
    handleCancelEdit: () => void;
    getActionTypeDisplayName: (actionType: string) => string;
    getActionSummary: (action: Action) => string;
    actionsList: Action[];
  };
}

class ActionItem extends React.Component<ActionItemProps> {
  getDragHeight() {
    return 80; // Approximate height of action item
  }

  render() {
    const { item: action, itemSelected, dragHandleProps, commonProps } = this.props;
    const { 
      section, 
      isEditing, 
      setIsEditing, 
      handleUpdateAction, 
      handleDeleteAction, 
      handleCancelEdit,
      getActionTypeDisplayName,
      getActionSummary,
      actionsList
    } = commonProps;

    // Find the actual index of this action in the appropriate list by its ID
    const index = actionsList.findIndex((a: Action) => a.id === action.id);
    
    // Check if this action is currently being edited
    const isCurrentlyEditing = isEditing?.section === section && isEditing.index === index;

    return (
      <div className="mb-2">
        {isCurrentlyEditing ? (
          // When editing, don't apply drag props to prevent unwanted dragging
          <ActionEditor
            action={action}
            onSave={(updatedAction) => handleUpdateAction(index, updatedAction, section)}
            onCancel={handleCancelEdit}
          />
        ) : (
          // Only apply drag props when not editing
          <div {...dragHandleProps}>
            <Card className="p-3">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="bg-default-100 p-1 rounded-full cursor-move">
                    <Icon icon="lucide:grip" className="text-default-500" />
                  </div>
                  <div>
                    <span className="font-medium">{getActionTypeDisplayName(action.type)}</span>
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
          </div>
        )}
      </div>
    );
  }
}