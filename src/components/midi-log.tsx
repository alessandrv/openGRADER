import { Divider, Select, SelectItem, Button, Tooltip } from "@heroui/react";
import { Icon } from "@iconify/react";
import React from "react";
import { useMidi } from "../contexts/midi-context";

export const MidiLog = () => {
  const { 
    isEnabled, 
    inputs, 
    midiEventLog, 
    selectedInput, 
    setSelectedInput 
  } = useMidi();

  // Helper: find a macro by its concrete id or by a group id
  const findMacroByAnyId = (id: string) => {
    // Direct match by macro id
    const direct = macrosById.get(id);
    if (direct) return direct;
    // Fallback: search any macro that belongs to this group
    for (const m of macrosById.values()) {
      if (m?.groupId && m.groupId === id) return m;
    }
    return null;
  };

  const navigateToMacro = (macroId: string) => {
    try {
      // Also store the category to expand so the macro is visible
      const macro = findMacroByAnyId(macroId);
      const catId = (macro?.categoryId) || "default";
      localStorage.setItem("expandCategoryId", catId);
      // Switch to macros view by writing a nav hint to localStorage (read by App on load/change)
      localStorage.setItem("navigateToView", "macros");
      localStorage.setItem("scrollToMacroId", macroId);
      // Trigger a soft navigation by dispatching a custom event
      window.dispatchEvent(new CustomEvent("navigate-to-macros"));
    } catch (e) {
      console.error("Failed to navigate to macro", e);
    }
  };

  // Truncate a label to maxLen characters with ellipsis
  const truncateLabel = (label: string, maxLen = 20) =>
    label.length > maxLen ? label.slice(0, maxLen - 1) + "…" : label;

  // Build quick lookup maps for macros and categories from localStorage
  const macrosById = React.useMemo(() => {
    try {
      const list = JSON.parse(localStorage.getItem("midiMacros") || "[]");
      const map = new Map<string, any>();
      for (const m of list) map.set(m.id, m);
      return map;
    } catch {
      return new Map<string, any>();
    }
  }, [midiEventLog]);

  const categoriesById = React.useMemo(() => {
    try {
      const list = JSON.parse(localStorage.getItem("macroCategories") || "[]");
      const map = new Map<string, any>();
      for (const c of list) map.set(c.id, c);
      // Ensure default exists
      if (!map.has("default")) map.set("default", { id: "default", name: "General", color: "default" });
      return map;
    } catch {
      return new Map<string, any>([["default", { id: "default", name: "General", color: "default" }]]);
    }
  }, [midiEventLog]);

  const hexToRgba = (hex: string, alpha = 1) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) return hex;
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Map of supported hue names to representative hex (Tailwind 500 scale)
  const HUE_TO_HEX: Record<string, string> = {
    red: "#ef4444",
    rose: "#f43f5e",
    pink: "#ec4899",
    fuchsia: "#d946ef",
    purple: "#a855f7",
    violet: "#8b5cf6",
    indigo: "#6366f1",
    blue: "#3b82f6",
    sky: "#0ea5e9",
    cyan: "#06b6d4",
    teal: "#14b8a6",
    emerald: "#10b981",
    green: "#22c55e",
    lime: "#84cc16",
    yellow: "#eab308",
    amber: "#f59e0b",
    orange: "#f97316",
    coral: "#fb6f5f",
    salmon: "#fa8072",
    crimson: "#dc143c",
  };

  const normalizeToHex = (color: string): string | null => {
    if (!color) return null;
    const c = color.trim().toLowerCase();
    if (c.startsWith('#') && (c.length === 7)) return c; // #rrggbb
    if (HUE_TO_HEX[c]) return HUE_TO_HEX[c];
    // Basic CSS color names could be used directly; return null to indicate non-hex
    return null;
  };

  const getButtonPropsForMacro = (macroId?: string) => {
    if (!macroId) return { color: "default" as const, style: undefined as React.CSSProperties | undefined, variant: "flat" as const };
    const macro = findMacroByAnyId(macroId);
    const categoryId = (macro?.categoryId) || "default";
    const category = categoriesById.get(categoryId) || categoriesById.get("default");
    const c = category?.color as string | undefined;
    const named = ["default", "primary", "secondary", "success", "warning", "danger"] as const;
    if (!c || (named as readonly string[]).includes(c)) {
      // Use a solid variant for preset colors to ensure visible background
      return { color: (c as any) || "default", style: undefined, variant: "solid" as const };
    }
    // Non-theme color: resolve to hex if it's a known hue or hex, then apply inline styles
    const hex = normalizeToHex(c) || c; // c may be a css color name
    const bg = normalizeToHex(c) ? hexToRgba(hex, 0.18) : hex; // add subtle alpha for hex hues
    const border = normalizeToHex(c) ? hexToRgba(hex, 0.35) : undefined;
    return {
      color: undefined,
      style: {
        backgroundColor: bg,
        border: border ? `1px solid ${border}` : undefined,
  color: "white",
      } as React.CSSProperties,
      variant: "flat" as const,
    };
  };

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
          aria-label="Select MIDI input device"
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
            {midiEventLog.map((event, index) => {
              const isMacro = event.type === 'macro-trigger';
              return (
                <div 
                  key={`midi-event-${event.timestamp}-${index}`}
                  className="text-xs p-2 rounded flex justify-between items-center bg-default-50"
                >
                  <div className="flex items-center gap-2">
                    {!isMacro && (
                      <div className="flex items-center gap-1 min-w-[40px]">
                        {event.type === "noteon" && <Icon icon="lucide:arrow-down" className="text-success" />}
                        {event.type === "noteoff" && <Icon icon="lucide:arrow-up" className="text-danger" />}
                        {event.type === "controlchange" && <Icon icon="lucide:sliders" className="text-primary" />}
                        <span className="text-foreground-400">Ch {event.channel}</span>
                      </div>
                    )}
                    {(
                      renderEventValue(event)
                    )}
                  </div>
                  <div className="flex items-center gap-2">
          {!isMacro && event.macroId && (() => {
                      const props = getButtonPropsForMacro(event.macroId);
                      return (
            <Tooltip content="Open macro">
                          <Button 
                            size="sm" 
                            variant={props.variant as any}
                            color={props.color as any}
                            style={props.style}
                            onPress={() => navigateToMacro(event.macroId!)}
                          >
              {truncateLabel(event.macroName || 'Macro', 20)}
                          </Button>
                        </Tooltip>
                      );
                    })()}
                    <span className="text-foreground-400">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
      )}
      </div>
    </div>
  );
};