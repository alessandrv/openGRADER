import React from "react";
import { Button, Card, Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, useDisclosure } from "@heroui/react";
import { Icon } from "@iconify/react";

interface ImportExportControlsProps {
  onExport: () => void;
  onImport: (data: any) => void;
}

export const ImportExportControls: React.FC<ImportExportControlsProps> = ({ onExport, onImport }) => {
  const { isOpen, onOpen, onOpenChange } = useDisclosure();
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [importError, setImportError] = React.useState<string | null>(null);
  
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
        onImport(data);
        
        // Reset the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } catch (error) {
        console.error("Error parsing import file:", error);
        setImportError("Invalid JSON file format");
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
    <Card className="p-4 bg-content2 border-2 border-primary-100">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-lg font-medium">Macro Configuration</h2>
          <p className="text-sm text-foreground-500">Import or export your macro configurations</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="solid"
            color="primary"
            startContent={<Icon icon="lucide:download" />}
            onPress={onExport}
            size="lg"
          >
            Export Macros
          </Button>
          <Button
            variant="flat"
            startContent={<Icon icon="lucide:upload" />}
            onPress={handleImportClick}
            size="lg"
          >
            Import Macros
          </Button>
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
                  Please make sure you are importing a valid MIDI Macro configuration file.
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