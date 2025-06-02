# Bulk Encoder Initialization

The Bulk Encoder Initialization feature allows you to quickly create multiple encoder groups from a single template, perfect for setting up complex MIDI controller mappings.

## How It Works

### Template-Based Creation
- Start with any encoder template (templates with increment/decrement or click actions)
- The system automatically determines how many macros per group based on the template:
  - **Encoder templates**: 2 macros per group (increment + decrement)
  - **Encoder with click templates**: 3 macros per group (increment + decrement + click)
  - **Basic templates**: 1 macro per group

### Manual MIDI Input Workflow
Unlike the original bulk creation that auto-generated MIDI values, the new workflow requires manual input for each group:

1. **Set Base Configuration**
   - Enter a base name (e.g., "Volume", "Brightness")
   - Select a category for all groups
   - Choose whether to randomize key presses

2. **Add Groups One by One**
   - For each group, manually set the MIDI triggers using MIDI learning
   - Groups are automatically named with indices: "Volume 1", "Volume 2", etc.
   - Add as many groups as needed before finalizing

3. **MIDI Learning for Each Trigger**
   - **Increment Trigger**: Set the MIDI CC for increment actions
   - **Decrement Trigger**: Set the MIDI CC for decrement actions  
   - **Click Trigger**: Set the MIDI note/CC for click actions (if template supports it)

4. **Automatic Key Randomization**
   - If enabled, the system automatically assigns different keys to avoid conflicts
   - Uses a pool of safe keys (a-z, 0-9, F1-F12)
   - Checks against existing macros to prevent duplicates

## Step-by-Step Usage

### 1. Access Bulk Initialization
- Go to Templates Gallery
- Find an encoder template
- Click the dropdown arrow on the template card
- Select "Bulk Initialize"

### 2. Configure Base Settings
- **Base Name**: Enter the common name for all groups (e.g., "EQ Band")
- **Category**: Select where to organize the macros
- **Randomize Keys**: Toggle to automatically assign unique keys

### 3. Add Your First Group
- The system shows required triggers based on template type
- Use MIDI learning to set each trigger:
  - Click "Listen for MIDI" on each trigger field
  - Move/press the corresponding control on your MIDI device
  - The trigger is automatically captured and set

### 4. Add More Groups
- Click "Add Group" to save the current group
- The form resets for the next group
- Repeat the MIDI learning process for each new group
- Groups are automatically numbered: "EQ Band 1", "EQ Band 2", etc.

### 5. Review and Create
- View all added groups in the list
- Use "Show Preview" to see action details
- Remove any unwanted groups with the trash button
- Click "Create X Macros" to generate all macros

## Example: Creating 5 Volume Controls

1. **Template**: Use an encoder template with volume up/down actions
2. **Base Name**: "Volume"
3. **Groups**: Add 5 groups with different MIDI CCs:
   - Volume 1: Ch1 CC1 (increment) / Ch1 CC2 (decrement)
   - Volume 2: Ch1 CC3 (increment) / Ch1 CC4 (decrement)
   - Volume 3: Ch1 CC5 (increment) / Ch1 CC6 (decrement)
   - Volume 4: Ch1 CC7 (increment) / Ch1 CC8 (decrement)
   - Volume 5: Ch1 CC9 (increment) / Ch1 CC10 (decrement)

**Result**: 10 macros total (2 per group), each with unique key assignments if randomization is enabled.

## Key Features

### Conflict Avoidance
- **MIDI Conflicts**: You manually set each MIDI trigger, so conflicts are avoided by design
- **Key Conflicts**: Automatic randomization ensures unique key assignments
- **Name Conflicts**: Automatic indexing prevents duplicate names

### Flexible Workflow
- **Add Groups Incrementally**: No need to specify total count upfront
- **MIDI Learning**: Quick and accurate MIDI trigger setup
- **Preview Before Creation**: Review all groups before committing
- **Easy Removal**: Remove unwanted groups from the list

### Template Inheritance
- **All Actions Preserved**: Before/after actions, timeouts, and settings are inherited
- **Randomized Parameters**: Only key presses are randomized (if enabled)
- **Category Assignment**: All macros go to the selected category

## Best Practices

### MIDI Organization
- Use sequential CC numbers for related controls
- Keep increment/decrement CCs close together (e.g., CC1/CC2)
- Use the same channel for related groups when possible

### Naming Strategy
- Use descriptive base names that make sense with numbers
- Examples: "EQ Band", "Send Level", "Pan Control"
- Avoid names that don't work well with indices

### Key Randomization
- Enable for large bulk creations to avoid manual key assignment
- Disable if you want to manually set specific keys later
- The system uses safe, commonly available keys

## Troubleshooting

### "Add Group" Button Disabled
- Ensure all required MIDI triggers are set
- For encoder templates, both increment and decrement triggers are required
- For encoder-click templates, all three triggers are required

### MIDI Learning Not Working
- Check that your MIDI device is connected and selected
- Ensure the MIDI input is enabled in the app
- Try moving the control more distinctly

### Key Conflicts After Creation
- Edit individual macros to assign different keys
- Use the macro editor to resolve conflicts manually
- Consider enabling randomization for future bulk creations

## Technical Notes

### Macro Structure
- Each group gets a unique `groupId` for related macros
- Increment macros use type "encoder-increment"
- Decrement macros use type "encoder-decrement"  
- Click macros use type "encoder-click"

### Storage
- All macros are saved to localStorage immediately
- Groups maintain their relationship through `groupId`
- Category assignments are preserved across sessions 