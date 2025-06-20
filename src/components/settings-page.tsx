import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardBody, Input, Switch, Button, Divider, Slider } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useSettings } from "../hooks/use-settings";

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, resetSettings, isLoading } = useSettings();
  const [timeoutInputValue, setTimeoutInputValue] = useState<string>("");

  // Initialize timeout input value when settings load
  useEffect(() => {
    setTimeoutInputValue(settings.defaultTimeout.toString());
  }, [settings.defaultTimeout]);

  const handleTimeoutChange = (value: string) => {
    // Allow any input including empty string
    setTimeoutInputValue(value);
  };

  const handleTimeoutBlur = () => {
    // Parse the value and apply constraints only when user finishes editing
    const numValue = parseInt(timeoutInputValue);
    
    if (isNaN(numValue) || timeoutInputValue.trim() === "") {
      // If invalid or empty, set to minimum (100ms)
      const newValue = 100;
      setTimeoutInputValue(newValue.toString());
      updateSettings({ defaultTimeout: newValue });
    } else {
      // Apply constraints: min 100ms, max 30000ms
      const constrainedValue = Math.max(100, Math.min(30000, numValue));
      setTimeoutInputValue(constrainedValue.toString());
      updateSettings({ defaultTimeout: constrainedValue });
    }
  };

  const handleTimeoutKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTimeoutBlur();
    }
  };

  if (isLoading) {
    return (
      <Card className="p-8">
        <div className="flex items-center justify-center">
          <Icon icon="lucide:loader-2" className="animate-spin text-2xl" />
          <span className="ml-2">Loading settings...</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Macro Behavior Settings */}
      <Card>
        <CardHeader className="flex gap-3">
          <Icon icon="lucide:zap" className="text-2xl text-primary" />
          <div className="flex flex-col">
            <p className="text-md font-semibold">Macro Behavior</p>
            <p className="text-small text-default-500">Configure how macros are triggered and executed</p>
          </div>
        </CardHeader>
        <Divider/>
        <CardBody className="space-y-6">
          {/* Macro Trigger Delay */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-sm font-medium">Macro Trigger Delay</h4>
                <p className="text-xs text-default-500">
                  Delay between switching to different macro groups
                </p>
              </div>
              <div className="text-right">
                <span className="text-sm font-mono">{settings.macroTriggerDelay}ms</span>
              </div>
            </div>
            <Slider
              size="sm"
              step={10}
              minValue={0}
              maxValue={2000}
              value={settings.macroTriggerDelay}
              onChange={(value) => updateSettings({ macroTriggerDelay: Array.isArray(value) ? value[0] : value })}
              className="max-w-md"
              classNames={{
                base: "w-full",
                filler: "bg-gradient-to-r from-primary-500 to-secondary-500"
              }}
            />
            <div className="flex justify-between text-xs text-default-400">
              <span>0ms (No delay)</span>
              <span>2000ms (2 seconds)</span>
            </div>
          </div>

          {/* Conflict Prevention */}
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-sm font-medium">Macro Conflict Prevention</h4>
              <p className="text-xs text-default-500">
                Prevent multiple macros with the same MIDI trigger from running simultaneously
              </p>
            </div>
            <Switch
              isSelected={settings.enableMacroConflictPrevention}
              onValueChange={(value) => updateSettings({ enableMacroConflictPrevention: value })}
              color="primary"
            />
          </div>

          {/* Default Timeout */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <div>
                <h4 className="text-sm font-medium">Default Macro Timeout</h4>
                <p className="text-xs text-default-500">
                  Default timeout for new macros (before/after actions)
                </p>
              </div>
              <Input
                type="number"
                size="sm"
                value={timeoutInputValue}
                onChange={(e) => handleTimeoutChange(e.target.value)}
                onBlur={handleTimeoutBlur}
                onKeyPress={handleTimeoutKeyPress}
                endContent={<span className="text-xs text-default-500">ms</span>}
                className="w-32"
                placeholder="100"
                min="100"
                max="30000"
              />
            </div>
            <p className="text-xs text-default-400">
              Range: 100ms - 30,000ms (30 seconds). Values below 100ms will be set to 100ms.
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Settings Info */}
      <Card>
        <CardHeader className="flex gap-3">
          <Icon icon="lucide:info" className="text-2xl text-default-400" />
          <div className="flex flex-col">
            <p className="text-md font-semibold">About Settings</p>
            <p className="text-small text-default-500">Information about your configuration</p>
          </div>
        </CardHeader>
        <Divider/>
        <CardBody className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <h5 className="font-medium text-default-600">Current Configuration</h5>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span>Trigger Delay:</span>
                  <span className="font-mono">{settings.macroTriggerDelay}ms</span>
                </div>
                <div className="flex justify-between">
                  <span>Conflict Prevention:</span>
                  <span className={settings.enableMacroConflictPrevention ? "text-success" : "text-danger"}>
                    {settings.enableMacroConflictPrevention ? "Enabled" : "Disabled"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Default Timeout:</span>
                  <span className="font-mono">{settings.defaultTimeout}ms</span>
                </div>
              </div>
            </div>
            
            <div className="space-y-2">
              <h5 className="font-medium text-default-600">Tips</h5>
              <ul className="text-xs space-y-1 text-default-500">
                <li>• Trigger delays only apply when switching between different macro groups</li>
                <li>• Conflict prevention shows a dialog when macros have the same MIDI trigger</li>
                <li>• Encoder macros in the same group don't conflict with each other</li>
                <li>• Settings are saved automatically when you change them</li>
              </ul>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Actions */}
      <Card>
        <CardBody>
          <div className="flex justify-between items-center">
            <div>
              <h4 className="text-sm font-medium">Reset Settings</h4>
              <p className="text-xs text-default-500">
                Restore all settings to their default values
              </p>
            </div>
            <Button
              color="danger"
              variant="flat"
              size="sm"
              onPress={resetSettings}
              startContent={<Icon icon="lucide:refresh-ccw" />}
            >
              Reset to Defaults
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}; 