import React, { useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalBody, ModalFooter, Button, Card, CardBody, Chip } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useMidi } from "../contexts/midi-context";

export const MidiDeviceModal: React.FC = () => {
  const { 
    showDeviceModal, 
    setShowDeviceModal, 
    inputs, 
    selectedInput, 
    setSelectedInput,
    isEnabled 
  } = useMidi();
  
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const handleSelectDevice = (device: { id: string, name: string }) => {
    setSelectedDeviceId(device.id);
  };

  const handleConfirm = async () => {
    if (selectedDeviceId) {
      const selectedDevice = inputs.find(input => input.id === selectedDeviceId);
      if (selectedDevice) {
        await setSelectedInput(selectedDevice);
      }
    }
    setShowDeviceModal(false);
  };

  const handleSkip = () => {
    setShowDeviceModal(false);
  };

  // Don't render if MIDI is not enabled
  if (!isEnabled) {
    return null;
  }

  return (
    <Modal 
      isOpen={showDeviceModal} 
      onOpenChange={setShowDeviceModal}
      isDismissable={false}
      hideCloseButton
      size="lg"
      backdrop="blur"
    >
      <ModalContent>
        <>
          <ModalHeader className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Icon icon="lucide:music" className="text-2xl text-primary" />
              <span>Select MIDI Device</span>
            </div>
            <p className="text-sm text-foreground-500 font-normal">
              Choose a MIDI input device to get started with openGRADER
            </p>
          </ModalHeader>
          <ModalBody>
            {inputs.length === 0 ? (
              <Card className="border-dashed border-2 border-default-200">
                <CardBody className="text-center py-8">
                  <Icon icon="lucide:search-x" className="text-4xl text-default-400 mb-2 mx-auto" />
                  <p className="text-foreground-500">No MIDI devices detected</p>
                  <p className="text-foreground-400 text-sm mt-1">
                    Connect a MIDI device to continue
                  </p>
                </CardBody>
              </Card>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-foreground-600 mb-3">
                  Found {inputs.length} MIDI device{inputs.length !== 1 ? 's' : ''}:
                </p>
                {inputs.map((input) => (
                  <Card 
                    key={input.id}
                    className={`cursor-pointer transition-all duration-200 hover:scale-[1.02] ${
                      selectedDeviceId === input.id 
                        ? 'border-2 border-primary bg-primary-50' 
                        : 'border border-default-200 hover:border-default-300'
                    }`}
                    isPressable
                    onPress={() => handleSelectDevice(input)}
                  >
                    <CardBody className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${
                            selectedDeviceId === input.id ? 'bg-primary' : 'bg-default-300'
                          }`} />
                          <div>
                            <p className="font-medium">{input.name}</p>
                            <p className="text-sm text-foreground-500">
                              MIDI Input Device
                            </p>
                          </div>
                        </div>
                        {selectedInput?.id === input.id && (
                          <Chip size="sm" color="success" variant="flat">
                            Currently Active
                          </Chip>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </ModalBody>
          <ModalFooter>
            <Button 
              variant="flat" 
              onPress={handleSkip}
            >
              Skip for Now
            </Button>
            <Button 
              color="primary" 
              onPress={handleConfirm}
              isDisabled={!selectedDeviceId}
            >
              Connect Device
            </Button>
          </ModalFooter>
        </>
      </ModalContent>
    </Modal>
  );
}; 