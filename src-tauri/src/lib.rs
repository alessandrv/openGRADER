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

// Shared state for the application - removed Enigo from here
pub struct AppState {
    // Removed enigo from here since it's not thread-safe
    midi_connection: Mutex<Option<MidiInputConnection<()>>>,
    midi_ports: Mutex<Vec<(String, usize)>>, // Store (port_name, index) pairs
    registered_macros: Mutex<Vec<MacroConfig>>, // Added to store macros
    // Track active macros by their ID
    active_macros: Mutex<HashMap<String, ActiveMacro>>,
    // Track before_action execution state across triggers
    before_action_states: Mutex<HashMap<String, BeforeActionState>>,
}

static APP_STATE: Lazy<Arc<AppState>> = Lazy::new(|| {
    Arc::new(AppState {
        // Removed enigo initialization
        midi_connection: Mutex::new(None),
        midi_ports: Mutex::new(Vec::new()),
        registered_macros: Mutex::new(Vec::new()),
        active_macros: Mutex::new(HashMap::new()),
        before_action_states: Mutex::new(HashMap::new()),
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
            let button_str = params.button.ok_or("Missing button parameter for MouseClick")?;
            let button = string_to_mouse_button(&button_str)
                .ok_or_else(|| format!("Invalid mouse button: {}", button_str))?;
            println!("Executing MouseClick: button={:?}, hold={:?}", button, params.hold);
            if params.hold == Some(true) {
                enigo.mouse_down(button);
            } else {
                enigo.mouse_click(button);
            }
            println!("MouseClick completed successfully");
            Ok(())
        },
        ActionType::KeyPress => {
            let key_str = params.key.ok_or("Missing key parameter for KeyPress")?;
            let key = string_to_key(&key_str)
                .ok_or_else(|| format!("Invalid key: {}", key_str))?;
            println!("Executing KeyPress: key={:?}", key);
            enigo.key_click(key);
            println!("KeyPress completed successfully");
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
            let button_str = params.button.ok_or("Missing button parameter for MouseRelease")?;
            let button = string_to_mouse_button(&button_str)
                .ok_or_else(|| format!("Invalid mouse button: {}", button_str))?;
            enigo.mouse_up(button);
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
    
    println!("Macro {} successfully canceled", id);
    Ok(())
}

// Command to list MIDI inputs
#[tauri::command]
fn list_midi_inputs_rust() -> Result<Vec<String>, String> {
    let midi_in = MidiInput::new("opengrader-midi-input").map_err(|e| e.to_string())?;
    
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
#[tauri::command]
async fn start_midi_listening_rust<R: Runtime>(app_handle: AppHandle<R>, port_index: usize) -> Result<(), String> {
    // Make sure we clean up any existing connection
    let mut connection_guard = APP_STATE.midi_connection.lock().unwrap();
    if connection_guard.is_some() {
        *connection_guard = None;
    }
    drop(connection_guard); // Release lock
    
    // Get the port info from app state
    let ports_guard = APP_STATE.midi_ports.lock().unwrap();
    if port_index >= ports_guard.len() {
        return Err(format!("Port index {} out of range. Only {} ports available.", port_index, ports_guard.len()));
    }
    let port_name = ports_guard[port_index].0.clone();
    drop(ports_guard); // Release lock
    
    let midi_in = MidiInput::new("opengrader-midi-listener").map_err(|e| e.to_string())?;
    let ports = midi_in.ports();
    if port_index >= ports.len() {
        return Err(format!("Port index {} out of range. Only {} ports available.", port_index, ports.len()));
    }
    
    let port = &ports[port_index];
    
    // Set up callback and connection
    let app_handle_clone = app_handle.clone();
    let connection = midi_in.connect(port, "midi-connection", move |timestamp, message, _| {
        // Process MIDI message
        if message.len() >= 3 { // Basic check for message length
            let status = message[0];
            let data1 = message[1]; // Often Note or CC number
            let data2 = message[2]; // Often Velocity or CC value
            
            let message_type_u8 = status & 0xF0;
            let channel = (status & 0x0F) + 1; // MIDI channels 1-16

            // Clone app_handle for use in the macro execution logic
            let app_handle_for_macros = app_handle_clone.clone();

            // Extract all registered macros first and release the lock
            // This prevents borrowing issues in the async blocks
            let macros_to_check: Vec<MacroConfig> = {
                let registered_macros_guard = APP_STATE.registered_macros.lock().unwrap();
                registered_macros_guard.clone() // Clone all macros to avoid borrowing issues
            };
            
            // Now iterate over our cloned macros without holding the lock
            for macro_config in macros_to_check.iter() {
                // Match NoteOn/NoteOff (0x90 / 0x80) or ControlChange (0xB0)
                let _is_note_message = message_type_u8 == 0x90 || message_type_u8 == 0x80;
                let is_cc_message = message_type_u8 == 0xB0;

                let mut trigger_match = false;

                if macro_config.midi_channel == channel {
                    // For MacroConfig, midi_note field is used for both note number and CC number
                    if is_cc_message && macro_config.midi_note == data1 { // CC Number matches
                        // Now check for CC Value if specified in macro_config
                        if let Some(expected_value) = macro_config.midi_value {
                            if data2 == expected_value { // CC Value matches
                                trigger_match = true;
                                println!(
                                    "MIDI CC matched (w/ value): Macro '{}'. Ch: {}, CC_Num: {}, Expected_Val: {}, Received_Val: {}",
                                    macro_config.name,
                                    channel,
                                    data1,
                                    expected_value,
                                    data2
                                );
                            }
                        } else {
                            // If midi_value is None, then match any value for this CC number
                            // For your current use case, we might want to make midi_value non-optional for CC
                            // or decide if None means "any value". For now, let's assume None means it doesn't match if we expect value-specific triggers.
                            // OR, to match any value if midi_value is not set:
                            // trigger_match = true;
                            // println!(
                            //     "MIDI CC matched (any value): Macro '{}'. Ch: {}, CC_Num: {}, Received_Val: {}",
                            //     macro_config.name,
                            //     channel,
                            //     data1,
                            //     data2
                            // );
                        }
                    }
                    // TODO: Add NoteOn/NoteOff matching if your MacroConfig supports it explicitly
                    // else if is_note_message && macro_config.midi_note == data1 { // Note Match
                    //     trigger_match = true;
                    //     println!("MIDI Note matched for macro: {}. Channel: {}, Note: {}, Velocity: {}", macro_config.name, channel, data1, data2);
                    // }
                }

                if trigger_match {
                    // We need to clone everything from macro_config to avoid borrowing issues in the async context
                    let main_actions_clone = macro_config.actions.clone(); // Clone the vec of actions
                    let macro_name_clone = macro_config.name.clone();
                    let macro_id_clone = macro_config.id.clone();
                    
                    // Clone groupId too to prevent borrowing issues
                    let group_id_clone = macro_config.groupId.clone();
                    
                    // Clone before/after actions and timeout
                    let before_actions = macro_config.before_actions.clone();
                    let after_actions = macro_config.after_actions.clone();
                    let timeout = macro_config.timeout;
                    
                    // Execute the action in a separate thread/task to avoid blocking MIDI callback
                    // And use the app_handle to call the command
                    let app_handle_clone = app_handle_for_macros.clone();
                    let _ = tauri::async_runtime::spawn(async move {
                        println!("Macro triggered: {} (timeout value: {:?}ms)", 
                            macro_name_clone, 
                            timeout);
                        
                                                                        // Determine which key to use for active macro lookup
                        let active_macro_key = if let Some(ref group_id) = group_id_clone {
                            // Use group ID if available
                            group_id.clone()
                        } else {
                            // Fall back to individual macro ID
                            macro_id_clone.clone()
                        };
                        
                        // First, check if there are any active macros with pending after_actions
                        let active_macros_to_execute: Vec<(String, MacroConfig)> = {
                            // Get a clone of the active_macros
                            let mut active_macros = APP_STATE.active_macros.lock().unwrap();
                            let registered_macros = APP_STATE.registered_macros.lock().unwrap();
                            
                            // Find all active macros that are not part of this group/macro
                            let mut macros_to_execute = Vec::new();
                            let mut keys_to_remove = Vec::new();
                            
                            for (key, _active_macro) in active_macros.iter() {
                                // Skip if this is the same macro/group we're currently triggering
                                if key == &active_macro_key {
                                    println!("Found current macro/group in active_macros, will be replaced: {}", key);
                                    keys_to_remove.push(key.clone());
                                    continue;
                                }
                                
                                // Find the corresponding MacroConfig for this active macro
                                if let Some(macro_config) = registered_macros.iter().find(|m| 
                                    m.id == *key || m.groupId.as_ref().map_or(false, |g| g == key)
                                ) {
                                    // Only add if it has after actions
                                    if let Some(ref after_actions) = macro_config.after_actions {
                                        if !after_actions.is_empty() {
                                            println!("Found another active macro that needs after_actions executed: {}", key);
                                            macros_to_execute.push((key.clone(), macro_config.clone()));
                                            keys_to_remove.push(key.clone());
                                        }
                                    }
                                }
                            }
                            
                            // Abort and remove all tasks we found
                            for key in keys_to_remove {
                                if let Some(active_macro) = active_macros.get(&key) {
                                    println!("Aborting task for {}", key);
                                    active_macro.abort_handle.abort();
                                    active_macros.remove(&key);
                                }
                            }
                            
                            macros_to_execute
                        };
                        
                        // Execute the after_actions for all found macros immediately
                        for (key, macro_config) in active_macros_to_execute {
                            if let Some(ref after_actions) = macro_config.after_actions {
                                println!("Immediately executing after_actions for: {}", key);
                                
                                for (i, action) in after_actions.iter().enumerate() {
                                    println!("Executing forced after action {} of type {:?}", i, action.action_type);
                                    match execute_action_safe(action.action_type.clone(), action.action_params.clone(), Some(app_handle_clone.clone())).await {
                                        Ok(_) => {
                                            println!("Forced after action {} executed successfully", i);
                                        },
                                        Err(e) => eprintln!("Error executing forced after action {}: {}", i, e),
                                    }
                                }
                                
                                // Clean up any before_action_state
                                let mut before_action_states = APP_STATE.before_action_states.lock().unwrap();
                                if before_action_states.remove(&key).is_some() {
                                    println!("Removed before_action_state for macro group {}", key);
                                }
                            }
                        }
                        
                        // Now handle the current macro's active state
                        {
                            let mut active_macros = APP_STATE.active_macros.lock().unwrap();
                            
                            // Check for existing active macros in this group (should be removed by now but let's be safe)
                            if let Some(active_macro) = active_macros.get(&active_macro_key) {
                                // This macro group is already active
                                println!("Repeat/group trigger for macro group: {} (resetting timeout: {:?}ms)", 
                                    active_macro_key, timeout);
                                
                                // Abort the scheduled after_actions task and log how long it had been running
                                let time_since_last_trigger = active_macro.last_triggered.elapsed();
                                println!("Aborting after_actions task after running for {:?} of {:?}ms timeout", 
                                    time_since_last_trigger, timeout);
                                active_macro.abort_handle.abort();
                                
                                // Remove the entry so we completely replace it
                                active_macros.remove(&active_macro_key);
                                
                                println!("Removed previous macro group entry to prevent multiple after_actions");
                            }
                        }
                        
                        // We need to ALSO protect any existing before_action_state for rapid repeat triggers within same group
                        // This prevents the second 'c' issue
                        {
                            let mut before_action_states = APP_STATE.before_action_states.lock().unwrap();
                            if let Some(_) = before_action_states.get(&active_macro_key) {
                                // We've previously executed a before action for this group
                                // For rapid repeat triggers, we need to ensure it doesn't happen again until timeout
                                println!("WARNING: Found lingering before_action_state for group {} - Protecting it", active_macro_key);
                                
                                // Don't remove it, but make sure we extend the cooldown timer
                                // This ensures the before action won't run again until after actions complete
                                before_action_states.insert(active_macro_key.clone(), BeforeActionState {
                                    last_executed: std::time::Instant::now(),
                                    cooldown: std::time::Duration::from_millis(BEFORE_ACTION_COOLDOWN_MS * 2), // Use longer timeout
                                });
                                
                                println!("Extended before_action protection for group {}", active_macro_key);
                            }
                        }
                        
                        {
                        }
                        
                        // Check if we should execute before actions
                        let mut should_execute_before = true;
                        
                        // Use a fixed timeout for before_actions - 5 seconds
                        const BEFORE_ACTION_COOLDOWN_MS: u64 = 5000;
                        
                        // Use groupId (if available) instead of macro ID for tracking before actions
                        // This ensures all macros in the same encoder group share the same before_action_state
                        let state_key = if let Some(ref group_id) = group_id_clone {
                            // Use group ID for tracking if it exists
                            println!("Using group ID {} for before action state tracking", group_id);
                            group_id.clone() // Clone the borrowed value
                        } else {
                            // Fall back to macro ID for standalone macros
                            macro_id_clone.clone()
                        };

                        // Check the before_action_states to see if we've recently executed these actions
                        {
                            let before_action_states = APP_STATE.before_action_states.lock().unwrap();
                            if let Some(state) = before_action_states.get(&state_key) {
                                let elapsed = state.last_executed.elapsed();
                                if elapsed < state.cooldown {
                                    // Still in cooldown period, don't execute
                                    should_execute_before = false;
                                    println!("Skipping before actions for macro group {} - cooldown period active ({:?} remaining)", 
                                             state_key, state.cooldown - elapsed);
                                }
                            }
                        }
                        
                        // Execute before actions if allowed and they exist
                        if should_execute_before && before_actions.is_some() && !before_actions.as_ref().unwrap().is_empty() {
                            println!("Executing before actions for macro: {}", macro_name_clone);
                            
                            for (i, action_def) in before_actions.as_ref().unwrap().iter().enumerate() {
                                println!("Executing before action {} of type {:?}", i, action_def.action_type);
                                if let ActionType::Delay = action_def.action_type {
                                    if let Some(duration_ms) = action_def.action_params.duration {
                                        println!("Starting delay of {}ms in before action chain", duration_ms);
                                        tokio::time::sleep(tokio::time::Duration::from_millis(duration_ms as u64)).await;
                                        println!("Delay of {}ms completed in before action chain", duration_ms);
                                    } else {
                                        eprintln!("Delay action missing duration at before_action {}", i);
                                    }
                                } else {
                                    match execute_action_safe(action_def.action_type.clone(), action_def.action_params.clone(), Some(app_handle_clone.clone())).await {
                                    Ok(_) => {
                                        println!("Before action {} executed successfully", i);
                                    },
                                    Err(e) => eprintln!("Error executing before action {}: {}", i, e),
                                }
                                }
                            }
                            
                            // Update the before_action_state cooldown logic
                            let mut before_action_states_guard = APP_STATE.before_action_states.lock().unwrap();
                            before_action_states_guard.insert(state_key.clone(), BeforeActionState {
                                    last_executed: std::time::Instant::now(),
                                    cooldown: std::time::Duration::from_millis(BEFORE_ACTION_COOLDOWN_MS),
                                });
                                println!("Updated before_action cooldown for macro group {}", state_key);
                        }

                        // Execute main action
                        // println!("Executing main action of type {:?} for macro: {}", action_type_clone, macro_name_clone);
                        
                        // Iterate through the cloned main actions
                        for (i, action_def) in main_actions_clone.iter().enumerate() {
                            println!("Executing main action {} of type {:?} for macro: {}", i, action_def.action_type, macro_name_clone);
                            if let ActionType::Delay = action_def.action_type { // CHECK FOR DELAY
                                println!("**************************************************************************");
                                println!("FOUND DELAY ACTION! This message should appear in the console if Delay is being properly detected.");
                                println!("Action def: {:?}", action_def);
                                println!("**************************************************************************");
                                if let Some(duration_ms) = action_def.action_params.duration {
                                    println!("Starting delay of {}ms in main action chain", duration_ms);
                                    tokio::time::sleep(tokio::time::Duration::from_millis(duration_ms as u64)).await;
                                    println!("Delay of {}ms completed in main action chain", duration_ms);
                                } else {
                                    eprintln!("Delay action missing duration in main_actions at index {} for macro {}", i, macro_name_clone);
                                }
                            } else { // For other actions, call execute_action
                                match execute_action_safe(action_def.action_type.clone(), action_def.action_params.clone(), Some(app_handle_clone.clone())).await {
                                    Ok(_) => println!("Main action {} executed successfully for macro: {}", i, macro_name_clone),
                                    Err(e) => eprintln!("Error executing main action {} for macro {}: {}", i, macro_name_clone, e),
                                }
                            }
                        }
                        
                                                        // If after actions exist and there's a timeout, schedule them
                                if let Some(after_actions) = after_actions {
                                    if !after_actions.is_empty() && timeout.is_some() {
                                        let timeout_ms = timeout.unwrap();
                                        let _app_handle_after = app_handle_clone.clone();
                                        // Clone these for use in both the async block and local scope
                                        let macro_name_after = macro_name_clone.clone();
                                        // Use group ID for after actions if available
                                        let macro_id_after = if let Some(ref group_id) = group_id_clone {
                                            group_id.clone()
                                        } else {
                                            macro_id_clone.clone()
                                        };
                                        // Make an additional clone for the closure
                                        let macro_name_for_task = macro_name_after.clone();
                                        let task_key = macro_id_after.clone();
                                        
                                        // Spawn a new task to handle the timeout - but store its handle to cancel if needed
                                        let abort_handle = tokio::spawn(async move {
                                                                                // Wait for the timeout
                                            println!("TIMEOUT START: Scheduled after actions with {}ms timeout for macro: {}", 
                                                timeout_ms, macro_name_for_task);
                                            let start_time = std::time::Instant::now();
                                    tokio::time::sleep(tokio::time::Duration::from_millis(timeout_ms as u64)).await;
                                    
                                                                                // Execute after actions
                                            let elapsed = start_time.elapsed();
                                            println!("TIMEOUT COMPLETE: Waited for {:?} of {}ms timeout, executing after actions for macro: {}", 
                                                elapsed, timeout_ms, macro_name_for_task);
                                    for (i, action) in after_actions.iter().enumerate() {
                                        println!("Executing after action {} of type {:?}", i, action.action_type);
                                        
                                        match execute_action_safe(action.action_type.clone(), action.action_params.clone(), Some(_app_handle_after.clone())).await {
                                            Ok(_) => {
                                                println!("After action {} executed successfully", i);
                                            },
                                            Err(e) => eprintln!("Error executing after action {}: {}", i, e),
                                        }
                                    }
                                    
                                                                    // Remove this macro from active_macros and before_action_states when complete
                                let mut active_macros = APP_STATE.active_macros.lock().unwrap();
                                
                                // Check if this specific task is still the one registered
                                if let Some(_existing_macro) = active_macros.get(&macro_id_after) {
                                    // Only remove if this is still the current abort handle
                                    // This prevents a newer task from being removed by an older one
                                    // that completed at the same time
                                    println!("Cleaning up after_actions for macro: {}", macro_name_for_task);
                                    active_macros.remove(&macro_id_after);
                                    
                                    // Also clean up the before_action_state so before actions can run again
                                    let mut before_action_states = APP_STATE.before_action_states.lock().unwrap();
                                    if before_action_states.remove(&macro_id_after).is_some() {
                                        println!("Removed before_action_state for macro group {}", macro_id_after);
                                    }
                                    
                                    println!("Removed macro {} from active macros after completion", macro_name_for_task);
                                } else {
                                    println!("Macro {} already removed from active_macros, possibly by a newer trigger", macro_name_for_task);
                                }
                                }).abort_handle();
                                
                                // Update active_macros with this new task
                                {
                                    let mut active_macros = APP_STATE.active_macros.lock().unwrap();
                                    
                                    // Double check that no other task was scheduled while we were setting up
                                    if let Some(_existing_active_macro) = active_macros.get(&task_key) {
                                        // Another task was already created (race condition), abort our new one
                                        println!("Race condition detected: another after_actions task already exists for macro group {}", task_key);
                                        abort_handle.abort();
                                    } else {
                                        // Insert our new task using the task_key (group ID or macro ID)
                                        let now = std::time::Instant::now();
                                        active_macros.insert(task_key.clone(), ActiveMacro {
                                            abort_handle,
                                            last_triggered: now,
                                        });
                                        
                                        // Log with current time for tracking
                                        println!("Scheduled new after_actions task at {:?} for macro group {} (timeout: {}ms)", 
                                            now, task_key, timeout_ms);
                                    }
                                }
                            }
                        }
                    });
                }
            }

            // Emit raw MIDI event to frontend (as before)
            let frontend_message_type = match message_type_u8 {
                0x80 => "noteoff",
                0x90 => "noteon",
                0xA0 => "aftertouch",
                0xB0 => "controlchange",
                0xC0 => "programchange",
                0xD0 => "channelpressure",
                0xE0 => "pitchbend",
                _ => "other"
            };
            
            // Create message payload
            let payload = RustMidiEvent {
                status,
                data1,
                data2,
                timestamp,
                type_name: frontend_message_type.to_string(),
                channel: channel as u8,
                // Additional fields for specific message types
                note: if message_type_u8 == 0x90 || message_type_u8 == 0x80 { Some(data1) } else { None },
                velocity: if message_type_u8 == 0x90 || message_type_u8 == 0x80 { Some(data2) } else { None },
                controller: if message_type_u8 == 0xB0 { Some(data1) } else { None },
                value: if message_type_u8 == 0xB0 { Some(data2) } else { None },
            };
            
            // Emit to frontend
            if let Err(e) = app_handle_for_macros.emit("rust-midi-event", payload) {
                eprintln!("Failed to emit MIDI event: {}", e);
            }
        }
    }, ())
    .map_err(|e| e.to_string())?;
    
    // Store connection in app state
    let mut connection_guard = APP_STATE.midi_connection.lock().unwrap();
    *connection_guard = Some(connection);
    
    // Also emit a message to let frontend know connection succeeded
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
            get_cursor_position
        ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}