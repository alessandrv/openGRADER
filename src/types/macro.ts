export interface Action {
  id: string;
  type: string; // e.g., "keypress", "mouseclick", "delay", "mouserelease", "mousedrag"
  params: Record<string, any>; // Parameters specific to the action type
}

export interface MacroCategory {
  id: string;
  name: string;
  color: string; // Color for the category
  isExpanded?: boolean; // Optional tracking of expanded state in UI
}

export interface MacroDefinition {
  id: string;
  groupId?: string; // For grouping related macros, e.g., encoder increment/decrement/click
  categoryId?: string; // For organizing into user-defined categories (Photoshop, DaVinci, etc.)
  name: string;
  type?: "standard" | "encoder-increment" | "encoder-decrement" | "encoder-click"; // Helps categorize and handle UI for grouped macros
  trigger: {
    type: "noteon" | "noteoff" | "controlchange";
    channel?: number;
    note?: number; // Note number (0-127)
    controller?: number; // CC number (0-127)
    value?: number; // For CC, the specific value to match (0-127), or for noteon, velocity
    direction?: "increment" | "decrement"; // For rotary encoders sending CC
  };
  midi_value?: number; // Specific CC value to match, extracted from trigger.value if trigger is CC
  actions: Action[];
  beforeActions?: Action[];
  afterActions?: Action[];
  timeout?: number; // Timeout for afterActions, if applicable
  createdAt: string; // ISO date string
  updatedAt?: string; // ISO date string, optional
}

// Template for creating macros
export interface MacroTemplate {
  id: string;
  name: string;
  description?: string;
  categoryId?: string;
  type: "standard" | "encoder-increment" | "encoder-decrement" | "encoder-click"; // Type of template
  // Core action arrays
  actions: Action[];
  beforeActions?: Action[];
  afterActions?: Action[];
  // For encoder templates
  decrementActions?: Action[];
  clickActions?: Action[];
  // Settings
  timeout?: number;
  // Editable field configuration
  editableFields: {
    category: boolean;
    midi: boolean;
    midiValues: {
      channel: boolean;
      note: boolean;
      controller: boolean;
      value: boolean;
    };
    actionParams: {
      id: string;       // Action ID to edit
      section: string;  // Section: "main", "before", "after", "decrement", "click"
      params: string[]; // Parameter names that can be edited
    }[];
  };
  createdAt: string;
  updatedAt?: string;
}