import React from "react";
import { Card, Divider, Chip, Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import { MacroDefinition } from "../types/macro";

interface EncoderMacroGroupProps {
  macros: MacroDefinition[];
  onDelete: (id: string) => void;
}

export const EncoderMacroGroup: React.FC<EncoderMacroGroupProps> = ({ macros, onDelete }) => {
  const [selectedMacro, setSelectedMacro] = React.useState<string | null>(null);
  
  // Group macros by groupId
  const groupedMacros = React.useMemo(() => {
    const groups: Record<string, MacroDefinition[]> = {};
    
    macros.forEach(macro => {
      if (macro.groupId) {
        if (!groups[macro.groupId]) {
          groups[macro.groupId] = [];
        }
        groups[macro.groupId].push(macro);
      } else if (macro.trigger.type === "controlchange" && macro.trigger.direction) {
        // Legacy support for old format
        const key = `${macro.trigger.channel}-${macro.trigger.controller}`;
        if (!groups[key]) {
          groups[key] = [];
        }
        groups[key].push(macro);
      }
    });
    
    return groups;
  }, [macros]);
  
  if (Object.keys(groupedMacros).length === 0) {
    return null;
  }
  
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + " " + date.toLocaleTimeString();
  };
  
  const getActionSummary = (action: any): string => {
    switch (action.type) {
      case "keypress":
        return `Press ${action.params.key}${action.params.modifiers?.length ? ` with ${action.params.modifiers.join('+')}` : ''}`;
      case "keyhold":
        return `Hold ${action.params.key} for ${action.params.duration}ms`;
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
      case "mousemove":
        if (action.params.relative) {
          return `Move ${action.params.direction || 'right'} by ${action.params.distance || 100}px in ${action.params.duration}ms`;
        } else {
        return `Move to (${action.params.x}, ${action.params.y}) in ${action.params.duration}ms`;
        }
      case "mousedrag":
        return `Drag ${action.params.direction} from (${action.params.startX}, ${action.params.startY}) - ${action.params.distance}px at ${action.params.speed}px/s`;
      case "mousescroll":
        return `Scroll ${action.params.direction} at (${action.params.x}, ${action.params.y})`;
      case "delay":
        return `Wait for ${action.params.duration}ms`;
      default:
        return "Unknown action";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Icon icon="lucide:rotate-cw" className="text-primary" />
        <h3 className="text-lg font-medium">Encoder Macros</h3>
      </div>
      
      {Object.entries(groupedMacros).map(([key, macroGroup]) => {
        // Get a representative macro to display group info
        const firstMacro = macroGroup[0];
        const groupName = firstMacro.name.split(' (')[0]; // Remove the (Increment) part
        
        // Find each type of macro
        const incrementMacro = macroGroup.find(m => 
          m.type === "encoder-increment" || 
          (m.trigger.direction === "increment" && !m.type)
        );
        const decrementMacro = macroGroup.find(m => 
          m.type === "encoder-decrement" || 
          (m.trigger.direction === "decrement" && !m.type)
        );
        const clickMacro = macroGroup.find(m => m.type === "encoder-click");
        
        // Get controller and channel info
        const controller = incrementMacro?.trigger.controller || decrementMacro?.trigger.controller;
        const channel = incrementMacro?.trigger.channel || decrementMacro?.trigger.channel;
        
        return (
          <Card key={key} className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <Icon icon="lucide:sliders-horizontal" className="text-secondary" />
              <div>
                <h4 className="font-medium">{groupName}</h4>
                <p className="text-xs text-foreground-500">
                  {controller !== undefined ? `Controller ${controller}` : ''} 
                  {channel !== undefined ? ` on Channel ${channel}` : ''}
                </p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Increment Macro */}
              <Card className="p-3 border-success-200 bg-success-50 dark:bg-success-900/20">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Icon icon="lucide:rotate-cw" className="text-success" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="font-medium">Increment</h5>
                        <Chip size="sm" color="success">↑</Chip>
                      </div>
                      {incrementMacro ? (
                        <p className="text-xs">{incrementMacro.name}</p>
                      ) : (
                        <p className="text-xs text-foreground-500">No macro assigned</p>
                      )}
                    </div>
                  </div>
                  
                  {incrementMacro && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="danger"
                      onPress={() => onDelete(incrementMacro.id)}
                    >
                      <Icon icon="lucide:trash-2" />
                    </Button>
                  )}
                </div>
                
                {incrementMacro && selectedMacro === incrementMacro.id && (
                  <>
                    <Divider className="my-3" />
                    <div>
                      <p className="text-xs text-foreground-500 mb-1">
                        Created: {formatDate(incrementMacro.createdAt)}
                      </p>
                      <p className="text-sm font-medium mb-2">Actions ({incrementMacro.actions.length})</p>
                      <div className="space-y-2">
                        {incrementMacro.actions.map((action, index) => (
                          <div key={action.id} className="text-xs bg-content2 p-2 rounded-medium">
                            <span className="text-foreground-500 mr-1">{index + 1}.</span>
                            <span className="font-medium capitalize">{action.type}:</span>{" "}
                            <span>{getActionSummary(action)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                
                <div className="mt-3">
                  <Button 
                    size="sm" 
                    variant="flat" 
                    color="success"
                    fullWidth
                    onPress={() => setSelectedMacro(incrementMacro?.id === selectedMacro ? null : (incrementMacro?.id || null))}
                    isDisabled={!incrementMacro}
                  >
                    {selectedMacro === incrementMacro?.id ? "Hide Details" : "Show Details"}
                  </Button>
                </div>
              </Card>
              
              {/* Decrement Macro */}
              <Card className="p-3 border-warning-200 bg-warning-50 dark:bg-warning-900/20">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    <Icon icon="lucide:rotate-ccw" className="text-warning" />
                    <div>
                      <div className="flex items-center gap-2">
                        <h5 className="font-medium">Decrement</h5>
                        <Chip size="sm" color="warning">↓</Chip>
                      </div>
                      {decrementMacro ? (
                        <p className="text-xs">{decrementMacro.name}</p>
                      ) : (
                        <p className="text-xs text-foreground-500">No macro assigned</p>
                      )}
                    </div>
                  </div>
                  
                  {decrementMacro && (
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="danger"
                      onPress={() => onDelete(decrementMacro.id)}
                    >
                      <Icon icon="lucide:trash-2" />
                    </Button>
                  )}
                </div>
                
                {decrementMacro && selectedMacro === decrementMacro.id && (
                  <>
                    <Divider className="my-3" />
                    <div>
                      <p className="text-xs text-foreground-500 mb-1">
                        Created: {formatDate(decrementMacro.createdAt)}
                      </p>
                      <p className="text-sm font-medium mb-2">Actions ({decrementMacro.actions.length})</p>
                      <div className="space-y-2">
                        {decrementMacro.actions.map((action, index) => (
                          <div key={action.id} className="text-xs bg-content2 p-2 rounded-medium">
                            <span className="text-foreground-500 mr-1">{index + 1}.</span>
                            <span className="font-medium capitalize">{action.type}:</span>{" "}
                            <span>{getActionSummary(action)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                
                <div className="mt-3">
                  <Button 
                    size="sm" 
                    variant="flat" 
                    color="warning"
                    fullWidth
                    onPress={() => setSelectedMacro(decrementMacro?.id === selectedMacro ? null : (decrementMacro?.id || null))}
                    isDisabled={!decrementMacro}
                  >
                    {selectedMacro === decrementMacro?.id ? "Hide Details" : "Show Details"}
                  </Button>
                </div>
              </Card>
              
              {/* Click Macro - Only show if this is an encoder-click group */}
              {clickMacro && (
                <Card className="p-3 border-secondary-200 bg-secondary-50 dark:bg-secondary-900/20">
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:mouse-pointer-click" className="text-secondary" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h5 className="font-medium">Click</h5>
                          <Chip size="sm" color="secondary">●</Chip>
                        </div>
                        <p className="text-xs">{clickMacro.name}</p>
                      </div>
                    </div>
                    
                    <Button
                      isIconOnly
                      size="sm"
                      variant="light"
                      color="danger"
                      onPress={() => onDelete(clickMacro.id)}
                    >
                      <Icon icon="lucide:trash-2" />
                    </Button>
                  </div>
                  
                  {selectedMacro === clickMacro.id && (
                    <>
                      <Divider className="my-3" />
                      <div>
                        <p className="text-xs text-foreground-500 mb-1">
                          Created: {formatDate(clickMacro.createdAt)}
                        </p>
                        <p className="text-sm font-medium mb-2">Actions ({clickMacro.actions.length})</p>
                        <div className="space-y-2">
                          {clickMacro.actions.map((action, index) => (
                            <div key={action.id} className="text-xs bg-content2 p-2 rounded-medium">
                              <span className="text-foreground-500 mr-1">{index + 1}.</span>
                              <span className="font-medium capitalize">{action.type}:</span>{" "}
                              <span>{getActionSummary(action)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                  
                  <div className="mt-3">
                    <Button 
                      size="sm" 
                      variant="flat" 
                      color="secondary"
                      fullWidth
                      onPress={() => setSelectedMacro(clickMacro.id === selectedMacro ? null : clickMacro.id)}
                    >
                      {selectedMacro === clickMacro.id ? "Hide Details" : "Show Details"}
                    </Button>
                  </div>
                </Card>
              )}
            </div>
            
            {/* Shared actions section removed to simplify component */}
          </Card>
        );
      })}
    </div>
  );
};