import React, { useState } from "react";
import { Button, Card, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure, addToast, Divider } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useTemplates } from "../hooks/use-templates";
import { MacroTemplate } from "../types/macro";

interface TemplateImportExportProps {
  className?: string;
  templates: MacroTemplate[];
  selectedTemplates: Set<string>;
  setSelectedTemplates: (templates: Set<string>) => void;
  showExportSelection: boolean;
  setShowExportSelection: (show: boolean) => void;
}

export const TemplateImportExport: React.FC<TemplateImportExportProps> = ({ 
  className, 
  templates,
  selectedTemplates,
  setSelectedTemplates,
  showExportSelection,
  setShowExportSelection
}) => {
  const { exportTemplates, importTemplates, loadTemplatesFromStorage } = useTemplates();
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
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
  
  const handleExport = () => {
    try {
      let count;
      
      if (showExportSelection && selectedTemplates.size > 0) {
        // Export only selected templates
        count = exportTemplates([...selectedTemplates]);
        
        // After export, reset the selection mode
        setShowExportSelection(false);
        setSelectedTemplates(new Set());
      } else {
        // Export all templates if no selection
        count = exportTemplates();
      }
      
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
  
  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };
  
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
        onOpen();
        
        // Reset the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    
    reader.onerror = () => {
      setImportError("Error reading file");
      onOpen();
      
      // Reset the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    };
    
    reader.readAsText(file);
  };
  
  return (
    <Card className={`p-4 bg-content1 border border-default-200 ${className || ""}`}>
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-lg font-medium">Template Management</h2>
          <p className="text-sm text-foreground-500">Import or export your macro templates</p>
        </div>
        <div className="flex gap-2">
          {showExportSelection ? (
            <>
              <Button
                variant="flat"
                color="default"
                startContent={<Icon icon="lucide:check" />}
                onPress={handleSelectAll}
              >
                {selectedTemplates.size === templates.length ? "Deselect All" : "Select All"}
                <span className="ml-1 text-xs">
                  ({selectedTemplates.size}/{templates.length})
                </span>
              </Button>
              <Button
                variant="solid"
                color="primary"
                startContent={<Icon icon="lucide:download" />}
                onPress={handleExport}
                isDisabled={selectedTemplates.size === 0}
              >
                Export Selected
              </Button>
              <Button
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
          ) : (
            <>
              <Button
                variant="solid"
                color="primary"
                startContent={<Icon icon="lucide:download" />}
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
                Export
              </Button>
              <Button
                variant="flat"
                startContent={<Icon icon="lucide:upload" />}
                onPress={handleImportClick}
              >
                Import Templates
              </Button>
            </>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />
        </div>
      </div>
      
      <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
        <ModalContent>
          {(onClose) => (
            <>
              <ModalHeader className="flex flex-col gap-1">Import Error</ModalHeader>
              <ModalBody>
                <div className="flex items-center gap-2 text-danger">
                  <Icon icon="lucide:alert-circle" className="text-2xl" />
                  <p>{importError}</p>
                </div>
                <p className="mt-2">
                  Please make sure you are importing a valid openGRADER template file.
                </p>
              </ModalBody>
              <ModalFooter>
                <Button color="primary" onPress={onClose}>
                  OK
                </Button>
              </ModalFooter>
            </>
          )}
        </ModalContent>
      </Modal>
    </Card>
  );
}; 