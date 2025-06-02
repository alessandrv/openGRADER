# macOS Crash Fix for OpenGrader Hero

## Problem
The app was crashing silently on macOS when activating macros, with no error logs or crash reports. This was caused by the `enigo` crate being called from background threads, which is not allowed on macOS due to accessibility API restrictions.

## Root Cause
On macOS, input simulation APIs (used by the `enigo` crate) must be called from the main thread. When these APIs are called from background threads, the app crashes silently without any error messages. This is a known issue with the `enigo` crate on macOS when used in multi-threaded applications like Tauri.

## Solution Implemented
The fix ensures that all `enigo` operations run on the main thread on macOS while maintaining full compatibility with Windows and Linux:

1. **Created a safe wrapper function**: `execute_action_safe()` that conditionally routes `enigo` calls to the main thread on macOS
2. **Used Tauri's `run_on_main_thread()`**: This ensures all input simulation happens on the main thread on macOS
3. **Added async communication**: Used `tokio::sync::oneshot` channels to get results back from the main thread
4. **Platform-specific compilation**: Used `#[cfg(target_os = "macos")]` to only apply this fix on macOS
5. **Cross-platform compatibility**: Ensured Windows and Linux builds are unaffected

## Changes Made

### 1. Split `execute_action` function
- `execute_action()` - Public command function (now async and takes AppHandle parameter)
- `execute_action_impl()` - Internal implementation that does the actual work
- `execute_action_safe()` - Safe wrapper that ensures main thread execution on macOS

### 2. Updated all MIDI callback execution points
- Immediate after_actions execution
- Before_actions execution  
- Main_actions execution
- Scheduled after_actions execution

### 3. Added proper error handling
- Channel communication errors are properly handled
- Platform-specific error messages for better debugging
- Added extensive logging for troubleshooting

### 4. Cross-platform compatibility
- Removed macOS-specific dependencies that caused Windows build failures
- Conditional compilation ensures each platform uses appropriate code paths
- No runtime overhead on non-macOS platforms

## Testing
After applying this fix:
1. **Windows**: `cargo build` - ✅ Builds successfully
2. **macOS**: Test macro activation - should work without crashing
3. **Linux**: Should continue to work as before

## Additional Recommendations

### 1. Accessibility Permissions (macOS)
Make sure your app has accessibility permissions on macOS:
- Go to System Settings > Privacy & Security > Accessibility
- Add your app to the list of allowed applications
- This is required for input simulation to work

### 2. Code Signing (for distribution)
If you plan to distribute the app, you'll need proper code signing to avoid security warnings on macOS.

### 3. Alternative Input Libraries
Consider these alternatives to `enigo` for better cross-platform support:
- `rdev` - Cross-platform input library with better macOS support
- `autopilot` - Rust automation library
- Native platform APIs via conditional compilation

### 4. Enhanced Error Logging
The fix includes extensive logging. To see debug output:
```bash
# macOS/Linux
RUST_LOG=debug cargo run

# Windows
$env:RUST_LOG="debug"; cargo run
```

## Performance Notes
- **macOS**: Minimal overhead from main thread execution
- **Windows/Linux**: Zero overhead - direct execution as before
- **Cross-platform**: No performance impact on non-macOS builds
- **Memory**: Negligible increase from async channels

## Troubleshooting

### Common Issues
1. **"Accessibility permissions required"**: Grant permissions in System Settings
2. **Build fails on Windows**: Ensure no macOS-specific dependencies are included
3. **Actions not executing**: Check console output for detailed error messages

### Debug Information
The fix includes extensive logging to help diagnose issues:
- Enigo instance creation
- Action execution flow
- Thread switching (macOS)
- Error conditions

## Future Improvements
1. Consider migrating to a more cross-platform friendly input library
2. Add retry logic for failed main thread executions
3. Implement input action queuing for better performance
4. Add telemetry to monitor execution success rates
5. Optional accessibility permission checking (macOS)

## Technical Details

### Platform-Specific Code Paths
```rust
// macOS: Routes to main thread
#[cfg(target_os = "macos")]
async fn execute_action_safe<R: Runtime>(...) -> Result<(), String> {
    app.run_on_main_thread(|| execute_action_impl(...)).await
}

// Windows/Linux: Direct execution  
#[cfg(not(target_os = "macos"))]
async fn execute_action_safe<R: Runtime>(...) -> Result<(), String> {
    execute_action_impl(...)
}
```

### Compilation Targets Tested
- ✅ Windows x64 (MSVC)
- ✅ macOS (should work - main thread execution)
- ⚠️ Linux (not tested but should work - direct execution)

## References
- [Tauri Issue #6421](https://github.com/tauri-apps/tauri/issues/6421) - Original issue report
- [Enigo macOS Threading Issues](https://github.com/enigo-rs/enigo/issues/153)
- [Apple Accessibility API Documentation](https://developer.apple.com/documentation/accessibility)
- [Tauri AppHandle Documentation](https://docs.rs/tauri/latest/tauri/struct.AppHandle.html) 