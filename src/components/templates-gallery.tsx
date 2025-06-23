import React, { useState, useEffect, useCallback, useRef } from "react";
import { Button, Card, useDisclosure, Modal, addToast, ModalContent, Chip, ModalHeader, ModalBody, ModalFooter, DropdownItem, Dropdown, DropdownMenu, DropdownTrigger, Popover, PopoverTrigger, PopoverContent } from "@heroui/react";
import { Icon } from "@iconify/react";
import { MacroTemplate, MacroDefinition, MacroCategory } from "../types/macro";
import { TemplateApply } from "./template-apply";
import { BulkEncoderInitializer } from "./bulk-encoder-initializer";
import { useTemplates } from "../hooks/use-templates";

interface TemplatesGalleryProps {
  onCreateNewMacro: () => void;
  onApplyTemplate: (macro: MacroDefinition) => void;
  onEditMacroFromTemplate: (macro: MacroDefinition) => void;
  onDeleteTemplate: (id: string) => void;
  onEditTemplate?: (template: MacroTemplate) => void;
}


export const TemplatesGallery: React.FC<TemplatesGalleryProps> = ({ 
  onCreateNewMacro,
  onApplyTemplate,
  onEditMacroFromTemplate,
  onDeleteTemplate,
  onEditTemplate
}) => {
  const { templates, deleteTemplate, exportTemplates, importTemplates, loadTemplatesFromStorage } = useTemplates();
  const [categories, setCategories] = useState<MacroCategory[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<MacroTemplate | null>(null);
  const [bulkInitTemplate, setBulkInitTemplate] = useState<MacroTemplate | null>(null);
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isBulkOpen, onOpen: onBulkOpen, onClose: onBulkClose } = useDisclosure();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const { isOpen: isErrorOpen, onOpen: onErrorOpen, onOpenChange: onErrorOpenChange } = useDisclosure();
  
  // Export selection state
  const [selectedTemplates, setSelectedTemplates] = useState<Set<string>>(new Set());
  const [showExportSelection, setShowExportSelection] = useState(false);
  
  // State for delete confirmation popover
  const [deletePopoverOpen, setDeletePopoverOpen] = useState<string | null>(null);
  
  // Reference to track elements being deleted with animation
  const elementsBeingDeleted = useRef(new Set<string>());
  
  // Thanos snap animation functions
  const setRandomSeed = useCallback(() => {
    const turbulence = document.getElementById("dissolve-filter-turbulence");
    if (turbulence) {
      turbulence.setAttribute("seed", (Math.random() * 1000).toString());
    }
  }, []);

  const easeOutCubic = useCallback((t: number) => {
    return 1 - Math.pow(1 - t, 3);
  }, []);

  const maxDisplacementScale = 2000;

  const useThanosSnap = useCallback((elementId: string, onComplete: () => void) => {
    const element = document.getElementById(elementId);
    if (!element || elementsBeingDeleted.current.has(elementId)) return;
    
    elementsBeingDeleted.current.add(elementId);
    
    const displacement = document.getElementById("dissolve-filter-displacement");
    if (!displacement) return;
    
    setRandomSeed();
    element.style.filter = "url(#dissolve-filter)";

    const duration = 1000;
    const startTime = performance.now();
    element.setAttribute("data-being-destroyed", "true");

    const animate = (currentTime: number) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1);
      const displacementScale = easeOutCubic(progress) * maxDisplacementScale;

      displacement.setAttribute("scale", displacementScale.toString());
      element.style.transform = `scale(${1 + 0.1 * progress})`;
      element.style.opacity = progress < 0.5 ? "1" : `${1 - ((progress - 0.5) * 2)}`;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        displacement.setAttribute("scale", "0");
        elementsBeingDeleted.current.delete(elementId);
        onComplete();
      }
    };

    requestAnimationFrame(animate);
  }, [easeOutCubic, setRandomSeed]);
  
  // Handle file input change for import
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        
        // Try to import the templates
        const count = importTemplates(data);
        
        // Explicitly reload templates to trigger a re-render
        loadTemplatesFromStorage();
        
        addToast({
          title: "Templates Imported",
          description: `${count} template${count !== 1 ? 's' : ''} imported successfully`,
          color: "success"
        });
        
        // Reset the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } catch (error) {
        console.error("Error parsing import file:", error);
        setImportError(error instanceof Error ? error.message : "Invalid template file format");
        onErrorOpen();
        
        // Reset the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    
    reader.onerror = () => {
      setImportError("Error reading file");
      onErrorOpen();
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    
    reader.readAsText(file);
  };
  
  // Handle template import click
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
  // Handle export selected templates
  const handleExportSelected = () => {
    try {
      if (selectedTemplates.size === 0) {
        addToast({
          title: "No Templates Selected",
          description: "Please select at least one template to export",
          color: "warning"
        });
        return;
      }
      
      const count = exportTemplates([...selectedTemplates]);
      
      // After export, reset the selection mode
      setShowExportSelection(false);
      setSelectedTemplates(new Set());
      
      addToast({
        title: "Templates Exported",
        description: `${count} template${count !== 1 ? 's' : ''} exported successfully`,
        color: "success"
      });
    } catch (error) {
      console.error("Error exporting templates:", error);
      addToast({
        title: "Export Failed",
        description: "An error occurred while exporting templates",
        color: "danger"
      });
    }
  };
  
  // Handle export all templates
  const handleExportAll = () => {
    try {
      if (templates.length === 0) {
        addToast({
          title: "No Templates",
          description: "There are no templates to export",
          color: "warning"
        });
        return;
      }
      
      const count = exportTemplates();
      
      addToast({
        title: "All Templates Exported",
        description: `${count} template${count !== 1 ? 's' : ''} exported successfully`,
        color: "success"
      });
    } catch (error) {
      console.error("Error exporting templates:", error);
      addToast({
        title: "Export Failed",
        description: "An error occurred while exporting templates",
        color: "danger"
      });
    }
  };
  
  // Handle select all templates
  const handleSelectAll = () => {
    if (selectedTemplates.size === templates.length) {
      // Deselect all if all are currently selected
      setSelectedTemplates(new Set());
    } else {
      // Select all templates
      const allIds = templates.map(t => t.id);
      setSelectedTemplates(new Set(allIds));
    }
  };
  
  // Load categories on mount
  useEffect(() => {
    // Load categories
    const storedCategories = localStorage.getItem("macroCategories");
    if (storedCategories) {
      try {
        const parsedCategories = JSON.parse(storedCategories);
        setCategories(parsedCategories);
      } catch (e) {
        console.error("Failed to parse categories from localStorage", e);
      }
    }
  }, []);
  
  // Reset selected templates when templates change
  useEffect(() => {
    setSelectedTemplates(new Set());
  }, [templates]);
  
  const handleSelectTemplate = (template: MacroTemplate) => {
    // Don't open the template modal if we're in export selection mode
    if (showExportSelection) {
      toggleTemplateSelection(template.id);
      return;
    }
    
    setSelectedTemplate(template);
    onOpen();
  };
  
  const toggleTemplateSelection = (id: string) => {
    setSelectedTemplates(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(id)) {
        newSelection.delete(id);
      } else {
        newSelection.add(id);
      }
      return newSelection;
    });
  };
  
  const handleCancelTemplate = () => {
    setSelectedTemplate(null);
    onClose();
  };
  
  const handleBulkInitialize = (template: MacroTemplate) => {
    // Only allow bulk initialization for encoder templates
    if (template.type.includes("encoder")) {
      setBulkInitTemplate(template);
      onBulkOpen();
    } else {
      addToast({
        title: "Not Supported",
        description: "Bulk initialization is only available for encoder templates",
        color: "warning"
      });
    }
  };

  const handleBulkInitComplete = (macros: MacroDefinition[]) => {
    // Save the macros to localStorage
    const existingMacros = localStorage.getItem("midiMacros");
    let allMacros: MacroDefinition[] = [];
    
    if (existingMacros) {
      try {
        allMacros = JSON.parse(existingMacros);
      } catch (e) {
        console.error("Failed to parse existing macros:", e);
        allMacros = [];
      }
    }
    
    // Add the new macros
    allMacros.push(...macros);
    
    // Save back to localStorage
    localStorage.setItem("midiMacros", JSON.stringify(allMacros));
    
    // Show success message
    addToast({
      title: "Macros Created",
      description: `Successfully created ${macros.length} macros from template`,
      color: "success"
    });
    
    // Close the bulk init modal
    onBulkClose();
    setBulkInitTemplate(null);
    
    // Navigate to macros view to show the created macros
    onApplyTemplate({ 
      id: "navigate-to-macros", 
      name: "dummy", 
      trigger: { type: "noteon" }, 
      actions: [],
      createdAt: ""
    });
  };

  const handleCancelBulkInit = () => {
    setBulkInitTemplate(null);
    onBulkClose();
  };
  
  const getCategoryColor = (categoryId?: string): string => {
    if (!categoryId) return "default";
    const category = categories.find(c => c.id === categoryId);
    return category ? category.color : "default";
  };

  // Helper function to check if a color is a preset color or custom hex
  const isPresetColor = (color: string): boolean => {
    const presetColors = [
      "red", "rose", "pink", "fuchsia", "purple",
      "violet", "indigo", "blue", "sky", "cyan",
      "teal", "emerald", "green", "lime", "yellow",
      "amber", "orange", "coral", "salmon", "crimson",
      "default", "primary", "secondary", "warning", "danger"
    ];
    return presetColors.includes(color);
  };

  // Helper function to convert hex to rgba
  const hexToRgba = (hex: string, alpha: number): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (result) {
      const r = parseInt(result[1], 16);
      const g = parseInt(result[2], 16);
      const b = parseInt(result[3], 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgba(59, 130, 246, ${alpha})`; // fallback to blue
  };

  // Helper function to get background style for template cards
  const getTemplateBackgroundStyle = (color: string) => {
    if (isPresetColor(color)) {
      return {
        className: `bg-${color}-50`,
        style: {}
      };
    } else {
      // Custom hex color
      return {
        className: 'transition-colors duration-200',
        style: {
          backgroundColor: hexToRgba(color, 0.1)
        }
      };
    }
  };

  // Helper function to get icon background style
  const getIconBackgroundStyle = (color: string, isHover: boolean = false) => {
    if (isPresetColor(color)) {
      return {
        className: `bg-${color}-100 group-hover:bg-${color}-200`,
        style: {}
      };
    } else {
      // Custom hex color
      return {
        className: 'transition-colors duration-200',
        style: {
          backgroundColor: isHover ? hexToRgba(color, 0.3) : hexToRgba(color, 0.2)
        }
      };
    }
  };

  // Helper function to get icon color style
  const getIconColorStyle = (color: string) => {
    if (isPresetColor(color)) {
      return {
        className: `text-${color}`,
        style: {}
      };
    } else {
      // Custom hex color
      return {
        className: '',
        style: {
          color: color
        }
      };
    }
  };

  // Helper function to get chip color
  const getChipColor = (color: string): "default" | "primary" | "secondary" | "success" | "warning" | "danger" => {
    if (isPresetColor(color)) {
      // Map preset colors to valid chip colors
      switch (color) {
        case "red":
        case "rose":
        case "pink":
        case "crimson":
          return "danger";
        case "orange":
        case "amber":
        case "yellow":
          return "warning";
        case "green":
        case "emerald":
        case "lime":
        case "teal":
          return "success";
        case "blue":
        case "sky":
        case "cyan":
        case "indigo":
        case "violet":
        case "purple":
        case "fuchsia":
          return "primary";
        default:
          return "default";
      }
    } else {
      // For custom colors, use default chip and custom styling
      return "default";
    }
  };
  
  const getTemplateTypeIcon = (type: string): string => {
    switch (type) {
      case "encoder-increment":
      case "encoder-decrement":
        return "lucide:rotate-cw";
      case "encoder-click":
        return "lucide:mouse-pointer-click";
      default:
        return "lucide:music";
    }
  };
  
  const getTemplateTypeLabel = (type: string): string => {
    switch (type) {
      case "encoder-increment":
      case "encoder-decrement":
        return "Encoder";
      case "encoder-click":
        return "Encoder with Click";
      default:
        return "Standard";
    }
  };
  
  const handleConfirmDelete = (id: string) => {
    const template = templates.find((t: MacroTemplate) => t.id === id);
    if (!template) return;
    
    // Get the element ID for animation
    const elementId = `template-${id}`;
    
    // Apply the Thanos snap animation
    useThanosSnap(elementId, () => {
      // Delete from templates
      deleteTemplate(id);
      
      // Notify parent
      onDeleteTemplate(id);
      
      // Show success message
      addToast({
        title: "Template Deleted",
        description: `"${template.name}" has been removed`,
        color: "danger"
      });
    });
  };
  
  const handleEditTemplateClick = (template: MacroTemplate) => {
    if (onEditTemplate) {
      console.log("Editing template:", template);
      onEditTemplate(template);
    } else {
      console.warn("Edit template functionality not available");
      addToast({
        title: "Feature Not Available",
        description: "Template editing is not available in this context",
        color: "warning"
      });
    }
  };
  
  // Method to handle action buttons in the template card
  const handleTemplateAction = (e: React.MouseEvent | null, action: 'edit' | 'delete', template: MacroTemplate) => {
    // Stop event propagation to prevent toggling selection when clicking action buttons
    // Only call stopPropagation if the event exists and has the method
    if (e && typeof e.stopPropagation === 'function') {
      e.stopPropagation();
    }
    
    if (action === 'edit') {
      handleEditTemplateClick(template);
    }
    // Delete action is now handled by the Popover component directly
  };

  return (
    <div className="">
      {/* SVG Filter Definition for Thanos Snap effect */}
      <svg xmlns="http://www.w3.org/2000/svg" style={{ display: 'none' }}>
        <defs>
          <filter id="dissolve-filter" x="-200%" y="-200%" width="500%" height="500%" color-interpolation-filters="sRGB" overflow="visible">
            <feTurbulence 
              id="dissolve-filter-turbulence"
              type="fractalNoise" 
              baseFrequency="0.004" 
              numOctaves="1" 
              result="bigNoise" 
              seed="0"
            />
            <feComponentTransfer in="bigNoise" result="bigNoiseAdjusted">
              <feFuncR type="linear" slope="3" intercept="-1" />
              <feFuncG type="linear" slope="3" intercept="-1" />
            </feComponentTransfer>
            <feTurbulence type="fractalNoise" baseFrequency="1" numOctaves="1" result="fineNoise" />
            <feMerge result="mergedNoise">
              <feMergeNode in="bigNoiseAdjusted" />
              <feMergeNode in="fineNoise" />
            </feMerge>
            <feDisplacementMap 
              id="dissolve-filter-displacement"
              in="SourceGraphic" 
              in2="mergedNoise" 
              scale="0" 
              xChannelSelector="R" 
              yChannelSelector="G" 
            />
          </filter>
        </defs>
      </svg>

      {/* Modern translucent header with iOS-like design */}
      <div className="sticky mb-4 top-0 z-10 backdrop-blur-md bg-background/80 p-5 rounded-xl border border-default-200/30 shadow-sm">
        <div className="flex flex-col sm:flex-row justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-foreground">Templates Gallery</h2>
            <p className="text-foreground-500 text-sm mt-1">Create, use and manage your macro templates</p>
          </div>
          
          {showExportSelection && (
            <div className="text-sm px-4 py-2 bg-primary-900/20 rounded-full border border-primary-700/30 text-primary-300 flex items-center gap-2 backdrop-blur-sm">
              <Icon icon="lucide:info" className="text-primary-400" />
              <span>Selection mode: <span className="font-medium">{selectedTemplates.size}</span> selected</span>
            </div>
          )}
          
          <div className="flex gap-2 items-center">
            {showExportSelection && (
              <>
                <Button
                  className="rounded-full font-medium"
                  variant="flat"
                  color="default"
                  startContent={<Icon icon="lucide:check" />}
                  onPress={handleSelectAll}
                >
                  {selectedTemplates.size === templates.length ? "Deselect All" : "Select All"}
                </Button>
                <Button
                  className="rounded-full font-medium"
                  variant="solid"
                  color="primary"
                  startContent={<Icon icon="lucide:download" />}
                  onPress={handleExportSelected}
                  isDisabled={selectedTemplates.size === 0}
                >
                  Export {selectedTemplates.size}
                </Button>
                <Button
                  className="rounded-full"
                  variant="flat"
                  startContent={<Icon icon="lucide:x" />}
                  onPress={() => {
                    setShowExportSelection(false);
                    setSelectedTemplates(new Set());
                  }}
                >
                  Cancel
                </Button>
              </>
            )}
            
            {!showExportSelection && (
              <>
                <Button 
                  className="rounded-full font-medium"
                  color="primary"
                  variant="solid"
                  startContent={<Icon icon="lucide:list" />}
                  onPress={() => onApplyTemplate({ 
                    id: "navigate-to-macros", 
                    name: "dummy", 
                    trigger: { type: "noteon" }, 
                    actions: [],
                    createdAt: ""
                  })}
                >
                  My Macros
                </Button>
                
                <Dropdown>
                  <DropdownTrigger>
                    <Button 
                      isIconOnly
                      className="rounded-full" 
                      variant="flat" 
                      color="default"
                    >
                      <Icon icon="lucide:settings" className="text-lg" />
                    </Button>
                  </DropdownTrigger>
                  <DropdownMenu aria-label="Template management options" variant="faded">
                    <DropdownItem
                      key="import"
                      description="Import templates from a file"
                      startContent={<Icon icon="lucide:upload" className="text-secondary" />}
                      onPress={handleImportClick}
                    >
                      Import Templates
                    </DropdownItem>
                    <DropdownItem
                      key="export-all"
                      description="Export all templates"
                      startContent={<Icon icon="lucide:download" className="text-primary" />}
                      onPress={handleExportAll}
                    >
                      Export All Templates
                    </DropdownItem>
                    <DropdownItem
                      key="export-selected"
                      description="Choose templates to export"
                      startContent={<Icon icon="lucide:list-checks" className="text-success" />}
                      onPress={() => {
                        if (templates.length > 0) {
                          setShowExportSelection(true);
                        } else {
                          addToast({
                            title: "No Templates",
                            description: "There are no templates to export",
                            color: "warning"
                          });
                        }
                      }}
                    >
                      Export Selected Templates
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".json"
                  className="hidden"
                />
              </>
            )}
          </div>
        </div>
      </div>
      
      <div className="grid grid-cols-3 xs:grid-cols-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5  gap-4">
        {/* Create New Macro Card - iOS style glossy card */}
        {!showExportSelection && (
          <Card 
            isPressable
            className="relative overflow-hidden h-[200px] shadow-md backdrop-blur-sm hover:shadow-xl transition-all duration-300 transform hover:scale-[1.02] hover:border-primary/20 group"
            onPress={onCreateNewMacro}
          >
            {/* Subtle gradient background effect */}
            <div className="absolute inset-0 bg-gradient-to-br from-background/80 via-background to-background/80 opacity-80"></div>
            
            <div className="relative flex flex-col items-center justify-center text-center p-5 h-full">
              <div className="mb-5 p-4 rounded-full bg-primary/10 border border-primary/20 transition-colors duration-300 group-hover:bg-primary/20">
                <Icon icon="lucide:plus" className="text-primary text-2xl" />
              </div>
              
              <h3 className="text-xl font-medium text-foreground mb-2">Create New Macro</h3>
              <p className="text-sm text-foreground-500 mt-1 max-w-[16rem]">
                Start from scratch with a blank macro
              </p>
              
              
            </div>
          </Card>
        )}
        
        {/* Template Cards - Clean design */}
        {templates.map((template: MacroTemplate) => {
          const categoryColor = getCategoryColor(template.categoryId);
          const isSelected = selectedTemplates.has(template.id);
          const backgroundStyle = getTemplateBackgroundStyle(categoryColor);
          const iconBackgroundStyle = getIconBackgroundStyle(categoryColor);
          const iconColorStyle = getIconColorStyle(categoryColor);
          const chipColor = getChipColor(categoryColor);
          
          return (
            <Card 
              key={template.id}
              id={`template-${template.id}`}
              isPressable
              className={`
                h-[200px] transition-all duration-200
                ${showExportSelection 
                  ? isSelected 
                    ? 'shadow-lg ring-2 ring-primary border-primary' 
                    : 'opacity-80 hover:opacity-100' 
                  : 'hover:shadow-lg hover:border-primary/30 hover:scale-[1.01] transform'
                } 
                ${backgroundStyle.className} flex flex-col p-4 group
              `}
              style={backgroundStyle.style}
              onPress={() => {
                if (showExportSelection) {
                  toggleTemplateSelection(template.id);
                } else {
                  handleSelectTemplate(template);
                }
              }}
            >
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2">
                  <div 
                    className={`p-2 rounded-md ${iconBackgroundStyle.className}`}
                    style={iconBackgroundStyle.style}
                  >
                    <Icon 
                      icon={getTemplateTypeIcon(template.type)} 
                      className={`text-xl ${iconColorStyle.className}`}
                      style={iconColorStyle.style}
                    />
                  </div>
                  
                  <Chip 
                    size="sm" 
                    variant="flat"
                    color={chipColor}
                    style={!isPresetColor(categoryColor) ? { 
                      backgroundColor: hexToRgba(categoryColor, 0.15),
                      color: categoryColor,
                      borderColor: hexToRgba(categoryColor, 0.3)
                    } : {}}
                  >
                    {getTemplateTypeLabel(template.type)}
                  </Chip>
                </div>
                
                <div className="flex gap-1">
                  {!showExportSelection && (
                    <>
                      <div className="relative">
                        <Dropdown>
                          <DropdownTrigger>
                            <Button
                              isIconOnly
                              size="sm"
                              variant="light"
                              color="default"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Icon icon="lucide:more-vertical" className="text-foreground-500" />
                            </Button>
                          </DropdownTrigger>
                          <DropdownMenu aria-label="Template actions" variant="flat">
                            <DropdownItem
                              key="use"
                              description="Apply this template to create a macro"
                              startContent={<Icon icon="lucide:play" className="text-primary" />}
                              onPress={() => handleSelectTemplate(template)}
                            >
                              Use Template
                            </DropdownItem>
                            
                            {template.type.includes("encoder") ? (
                              <DropdownItem
                                key="bulk-init"
                                description="Create multiple encoder groups at once"
                                startContent={<Icon icon="lucide:layers" className="text-secondary" />}
                                onPress={() => handleBulkInitialize(template)}
                              >
                                Bulk Initialize
                              </DropdownItem>
                            ) : null}
                            
                            <DropdownItem
                              key="edit"
                              description="Edit this template"
                              startContent={<Icon icon="lucide:edit" className="text-warning" />}
                              onPress={() => handleTemplateAction(null, 'edit', template)}
                            >
                              Edit Template
                            </DropdownItem>
                            
                            <DropdownItem
                              key="delete"
                              description="Delete this template"
                              color="danger"
                              startContent={<Icon icon="lucide:trash-2" className="text-danger" />}
                              onPress={() => setDeletePopoverOpen(template.id)}
                            >
                              Delete Template
                            </DropdownItem>
                          </DropdownMenu>
                        </Dropdown>
                        
                        {/* Delete confirmation popover */}
                        <Popover 
                          isOpen={deletePopoverOpen === template.id} 
                          onOpenChange={(open) => {
                            if (!open) {
                              setDeletePopoverOpen(null);
                            }
                          }}
                          backdrop="opaque"
                          placement="bottom-end"
                          offset={8}
                          crossOffset={0}
                          shouldBlockScroll={false}
                        >
                          <PopoverTrigger>
                            <div 
                              className="absolute inset-0 pointer-events-none"
                              style={{ 
                                visibility: deletePopoverOpen === template.id ? 'visible' : 'hidden' 
                              }}
                            />
                          </PopoverTrigger>
                          <PopoverContent className="w-[280px]">
                            <div className="px-3 py-3 w-full">
                              <div className="flex items-center gap-2 mb-2">
                                <Icon icon="lucide:alert-triangle" className="text-danger text-lg" />
                                <p className="text-small font-bold text-foreground">
                                  Delete Template
                                </p>
                              </div>
                              <div className="mb-4">
                                <p className="text-small text-default-500">
                                  Are you sure you want to delete <strong>"{template.name}"</strong>? This action cannot be undone.
                                </p>
                              </div>
                              <div className="flex justify-end gap-2">
                                <Button 
                                  size="sm" 
                                  variant="flat"
                                  onPress={() => setDeletePopoverOpen(null)}
                                >
                                  Cancel
                                </Button>                                
                                <Button 
                                  size="sm"
                                  color="danger"
                                  variant="solid"
                                  onPress={() => {
                                    handleConfirmDelete(template.id);
                                    setDeletePopoverOpen(null);
                                  }}
                                >
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </>
                  )}
                  {showExportSelection && isSelected && (
                    <div className="bg-primary text-white rounded-full p-1">
                      <Icon icon="lucide:check" className="text-lg" />
                    </div>
                  )}
                </div>
              </div>
              
              <h3 className="text-lg font-medium mb-1">{template.name}</h3>
              
              <div className="flex-grow overflow-hidden">
                {template.description ? (
                  <p className="text-sm text-foreground-500 line-clamp-3">
                    {template.description}
                  </p>
                ) : (
                  <p className="text-sm text-foreground-400 italic">
                    No description
                  </p>
                )}
              </div>
            </Card>
          );
        })}
        
        {/* iOS-style empty state with illustration effect */}
       
      </div>
      
      {/* Template Application Modal */}
      <Modal 
        isOpen={isOpen} 
        onOpenChange={onClose}
        size="3xl"
        classNames={{
          base: "bg-background/90 backdrop-blur-md border border-white/10 shadow-xl",
          header: "border-b border-white/10",
          body: "py-5",
          closeButton: "hover:bg-white/10 active:bg-white/20"
        }}
      >
        <ModalContent>
          {() => (
            <>
              {selectedTemplate && (
                <TemplateApply
                  template={selectedTemplate}
                  categories={categories}
                  onCancel={handleCancelTemplate}
                  onApplyTemplate={(macro) => {
                    onApplyTemplate(macro);
                    onClose();
                  }}
                  onEditBeforeSaving={(macro) => {
                    onEditMacroFromTemplate(macro);
                    onClose();
                  }}
                />
              )}
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Bulk Encoder Initialization Modal */}
      <Modal 
        isOpen={isBulkOpen} 
        onOpenChange={onBulkClose}
        size="5xl"
        scrollBehavior="inside"
        classNames={{
          base: "bg-background/90 backdrop-blur-md border border-white/10 shadow-xl",
          header: "border-b border-white/10",
          body: "py-5 max-h-[calc(100vh-200px)] overflow-y-auto",
          closeButton: "hover:bg-white/10 active:bg-white/20"
        }}
      >
        <ModalContent>
          {() => (
            <>
              {bulkInitTemplate && (
                <BulkEncoderInitializer
                  template={bulkInitTemplate}
                  categories={categories}
                  onCancel={handleCancelBulkInit}
                  onCreateMacros={handleBulkInitComplete}
                />
              )}
            </>
          )}
        </ModalContent>
      </Modal>

      {/* Import Error Modal */}
      <Modal isOpen={isErrorOpen} onOpenChange={onErrorOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader>Import Error</ModalHeader>
              <ModalBody>
                <p>{importError}</p>
              </ModalBody>
              <ModalFooter>
                <Button onPress={onClose}>
                  Close
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </div>
  );
}; 