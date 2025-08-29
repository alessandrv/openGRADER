import React, { useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Input, Chip, Checkbox, Divider, Tabs, Tab, Card, CardBody } from "@heroui/react";
import { Icon } from "@iconify/react";

interface KeySelectorModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onKeySelect: (key: string | string[]) => void;
  currentKey?: string;
  allowMultiple?: boolean;
  title?: string;
  description?: string;
  exclusionMode?: boolean;
}

// Organized key categories
const keyCategories = {
  letters: [
    'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm',
    'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'
  ],
  numbers: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  function: ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12'],
  navigation: [
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown'
  ],
  special: [
    'Enter', 'Escape', 'Space', 'Tab', 'Backspace', 'Delete',
    'Insert', 'CapsLock', 'NumLock', 'ScrollLock', 'PrintScreen', 'Pause'
  ],
  symbols: [
    '`', '~', '!', '@', '#', '$', '%', '^', '&', '*', '(', ')', '-', '_',
    '=', '+', '[', ']', '{', '}', '\\', '|', ';', ':', "'", '"', ',', '.',
    '<', '>', '/', '?'
  ],
  numpad: [
    'Numpad0', 'Numpad1', 'Numpad2', 'Numpad3', 'Numpad4', 'Numpad5',
    'Numpad6', 'Numpad7', 'Numpad8', 'Numpad9', 'NumpadDecimal',
    'NumpadAdd', 'NumpadSubtract', 'NumpadMultiply', 'NumpadDivide', 'NumpadEnter'
  ]
};

const modifierKeys = ['Ctrl', 'Shift', 'Alt', 'Meta'];

export const KeySelectorModal: React.FC<KeySelectorModalProps> = ({
  isOpen,
  onOpenChange,
  onKeySelect,
  currentKey = "",
  allowMultiple = false,
  title = "Select Key",
  description = "Choose a key for your macro",
  exclusionMode = false
}) => {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [selectedModifiers, setSelectedModifiers] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("letters");
  const [modalKey, setModalKey] = useState(0);

  // Get all keys for search
  const allKeys = Object.values(keyCategories).flat();
  
  const filteredKeys = searchTerm 
    ? allKeys.filter(key => key.toLowerCase().includes(searchTerm.toLowerCase()))
    : keyCategories[activeTab as keyof typeof keyCategories] || [];

  const handleKeyClick = (key: string) => {
    if (allowMultiple || exclusionMode) {
      if (selectedKeys.includes(key)) {
        setSelectedKeys(selectedKeys.filter(k => k !== key));
      } else {
        setSelectedKeys([...selectedKeys, key]);
      }
    } else {
      onKeySelect(key);
      onOpenChange(false);
      resetState();
    }
  };

  const handleModifierToggle = (modifier: string) => {
    if (selectedModifiers.includes(modifier)) {
      setSelectedModifiers(selectedModifiers.filter(m => m !== modifier));
    } else {
      setSelectedModifiers([...selectedModifiers, modifier]);
    }
  };

  // Add functions for select/deselect all keys in current tab
  const handleSelectAllInTab = (keys: string[]) => {
    const newSelectedKeys = [...selectedKeys];
    keys.forEach(key => {
      if (!newSelectedKeys.includes(key)) {
        newSelectedKeys.push(key);
      }
    });
    setSelectedKeys(newSelectedKeys);
  };

  const handleDeselectAllInTab = (keys: string[]) => {
    setSelectedKeys(selectedKeys.filter(key => !keys.includes(key)));
  };

  const resetState = () => {
    setSelectedKeys([]);
    setSelectedModifiers([]);
    setSearchTerm("");
    setActiveTab("letters");
    setModalKey(prev => prev + 1);
  };

  // Reset state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      // Reset state when modal is closed
      resetState();
    }
  }, [isOpen]);

  const handleConfirm = () => {
    if (exclusionMode) {
      // Return key combinations with modifiers
      const combinations = selectedKeys.map(key => ({
        key,
        modifiers: [...selectedModifiers]
      }));
      onKeySelect(combinations as any);
    } else {
      onKeySelect(allowMultiple ? selectedKeys : selectedKeys[0] || "");
    }
    
    // Use a small timeout to ensure proper modal cleanup
    setTimeout(() => {
      onOpenChange(false);
    }, 10);
  };

  const handleCancel = () => {
    // Use a small timeout to ensure proper modal cleanup
    setTimeout(() => {
      onOpenChange(false);
    }, 10);
  };

  // Remove the modal content ref and focus management
  // as it's interfering with proper modal close behavior

  // Enhanced click handler with better focus management
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // This part is no longer needed as the ref is removed
    // if (modalContentRef.current) {
    //   modalContentRef.current.focus();
    // }
  };

  // Updated renderKeyGrid to always show current selection state
  const renderKeyGrid = (keys: string[], tabName?: string) => (
    <div className="space-y-3">
      {/* Select/Deselect All buttons for each tab */}
      {(allowMultiple || exclusionMode) && tabName && (
        <div className="flex gap-2 justify-end">
          <Button
            size="sm"
            variant="flat"
            color="primary"
            onPress={() => handleSelectAllInTab(keys)}
            className="text-xs h-7"
          >
            Select All
          </Button>
          <Button
            size="sm"
            variant="flat"
            color="default"
            onPress={() => handleDeselectAllInTab(keys)}
            className="text-xs h-7"
          >
            Deselect All
          </Button>
        </div>
      )}
      
      <div className="grid grid-cols-12 gap-1 max-h-80 overflow-y-auto p-3">
        {keys.map((key) => (
          <Chip
            key={key}
            variant={selectedKeys.includes(key) ? "solid" : "bordered"}
            color={selectedKeys.includes(key) ? "primary" : "default"}
            className={`cursor-pointer text-center justify-center w-full h-8 text-xs font-medium transition-all duration-150 ${
              selectedKeys.includes(key) 
                ? "shadow-sm transform scale-[0.98]" 
                : "hover:shadow-sm hover:scale-[1.02]"
            }`}
            style={{
              borderRadius: "4px", // Even smaller radius for tighter, more uniform look
              border: selectedKeys.includes(key) ? "none" : "1px solid #d4d4d8",
              fontFamily: "ui-monospace, 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace",
              minWidth: "32px",
              maxWidth: "none",
              fontSize: "11px",
              fontWeight: "500"
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleKeyClick(key);
            }}
          >
            {key}
          </Chip>
        ))}
      </div>
    </div>
  );

  return (
    <Modal 
      key={`key-selector-modal-${modalKey}`}
      isOpen={isOpen} 
      onOpenChange={(open) => {
        if (!open) {
          // If modal is being closed, ensure clean state
          setTimeout(() => {
            onOpenChange(false);
          }, 0);
        } else {
          onOpenChange(open);
        }
      }}
      size="4xl" 
      scrollBehavior="inside"
      isDismissable={true}
      isKeyboardDismissDisabled={false}
      hideCloseButton={false}
      backdrop="blur"
      classNames={{
        backdrop: "z-[100]",
        wrapper: "z-[101]",
        base: "z-[102]"
      }}
    >
      <ModalContent onClick={handleModalClick}>
        {(onClose) => (
          <div 
            // ref={modalContentRef} // Removed ref
            tabIndex={-1}
            className="focus:outline-none"
            onFocus={(e) => e.stopPropagation()}
          >
            <ModalHeader className="flex flex-col gap-1">
              <h3>{title}</h3>
              {description && (
                <p className="text-sm text-foreground-500 font-normal">{description}</p>
              )}
            </ModalHeader>
            <ModalBody>
              {/* Modifier Selection (for exclusion mode) */}
              {exclusionMode && (
                <Card className="mb-4">
                  <CardBody>
                    <h4 className="text-sm font-medium mb-3">Modifier Keys</h4>
                    <div className="flex gap-3">
                      {modifierKeys.map((modifier) => (
                        <Checkbox
                          key={modifier}
                          size="sm"
                          isSelected={selectedModifiers.includes(modifier)}
                          onValueChange={() => handleModifierToggle(modifier)}
                        >
                          {modifier}
                        </Checkbox>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* Selected Keys Display - Moved to top for better visibility */}
              {(allowMultiple || exclusionMode) && selectedKeys.length > 0 && (
                <Card key={`selected-${selectedKeys.length}-${selectedKeys.join(',')}`} className="mb-4">
                  <CardBody>
                    <h4 className="text-sm font-medium mb-3">Selected Keys ({selectedKeys.length})</h4>
                    <div className="flex flex-wrap gap-2">
                      {selectedKeys.map((key) => (
                        <Chip
                          key={key}
                          variant="solid"
                          color="primary"
                          onClose={() => handleKeyClick(key)}
                          className="cursor-pointer"
                        >
                          {exclusionMode && selectedModifiers.length > 0 
                            ? `${selectedModifiers.join('+')}+${key}`
                            : key
                          }
                        </Chip>
                      ))}
                    </div>
                  </CardBody>
                </Card>
              )}

              {/* Multiple selection info - Updated to show less prominent message */}
              

              {/* Search */}
              <div className="mb-4">
                <Input
                  placeholder="Search keys..."
                  value={searchTerm}
                  onValueChange={setSearchTerm}
                  startContent={<Icon icon="lucide:search" className="w-4 h-4" />}
                  className="w-full"
                />
              </div>

              {/* Key Categories */}
              {searchTerm ? (
                <Card>
                  <CardBody>
                    <h4 className="text-sm font-medium mb-3">Search Results</h4>
                    {renderKeyGrid(filteredKeys)}
                  </CardBody>
                </Card>
              ) : (
                <Tabs 
                  selectedKey={activeTab} 
                  onSelectionChange={(key) => setActiveTab(key as string)}
                  className="w-full"
                >
                  <Tab key="letters" title={
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:type" className="w-4 h-4" />
                      <span>Letters</span>
                    </div>
                  }>
                    <Card>
                      <CardBody>
                        {renderKeyGrid(keyCategories.letters, "letters")}
                      </CardBody>
                    </Card>
                  </Tab>
                  
                  <Tab key="numbers" title={
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:hash" className="w-4 h-4" />
                      <span>Numbers</span>
                    </div>
                  }>
                    <Card>
                      <CardBody>
                        {renderKeyGrid(keyCategories.numbers, "numbers")}
                      </CardBody>
                    </Card>
                  </Tab>
                  
                  <Tab key="function" title={
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:command" className="w-4 h-4" />
                      <span>Function</span>
                    </div>
                  }>
                    <Card>
                      <CardBody>
                        {renderKeyGrid(keyCategories.function, "function")}
                      </CardBody>
                    </Card>
                  </Tab>
                  
                  <Tab key="navigation" title={
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:navigation" className="w-4 h-4" />
                      <span>Navigation</span>
                    </div>
                  }>
                    <Card>
                      <CardBody>
                        {renderKeyGrid(keyCategories.navigation, "navigation")}
                      </CardBody>
                    </Card>
                  </Tab>
                  
                  <Tab key="special" title={
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:star" className="w-4 h-4" />
                      <span>Special</span>
                    </div>
                  }>
                    <Card>
                      <CardBody>
                        {renderKeyGrid(keyCategories.special, "special")}
                      </CardBody>
                    </Card>
                  </Tab>
                  
                  <Tab key="symbols" title={
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:at-sign" className="w-4 h-4" />
                      <span>Symbols</span>
                    </div>
                  }>
                    <Card>
                      <CardBody>
                        {renderKeyGrid(keyCategories.symbols, "symbols")}
                      </CardBody>
                    </Card>
                  </Tab>
                  
                  <Tab key="numpad" title={
                    <div className="flex items-center gap-2">
                      <Icon icon="lucide:calculator" className="w-4 h-4" />
                      <span>Numpad</span>
                    </div>
                  }>
                    <Card>
                      <CardBody>
                        {renderKeyGrid(keyCategories.numpad, "numpad")}
                      </CardBody>
                    </Card>
                  </Tab>
                </Tabs>
              )}
            </ModalBody>
            
            <ModalFooter>
              <Button variant="flat" onPress={handleCancel}>
                Cancel
              </Button>
              {(allowMultiple || exclusionMode) && (
                <Button 
                  color="primary" 
                  onPress={handleConfirm}
                  isDisabled={selectedKeys.length === 0}
                >
                  Confirm Selection ({selectedKeys.length})
                </Button>
              )}
            </ModalFooter>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}; 