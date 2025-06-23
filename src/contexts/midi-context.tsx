import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { listenToMidiStatus, registerMacro, ActionType, ActionParams, MacroAction, MacroConfig } from "../lib/tauri";
import { addToast } from "@heroui/react";
import { MacroDefinition, Action } from "../types/macro";

// Type definitions - we'll keep these similar to what we had before for compatibility
interface MidiContextType {
  isEnabled: boolean;
  inputs: { id: string, name: string }[];
  selectedInput: { id: string, name: string } | null;
  setSelectedInput: (input: { id: string, name: string } | null) => void;
  lastReceivedMessage: {
    type: string;
    channel?: number;
    note?: number;
    controller?: number;
    value?: number;
    timestamp: number;
  } | null;
  midiEventLog: {
    type: string;
    channel?: number;
    note?: number;
    controller?: number;
    value?: number;
    timestamp: number;
  }[];
  showDeviceModal: boolean;
  setShowDeviceModal: (show: boolean) => void;
}

// Event type for messages from Rust
interface RustMidiEvent {
  status: number;
  data1: number;
  data2: number;
  timestamp: number;
  type_name: string;
  channel: number;
  note?: number;
  velocity?: number;
  controller?: number;
  value?: number;
}

const MidiContext = createContext<MidiContextType | null>(null);

export const useMidi = () => {
  const context = useContext(MidiContext);
  if (!context) {
    throw new Error("useMidi must be used within a MidiProvider");
  }
  return context;
};

// Utility functions for macro initialization (moved from MacrosList)
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
        return { 
          keys,
          hold: params.hold || false
        };
      } else {
        // Simple key press without modifiers
        return { 
          key: params.key || "",
          hold: params.hold || false
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
          hold: params.hold || false,
          x: params.x || 0,
          y: params.y || 0,
        };
      }
    case "mouserelease":
      return {
        button: params.button || "left",
      };
    case "mousemove":
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
        x: dx,
        y: dy,
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

export const MidiProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isEnabled, setIsEnabled] = useState<boolean>(false);
  const [inputs, setInputs] = useState<{ id: string, name: string }[]>([]);
  const [selectedInput, setSelectedInputInternal] = useState<{ id: string, name: string } | null>(null);
  const selectedInputRef = useRef(selectedInput); // Ref to keep track of selectedInput for cleanup
  const [lastReceivedMessage, setLastReceivedMessage] = useState<{
    type: string;
    channel?: number;
    note?: number;
    controller?: number;
    value?: number;
    timestamp: number;
  } | null>(null);
  const [midiEventLog, setMidiEventLog] = useState<{
    type: string;
    channel?: number;
    note?: number;
    controller?: number;
    value?: number;
    timestamp: number;
  }[]>([]);
  
  const rustMidiEventUnlistenerRef = useRef<UnlistenFn | null>(null);
  const [isRustEventListenerActive, setIsRustEventListenerActive] = useState(false);
  const inputsRef = React.useRef(inputs);
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [hasShownInitialModal, setHasShownInitialModal] = useState(false);
  

  useEffect(() => {
    selectedInputRef.current = selectedInput; // Keep ref updated
  }, [selectedInput]);

  useEffect(() => { 
    inputsRef.current = inputs; 
  }, [inputs]);

  // Check if we should show the device selection modal
  useEffect(() => {
    // Check if user has previously selected a device
    const savedDevice = localStorage.getItem("selectedMidiDevice");
    
    if (!hasShownInitialModal && isEnabled && inputs.length > 0) {
      if (!savedDevice && !selectedInput) {
        // First time user with available devices - show modal
        console.log("[MidiProvider] First time user detected, showing device selection modal");
        setShowDeviceModal(true);
      } else if (savedDevice && !selectedInput) {
        // Try to restore previously selected device
        try {
          const parsedDevice = JSON.parse(savedDevice);
          const matchingInput = inputs.find(input => input.name === parsedDevice.name);
          if (matchingInput) {
            console.log("[MidiProvider] Restoring previously selected device:", parsedDevice.name);
            setSelectedInput(matchingInput);
          } else {
            console.log("[MidiProvider] Previously selected device not found, showing selection modal");
            setShowDeviceModal(true);
          }
        } catch (e) {
          console.error("[MidiProvider] Error parsing saved device:", e);
          setShowDeviceModal(true);
        }
      }
      setHasShownInitialModal(true);
    }
  }, [isEnabled, inputs, selectedInput, hasShownInitialModal]);

  // Effect for initializing MIDI, listing ports, and setting up the main rust-midi-event listener
  useEffect(() => {
    let isMounted = true;
    console.log("[MidiProvider] Mount/Effect Run. isRustEventListenerActive:", isRustEventListenerActive);

    async function initializeAndListen() {
      console.log("[MidiProvider] initializeAndListen called.");
      try {
        console.log("[MidiProvider] Listing MIDI inputs...");
        const portNames = await invoke<string[]>('list_midi_inputs_rust');
        if (!isMounted) return;
        const inputPorts = portNames.map((name, index) => ({ id: index.toString(), name }));
        setInputs(inputPorts);
        setIsEnabled(true);
        // addToast({ title: "MIDI Enabled", description: `${inputPorts.length} inputs detected`, color: "success" });
        console.log("[MidiProvider] MIDI inputs listed:", inputPorts.length);
      } catch (err) {
        console.error("[MidiProvider] Could not initialize MIDI or list ports:", err);
        if (!isMounted) return;
        setIsEnabled(false);
        // addToast({ title: "MIDI Error", description: `Failed to initialize MIDI: ${err}`, color: "danger" });
      }

      if (!isRustEventListenerActive && !rustMidiEventUnlistenerRef.current) {
        console.log("[MidiProvider] Attaching 'rust-midi-event' listener...");
        listen<RustMidiEvent>('rust-midi-event', (event) => {
          const payload = event.payload;
           // console.log("[MidiProvider] Received rust-midi-event:", payload); // Can be noisy
          const message = {
            type: payload.type_name,
            channel: payload.channel,
            note: payload.note,
            controller: payload.controller,
            value: payload.value || payload.velocity, // Use velocity if value is not present (e.g. for noteon)
            timestamp: Date.now()
          };
          setLastReceivedMessage(message);
          setMidiEventLog(prev => [message, ...prev].slice(0, 25));
        }).then(unlistenerFn => {
          if (isMounted) {
            rustMidiEventUnlistenerRef.current = unlistenerFn;
            setIsRustEventListenerActive(true);
            console.log("[MidiProvider] 'rust-midi-event' listener ATTACHED successfully.");
          } else {
            console.log("[MidiProvider] Component unmounted while attaching listener, cleaning up immediately.");
            unlistenerFn(); // Unlisten immediately if component unmounted during setup
          }
        }).catch(err => {
            console.error("[MidiProvider] Error attaching 'rust-midi-event' listener:", err);
        });
      } else {
        console.log("[MidiProvider] 'rust-midi-event' listener already active or unlisten function exists.");
      }

      // Initialize macros after MIDI setup
      console.log("[MidiProvider] Starting macro initialization...");
      await initializeMacros();
    }

    initializeAndListen();

    return () => {
      isMounted = false;
      console.log("[MidiProvider] Cleanup function running.");
      if (rustMidiEventUnlistenerRef.current) {
        console.log("[MidiProvider] Unsubscribing from 'rust-midi-event' listener...");
        rustMidiEventUnlistenerRef.current();
        rustMidiEventUnlistenerRef.current = null;
        setIsRustEventListenerActive(false); // Reset state
        console.log("[MidiProvider] Successfully unsubscribed from 'rust-midi-event'.");
      } else {
        console.log("[MidiProvider] No 'rust-midi-event' unlistener to call during cleanup.");
      }
      // Potentially stop rust listening if a device was selected - handled by selectedInput change
      // However, if the whole provider unmounts, we might want to stop the active device.
      if (selectedInputRef.current) {
        console.log("[MidiProvider] Stopping MIDI listening on unmount for device:", selectedInputRef.current.name);
        invoke('stop_midi_listening_rust').catch(err => {
          console.error("[MidiProvider] Error stopping MIDI listener on unmount:", err);
        });
      }
    };
  }, []); // Run once on mount, unless addToast causes re-runs. Empty array is safer for one-time setup.

  // Macro initialization function (moved from MacrosList)
  const initializeMacros = async () => {
    console.log("[MidiProvider] Initializing macros from localStorage");
    
    // Load macros from localStorage
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
          console.warn("[MidiProvider] Found duplicate macro IDs in localStorage!");
          
          // Find the duplicates
          const duplicateIds = macroIds.filter((id: string, idx: number) => 
            macroIds.indexOf(id) !== idx
          );
          
          console.warn(`[MidiProvider] Duplicate IDs: ${duplicateIds.join(", ")}`);
          
          // Filter out duplicates before setting state - keep only the first occurrence
          loadedMacros = parsedMacros.filter((macro: MacroDefinition, idx: number) => 
            macroIds.indexOf(macro.id) === idx
          );
          
          // Write back de-duplicated macros to localStorage
          localStorage.setItem("midiMacros", JSON.stringify(loadedMacros));
          console.log("[MidiProvider] De-duplicated macros saved back to localStorage");
        } else {
          loadedMacros = parsedMacros;
          console.log(`[MidiProvider] Loaded ${parsedMacros.length} macros from localStorage`);
        }
      } catch (e) {
        console.error("[MidiProvider] Failed to parse macros from localStorage:", e);
        loadedMacros = [];
      }
    } else {
      console.log("[MidiProvider] No macros found in localStorage");
      loadedMacros = [];
    }
    
    // Handle reactivating saved macros if we have any macros
    if (loadedMacros.length > 0) {
      const activeFromStorage = localStorage.getItem("activeMidiMacros");
      if (activeFromStorage) {
        try {
          const activeIds = JSON.parse(activeFromStorage);
          if (Array.isArray(activeIds) && activeIds.length > 0) {
            console.log(`[MidiProvider] Reactivating ${activeIds.length} macros from storage:`, activeIds);
            
            // Process reactivation synchronously to avoid issues
            for (const id of activeIds) {
              try {
                const macro = loadedMacros.find(m => m.id === id);
                if (macro) {
                  console.log(`[MidiProvider] Reactivating macro: ${macro.name} (${id})`);
                  
                  // Convert to MacroConfig format
                  const config = createMacroConfig(macro);
                  
                  // Register with Tauri backend
                  await registerMacro(config);
                  
                  console.log(`[MidiProvider] Successfully reactivated macro: ${macro.name}`);
                } else {
                  console.warn(`[MidiProvider] Could not find macro with ID: ${id}`);
                }
              } catch (error) {
                console.error(`[MidiProvider] Error reactivating macro ${id}:`, error);
              }
            }
            
            console.log(`[MidiProvider] Macro initialization completed`);
          }
        } catch (e) {
          console.error("[MidiProvider] Failed to parse active macros from storage:", e);
        }
      }
    }
  };

  const setSelectedInput = useCallback(async (input: { id: string, name: string } | null) => {
    console.log("[MidiProvider] setSelectedInput called with:", input?.name || 'null');
    try {
      if (selectedInputRef.current) {
        console.log("[MidiProvider] Stopping listening to old input:", selectedInputRef.current.name);
        await invoke('stop_midi_listening_rust');
      }
      
      setSelectedInputInternal(null); // Clear previous selection immediately

      if (input) {
        console.log("[MidiProvider] Starting listening to new input:", input.name);
        await invoke('start_midi_listening_rust', { portIndex: parseInt(input.id) });
        setSelectedInputInternal(input);
        
        // Save selected device to localStorage
        localStorage.setItem("selectedMidiDevice", JSON.stringify(input));
        
        addToast({
          title: "MIDI Input Selected",
          description: input.name,
          color: "secondary"
        });
      } else {
        // Clear saved device when deselecting
        localStorage.removeItem("selectedMidiDevice");
        
         addToast({
          title: "MIDI Input Cleared",
          description: "No MIDI input selected.",
          color: "secondary"
        });
      }
    } catch (err) {
      console.error("[MidiProvider] Error changing MIDI input:", err);
      addToast({
        title: "MIDI Error",
        description: `Failed to connect to MIDI input: ${err}`,
        color: "danger"
      });
      setSelectedInputInternal(null); // Ensure it's reset on error
    }
  }, [addToast]);
  
  // Listen for Tauri backend MIDI status (e.g., connection success/failure from Rust)
  useEffect(() => {
    let isStatusListenerMounted = true;
    console.log("[MidiProvider] Setting up 'midi-status' listener.");
    const unlistenFn = listenToMidiStatus((status: string) => {
      console.log("[MidiProvider] Received 'midi-status':", status);
      
    });
    
    return () => {
      isStatusListenerMounted = false; // This flag can be used if there were async ops before unlisten
      console.log("[MidiProvider] Cleaning up 'midi-status' listener.");
      if (typeof unlistenFn === 'function') {
        unlistenFn();
        console.log("[MidiProvider] 'midi-status' listener unlistened.");
      } else {
        console.error("[MidiProvider] Failed to unlisten from 'midi-status': unlistenFn is not a function", unlistenFn);
      }
    };
  }, [addToast]);
    
  // Periodically refresh input list to detect new devices and disconnections
  useEffect(() => {
    let isRefreshMounted = true;
    let lastInputsString = ''; // Keep track of last inputs state
    console.log("[MidiProvider] Setting up periodic MIDI input list refresh.");
    
    const refreshInterval = setInterval(async () => {
      try {
        const portNames = await invoke<string[]>('list_midi_inputs_rust');
        if (!isRefreshMounted) return;
        
        const currentInputs = inputsRef.current;
        const newInputs = portNames.map((name, index) => ({ id: index.toString(), name }));
        
        const newInputsString = JSON.stringify(newInputs);
        if (newInputsString !== lastInputsString) {
          console.log("[MidiProvider] MIDI input list changed, updating.");
          
          // Check if currently selected device is still available
          const currentSelected = selectedInputRef.current;
          if (currentSelected) {
            const isStillAvailable = newInputs.some(input => 
              input.name === currentSelected.name && input.id === currentSelected.id
            );
            
                         if (!isStillAvailable) {
               console.log("[MidiProvider] Currently selected MIDI device disconnected:", currentSelected.name);
               
               // Clear the selection and stop listening
               try {
                 await invoke('stop_midi_listening_rust');
               } catch (stopErr) {
                 console.error("[MidiProvider] Error stopping MIDI listening after disconnection:", stopErr);
               }
               
               setSelectedInputInternal(null);
               localStorage.removeItem("selectedMidiDevice");
               
               addToast({
                 title: "MIDI Device Disconnected",
                 description: `"${currentSelected.name}" was disconnected`,
                 color: "warning"
               });
               
               // Always show device selection modal after disconnection (like first boot)
               console.log("[MidiProvider] Device disconnected, showing selection modal");
               setTimeout(() => {
                 setShowDeviceModal(true);
               }, 1000); // Small delay to let the user see the disconnection toast first
             }
          }
          
          setInputs(newInputs);
          
          // Show toasts for device changes if we have a previous state to compare against
          if (lastInputsString) {
            const currentLength = currentInputs?.length || 0;
            const newLength = newInputs.length;
            
            if (newLength > currentLength) {
              addToast({
                title: "New MIDI Devices Detected",
                description: `${newLength - currentLength} new MIDI input(s) available`,
                color: "primary"
              });
              
              // If no device is currently selected and we now have devices, show selection modal
              if (!currentSelected && newLength > 0) {
                console.log("[MidiProvider] New MIDI devices detected and no device selected, showing selection modal");
                setTimeout(() => {
                  setShowDeviceModal(true);
                }, 1000); // Small delay to let the user see the detection toast first
              }
            } else if (newLength < currentLength && !currentSelected) {
              // Only show general removal message if no specific device was disconnected
              addToast({
                title: "MIDI Devices Removed", 
                description: `${currentLength - newLength} MIDI input(s) disconnected`,
                color: "warning"
              });
            }
          }
          
          lastInputsString = newInputsString;
        }
      } catch (err) {
        // If we get an error and a device is selected, it might be disconnected
        if (selectedInputRef.current) {
          console.error("[MidiProvider] Error refreshing MIDI inputs, device may be disconnected:", err);
          
          // Try to stop listening and clear selection
          try {
            await invoke('stop_midi_listening_rust');
          } catch (stopErr) {
            console.error("[MidiProvider] Error stopping MIDI listening after error:", stopErr);
          }
          
                     const disconnectedDevice = selectedInputRef.current;
           setSelectedInputInternal(null);
           localStorage.removeItem("selectedMidiDevice");
           
           addToast({
             title: "MIDI Connection Error",
             description: `Lost connection to "${disconnectedDevice.name}"`,
             color: "danger"
           });
           
           // Always show device selection modal after connection error (like first boot)
           console.log("[MidiProvider] Connection error, showing selection modal");
           setTimeout(() => {
             setShowDeviceModal(true);
           }, 1000); // Small delay to let the user see the error toast first
        }
      }
    }, 2000); // Check every 2 seconds for more responsive disconnection detection
    
    return () => {
      isRefreshMounted = false;
      console.log("[MidiProvider] Clearing periodic MIDI input list refresh.");
      clearInterval(refreshInterval);
    };
  }, [addToast]);

  return (
    <MidiContext.Provider 
      value={{
        isEnabled,
        inputs,
        selectedInput,
        setSelectedInput,
        lastReceivedMessage,
        midiEventLog,
        showDeviceModal,
        setShowDeviceModal
      }}
    >
      {children}
    </MidiContext.Provider>
  );
};