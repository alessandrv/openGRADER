import React from "react";
import { Divider, Select, SelectItem } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useMidi } from "../contexts/midi-context";

export const MidiLog = () => {
  const { 
    isEnabled, 
    inputs, 
    midiEventLog, 
    selectedInput, 
    setSelectedInput 
  } = useMidi();

  const renderEventValue = (event: any) => {
    if (event.type === "noteon" || event.type === "noteoff") {
      return (
        <div className="flex items-center gap-1">
          <span className="font-mono text-foreground-700">
            Note {event.note}
          </span>
          {event.type === "noteon" && (
            <span className="text-xs px-1 py-0.5 rounded bg-success-100 text-success-700">
              {event.value}
            </span>
          )}
        </div>
      );
    } else if (event.type === "controlchange") {
    return (
        <div className="flex items-center gap-1">
          <span className="font-mono text-foreground-700">
            CC {event.controller}
          </span>
          <span className="text-xs px-1 py-0.5 rounded bg-primary-100 text-primary-700">
            {event.value}
          </span>
      </div>
    );
  }
    return null;
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            selectedInput ? "bg-success" : (isEnabled ? "bg-warning" : "bg-danger")
          }`}></div>
          <span className="text-sm">
            {selectedInput 
              ? `Connected:` 
              : (isEnabled ? "MIDI Ready" : "MIDI Disabled")
            }
          </span>
        </div>
        <Select
          placeholder="Select MIDI Input"
          selectedKeys={selectedInput ? [selectedInput.id] : []}
          onChange={(e) => {
            const inputId = e.target.value;
            const input = inputs.find((input) => input.id === inputId);
            setSelectedInput(input || null);
          }}
          isDisabled={!isEnabled || inputs.length === 0}
          size="sm" 
          className="max-w-[200px]"
        >
          {inputs.map((input) => (
            <SelectItem key={input.id}>
              {input.name}
            </SelectItem>
          ))}
        </Select>
      </div>

      <Divider className="my-2" />

      <div className="flex-grow overflow-hidden">
        {midiEventLog.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full opacity-60 p-4">
            <Icon icon="lucide:activity" className="text-4xl mb-2" />
            <p className="text-center text-sm">No MIDI activity detected yet</p>
            <p className="text-center text-xs mt-1">Connect a MIDI device and select an input</p>
        </div>
      ) : (
          <div className="space-y-1 pb-2">
            {midiEventLog.map((event, index) => (
              <div 
                key={`midi-event-${event.timestamp}-${index}`}
                className="text-xs p-2 rounded bg-default-50 flex justify-between items-center"
              >
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 min-w-[40px]">
                    {event.type === "noteon" && <Icon icon="lucide:arrow-down" className="text-success" />}
                    {event.type === "noteoff" && <Icon icon="lucide:arrow-up" className="text-danger" />}
                    {event.type === "controlchange" && <Icon icon="lucide:sliders" className="text-primary" />}
                    <span className="text-foreground-400">Ch {event.channel}</span>
                  </div>
                  {renderEventValue(event)}
                </div>
                <span className="text-foreground-400">
                  {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
              </div>
            ))}
          </div>
      )}
      </div>
    </div>
  );
};