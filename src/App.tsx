import React, { useState } from "react";
import { Card, Tabs, Tab, Divider, Button } from "@heroui/react";
import { MacroBuilder } from "./components/macro-builder";
import { MidiLog } from "./components/midi-log";
import { MacrosList } from "./components/macros-list";
import { SettingsPage } from "./components/settings-page";
import { MacroDefinition, MacroTemplate } from "./types/macro";
import { TemplatesGallery } from "./components/templates-gallery";
import { TemplateManager } from "./components/template-manager";
import { TemplateEditor } from "./components/template-editor";
import { MidiDeviceModal } from "./components/midi-device-modal";
import { useTemplates } from "./hooks/use-templates";
import { Icon } from "@iconify/react";

export default function App() {
  // Views: "gallery", "create", "macros", "template", "edit-template", "settings"
  const [currentView, setCurrentView] = useState<string>("gallery");
  const [editingMacro, setEditingMacro] = useState<MacroDefinition | null>(null);
  const [templateSourceMacro, setTemplateSourceMacro] = useState<MacroDefinition | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<MacroTemplate | null>(null);
  
  const { addTemplate, updateTemplate } = useTemplates();

  const handleEditMacro = (macro: MacroDefinition) => {
    setEditingMacro(macro);
    setCurrentView("create");
  };

  const handleEditComplete = () => {
    setEditingMacro(null);
    // Go back to the previous view (either gallery or macros list)
    setCurrentView(currentView === "create" ? "gallery" : "macros");
  };

  const handleNewMacroCreated = () => {
    setEditingMacro(null);
    setCurrentView("macros");
  };

  const handleCreateTemplateFromMacro = (macro: MacroDefinition) => {
    // If this is part of a group (encoder), we should load all related macros
    // so the template manager can handle them together
    if (macro.groupId) {
      // Get all macros from localStorage
      const allMacros: MacroDefinition[] = JSON.parse(localStorage.getItem("midiMacros") || "[]");
      
      // Find all macros in this group
      const groupMacros = allMacros.filter(m => m.groupId === macro.groupId);
      
      // Use the macro most representative of the group
      // Order of preference: increment, decrement, click
      const incrementMacro = groupMacros.find(m => m.type === "encoder-increment");
      const decrementMacro = groupMacros.find(m => m.type === "encoder-decrement");
      const clickMacro = groupMacros.find(m => m.type === "encoder-click");
      
      // Use the first available macro with priority order
      const primaryMacro = incrementMacro || decrementMacro || clickMacro || macro;
      
      // Create a merged macro object with all parts for the template manager
      const mergedMacro = {
        ...primaryMacro,
        // Add special properties for the template manager to access all parts
        _encoderGroup: {
          increment: incrementMacro,
          decrement: decrementMacro,
          click: clickMacro
        }
      };
      
      setTemplateSourceMacro(mergedMacro);
    } else {
      // For regular macros, just use as is
      setTemplateSourceMacro(macro);
    }
    
    setCurrentView("template");
  };

  const handleTemplateCreated = (template: MacroTemplate) => {
    // Save the template using our hook
    addTemplate(template);
    
    // Go back to gallery view
    setCurrentView("gallery");
    setTemplateSourceMacro(null);
  };

  const handleCreateNewMacro = () => {
    setEditingMacro(null);
    setCurrentView("create");
  };

  const handleApplyTemplate = (macro: MacroDefinition) => {
    // Special case for navigation
    if (macro.id === "navigate-to-macros") {
      setCurrentView("macros");
      return;
    }
    
    // Save the macro to localStorage
    const existingMacros = JSON.parse(localStorage.getItem("midiMacros") || "[]");
    const updatedMacros = [...existingMacros, macro];
    localStorage.setItem("midiMacros", JSON.stringify(updatedMacros));
    
    // Go to macros view
    setCurrentView("macros");
  };

  const handleEditMacroFromTemplate = (macro: MacroDefinition) => {
    setEditingMacro(macro);
    setCurrentView("create");
  };

  const handleEditTemplate = (template: MacroTemplate) => {
    setEditingTemplate(template);
    setCurrentView("edit-template");
  };

  const handleTemplateUpdated = (updatedTemplate: MacroTemplate) => {
    // Save the updated template
    updateTemplate(updatedTemplate);
    
    // Go back to gallery view
    setCurrentView("gallery");
    setEditingTemplate(null);
  };

  const handleDeleteTemplate = (_id: string) => {
    // Template deletion is handled in the TemplatesGallery component via the useTemplates hook
  };
  
  const handleBackToGallery = () => {
    setCurrentView("gallery");
    setEditingMacro(null);
    setTemplateSourceMacro(null);
    setEditingTemplate(null);
  };

  // const handleBackToMacros = () => {
  //   setCurrentView("macros");
  //   setEditingMacro(null);
  //   setTemplateSourceMacro(null);
  //   setEditingTemplate(null);
  // };

  // Function to determine if we should show back button
  // const shouldShowBackButton = () => {
  //   return currentView === "create" || currentView === "template" || currentView === "edit-template";
  // };
  
  const getBackButtonTarget = () => {
    if (currentView === "create") {
      // If editing a macro, go back to macros view
      return editingMacro ? "macros" : "gallery";
    }
    return "gallery"; // Default for template view and edit-template view
  };

  const handleBackButton = () => {
    const target = getBackButtonTarget();
    setCurrentView(target);
    setEditingMacro(null);
    setTemplateSourceMacro(null);
    setEditingTemplate(null);
  };

  const renderContent = () => {
    switch (currentView) {
      case "gallery":
        return (
          <Card className="p-4">
            <TemplatesGallery
              onCreateNewMacro={handleCreateNewMacro}
              onApplyTemplate={handleApplyTemplate}
              onEditMacroFromTemplate={handleEditMacroFromTemplate}
              onDeleteTemplate={handleDeleteTemplate}
              onEditTemplate={handleEditTemplate}
            />
          </Card>
        );
      
      case "create":
        return (
          <Card className="p-4">
            <div className="mb-4 flex justify-between items-center">
              <Button 
                variant="flat"
                color="primary"
                startContent={<Icon icon="lucide:arrow-left" />}
                onClick={handleBackButton}
              >
                Back
              </Button>
              
              {editingMacro && (
                <h2 className="text-xl font-semibold">
                  Editing: {editingMacro.name}
                </h2>
              )}
            </div>
            <MacroBuilder 
              macroToEdit={editingMacro} 
              onEditComplete={handleEditComplete}
              onNewMacroCreated={handleNewMacroCreated}
            />
          </Card>
        );
      
      case "macros":
        return (
          <Card className="p-4">
            <MacrosList 
              onEditMacro={handleEditMacro} 
              onCreateTemplate={handleCreateTemplateFromMacro}
            />
          </Card>
        );
      
      case "template":
        if (!templateSourceMacro) return null;
        return (
          <Card className="p-4">
            <div className="mb-4 flex justify-between items-center">
              <Button 
                variant="flat"
                color="primary"
                startContent={<Icon icon="lucide:arrow-left" />}
                onClick={handleBackButton}
              >
                Back
              </Button>
              
              <h2 className="text-xl font-semibold">Create Template</h2>
            </div>
            <TemplateManager
              macro={templateSourceMacro}
              onClose={handleBackToGallery}
              onSave={handleTemplateCreated}
              categories={JSON.parse(localStorage.getItem("macroCategories") || "[]")}
            />
          </Card>
        );

      case "edit-template":
        if (!editingTemplate) return null;
        return (
          <Card className="p-4">
            <div className="mb-4 flex justify-between items-center">
              <Button 
                variant="flat"
                color="primary"
                startContent={<Icon icon="lucide:arrow-left" />}
                onClick={handleBackButton}
              >
                Back
              </Button>
              
              <h2 className="text-xl font-semibold">Edit Template</h2>
            </div>
            <TemplateEditor
              template={editingTemplate}
              onCancel={handleBackToGallery}
              onSave={handleTemplateUpdated}
              categories={JSON.parse(localStorage.getItem("macroCategories") || "[]")}
            />
          </Card>
        );

      case "settings":
        return (
          <Card className="p-4">
            <SettingsPage />
          </Card>
        );
      
      default:
        return null;
    }
  };

  // Handle navigation requests from other components (e.g., MIDI monitor)
  React.useEffect(() => {
    const handler = () => {
      const targetView = localStorage.getItem('navigateToView');
      if (targetView === 'macros') {
        // Ensure category is expanded before rendering list
        const expandCategoryId = localStorage.getItem('expandCategoryId');
        if (expandCategoryId) {
          try {
            const categories = JSON.parse(localStorage.getItem('macroCategories') || '[]');
            const updated = categories.map((c: any) => ({ ...c, isExpanded: c.id === expandCategoryId ? true : c.isExpanded }));
            localStorage.setItem('macroCategories', JSON.stringify(updated));
          } catch {}
        }
        setCurrentView('macros');
        // Retry loop to wait for content to mount
        const macroId = localStorage.getItem('scrollToMacroId');
        let tries = 0;
        const maxTries = 12; // ~2.4s at 200ms
        const tick = () => {
          tries++;
          const selector = macroId ? `[data-macro-id="${macroId}"]` : '';
          const el = selector ? document.querySelector(selector) as HTMLElement | null : null;
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('macro-highlight');
            setTimeout(() => el.classList.remove('macro-highlight'), 1400);
            // Do not clear hints for potential future navigations; MacrosList handler clears scroll id
          } else if (tries < maxTries) {
            setTimeout(tick, 200);
          }
        };
        setTimeout(tick, 150);
      }
    };
    window.addEventListener('navigate-to-macros' as any, handler);
    return () => window.removeEventListener('navigate-to-macros' as any, handler);
  }, []);

  const renderHeader = () => {
    const titles: Record<string, string> = {
      "gallery": "openGRADER",
      "create": editingMacro ? "Edit Macro" : "Create New Macro",
      "macros": "My Macros",
      "template": "Create Template",
      "edit-template": "Edit Template",
      "settings": "Settings"
    };
    
    return (
      <header className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{titles[currentView] || "MIDI Macro Builder"}</h1>
            <p className="text-foreground-500">
              {currentView === "gallery" 
                ? "Choose a template or create a new macro from scratch" 
                : currentView === "macros"
                ? "Manage your saved macros"
                : currentView === "create"
                ? "Create custom macros triggered by MIDI inputs"
                : currentView === "edit-template"
                ? "Edit an existing template"
                : currentView === "settings"
                ? "Configure application behavior and preferences"
                : "Create a reusable template from an existing macro"}
            </p>
          </div>
          <Tabs 
            aria-label="App Navigation" 
            selectedKey={currentView === "create" || currentView === "template" || currentView === "edit-template" ? getBackButtonTarget() : currentView}
            onSelectionChange={(key) => {
              // Only allow navigation to main views
              if (key === "gallery" || key === "macros" || key === "settings") {
                setCurrentView(key.toString());
                setEditingMacro(null);
                setTemplateSourceMacro(null);
                setEditingTemplate(null);
              }
            }}
          >
            <Tab 
              key="gallery" 
              title={
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:grid" />
                  <span>Templates</span>
                </div>
              }
            />
            <Tab 
              key="macros" 
              title={
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:list" />
                  <span>My Macros</span>
                </div>
              }
            />
            <Tab 
              key="settings" 
              title={
                <div className="flex items-center gap-2">
                  <Icon icon="lucide:settings" />
                  <span>Settings</span>
                </div>
              }
            />
          </Tabs>
        </div>
      </header>
    );
  };

  return (
        <div className="min-h-screen bg-background p-4 md:p-8">
         
          
          {renderHeader()}
          
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              {renderContent()}
            </div>
            
            <div>
              <Card className="p-4 h-[calc(100vh-156px)]">
                <h2 className="text-lg font-medium mb-2">MIDI Monitor</h2>
                <Divider className="my-2" />
                <MidiLog />
              </Card>
            </div>
          </div>
          
          {/* MIDI Device Selection Modal */}
          <MidiDeviceModal />
        </div>
  );
}