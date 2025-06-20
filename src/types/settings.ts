export interface AppSettings {
  macroTriggerDelay: number; // Delay in milliseconds before triggering a new macro
  enableMacroConflictPrevention: boolean; // Whether to prevent conflicting macro triggers
  defaultTimeout: number; // Default timeout for new macros in milliseconds
}
 
export const DEFAULT_SETTINGS: AppSettings = {
  macroTriggerDelay: 0, // 0ms default delay (no delay)
  enableMacroConflictPrevention: true,
  defaultTimeout: 500
}; 