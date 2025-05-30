import { useState, useEffect, useCallback } from 'react';
import { MacroTemplate } from '../types/macro';

export function useTemplates() {
  const [templates, setTemplates] = useState<MacroTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load templates from localStorage on mount
  useEffect(() => {
    loadTemplatesFromStorage();
  }, []);

  // Function to load templates from localStorage
  const loadTemplatesFromStorage = useCallback(() => {
    try {
      const storedTemplates = localStorage.getItem('macroTemplates');
      if (storedTemplates) {
        setTemplates(JSON.parse(storedTemplates));
      } else {
        setTemplates([]);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      setTemplates([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Add a template
  const addTemplate = useCallback((template: MacroTemplate) => {
    setTemplates(prevTemplates => {
      const newTemplates = [...prevTemplates, template];
      localStorage.setItem('macroTemplates', JSON.stringify(newTemplates));
      return newTemplates;
    });
  }, []);

  // Delete a template by id
  const deleteTemplate = useCallback((id: string) => {
    setTemplates(prevTemplates => {
      const newTemplates = prevTemplates.filter(t => t.id !== id);
      localStorage.setItem('macroTemplates', JSON.stringify(newTemplates));
      return newTemplates;
    });
  }, []);

  // Update a template
  const updateTemplate = useCallback((updatedTemplate: MacroTemplate) => {
    // First, get the latest templates from localStorage to ensure we have the most current data
    const storedTemplates = localStorage.getItem('macroTemplates');
    const currentTemplates = storedTemplates ? JSON.parse(storedTemplates) : [];
    
    // Apply the update to the current templates from localStorage
    const updatedTemplates = currentTemplates.map((t: MacroTemplate) => 
        t.id === updatedTemplate.id ? updatedTemplate : t
      );
    
    // Save back to localStorage
    localStorage.setItem('macroTemplates', JSON.stringify(updatedTemplates));
    
    // Update the state with the most current data
    setTemplates(updatedTemplates);
  }, []);

  // Export templates to a file
  const exportTemplates = useCallback((templateIds?: string[]) => {
    // Get all templates
    const storedTemplates = localStorage.getItem('macroTemplates');
    const currentTemplates = storedTemplates ? JSON.parse(storedTemplates) : [];
    
    // Filter templates if specific IDs are provided
    const templatesToExport = templateIds 
      ? currentTemplates.filter((t: MacroTemplate) => templateIds.includes(t.id))
      : currentTemplates;
    
    // Create an export object with metadata
    const exportData = {
      version: "1.0",
      type: "macroTemplates",
      exportDate: new Date().toISOString(),
      templates: templatesToExport
    };
    
    // Convert to JSON string
    const jsonString = JSON.stringify(exportData, null, 2);
    
    // Create a blob and download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    // Create a link and trigger download
    const a = document.createElement('a');
    a.href = url;
    a.download = `opengrader-templates-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    
    // Clean up
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return templatesToExport.length;
  }, []);

  // Import templates from a file
  const importTemplates = useCallback((importData: any) => {
    try {
      // Log the import data for debugging
      console.log("Import data received:", importData);
      
      // Validate the import data
      if (!importData || typeof importData !== 'object') {
        console.error("Invalid import data, not an object:", importData);
        throw new Error('Invalid template format: not a valid JSON object');
      }
      
      // Check if this is our expected format with templates array
      if (!importData.templates && !Array.isArray(importData)) {
        console.error("No templates array found in import data:", importData);
        throw new Error('Invalid template format: templates array not found');
      }
      
      // Extract the templates - handle both formats (array or object with templates array)
      const importedTemplates = Array.isArray(importData) ? importData : importData.templates;
      console.log(`Found ${importedTemplates.length} templates to import`);
      
      // Get existing templates
      const storedTemplates = localStorage.getItem('macroTemplates');
      const currentTemplates = storedTemplates ? JSON.parse(storedTemplates) : [];
      console.log(`Current templates: ${currentTemplates.length}`);
      
      // Track existing IDs to avoid duplicates
      const existingIds = new Set(currentTemplates.map((t: MacroTemplate) => t.id));
      
      // Process imported templates - assign new IDs if they already exist
      const newTemplates = importedTemplates.map((template: MacroTemplate) => {
        // Validate template has minimum required fields
        if (!template.id || !template.name || !template.actions) {
          console.warn("Skipping invalid template:", template);
          return null;
        }
        
        // Generate a new ID if this one already exists
        if (existingIds.has(template.id)) {
          const newId = crypto.randomUUID();
          console.log(`Template ID ${template.id} already exists, assigning new ID: ${newId}`);
          return { ...template, id: newId };
        }
        
        return template;
      }).filter(Boolean); // Remove null entries
      
      console.log(`Processed ${newTemplates.length} valid templates to import`);
      
      // Combine with existing templates
      const updatedTemplates = [...currentTemplates, ...newTemplates];
      
      // Save to localStorage
      localStorage.setItem('macroTemplates', JSON.stringify(updatedTemplates));
      console.log(`Saved ${updatedTemplates.length} templates to storage`);
      
      // Update state
      setTemplates(updatedTemplates);
      
      return newTemplates.length;
    } catch (error) {
      console.error('Error importing templates:', error);
      throw error;
    }
  }, []);

  return {
    templates,
    isLoading,
    addTemplate,
    deleteTemplate,
    updateTemplate,
    exportTemplates,
    importTemplates,
    loadTemplatesFromStorage
  };
} 