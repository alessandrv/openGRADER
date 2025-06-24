use enigo::{Enigo, Key, KeyboardControllable, MouseButton, MouseControllable};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Runtime, Emitter};
use midir::{MidiInput, MidiInputConnection};
use std::collections::HashMap;
use tokio::task::AbortHandle;

// Added an ActiveMacro struct to track in-progress macros and their timeout tasks
struct ActiveMacro {
    // Handle to the tokio task that will execute after_actions after timeout
    abort_handle: AbortHandle,
    // Timestamp when this macro was last triggered
    last_triggered: std::time::Instant,
}

// Struct that tracks when a before action can be run again (based on timeout)
struct BeforeActionState {
    // When this before action was executed
    last_executed: std::time::Instant,
    // How long to wait before executing again
    cooldown: std::time::Duration,
}

// Global settings structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GlobalSettings {
    pub macro_trigger_delay: u64, // Delay in milliseconds
    pub enable_macro_conflict_prevention: bool,
    pub default_timeout: u32,
}

impl Default for GlobalSettings {
    fn default() -> Self {
        Self {
            macro_trigger_delay: 0, // 0ms default (no delay)
            enable_macro_conflict_prevention: true,
            default_timeout: 500,
        }
    }
}

// Shared state for the application - removed Enigo from here
pub struct AppState {
    // Removed enigo from here since it's not thread-safe
    midi_connection: Mutex<Option<MidiInputConnection<()>>>,
    midi_ports: Mutex<Vec<(String, usize)>>, // Store (port_name, index) pairs
    registered_macros: Mutex<Vec<MacroConfig>>, // Added to store macros
    mouse_state: Mutex<HashMap<MouseButton, bool>>, // Track which buttons are pressed
    key_state: Mutex<HashMap<Key, bool>>, // Track which keys are pressed

    // Track active macros by their ID
    active_macros: Mutex<HashMap<String, ActiveMacro>>,
    // Track before_action execution state across triggers
    before_action_states: Mutex<HashMap<String, BeforeActionState>>,
    // Global settings
    global_settings: Mutex<GlobalSettings>,
    // Track last macro trigger time per group for delay enforcement
    last_group_triggers: Mutex<HashMap<String, std::time::Instant>>,
}

static APP_STATE: Lazy<Arc<AppState>> = Lazy::new(|| {
    Arc::new(AppState {
        // Removed enigo initialization
        midi_connection: Mutex::new(None),
        midi_ports: Mutex::new(Vec::new()),
        mouse_state: Mutex::new(HashMap::new()),
        key_state: Mutex::new(HashMap::new()),

        registered_macros: Mutex::new(Vec::new()),
        active_macros: Mutex::new(HashMap::new()),
        before_action_states: Mutex::new(HashMap::new()),
        global_settings: Mutex::new(GlobalSettings::default()),
        last_group_triggers: Mutex::new(HashMap::new()),
    })
});

// Helper function to create Enigo instances on-demand
fn create_enigo() -> Enigo {
    println!("Creating new Enigo instance...");
    // Add a small delay to ensure proper initialization
    std::thread::sleep(std::time::Duration::from_millis(50));
    let enigo = Enigo::new();
    println!("Enigo instance created successfully");
    enigo
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroConfig {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub groupId: Option<String>, // Added for encoder groups to share state
    pub midi_note: u8,
    pub midi_channel: u8,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub midi_value: Option<u8>,
    pub actions: Vec<MacroAction>, // Added
    // New fields for before/after actions
    #[serde(skip_serializing_if = "Option::is_none")]
    pub before_actions: Option<Vec<MacroAction>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub after_actions: Option<Vec<MacroAction>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timeout: Option<u32>, // in milliseconds
}

// New struct to represent an action within before/after actions arrays
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroAction {
    pub action_type: ActionType,
    pub action_params: ActionParams,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ActionType {
    MouseMove,
    MouseClick,
    KeyPress,
    KeyRelease,
    KeyCombination,
    MouseRelease,
    MouseDrag,
    Delay,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActionParams {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub button: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modifiers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keys: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub relative: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hold: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub amount: Option<i32>,
}

impl Default for ActionParams {
    fn default() -> Self {
        Self {
            x: None,
            y: None,
            button: None,
            key: None,
            modifiers: None,
            keys: None,
            relative: None,
            hold: None,
            duration: None,
            amount: None,
        }
    }
}

// Convert string key name to Enigo Key
fn string_to_key(key: &str) -> Option<Key> {
    match key.to_lowercase().as_str() {
        "backspace" => Some(Key::Backspace),
        "tab" => Some(Key::Tab),
        "enter" | "return" => Some(Key::Return),
        "escape" | "esc" => Some(Key::Escape),
        "space" => Some(Key::Space),
        "capslock" => Some(Key::CapsLock),
        "shift" => Some(Key::Shift),
        "ctrl" | "control" => Some(Key::Control),
        "alt" => Some(Key::Alt),
        "meta" | "command" | "super" | "windows" => Some(Key::Meta),
        "delete" | "del" => Some(Key::Delete),
        "home" => Some(Key::Home),
        "end" => Some(Key::End),
        "pageup" => Some(Key::PageUp),
        "pagedown" => Some(Key::PageDown),
        "leftarrow" => Some(Key::Layout('←')),
        "rightarrow" => Some(Key::Layout('→')),
        "uparrow" => Some(Key::Layout('↑')),
        "downarrow" => Some(Key::Layout('↓')),
        "f1" => Some(Key::F1),
        "f2" => Some(Key::F2),
        "f3" => Some(Key::F3),
        "f4" => Some(Key::F4),
        "f5" => Some(Key::F5),
        "f6" => Some(Key::F6),
        "f7" => Some(Key::F7),
        "f8" => Some(Key::F8),
        "f9" => Some(Key::F9),
        "f10" => Some(Key::F10),
        "f11" => Some(Key::F11),
        "f12" => Some(Key::F12),
        // Extended function keys (F13-F24)
        "f13" => Some(Key::F13),
        "f14" => Some(Key::F14),
        "f15" => Some(Key::F15),
        "f16" => Some(Key::F16),
        "f17" => Some(Key::F17),
        "f18" => Some(Key::F18),
        "f19" => Some(Key::F19),
        "f20" => Some(Key::F20),
        // Alternative arrow key names
        "arrowleft" => Some(Key::Layout('←')),
        "arrowright" => Some(Key::Layout('→')),
        "arrowup" => Some(Key::Layout('↑')),
        "arrowdown" => Some(Key::Layout('↓')),
        // Additional system keys
        s if s.len() == 1 => {
            let c = s.chars().next()?;
            if c.is_ascii() {
                Some(Key::Layout(c))
            } else {
                None
            }
        }
        _ => None,
    }
}

// Convert string button name to Enigo MouseButton
fn string_to_mouse_button(button: &str) -> Option<MouseButton> {
    match button.to_lowercase().as_str() {
        "left" => Some(MouseButton::Left),
        "right" => Some(MouseButton::Right),
        "middle" => Some(MouseButton::Middle),
        _ => None,
    }
}

// Command to execute an action based on a macro
#[tauri::command]
async fn execute_action<R: Runtime>(app_handle: AppHandle<R>, action_type: ActionType, params: ActionParams) -> Result<(), String> {
    execute_action_safe(action_type, params, Some(app_handle)).await
}

// Internal implementation that can be called from different contexts
fn execute_action_impl(action_type: ActionType, params: ActionParams) -> Result<(), String> {
    // Create a new Enigo instance for each action execution
    println!("Creating new Enigo instance for action: {:?}", action_type);
    let mut enigo = create_enigo();
    
    match action_type {
        ActionType::MouseMove => {
            let x = params.x.ok_or("Missing x parameter for MouseMove")?;
            let y = params.y.ok_or("Missing y parameter for MouseMove")?;
            let relative = params.relative.unwrap_or(false);
            println!("Executing MouseMove: x={}, y={}, relative={}", x, y, relative);
            if relative {
                enigo.mouse_move_relative(x, y);
            } else {
                enigo.mouse_move_to(x, y);
            }
            println!("MouseMove completed successfully");
            Ok(())
        },
        ActionType::MouseClick => {
            let button_str = params.button.ok_or("Missing button parameter")?;
            
            // Handle scroll actions
            if button_str == "scroll-up" || button_str == "scroll-down" {
                let amount = params.amount.unwrap_or(3);
                let scroll_amount = if button_str == "scroll-up" { -amount } else { amount };
                
                println!("Executing mouse scroll: direction={}, amount={}", button_str, scroll_amount);
                enigo.mouse_scroll_y(scroll_amount);
                println!("Mouse scroll completed successfully");
                return Ok(());
            }
            
            // Handle regular mouse clicks
            let button = string_to_mouse_button(&button_str)
                .ok_or_else(|| format!("Invalid mouse button: {}", button_str))?;
            
            if params.hold == Some(true) {
                let mut mouse_state = APP_STATE.mouse_state.lock().unwrap();
                if !mouse_state.get(&button).unwrap_or(&false) {
                    enigo.mouse_down(button);
                    mouse_state.insert(button, true);
                    println!("Mouse {:?} pressed and tracked", button);
                } else {
                    println!("Mouse {:?} already pressed, skipping", button);
                }
            } else {
                // For regular clicks, always release first to be safe
                let mut mouse_state = APP_STATE.mouse_state.lock().unwrap();
                if *mouse_state.get(&button).unwrap_or(&false) {
                    enigo.mouse_up(button);
                    mouse_state.insert(button, false);
                }
                enigo.mouse_click(button);
            }
            Ok(())
        },
        ActionType::KeyPress => {
            let key_str = params.key.ok_or("Missing key parameter for KeyPress")?;
            let key = string_to_key(&key_str)
                .ok_or_else(|| format!("Invalid key: {}", key_str))?;
            
            if params.hold == Some(true) {
                let mut key_state = APP_STATE.key_state.lock().unwrap();
                if !key_state.get(&key).unwrap_or(&false) {
                    println!("Executing KeyPress with hold: key={:?}", key);
                    enigo.key_down(key);
                    key_state.insert(key, true);
                    println!("Key {:?} pressed and held, tracked in state", key);
                } else {
                    println!("Key {:?} already held, skipping", key);
                }
            } else {
                // For regular key presses, always release first to be safe
                let mut key_state = APP_STATE.key_state.lock().unwrap();
                if *key_state.get(&key).unwrap_or(&false) {
                    enigo.key_up(key);
                    key_state.insert(key, false);
                }
            println!("Executing KeyPress: key={:?}", key);
            enigo.key_click(key);
            println!("KeyPress completed successfully");
            }
            Ok(())
        },
        ActionType::KeyRelease => {
            let key_str = params.key.ok_or("Missing key parameter for KeyRelease")?;
            let key = string_to_key(&key_str)
                .ok_or_else(|| format!("Invalid key: {}", key_str))?;
            
            let mut key_state = APP_STATE.key_state.lock().unwrap();
            if *key_state.get(&key).unwrap_or(&false) {
                println!("Executing KeyRelease: key={:?}", key);
                enigo.key_up(key);
                key_state.insert(key, false);
                println!("Key {:?} released and tracked", key);
            } else {
                println!("Key {:?} already released, skipping", key);
            }
            Ok(())
        },
        ActionType::KeyCombination => {
            let keys_vec = params.keys.ok_or("Missing keys parameter for KeyCombination")?;
            let mut enigo_keys = Vec::new();
            for key_str in keys_vec {
                let enigo_key = string_to_key(&key_str)
                    .ok_or_else(|| format!("Invalid key in combination: {}", key_str))?;
                enigo_keys.push(enigo_key);
            }
            println!("Executing KeyCombination: keys={:?}", enigo_keys);
            for key in &enigo_keys {
                enigo.key_down(*key);
            }
            for key in enigo_keys.iter().rev() {
                enigo.key_up(*key);
            }
            println!("KeyCombination completed successfully");
            Ok(())
        },
        ActionType::MouseRelease => {
            let button_str = params.button.ok_or("Missing button parameter")?;
            let button = string_to_mouse_button(&button_str)
                .ok_or_else(|| format!("Invalid mouse button: {}", button_str))?;
            
            let mut mouse_state = APP_STATE.mouse_state.lock().unwrap();
            if *mouse_state.get(&button).unwrap_or(&false) {
                enigo.mouse_up(button);
                mouse_state.insert(button, false);
                println!("Mouse {:?} released and tracked", button);
            } else {
                println!("Mouse {:?} already released, skipping", button);
            }
            Ok(())
        },
        ActionType::MouseDrag => {
            let button_str = params.button.ok_or("Missing button parameter for MouseDrag")?;
            let button = string_to_mouse_button(&button_str)
                .ok_or_else(|| format!("Invalid mouse button for MouseDrag: {}", button_str))?;
            let dx = params.x.ok_or("Missing dx (x) parameter for MouseDrag")?;
            let dy = params.y.ok_or("Missing dy (y) parameter for MouseDrag")?;
            let duration_ms = params.duration.unwrap_or(0);

            enigo.mouse_down(button);
            
            // For MouseDrag, we still want the duration for smooth dragging
            if duration_ms > 0 {
                let steps = 20.max((duration_ms / 10) as i32); // At least 20 steps, or one step every 10ms
                let step_dx = dx as f32 / steps as f32;
                let step_dy = dy as f32 / steps as f32;
                let sleep_duration = std::time::Duration::from_millis((duration_ms as u64) / (steps as u64));
                
                for i in 0..steps {
                    enigo.mouse_move_relative(step_dx.round() as i32, step_dy.round() as i32);
                    if i < steps - 1 { 
                         if sleep_duration > std::time::Duration::from_millis(1) {
                            std::thread::sleep(sleep_duration);
                         }
                    }
                }
            } else {
                // Instantaneous move if duration is 0
                enigo.mouse_move_relative(dx, dy);
            }
            
            enigo.mouse_up(button);
            Ok(())
        },
        ActionType::Delay => {
            // This shouldn't be reached if called from the new async loops
            println!("**************************************************************************");
            println!("ERROR: execute_action was called with ActionType::Delay - this is wrong!");
            println!("Delay should be handled by the async loop, not by execute_action.");
            println!("Params: {:?}", params);
            println!("**************************************************************************");
            Err("Delay action type should be handled by the calling async loop".to_string())
        },
    }
}

// Helper function to execute actions safely on macOS (on main thread)
#[cfg(target_os = "macos")]
async fn execute_action_safe<R: Runtime>(action_type: ActionType, params: ActionParams, app_handle: Option<tauri::AppHandle<R>>) -> Result<(), String> {
    if let Some(app) = app_handle {
        println!("Executing action on macOS: {:?}", action_type);
        let action_type_clone = action_type.clone();
        let params_clone = params.clone();
        
        // Use a channel to get the result back from the main thread
        let (tx, rx) = tokio::sync::oneshot::channel();
        
        println!("Running action on main thread...");
        app.run_on_main_thread(move || {
            println!("Inside main thread, executing action...");
            let result = execute_action_impl(action_type_clone, params_clone);
            println!("Action execution result: {:?}", result);
            let _ = tx.send(result);
        }).map_err(|e| format!("Failed to run on main thread: {}", e))?;
        
        println!("Waiting for action result...");
        let result = rx.await.map_err(|e| format!("Failed to receive result: {}", e))?;
        println!("Action completed with result: {:?}", result);
        result
    } else {
        println!("Error: No app handle available for macOS UI automation");
        Err("App handle is required for UI automation on macOS".to_string())
    }
}

// For non-macOS platforms, just call the implementation directly
#[cfg(not(target_os = "macos"))]
async fn execute_action_safe<R: Runtime>(action_type: ActionType, params: ActionParams, _app_handle: Option<tauri::AppHandle<R>>) -> Result<(), String> {
    execute_action_impl(action_type, params)
}

// Command to register a MIDI macro
#[tauri::command]
fn register_macro(config: MacroConfig) -> Result<(), String> {
    // Just log for now - in a real app, you'd store this in a database or config file
    println!("Attempting to register macro: {:?}", config);
    
    // Check if macro is already registered and if it has an active task running
    {
        let mut active_macros = APP_STATE.active_macros.lock().unwrap();
        if let Some(active_macro) = active_macros.remove(&config.id) {
            // Abort any pending after_actions task
            active_macro.abort_handle.abort();
            println!("Aborted pending after_actions for macro {}.", config.id);
        }
    }
    
    let mut macros = APP_STATE.registered_macros.lock().unwrap();
    // Optional: Prevent duplicate registration by ID or name if desired
    if macros.iter().any(|m| m.id == config.id) {
        println!("Macro with ID {} already registered. Updating.", config.id);
        macros.retain(|m| m.id != config.id);
    }
    macros.push(config.clone()); // Store the macro
    println!("Successfully registered macro. Total macros: {}", macros.len());
    Ok(())
}

// Command to get all registered macros
#[tauri::command]
fn get_macros() -> Result<Vec<MacroConfig>, String> {
    let macros = APP_STATE.registered_macros.lock().unwrap();
    Ok(macros.clone()) // Return a clone of the stored macros
}

// New command to cancel a macro (used when deactivating from frontend)
#[tauri::command]
fn cancel_macro(id: String) -> Result<(), String> {
    println!("Attempting to cancel macro: {}", id);
    
    // First, remove from registered macros
    {
        let mut macros = APP_STATE.registered_macros.lock().unwrap();
        macros.retain(|m| m.id != id);
    }
    
    // Then, abort any active after_actions task and clean up before_action_state
    {
        let mut active_macros = APP_STATE.active_macros.lock().unwrap();
        if let Some(active_macro) = active_macros.remove(&id) {
            active_macro.abort_handle.abort();
            println!("Aborted pending after_actions for macro {}.", id);
        }
        
        // Also remove any before_action_state
        let mut before_action_states = APP_STATE.before_action_states.lock().unwrap();
        if before_action_states.remove(&id).is_some() {
            println!("Removed before_action_state for macro {}.", id);
        }
    }
    cleanup_mouse_state_for_macro(&id);

    println!("Macro {} successfully canceled", id);
    Ok(())
}

// Command to list MIDI inputs
#[tauri::command]
fn list_midi_inputs_rust() -> Result<Vec<String>, String> {
    let midi_in = MidiInput::new("opengrader-midi-input").map_err(|e| {
        #[cfg(target_os = "macos")]
        return format!("Failed to initialize MIDI on macOS: {}. Please ensure your app has the necessary permissions in System Preferences > Security & Privacy > Privacy > Microphone and Bluetooth.", e);
        
        #[cfg(not(target_os = "macos"))]
        return e.to_string();
    })?;
    
    let ports = midi_in.ports();
    let mut port_names = Vec::new();
    
    // Store ports in app state for later reference
    let mut app_ports = APP_STATE.midi_ports.lock().unwrap();
    app_ports.clear();
    
    for (i, port) in ports.iter().enumerate() {
        let port_name = midi_in.port_name(port).unwrap_or_else(|_| format!("Unknown port {}", i));
        port_names.push(port_name.clone());
        app_ports.push((port_name, i));
    }
    
    Ok(port_names)
}

// Start listening to a MIDI input by index
// Add these type aliases at the top of your file (after imports)
type MacroId = String;
type GroupId = String;
type TimestampMs = u64;

// Add these new structures for better organization
#[derive(Debug, Clone)]
struct MidiData {
    status: u8,
    message_type: MidiMessageType,
    channel: u8,
    data1: u8,
    data2: u8,
}

#[derive(Debug, Clone, PartialEq)]
enum MidiMessageType {
    NoteOff,
    NoteOn,
    Aftertouch,
    ControlChange,
    ProgramChange,
    ChannelPressure,
    PitchBend,
    Other,
}

// Add this macro for conditional logging
#[cfg(feature = "midi-debug")]
macro_rules! midi_log {
    ($($arg:tt)*) => { println!($($arg)*); }
}

#[cfg(not(feature = "midi-debug"))]
macro_rules! midi_log {
    ($($arg:tt)*) => {};
}

// Helper function to create platform-specific MIDI errors
fn create_midi_error(base_error: &str, err: impl std::fmt::Display) -> String {
    #[cfg(target_os = "macos")]
    {
        format!("{} on macOS: {}. Please ensure:\n\
                1. Your app has permission in System Preferences > Security & Privacy > Privacy > Microphone\n\
                2. Your app has permission in System Preferences > Security & Privacy > Privacy > Bluetooth (if using Bluetooth MIDI)\n\
                3. The MIDI device is properly connected", base_error, err)
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        format!("{}: {}", base_error, err)
    }
}

// Helper functions for the refactored MIDI listening
fn cleanup_existing_connection() -> Result<(), String> {
    let mut connection_guard = APP_STATE.midi_connection.lock().unwrap();
    if connection_guard.is_some() {
        *connection_guard = None;
    }
    Ok(())
}

fn validate_and_get_port_name(port_index: usize) -> Result<String, String> {
    let ports_guard = APP_STATE.midi_ports.lock().unwrap();
    if port_index >= ports_guard.len() {
        return Err(format!("Port index {} out of range. Only {} ports available.", 
                          port_index, ports_guard.len()));
    }
    Ok(ports_guard[port_index].0.clone())
}

fn create_midi_input() -> Result<MidiInput, String> {
    MidiInput::new("opengrader-midi-listener")
        .map_err(|e| create_midi_error("Failed to create MIDI listener", e))
}

fn parse_midi_message(message: &[u8]) -> Option<MidiData> {
    if message.len() < 3 {
        return None;
    }
    
    let status = message[0];
    let message_type_u8 = status & 0xF0;
    let channel = (status & 0x0F) + 1;
    
    let message_type = match message_type_u8 {
        0x80 => MidiMessageType::NoteOff,
        0x90 => MidiMessageType::NoteOn,
        0xA0 => MidiMessageType::Aftertouch,
        0xB0 => MidiMessageType::ControlChange,
        0xC0 => MidiMessageType::ProgramChange,
        0xD0 => MidiMessageType::ChannelPressure,
        0xE0 => MidiMessageType::PitchBend,
        _ => MidiMessageType::Other,
    };
    
    Some(MidiData {
        status,
        message_type,
        channel: channel as u8,
        data1: message[1],
        data2: message[2],
    })
}

fn should_trigger_macro(macro_config: &MacroConfig, midi_data: &MidiData) -> bool {
    if macro_config.midi_channel != midi_data.channel {
        return false;
    }
    
    match midi_data.message_type {
        MidiMessageType::ControlChange => {
            macro_config.midi_note == midi_data.data1 && 
            macro_config.midi_value.map_or(false, |v| v == midi_data.data2)
        },
        // Add other message types as needed
        _ => false,
    }
}

fn calculate_trigger_delay(group_key: &str) -> Option<std::time::Duration> {
    let settings = APP_STATE.global_settings.lock().unwrap();
    let delay_ms = settings.macro_trigger_delay;
    
    if delay_ms == 0 {
        return None;
    }
    
    let mut last_group_triggers = APP_STATE.last_group_triggers.lock().unwrap();
    let now = std::time::Instant::now();
    
    // Find the most recent trigger from a different group
    let most_recent_different = last_group_triggers.iter()
        .filter(|(k, _)| *k != group_key)
        .max_by_key(|(_, time)| **time)
        .map(|(_, time)| *time);
    
    let delay = if let Some(last_time) = most_recent_different {
        let elapsed = now.duration_since(last_time);
        let required_delay = std::time::Duration::from_millis(delay_ms);
        
        if elapsed < required_delay {
            Some(required_delay - elapsed)
        } else {
            None
        }
    } else {
        None
    };
    
    // Update trigger time for this group
    last_group_triggers.insert(group_key.to_string(), now);
    
    delay
}

async fn handle_macro_trigger<R: Runtime>(
    macro_config: MacroConfig,
    app_handle: AppHandle<R>,
) {
    let group_key = macro_config.groupId.as_ref()
        .unwrap_or(&macro_config.id)
        .clone();
    
    // Calculate and apply delay if needed
    if let Some(delay) = calculate_trigger_delay(&group_key) {
        midi_log!("Delaying macro trigger by {:?}", delay);
        tokio::time::sleep(delay).await;
    }
    
    midi_log!("Macro triggered: {} (timeout: {:?}ms)", 
        macro_config.name, macro_config.timeout);
    
    // Execute any pending after actions from other macros
    execute_pending_after_actions(&group_key, &app_handle).await;
    
    // Handle the current macro's state
    cancel_existing_macro_task(&group_key);
    
    // Execute before actions if needed
    if should_execute_before_actions(&group_key) {
        execute_before_actions(&macro_config, &app_handle).await;
    }
    
    // Execute main actions
    execute_main_actions(&macro_config, &app_handle).await;
    
    // Schedule after actions if timeout is specified
    if let Some(timeout) = macro_config.timeout {
        schedule_after_actions(macro_config, app_handle, timeout).await;
    }
}

async fn execute_pending_after_actions<R: Runtime>(
    current_group_key: &str,
    app_handle: &AppHandle<R>,
) {
    let macros_to_execute = {
        let mut active_macros = APP_STATE.active_macros.lock().unwrap();
        let registered_macros = APP_STATE.registered_macros.lock().unwrap();
        
        let mut result = Vec::new();
        let mut keys_to_remove = Vec::new();
        
        for (key, _) in active_macros.iter() {
            if key == current_group_key {
                keys_to_remove.push(key.clone());
                continue;
            }
            
            if let Some(macro_config) = registered_macros.iter().find(|m| 
                m.id == *key || m.groupId.as_ref().map_or(false, |g| g == key)
            ) {
                if macro_config.after_actions.as_ref().map_or(false, |a| !a.is_empty()) {
                    result.push((key.clone(), macro_config.clone()));
                    keys_to_remove.push(key.clone());
                }
            }
        }
        
        // Abort and remove found tasks
        for key in &keys_to_remove {
            if let Some(active_macro) = active_macros.remove(key) {
                active_macro.abort_handle.abort();
            }
        }
        
        result
    };
    
    // Execute after actions
    for (key, macro_config) in macros_to_execute {
        if let Some(after_actions) = &macro_config.after_actions {
            midi_log!("Executing pending after_actions for: {}", key);
            
            for (i, action) in after_actions.iter().enumerate() {
                if let ActionType::Delay = action.action_type {
                    if let Some(duration_ms) = action.action_params.duration {
                        tokio::time::sleep(tokio::time::Duration::from_millis(duration_ms as u64)).await;
                    }
                } else {
                    if let Err(e) = execute_action_safe(
                        action.action_type.clone(),
                        action.action_params.clone(),
                        Some(app_handle.clone())
                    ).await {
                        eprintln!("Error executing after action {}: {}", i, e);
                    }
                }
            }
            
            // Clean up before_action_state
            APP_STATE.before_action_states.lock().unwrap().remove(&key);
        }
    }
}

fn cancel_existing_macro_task(group_key: &str) {
    let mut active_macros = APP_STATE.active_macros.lock().unwrap();
    if let Some(active_macro) = active_macros.remove(group_key) {
        active_macro.abort_handle.abort();
        midi_log!("Cancelled existing task for macro group: {}", group_key);
    }
}

fn should_execute_before_actions(state_key: &str) -> bool {
    let before_action_states = APP_STATE.before_action_states.lock().unwrap();
    !before_action_states.contains_key(state_key)
}

async fn execute_before_actions<R: Runtime>(
    macro_config: &MacroConfig,
    app_handle: &AppHandle<R>,
) {
    if let Some(before_actions) = &macro_config.before_actions {
        if before_actions.is_empty() {
            return;
        }
        
        midi_log!("Executing before actions for macro: {}", macro_config.name);
        
        for (i, action) in before_actions.iter().enumerate() {
            if let ActionType::Delay = action.action_type {
                if let Some(duration_ms) = action.action_params.duration {
                    tokio::time::sleep(tokio::time::Duration::from_millis(duration_ms as u64)).await;
                }
            } else {
                if let Err(e) = execute_action_safe(
                    action.action_type.clone(),
                    action.action_params.clone(),
                    Some(app_handle.clone())
                ).await {
                    eprintln!("Error executing before action {}: {}", i, e);
                }
            }
        }
        
        // Mark as executed
        let state_key = macro_config.groupId.as_ref()
            .unwrap_or(&macro_config.id)
            .clone();
        
        APP_STATE.before_action_states.lock().unwrap().insert(
            state_key,
            BeforeActionState {
                last_executed: std::time::Instant::now(),
                cooldown: std::time::Duration::from_secs(0),
            }
        );
    }
}

async fn execute_main_actions<R: Runtime>(
    macro_config: &MacroConfig,
    app_handle: &AppHandle<R>,
) {
    for (i, action) in macro_config.actions.iter().enumerate() {
        midi_log!("Executing main action {} of type {:?}", i, action.action_type);
        
        if let ActionType::Delay = action.action_type {
            if let Some(duration_ms) = action.action_params.duration {
                tokio::time::sleep(tokio::time::Duration::from_millis(duration_ms as u64)).await;
            }
        } else {
            if let Err(e) = execute_action_safe(
                action.action_type.clone(),
                action.action_params.clone(),
                Some(app_handle.clone())
            ).await {
                eprintln!("Error executing main action {}: {}", i, e);
            }
        }
    }
}

async fn schedule_after_actions<R: Runtime>(
    macro_config: MacroConfig,
    app_handle: AppHandle<R>,
    timeout_ms: u32,
) {
    let task_key = macro_config.groupId.as_ref()
        .unwrap_or(&macro_config.id)
        .clone();
    
    let has_after_actions = macro_config.after_actions
        .as_ref()
        .map_or(false, |a| !a.is_empty());
    
    let abort_handle = tauri::async_runtime::spawn(async move {
        tokio::time::sleep(tokio::time::Duration::from_millis(timeout_ms as u64)).await;
        
        if has_after_actions {
            if let Some(after_actions) = &macro_config.after_actions {
                for (i, action) in after_actions.iter().enumerate() {
                    if let ActionType::Delay = action.action_type {
                        if let Some(duration_ms) = action.action_params.duration {
                            tokio::time::sleep(tokio::time::Duration::from_millis(duration_ms as u64)).await;
                        }
                    } else {
                        if let Err(e) = execute_action_safe(
                            action.action_type.clone(),
                            action.action_params.clone(),
                            Some(app_handle.clone())
                        ).await {
                            eprintln!("Error executing after action {}: {}", i, e);
                        }
                    }
                }
            }
        }
        
        // Clean up
        APP_STATE.active_macros.lock().unwrap().remove(&task_key);
        APP_STATE.before_action_states.lock().unwrap().remove(&task_key);
    }).abort_handle();
    
    // Store the task
    APP_STATE.active_macros.lock().unwrap().insert(
        task_key,
        ActiveMacro {
            abort_handle,
            last_triggered: std::time::Instant::now(),
        }
    );
}

fn emit_midi_event<R: Runtime>(
    midi_data: &MidiData,
    timestamp: TimestampMs,
    app_handle: &AppHandle<R>,
) {
    let type_name = match midi_data.message_type {
        MidiMessageType::NoteOff => "noteoff",
        MidiMessageType::NoteOn => "noteon",
        MidiMessageType::Aftertouch => "aftertouch",
        MidiMessageType::ControlChange => "controlchange",
        MidiMessageType::ProgramChange => "programchange",
        MidiMessageType::ChannelPressure => "channelpressure",
        MidiMessageType::PitchBend => "pitchbend",
        MidiMessageType::Other => "other",
    };
    
    let is_note = matches!(midi_data.message_type, MidiMessageType::NoteOn | MidiMessageType::NoteOff);
    let is_cc = matches!(midi_data.message_type, MidiMessageType::ControlChange);
    
    let payload = RustMidiEvent {
        status: midi_data.status,
        data1: midi_data.data1,
        data2: midi_data.data2,
        timestamp,
        type_name: type_name.to_string(),
        channel: midi_data.channel,
        note: if is_note { Some(midi_data.data1) } else { None },
        velocity: if is_note { Some(midi_data.data2) } else { None },
        controller: if is_cc { Some(midi_data.data1) } else { None },
        value: if is_cc { Some(midi_data.data2) } else { None },
    };
    
    if let Err(e) = app_handle.emit("rust-midi-event", payload) {
        eprintln!("Failed to emit MIDI event: {}", e);
    }
}

// Replace your existing start_midi_listening_rust function with this:
#[tauri::command]
async fn start_midi_listening_rust<R: Runtime>(
    app_handle: AppHandle<R>, 
    port_index: usize
) -> Result<(), String> {
    cleanup_existing_connection()?;
    let port_name = validate_and_get_port_name(port_index)?;
    let midi_in = create_midi_input()?;
    
    let ports = midi_in.ports();
    if port_index >= ports.len() {
        return Err(format!("Port index {} out of range. Only {} ports available.", 
                          port_index, ports.len()));
    }
    
    let port = &ports[port_index];
    let app_handle_clone = app_handle.clone();
    
    let connection = midi_in.connect(port, "midi-connection", move |timestamp, message, _| {
        // Early exit for invalid messages
        let midi_data = match parse_midi_message(message) {
            Some(data) => data,
            None => return,
        };
        
        // Early exit if no macros registered
        if APP_STATE.registered_macros.lock().unwrap().is_empty() {
            return;
        }
        
        let app_handle_for_macros = app_handle_clone.clone();
        
        // Get macros and settings in a single lock acquisition
        let (macros_to_check, _settings) = {
            let registered_macros = APP_STATE.registered_macros.lock().unwrap();
            let settings = APP_STATE.global_settings.lock().unwrap();
            (registered_macros.clone(), settings.clone())
        };
        
        // Check for macro triggers
        for macro_config in &macros_to_check {
            if should_trigger_macro(macro_config, &midi_data) {
                midi_log!("MIDI trigger matched for macro: {}", macro_config.name);
                
                let macro_clone = macro_config.clone();
                let app_handle = app_handle_for_macros.clone();
                
                // Spawn async task to handle the trigger
                let _ = tauri::async_runtime::spawn(async move {
                    handle_macro_trigger(macro_clone, app_handle).await;
                });
            }
        }
        
        // Always emit the raw MIDI event
        emit_midi_event(&midi_data, timestamp, &app_handle_for_macros);
        
    }, ())
    .map_err(|e| create_midi_error("Failed to connect to MIDI device", e))?;
    
    // Store connection and notify frontend
    APP_STATE.midi_connection.lock().unwrap().replace(connection);
    
    if let Err(e) = app_handle.emit("midi-status", format!("Connected to MIDI device: {}", port_name)) {
        eprintln!("Failed to emit MIDI status: {}", e);
    }
    
    Ok(())
}

#[tauri::command]
fn stop_midi_listening_rust<R: Runtime>(app_handle: AppHandle<R>) -> Result<(), String> {
    let mut connection_guard = APP_STATE.midi_connection.lock().unwrap();
    if connection_guard.is_some() {
        *connection_guard = None;
        if let Err(e) = app_handle.emit("midi-status", "MIDI connection closed") {
            eprintln!("Failed to emit MIDI status: {}", e);
        }
    }
    Ok(())
}

// MIDI Event coming from Rust
#[derive(Debug, Clone, Serialize)]
pub struct RustMidiEvent {
    pub status: u8,
    pub data1: u8,
    pub data2: u8,
    pub timestamp: u64,
    pub type_name: String, // "noteon", "noteoff", "controlchange", etc.
    pub channel: u8,       // 1-16
    pub note: Option<u8>,  // For noteon/noteoff
    pub velocity: Option<u8>, // For noteon/noteoff
    pub controller: Option<u8>, // For controlchange
    pub value: Option<u8>,     // For controlchange
}

// Command to get cursor position
#[tauri::command]
fn get_cursor_position() -> Result<(i32, i32), String> {
    let enigo = create_enigo();
    
    // Get the mouse position and explicitly create a tuple in (x, y) order
    // This ensures the coordinates are in the expected order
    let position = enigo.mouse_location();
    
    // Log coordinates for debugging
    println!("Cursor position: x={}, y={}", position.0, position.1);
    
    // Return explicitly as (x, y)
    Ok((position.0, position.1))
}

// Command to get global settings
#[tauri::command]
fn get_global_settings() -> Result<GlobalSettings, String> {
    let settings = APP_STATE.global_settings.lock().unwrap();
    Ok(settings.clone())
}

// Command to update global settings
#[tauri::command]
fn update_global_settings(new_settings: GlobalSettings) -> Result<(), String> {
    let mut settings = APP_STATE.global_settings.lock().unwrap();
    *settings = new_settings;
    println!("Global settings updated: {:?}", *settings);
    Ok(())
}
fn cleanup_mouse_state_for_macro(macro_id: &str) {
    // You could track which macro pressed which buttons
    // For now, just ensure all buttons are released
    let mut enigo = create_enigo();
    let mut mouse_state = APP_STATE.mouse_state.lock().unwrap();
    let mut key_state = APP_STATE.key_state.lock().unwrap();
    
    for (button, is_pressed) in mouse_state.iter_mut() {
        if *is_pressed {
            enigo.mouse_up(*button);
            *is_pressed = false;
            println!("Cleanup: released mouse {:?} for macro {}", button, macro_id);
        }
    }
    
    for (key, is_pressed) in key_state.iter_mut() {
        if *is_pressed {
            enigo.key_up(*key);
            *is_pressed = false;
            println!("Cleanup: released key {:?} for macro {}", key, macro_id);
        }
    }
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
            // Setup logging
            #[cfg(debug_assertions)]
            {
                let handle = app.handle();
                handle.plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
            
      Ok(())
    })
        .invoke_handler(tauri::generate_handler![
            register_macro,
            get_macros,
            execute_action,
            // Add the new MIDI commands
            list_midi_inputs_rust,
            start_midi_listening_rust,
            stop_midi_listening_rust,
            cancel_macro,
            get_cursor_position,
            // Global settings commands
            get_global_settings,
            update_global_settings
        ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
