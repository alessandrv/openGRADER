import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { listenToMidiStatus } from "../lib/tauri";
import { addToast } from "@heroui/react";

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
  

  useEffect(() => {
    selectedInputRef.current = selectedInput; // Keep ref updated
  }, [selectedInput]);

  useEffect(() => { 
    inputsRef.current = inputs; 
  }, [inputs]);

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
        addToast({
          title: "MIDI Input Selected",
          description: input.name,
          color: "secondary"
        });
      } else {
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
    
  // Periodically refresh input list to detect new devices
  useEffect(() => {
    let isRefreshMounted = true;
    let lastInputsString = ''; // Keep track of last inputs state
    console.log("[MidiProvider] Setting up periodic MIDI input list refresh.");
    
    const refreshInterval = setInterval(async () => {
      if (!selectedInputRef.current) { // Only refresh if not actively connected to an input
        try {
          const portNames = await invoke<string[]>('list_midi_inputs_rust');
          if (!isRefreshMounted) return;
          const currentInputs = inputsRef.current;
          const newInputs = portNames.map((name, index) => ({ id: index.toString(), name }));
          
          const newInputsString = JSON.stringify(newInputs);
          if (newInputsString !== lastInputsString) {
            console.log("[MidiProvider] MIDI input list changed, updating.");
            setInputs(newInputs);
            
            // Only show toasts if we have a previous state to compare against
            if (lastInputsString) {
              const currentLength = currentInputs?.length || 0;
              const newLength = newInputs.length;
              
              if (newLength > currentLength) {
                addToast({
                  title: "New MIDI Devices Detected",
                  description: `${newLength - currentLength} new MIDI input(s) available`,
                  color: "primary"
                });
              } else if (newLength < currentLength) {
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
          // console.error("[MidiProvider] Error refreshing MIDI inputs:", err); // Can be noisy
        }
      }
    }, 5000); // Check every 5 seconds
    
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
        midiEventLog
      }}
    >
      {children}
    </MidiContext.Provider>
  );
};