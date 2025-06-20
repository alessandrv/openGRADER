# macOS MIDI Setup Guide

## Overview

On macOS, openGRADER requires specific system permissions to access MIDI devices. This guide will help you configure these permissions properly.

## Required Permissions

### 1. Microphone Access
Even though openGRADER doesn't use the microphone directly, macOS requires this permission for MIDI device access.

**Steps to grant microphone permission:**
1. Open **System Preferences** (or **System Settings** on macOS Ventura+)
2. Navigate to **Security & Privacy** → **Privacy** → **Microphone**
3. Look for **openGRADER** in the list
4. Check the box next to it to enable access
5. If openGRADER is not in the list, try running the app first, then check again

### 2. Bluetooth Access (for Bluetooth MIDI devices)
If you're using Bluetooth MIDI devices, you'll also need Bluetooth permissions.

**Steps to grant Bluetooth permission:**
1. Open **System Preferences** (or **System Settings** on macOS Ventura+)
2. Navigate to **Security & Privacy** → **Privacy** → **Bluetooth**
3. Look for **openGRADER** in the list
4. Check the box next to it to enable access

### 3. Accessibility Access (for automation features)
For openGRADER to control your mouse and keyboard, it needs accessibility permissions.

**Steps to grant accessibility permission:**
1. Open **System Preferences** (or **System Settings** on macOS Ventura+)
2. Navigate to **Security & Privacy** → **Privacy** → **Accessibility**
3. Click the lock icon and enter your password
4. Look for **openGRADER** in the list
5. Check the box next to it to enable access
6. If prompted, you may need to quit and restart openGRADER

## Troubleshooting

### MIDI Device Not Detected
1. **Check Physical Connection**: Ensure your MIDI device is properly connected via USB or Bluetooth
2. **Verify Device Recognition**: Open **Audio MIDI Setup** (Applications → Utilities) and confirm your device appears
3. **Check Permissions**: Verify all required permissions are granted as described above
4. **Restart the App**: Sometimes permissions require an app restart to take effect

### Permission Dialogs Not Appearing
If macOS doesn't show permission dialogs:
1. Try manually adding openGRADER to the permission lists in System Preferences
2. Look for the app in `/Applications/` or wherever you installed it
3. If built from source, the app might be in a different location

### Still Having Issues?
1. **Reset Permissions**: You can reset permissions by removing openGRADER from the permission lists and re-adding it
2. **Check Console**: Open Console.app and look for any MIDI-related error messages
3. **Restart macOS**: In rare cases, a system restart may be needed for permission changes to take effect

## Alternative MIDI Testing
To test if your MIDI device is working with macOS:
1. Open **Audio MIDI Setup** (Applications → Utilities → Audio MIDI Setup)
2. Go to **Window** → **Show MIDI Studio**
3. Double-click your MIDI device to open its properties
4. Click **Test Setup** to verify MIDI communication

## Building from Source
If you're building openGRADER from source, make sure to:
1. Sign the application with a valid developer certificate
2. Notarize the app if distributing to other users
3. The Info.plist permissions should already be included in the source code

## macOS Version Compatibility
- **macOS 10.13+**: Supported
- **macOS 12+ (Monterey)**: Recommended for best compatibility
- **macOS 14+ (Sonoma)**: Latest features and security improvements

---

**Note**: These permission requirements are enforced by macOS for security reasons. Without proper permissions, MIDI functionality will not work correctly. 