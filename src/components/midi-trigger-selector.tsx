import React, { useState, useEffect } from "react";
import { Button, Card } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useMidi } from "../contexts/midi-context";
import { MacroDefinition } from "../types/macro"; // Import MacroDefinition

// Use a type alias for clarity, derived from MacroDefinition
type MidiTriggerValue = MacroDefinition['trigger'];

interface MidiTriggerSelectorProps {
  value: MidiTriggerValue | null;
  onChange: (value: MidiTriggerValue | null) => void;
  forceDirection?: "increment" | "decrement";
  matchChannel?: number;
  matchController?: number;
}

export const MidiTriggerSelector: React.FC<MidiTriggerSelectorProps> = ({ 
  value, 
  onChange, 
  forceDirection,
  matchChannel,
  matchController
}) => {
  const [isListening, setIsListening] = useState(false);
  const { lastReceivedMessage, isEnabled } = useMidi();
  const [listeningStartTime, setListeningStartTime] = useState<number | null>(null);
    
  // When in listening mode, watch for MIDI input
  useEffect(() => {
    if (!isListening || !lastReceivedMessage || !listeningStartTime) return;
    
    // Only process messages that arrived AFTER listening started
    if (lastReceivedMessage.timestamp > listeningStartTime) {
      // Process any relevant MIDI message type
      if (lastReceivedMessage.type === "noteon" || lastReceivedMessage.type === "noteoff" || lastReceivedMessage.type === "controlchange") {
        // Construct as compatible with MidiTriggerValue
        const newTriggerValue: Partial<MidiTriggerValue> = {
          type: lastReceivedMessage.type as MidiTriggerValue['type'], // Cast the type
          channel: lastReceivedMessage.channel,
        };
        
        if (lastReceivedMessage.type === "noteon" || lastReceivedMessage.type === "noteoff") {
          newTriggerValue.note = lastReceivedMessage.note;
          // For noteoff, value from lastReceivedMessage might be 0, which is fine.
          // For noteon, it will be the velocity.
          newTriggerValue.value = lastReceivedMessage.value; 
        } else { // controlchange
          newTriggerValue.controller = lastReceivedMessage.controller;
          newTriggerValue.value = lastReceivedMessage.value;
        }
        
        // Add direction for encoder if specified and it's a controlchange or note
        if (forceDirection && (lastReceivedMessage.type === "controlchange" || lastReceivedMessage.type === "noteon" || lastReceivedMessage.type === "noteoff")) {
          newTriggerValue.direction = forceDirection;
        }
        
        onChange(newTriggerValue as MidiTriggerValue); // Cast to full type before calling onChange
        setIsListening(false);
        setListeningStartTime(null); // Reset start time
      }
    }
  }, [lastReceivedMessage, isListening, onChange, forceDirection, listeningStartTime]);
            
  // Removed auto-filling effect to prevent unwanted cross-detection between increment and decrement
  // useEffect(() => {
  //   if (matchChannel !== undefined && matchController !== undefined && !value && forceDirection) {
  //     onChange({
  //       type: "controlchange", // Encoders are typically CC
  //       channel: matchChannel,
  //       controller: matchController,
  //       direction: forceDirection,
  //       // value: undefined, // value is optional, so omitting is fine
  //     } as MidiTriggerValue);
  //   }
  // }, [matchChannel, matchController, forceDirection, onChange, value]);
  
  const handleStartListening = () => {
    setIsListening(true);
    setListeningStartTime(Date.now()); // Record the time when listening starts
  };

  const handleStopListening = () => {
    setIsListening(false);
    setListeningStartTime(null); // Reset start time
  };

  const renderTriggerDetails = () => {
    if (!value) return null;
    
    let description = "";
    let details: string[] = [];

    if (value.channel !== undefined) details.push(`Ch ${value.channel}`);

    if (value.type === "noteon" || value.type === "noteoff") {
      description = value.type === "noteon" ? "Note On" : "Note Off";
      if (value.note !== undefined) details.push(`Note ${value.note}`);
      if (value.value !== undefined) details.push(`Vel ${value.value}`);
      if (value.direction) {
        details.push(value.direction === "increment" ? "Inc (↑)" : "Dec (↓)");
      }
    } else if (value.type === "controlchange") {
      description = "Control Change";
      if (value.controller !== undefined) details.push(`CC ${value.controller}`);
      if (value.value !== undefined) details.push(`Val ${value.value}`);
      if (value.direction) {
        details.push(value.direction === "increment" ? "Inc (↑)" : "Dec (↓)");
      }
    } else {
      description = value.type; // Fallback for other types if any
    }

      return (
      <div className="p-3 rounded-md bg-default-50 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{description}</span>
            {value.direction && (value.type === "controlchange" || value.type === "noteon" || value.type === "noteoff") && (
              <span className={`text-xs px-2 py-0.5 rounded ${
                value.direction === "increment" 
                  ? "bg-success-100 text-success-700" 
                  : "bg-warning-100 text-warning-700"
              }`}>
                {value.direction === "increment" ? "Increment" : "Decrement"}
              </span>
            )}
            {!value.direction && (value.type === "controlchange" || value.type === "noteon" || value.type === "noteoff") && (
              <span className="text-xs px-2 py-0.5 rounded bg-secondary-100 text-secondary-700">
                Click
              </span>
            )}
          </div>
          <p className="text-xs text-foreground-500 mt-1">
            {details.join(" / ")}
          </p>
        </div>
        <Button
          size="sm"
          variant="light"
          color="danger"
          onPress={() => onChange(null)}
          isIconOnly
          isDisabled={matchChannel !== undefined && matchController !== undefined && forceDirection !== undefined} // Don't allow clearing pre-filled encoder triggers
        >
          <Icon icon="lucide:x" />
        </Button>
      </div>
      );
  };
  
  // No longer need to check for pre-filled encoders since we disabled auto-filling
  const isPreFilledEncoder = false;

  return (
    <Card className="p-4">
      {!value || isListening ? ( // Show listening UI if no value OR explicitly listening
        <>
          {isListening ? (
            <div className="flex flex-col items-center justify-center p-6 space-y-4">
              <div className="animate-pulse flex items-center justify-center w-16 h-16 rounded-full bg-primary-100">
                <Icon icon="lucide:activity" className="text-primary text-2xl" />
          </div>
              <p className="text-center">
                Listening for MIDI message...
              </p>
              <p className="text-xs text-foreground-500 text-center">
                Play a note or move a control on your MIDI device
          </p>
              <Button
                color="danger"
                variant="flat"
                onPress={handleStopListening}
                size="sm"
              >
            Cancel
          </Button>
        </div>
          ) : (
            <Button
              color="primary"
              fullWidth
              startContent={<Icon icon="lucide:radio" />}
              onPress={handleStartListening}
              isDisabled={!isEnabled || isPreFilledEncoder}
            >
              Detect MIDI Input
            </Button>
          )}
           {value && !isListening && !isPreFilledEncoder && ( // Show current value if set and not listening, and not a pre-filled encoder
            <div className="mt-3">
                {renderTriggerDetails()}
          </div>
           )}
        </>
      ) : ( // Value is set and not currently listening
        renderTriggerDetails()
      )}
    </Card>
  );
};