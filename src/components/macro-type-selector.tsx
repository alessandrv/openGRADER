import React from "react";
import { Card, RadioGroup, Radio } from "@heroui/react";
import { Icon } from "@iconify/react";

interface MacroTypeSelectorProps {
  value: "standard" | "encoder" | "encoder-click";
  onChange: (value: "standard" | "encoder" | "encoder-click") => void;
}

export const MacroTypeSelector: React.FC<MacroTypeSelectorProps> = ({ value, onChange }) => {
  return (
    <div>
      <p className="text-sm font-medium mb-2">Macro Type</p>
      <div className="grid grid-cols-3 gap-2">
        <div 
          className={`m-0 bg-content1 hover:bg-content2 cursor-pointer rounded-medium p-3 border-2 ${value === "standard" ? "border-primary" : "border-transparent"}`}
          onClick={() => onChange("standard")}
        >
          <div className="flex gap-2 items-center">
            <Icon icon="lucide:music" className="text-xl text-primary" />
            <div>
              <div className="font-medium">Standard Macro</div>
              <div className="text-xs text-foreground-500">Single MIDI trigger with actions</div>
            </div>
          </div>
        </div>
        
        <div 
          className={`m-0 bg-content1 hover:bg-content2 cursor-pointer rounded-medium p-3 border-2 ${value === "encoder" ? "border-primary" : "border-transparent"}`}
          onClick={() => onChange("encoder")}
        >
          <div className="flex gap-2 items-center">
            <Icon icon="lucide:rotate-cw" className="text-xl text-primary" />
            <div>
              <div className="font-medium">Encoder Macro</div>
              <div className="text-xs text-foreground-500">Increment/decrement actions</div>
            </div>
          </div>
        </div>
        
        <div 
          className={`m-0 bg-content1 hover:bg-content2 cursor-pointer rounded-medium p-3 border-2 ${value === "encoder-click" ? "border-primary" : "border-transparent"}`}
          onClick={() => onChange("encoder-click")}
        >
          <div className="flex gap-2 items-center">
            <Icon icon="lucide:mouse-pointer-click" className="text-xl text-primary" />
            <div>
              <div className="font-medium">Encoder with Click</div>
              <div className="text-xs text-foreground-500">Inc/dec/click actions</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};