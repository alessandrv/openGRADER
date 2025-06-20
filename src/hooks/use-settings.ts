import { useState, useEffect } from 'react';
import { AppSettings, DEFAULT_SETTINGS } from '../types/settings';
import { getGlobalSettings, updateGlobalSettings } from '../lib/tauri';

const SETTINGS_KEY = 'opengrader-settings';

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  // Load settings from both localStorage and Rust backend on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        // First try to load from localStorage for immediate UI update
        const storedSettings = localStorage.getItem(SETTINGS_KEY);
        let finalSettings: AppSettings;
        
        if (storedSettings) {
          // User has saved settings in localStorage - use these as the source of truth
          const parsedSettings = JSON.parse(storedSettings);
          finalSettings = { ...DEFAULT_SETTINGS, ...parsedSettings };
          setSettings(finalSettings);
          
          // Sync localStorage settings to backend
          try {
            await updateGlobalSettings(finalSettings);
            console.log('Synced localStorage settings to backend');
          } catch (syncError) {
            console.error('Failed to sync localStorage settings to backend:', syncError);
          }
        } else {
          // No localStorage settings - try to load from backend, fallback to defaults
          try {
            const backendSettings = await getGlobalSettings();
            finalSettings = backendSettings;
            setSettings(backendSettings);
            // Save backend settings to localStorage for future use
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(backendSettings));
            console.log('Loaded settings from backend and saved to localStorage');
          } catch (backendError) {
            console.log('Backend settings failed, using defaults:', backendError);
            // Both localStorage and backend failed, use defaults
            finalSettings = DEFAULT_SETTINGS;
            setSettings(DEFAULT_SETTINGS);
            
            // Try to save defaults to both localStorage and backend
            try {
              localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
              await updateGlobalSettings(DEFAULT_SETTINGS);
            } catch (saveError) {
              console.error('Failed to save default settings:', saveError);
            }
          }
        }
      } catch (error) {
        console.error('Failed to load settings:', error);
        setSettings(DEFAULT_SETTINGS);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  // Save settings to both localStorage and Rust backend
  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
    
    try {
      // Save to localStorage for immediate persistence
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(updatedSettings));
      
      // Sync to Rust backend
      await updateGlobalSettings(updatedSettings);
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

  // Reset settings to defaults
  const resetSettings = async () => {
    setSettings(DEFAULT_SETTINGS);
    
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS));
      await updateGlobalSettings(DEFAULT_SETTINGS);
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  };

  return {
    settings,
    updateSettings,
    resetSettings,
    isLoading
  };
}; 