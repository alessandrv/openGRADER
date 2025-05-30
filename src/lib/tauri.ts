import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

// Types that match our Rust structs
export enum ActionType {
  MouseMove = "MouseMove",
  MouseClick = "MouseClick",
  KeyPress = "KeyPress",
  KeyCombination = "KeyCombination",
  MouseRelease = "MouseRelease",
  MouseDrag = "MouseDrag",
  Delay = "Delay",
}

export interface ActionParams {
  x?: number;
  y?: number;
  button?: string;
  key?: string;
  modifiers?: string[];
  keys?: string[];
  relative?: boolean;
  hold?: boolean;
  duration?: number;
}

// New interface to represent an action within before/after actions arrays
export interface MacroAction {
  action_type: ActionType;
  action_params: ActionParams;
}

export interface MacroConfig {
  id: string;
  name: string;
  groupId?: string; // For encoder groups to share state
  midi_note: number; // For CC, this is the CC number. For Notes, the note number.
  midi_channel: number;
  midi_value?: number; // For CC, this is the CC value. For Notes, could be velocity.
  actions: MacroAction[];
  // New fields for before/after actions
  before_actions?: MacroAction[];
  after_actions?: MacroAction[];
  timeout?: number; // in milliseconds
}

// Wrapper functions for Tauri commands
export async function moveMouse(x: number, y: number, relative: boolean = false): Promise<void> {
  return invoke("move_mouse", { x, y, relative });
}

export async function clickMouse(button: string): Promise<void> {
  return invoke("click_mouse", { button });
}

export async function pressKey(key: string): Promise<void> {
  return invoke("press_key", { key });
}

export async function pressKeyCombination(keys: string[]): Promise<void> {
  return invoke("press_key_combination", { keys });
}

export async function registerMacro(config: MacroConfig): Promise<void> {
  return invoke("register_macro", { config });
}

export async function getMacros(): Promise<MacroConfig[]> {
  return invoke("get_macros");
}

export async function executeAction(actionType: ActionType, params: ActionParams): Promise<void> {
  return invoke("execute_action", { actionType, params });
}

export async function getCursorPosition(): Promise<[number, number]> {
  const result = await invoke<[number, number]>("get_cursor_position");
  console.log("Raw cursor position result from Rust:", result);
  return result;
}

export function listenToMidiStatus(callback: (status: string) => void): () => void {
  const unlisten = listen("midi-status", (event) => {
    callback(event.payload as string);
  });
  
  return () => {
    unlisten.then(unlistenFn => unlistenFn());
  };
} 