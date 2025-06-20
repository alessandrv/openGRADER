import React from "react";
import { Card, Input, Button, Select, SelectItem, Checkbox, addToast, Modal, ModalContent, ModalHeader, ModalBody, Switch } from "@heroui/react";
import { Icon } from "@iconify/react";
import { Action } from "../types/macro";
import { getCursorPosition } from "../lib/tauri";

interface ActionEditorProps {
  action: Action;
  onSave: (action: Action) => void;
  onCancel: () => void;
}

export const ActionEditor: React.FC<ActionEditorProps> = ({ action, onSave, onCancel }) => {
  const [editedAction, setEditedAction] = React.useState<Action>({ ...action });
  const [isDetectingKey, setIsDetectingKey] = React.useState(false);
  const [isCapturingCoordinates, setIsCapturingCoordinates] = React.useState(false);
  const [coordCaptureActive, setCoordCaptureActive] = React.useState(false);
  const [mousePosition, setMousePosition] = React.useState({ x: 0, y: 0 });
  
  // Debug log whenever the edited action changes
  React.useEffect(() => {
    console.log("Edited action updated:", editedAction);
  }, [editedAction]);

  // Effect to handle coordinate detection mode
  React.useEffect(() => {
    if (!coordCaptureActive) return;
    
    const checkInterval = setInterval(async () => {
      try {
        // Get the actual screen cursor position from Tauri backend
        const [x, y] = await getCursorPosition();
        setMousePosition({ x, y });
      } catch (error) {
        console.error("Failed to get cursor position:", error);
      }
    }, 100); // Update every 100ms
    
    // Handle keyboard shortcuts for coordinate capture
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Escape cancels the detection
      if (e.key === "Escape") {
        setCoordCaptureActive(false);
        addToast({
          title: "Coordinates Capture Cancelled",
          description: "Coordinate detection mode was cancelled",
          color: "warning"
        });
      }
      
      // Ctrl+C captures the current coordinates
      if (e.key === "c" && e.ctrlKey) {
        e.preventDefault(); // Prevent normal copy behavior
        try {
          const [x, y] = await getCursorPosition();
          console.log("Captured coordinates from backend:", x, y);
          
          // Debug the current state
          console.log("Current action params before update:", editedAction.params);
          
          // Try a more direct approach - update both parameters at once
          const updatedParams = {
            ...editedAction.params,
            x: x, // Make sure x is explicitly set
            y: y  // Make sure y is explicitly set
          };
          
          console.log("New params to be set:", updatedParams);
          
          // Set the entire params object at once
          setEditedAction({
            ...editedAction,
            params: updatedParams
          });
          
          // Exit capture mode
          setCoordCaptureActive(false);
          
          // Show confirmation toast
          addToast({
            title: "Coordinates Captured",
            description: `Captured coordinates: X: ${x}, Y: ${y}`,
            color: "success"
          });
          
          // Check state after update
          setTimeout(() => {
            console.log("Params after update:", editedAction.params);
          }, 200);
        } catch (error) {
          console.error("Failed to capture cursor position:", error);
          addToast({
            title: "Capture Failed",
            description: "Could not get cursor position from system",
            color: "danger"
          });
        }
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    
    return () => {
      clearInterval(checkInterval);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [coordCaptureActive, addToast]);

  const handleParamChange = (key: string, value: any) => {
    console.log(`Setting param ${key} to ${value}`);
    setEditedAction({
      ...editedAction,
      params: {
        ...editedAction.params,
        [key]: value,
      },
    });
  };

  const handleModifierToggle = (modifier: string) => {
    const currentModifiers: string[] = editedAction.params.modifiers || [];
    const newModifiers = currentModifiers.includes(modifier)
      ? currentModifiers.filter((m: string) => m !== modifier)
      : [...currentModifiers, modifier];
    
    handleParamChange('modifiers', newModifiers);
  };

  const handleTypeChange = (type: string) => {
    setEditedAction({
      ...editedAction,
      type,
      params: getDefaultParamsForType(type),
    });
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
        return { x: 0, y: 0, relative: false, duration: 500 };
      case "delay":
        return { duration: 500 };
      default:
        return {};
    }
  };

  const handleKeyDetection = () => {
    setIsDetectingKey(true);
    
    const keyHandler = (e: KeyboardEvent) => {
      e.preventDefault();
      handleParamChange("key", e.key);
      setIsDetectingKey(false);
      window.removeEventListener("keydown", keyHandler);
    };
    
    window.addEventListener("keydown", keyHandler);
  };

  const handleCoordinateCapture = () => {
    // Start coordinate capture mode
    setCoordCaptureActive(true);
    
    // Show a toast with instructions
    addToast({
      title: "Coordinate Capture Mode Activated",
      description: "Press Ctrl+C to capture coordinates or ESC to cancel",
      color: "primary"
    });
  };

  const renderActionFields = () => {
    switch (editedAction.type) {
      case "keypress":
        return (
          <>
            <div className="flex gap-2 items-end mb-3">
              <Input
                label="Key"
                placeholder="e.g. a, b, Enter, Space"
                value={editedAction.params.key || ""}
                onValueChange={(value) => handleParamChange("key", value)}
                className="flex-1"
                endContent={
                  isDetectingKey ? (
                    <div className="animate-pulse">
                      <Icon icon="lucide:keyboard" className="text-primary" />
                    </div>
                  ) : null
                }
              />
              <Button 
                size="sm" 
                variant="flat" 
                onPress={handleKeyDetection}
                isDisabled={isDetectingKey}
              >
                {isDetectingKey ? "Detecting..." : "Detect Key"}
              </Button>
            </div>
            
            <Switch
              isSelected={editedAction.params.hold || false}
              onValueChange={(checked) => handleParamChange("hold", checked)}
              className="mb-3"
            >
              Hold key (until released by Key Release action)
            </Switch>
            
            <div className="mb-3">
              <p className="text-sm mb-2">Modifiers</p>
              <div className="flex flex-wrap gap-2">
                {["Ctrl", "Alt", "Shift", "Meta"].map((modifier) => (
                  <Checkbox
                    key={modifier}
                    isSelected={(editedAction.params.modifiers || []).includes(modifier)}
                    onValueChange={() => handleModifierToggle(modifier)}
                  >
                    {modifier}
                  </Checkbox>
                ))}
              </div>
            </div>
          </>
        );
        
      case "keyrelease":
        return (
          <>
            <div className="flex gap-2 items-end mb-3">
              <Input
                label="Key to Release"
                placeholder="e.g. a, b, Enter, Space"
                value={editedAction.params.key || ""}
                onValueChange={(value) => handleParamChange("key", value)}
                className="flex-1"
                endContent={
                  isDetectingKey ? (
                    <div className="animate-pulse">
                      <Icon icon="lucide:keyboard" className="text-primary" />
                    </div>
                  ) : null
                }
              />
              <Button 
                size="sm" 
                variant="flat" 
                onPress={handleKeyDetection}
                isDisabled={isDetectingKey}
              >
                {isDetectingKey ? "Detecting..." : "Detect Key"}
              </Button>
            </div>
          </>
        );
        
      case "mouseclick":
        return (
          <>
            <Select
              label="Click Type"
              placeholder="Select click type"
              selectedKeys={[editedAction.params.button || "left"]}
              onChange={(e) => handleParamChange("button", e.target.value)}
              className="mb-3"
            >
              <SelectItem key="left">Left Click</SelectItem>
              <SelectItem key="right">Right Click</SelectItem>
              <SelectItem key="middle">Middle Click</SelectItem>
              <SelectItem key="scroll-up">Scroll Up</SelectItem>
              <SelectItem key="scroll-down">Scroll Down</SelectItem>
            </Select>
            
            {!editedAction.params.button?.startsWith("scroll") && (
              <>
                <Switch
              isSelected={editedAction.params.hold || false}
                  onValueChange={(checked) => handleParamChange("hold", checked)}
              className="mb-3"
            >
                  Hold down (don't release immediately)
                </Switch>
                
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Input
                    type="number"
                    label="X Position"
                    placeholder="X coordinate"
                    value={editedAction.params.x?.toString() || "0"}
                    onValueChange={(value) => handleParamChange("x", parseInt(value) || 0)}
                  />
                  <Input
                    type="number"
                    label="Y Position"
                    placeholder="Y coordinate"
                    value={editedAction.params.y?.toString() || "0"}
                    onValueChange={(value) => handleParamChange("y", parseInt(value) || 0)}
                  />
                </div>
                
                <div className="relative">
                  <Button 
                    size="sm" 
                    variant="flat" 
                    color="primary"
                    startContent={<Icon icon="lucide:mouse-pointer-click" />}
                    onPress={handleCoordinateCapture}
                    className="w-full mb-3"
                    isDisabled={coordCaptureActive}
                  >
                    {coordCaptureActive ? "Detecting... (Press Ctrl+C to capture)" : "Capture Coordinates"}
                  </Button>
                  
                  {coordCaptureActive && (
                    <div className="absolute bottom-0 left-0 right-0 mb-10 bg-black/80 text-white p-2 rounded-md text-center text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <Icon icon="lucide:mouse-pointer" className="text-white animate-pulse" />
                        <div>
                          <p className="font-bold">Move cursor to desired position</p>
                          <p className="text-xs">Press <kbd className="px-1 py-0.5 bg-white/20 rounded">Ctrl+C</kbd> to capture or <kbd className="px-1 py-0.5 bg-white/20 rounded">ESC</kbd> to cancel</p>
                        </div>
                      </div>
                      {mousePosition.x !== 0 && mousePosition.y !== 0 && (
                        <p className="mt-1 font-mono">Current: X: {mousePosition.x}, Y: {mousePosition.y}</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
            
            {editedAction.params.button?.startsWith("scroll") && (
              <div className="mb-3">
                <Input
                  type="number"
                  label="Scroll Amount"
                  placeholder="Amount to scroll (default: 3)"
                  value={editedAction.params.amount?.toString() || "3"}
                  onValueChange={(value) => handleParamChange("amount", parseInt(value) || 3)}
                />
                <p className="text-xs text-foreground-500 mt-1">
                  Higher values scroll further/faster
                </p>
              </div>
            )}
          </>
        );
        
      case "mouserelease":
        return (
          <>
            <Select
              label="Button to Release"
              placeholder="Select mouse button"
              selectedKeys={[editedAction.params.button || "left"]}
              onChange={(e) => handleParamChange("button", e.target.value)}
              className="mb-3"
            >
              <SelectItem key="left">Left Button</SelectItem>
              <SelectItem key="right">Right Button</SelectItem>
              <SelectItem key="middle">Middle Button</SelectItem>
            </Select>
          </>
        );
        
      case "mousemove":
        return (
          <>
            <div className="mb-3">
              <div className="border-2 p-3 rounded mb-3 border-primary">
                <div className="flex items-center gap-2 mb-2">
                  <Checkbox
                    isSelected={!!editedAction.params.relative === true}
                    onValueChange={(isSelected) => {
                      // Batch all parameter changes together instead of calling handleParamChange multiple times
                      const updatedParams = { ...editedAction.params };
                      
                      if (isSelected) {
                        // Switching to relative mode - add direction and distance
                        updatedParams.relative = true;
                        updatedParams.direction = updatedParams.direction || "right";
                        updatedParams.distance = updatedParams.distance || 10;
                        console.log("Enabling relative mode:", updatedParams);
                      } else {
                        // Switching to absolute mode
                        updatedParams.relative = false;
                        console.log("Disabling relative mode:", updatedParams);
                      }
                      
                      // Replace the entire params object at once
                      setEditedAction({
                        ...editedAction,
                        params: updatedParams
                      });
                    }}
                  >
                    <span className="font-medium">Relative Movement</span>
                  </Checkbox>
                  <div className="ml-2 px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-xs">
                    {!!editedAction.params.relative === true ? "Enabled" : "Disabled"}
                  </div>
                </div>
                <p className="text-xs text-foreground-500 ml-6">
                  When enabled, moves cursor relative to current position using direction and distance
                </p>
              </div>
            </div>
            
            {!!editedAction.params.relative === true ? (
              // Show direction and distance for relative movement
              <>
                <div className="p-2 bg-success-50 rounded mb-2 text-sm">
                  <p>Using relative movement mode</p>
                </div>
                <Select
                  label="Direction"
                  placeholder="Select movement direction"
                  selectedKeys={[editedAction.params.direction || "right"]}
                  onChange={(e) => handleParamChange("direction", e.target.value)}
                  className="mb-3"
                >
                  <SelectItem key="up">Up</SelectItem>
                  <SelectItem key="down">Down</SelectItem>
                  <SelectItem key="left">Left</SelectItem>
                  <SelectItem key="right">Right</SelectItem>
                </Select>
                <Input
                  type="number"
                  label="Distance (px)"
                  placeholder="Distance in pixels"
                  value={editedAction.params.distance?.toString() || "10"}
                  onValueChange={(value) => handleParamChange("distance", parseInt(value) || 0)}
                  className="mb-3"
                />
              </>
            ) : (
              // Update the absolute position mode
              <>
                <div className="p-2 bg-default-50 rounded mb-2 text-sm">
                  <p>Using absolute position mode</p>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <Input
                    type="number"
                    label="X Position"
                    placeholder="X coordinate"
                    value={editedAction.params.x !== undefined ? editedAction.params.x.toString() : "0"}
                    onValueChange={(value) => {
                      console.log("Setting X input to:", value);
                      handleParamChange("x", parseInt(value) || 0);
                    }}
                  />
                  <Input
                    type="number"
                    label="Y Position"
                    placeholder="Y coordinate"
                    value={editedAction.params.y !== undefined ? editedAction.params.y.toString() : "0"}
                    onValueChange={(value) => {
                      console.log("Setting Y input to:", value);
                      handleParamChange("y", parseInt(value) || 0);
                    }}
                  />
                </div>
                <div className="relative">
                  <Button 
                    size="sm" 
                    variant="flat" 
                    color="primary"
                    startContent={<Icon icon="lucide:mouse-pointer-click" />}
                    onPress={handleCoordinateCapture}
                    className="w-full mb-3"
                    isDisabled={coordCaptureActive}
                  >
                    {coordCaptureActive ? "Detecting... (Press Ctrl+C to capture)" : "Capture Coordinates"}
                  </Button>
                  
                  {coordCaptureActive && (
                    <div className="absolute bottom-0 left-0 right-0 mb-10 bg-black/80 text-white p-2 rounded-md text-center text-sm">
                      <div className="flex items-center justify-center gap-2">
                        <Icon icon="lucide:mouse-pointer" className="text-white animate-pulse" />
                        <div>
                          <p className="font-bold">Move cursor to desired position</p>
                          <p className="text-xs">Press <kbd className="px-1 py-0.5 bg-white/20 rounded">Ctrl+C</kbd> to capture or <kbd className="px-1 py-0.5 bg-white/20 rounded">ESC</kbd> to cancel</p>
                        </div>
                      </div>
                      {mousePosition.x !== 0 && mousePosition.y !== 0 && (
                        <p className="mt-1 font-mono">Current: X: {mousePosition.x}, Y: {mousePosition.y}</p>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </>
        );
        
      case "delay":
        return (
          <Input
            type="number"
            label="Duration (ms)"
            placeholder="Duration in milliseconds"
            value={editedAction.params.duration?.toString() || "500"}
            onValueChange={(value) => handleParamChange("duration", parseInt(value) || 0)}
            className="mb-3"
          />
        );
        
      default:
        return <p>Unknown action type</p>;
    }
  };

  return (
    <Card className="p-4 border-2 border-primary-200">
      <div className="mb-4">
        <Select
          label="Action Type"
          placeholder="Select action type"
          selectedKeys={[editedAction.type]}
          onChange={(e) => handleTypeChange(e.target.value)}
          className="mb-3"
        >
          <SelectItem key="keypress">Key Press</SelectItem>
          <SelectItem key="keyrelease">Key Release</SelectItem>
          <SelectItem key="mouseclick">Mouse Click</SelectItem>
          <SelectItem key="mousemove">Mouse Move</SelectItem>
          <SelectItem key="mouserelease">Mouse Release</SelectItem>
          <SelectItem key="delay">Delay</SelectItem>
        </Select>
      </div>
      
      {renderActionFields()}
      
      <div className="flex justify-end gap-2 mt-2">
        <Button variant="flat" onPress={onCancel}>
          Cancel
        </Button>
        <Button color="primary" onPress={() => {
          console.log("Saving action:", editedAction);
          onSave(editedAction);
        }}>
          Save
        </Button>
      </div>
    </Card>
  );
};