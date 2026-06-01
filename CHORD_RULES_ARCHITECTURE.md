# Chord Detection Plugin Architecture

## Overview

The chord detection system has been refactored into a **modular plugin architecture** using the `ChordRuleEngine` to:

- **Enable/disable individual chord detection rules** without modifying code
- **Create custom chord detection rules** by following a simple interface
- **Compose different rule combinations** for different detection scenarios
- **Prioritize rules** based on accuracy, performance, or use case needs

## Architecture Layers

```
┌─────────────────────────────────────────┐
│        bestChordFilter() Function       │
│  (Backward-compatible public API)       │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      ChordRuleEngine                    │
│  (Rule registration & execution)        │
└────────────────┬────────────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
   ┌─────────────────────────────────┐
   │   Rule Modules                  │
   ├─────────────────────────────────┤
   │ • intervalRules.js (Override)   │
   │ • intervalRules.js (Default)    │
   │ • fallbackRules.js              │
   │ • formattingRules.js            │
   └─────────────────────────────────┘
```

## File Structure

```
performer/
├── chordEngine.js              # Main entry point, rule engine factory
├── ruleEngine.js               # Core plugin system
├── rules/
│   ├── intervalRules.js        # 16 chord type detection rules
│   ├── fallbackRules.js        # 6 fallback & shell chord rules
│   └── formattingRules.js      # 5 text formatting rules
├── script.js                   # MIDI handler, uses bestChordFilter()
└── [other files...]
```

## Rule Types & Priorities

Rules execute in this order:

### 1. **Override Rules** (Priority: 90+)
Early exit if matched - highest priority checks that prevent further processing.

Examples:
- `bendHoldCheck` (100) - Maintain chord during pitch bends
- `minor9Override` (95) - Enforce m9 detection
- `majorTriadSafety` (90) - Fix m#5 misclassifications

### 2. **Default Rules** (Priority: 50-89)
Standard interval-based chord detection with specific pattern matching.

Examples (16 rules):
- `dim7`, `m7b5`, `m11` - Diminished/half-diminished structures
- `7sharp9`, `dominant9` - Dominant chord variants
- `Maj7`, `7MinorValidation`, `m6` - Major, dominant, minor detection

### 3. **Fallback Rules** (Priority: 1-49)
Lower priority fallback detection for bass matching, shell chords, explicit targets.

Examples (6 rules):
- `bassMatching` (50) - Match by bass note for 3-note chords
- `rootlessShellChord` (48) - Detect voicings without root
- `anyChord` (1) - Ultimate fallback

## Using the Plugin System

### Basic Usage (Default Behavior)

No changes needed - `bestChordFilter()` works exactly as before:

```javascript
import { bestChordFilter } from "./chordEngine.js";

const result = bestChordFilter(
    chordList,           // Tonal.js detected chords
    bassNote,            // Lowest note
    physicalKeyCount,    // Number of active notes
    noteLetters,         // Note names
    currentChordName,    // Previous chord (for continuity)
    rawActiveMidiArray,  // Raw MIDI values
    bendingMidiNotes     // Notes with active bends
);
```

### Advanced Usage: Configure Rules

Access the global rule engine to enable/disable specific rules:

```javascript
import { getGlobalRuleEngine } from "./chordEngine.js";

const engine = getGlobalRuleEngine();

// Disable a specific rule
engine.disable("m7b5");  // Disable half-diminished detection

// Enable only certain rules
engine.disableAll();
engine.enable("minor9Override", "dominant9", "anyChord");

// Check rule status
const status = engine.getRuleStatus();
status.forEach(rule => {
    console.log(`${rule.name}: ${rule.enabled ? "✓" : "✗"}`);
});
```

### Available Rules Reference

#### Override Rules
```
bendHoldCheck      - Hold chord during pitch bends
minor9Override     - Enforce m9 ([3, 10, 2] intervals)
majorTriadSafety   - Convert misclassified m#5 to major
```

#### Interval Detection Rules
```
dim7               - Fully diminished 7th
m7b5               - Half-diminished 7th
m11Shell           - Minor 11 shell voicings
7sharp9            - Hendrix chord
dominant9          - Dominant 9th
7b5                - Dominant 7 flat 5
7b13               - Dominant 7 flat 13
6addb9             - Special voicing
13                 - Dominant 13
9sus4              - Suspended 4 with 9
Maj7               - Major 7 with ghost filtering
7MinorValidation   - Dominant/minor 7 validation
m6                 - Minor 6
```

#### Fallback Rules
```
bassMatching       - Match by bass note (3-note chords)
bassLeadMatch      - Find bass-leading slash chord
rootlessShellChord - Detect rootless voicings
explicitTargets    - Match against explicit types
pureRootChord      - Fall back to root position
anyChord           - Ultimate fallback (first detected)
```

#### Formatting Rules
```
sanitizeFormatting     - Remove no3/no5 tags
normalizePitchClass    - Enharmonic spelling
enforceTriadRules      - Strip slashes from 3-note chords
allowComplexVoicing    - Preserve slashes for 4+ notes
uppercaseNormalization - Normalize M notation
```

## Creating Custom Rules

### Rule Interface

Every rule must be an object with:

```javascript
{
    name: "myCustomRule",                    // Unique identifier
    type: "default",                         // "override", "default", or "fallback"
    priority: 75,                            // Higher = runs first
    description: "Detects something special",
    execute(context, data) {
        // Return chord name string or null
        if (someCondition) {
            return "C7sus4";
        }
        return null;
    }
}
```

### Example: Custom Rule

Create `rules/myRules.js`:

```javascript
export const MyCustomRule = {
    name: 'customMinor7',
    type: 'default',
    priority: 72,
    description: 'Custom minor 7 detection with extended checking',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        // Your custom interval checking logic
        if (relativeIntervals.includes(3) && relativeIntervals.includes(10)) {
            // Custom additional validation
            const hasSpecialVoicing = relativeIntervals.includes(5);
            if (hasSpecialVoicing) {
                return displayRoot + "m7(add11)";
            }
            return displayRoot + "m7";
        }
        return null;
    }
};
```

### Register Your Custom Rule

In `chordEngine.js`, add to `createChordRuleEngine()`:

```javascript
import * as MyRules from "./rules/myRules.js";

export function createChordRuleEngine() {
    const engine = new ChordRuleEngine();
    
    // ... existing registrations ...
    
    // Register your custom rule
    engine.registerRule(MyRules.MyCustomRule.name, MyRules.MyCustomRule);
    
    // Enable it
    engine.enableAll();
    
    return engine;
}
```

## Available Data in `execute(context, data)`

### Context Object
```javascript
{
    FLATTENED_PITCHES,    // ["C", "C#", "D", ...]
    Midi,                 // Tonal.js Midi object
    normalizePitchClass,  // Function: normalize enharmonic spelling
    accidentalMap         // Map of enharmonic equivalents
}
```

### Data Object
```javascript
{
    // Original parameters
    chordList,                   // Array of detected chord strings
    bassNote,                    // Lowest note name
    physicalKeyCount,            // Number of active MIDI notes
    noteLetters,                 // Array of note letters
    currentActiveChordName,      // Previously detected chord
    rawActiveMidiArray,          // Raw MIDI values
    bendingMidiNotes,            // Notes with active bends
    
    // Derived data
    upperLetters,                // Normalized uppercase letters
    normalizedBass,              // Normalized bass note
    uniqueNoteCount,             // Unique note letter count
    
    // MIDI analysis
    sortedMidi,                  // MIDI array sorted ascending
    rootMidi,                    // Lowest MIDI value
    relativeIntervals,           // Semitone intervals from root
    displayRoot,                 // Normalized root note name
    
    // Utilities
    normalizePitchClass,         // Function reference
    FLATTENED_PITCHES,          // Constants reference
    Midi                         // Tonal.js reference
}
```

## Example Scenarios

### Scenario 1: Disable Ambiguous Chords

Only detect "confident" chord types:

```javascript
const engine = getGlobalRuleEngine();
engine.disableAll();
engine.enable(
    "bendHoldCheck",
    "minor9Override",
    "dim7",
    "m7b5",
    "7sharp9",
    "Maj7",
    "7MinorValidation",
    "m6",
    "anyChord"  // Ultimate fallback
);
```

### Scenario 2: Strict 3-Note Chord Detection

For acoustic guitar style:

```javascript
const engine = getGlobalRuleEngine();
engine.disable("rootlessShellChord");  // Disable rootless voicings
engine.enable("bassMatching");          // Focus on bass-defined chords
```

### Scenario 3: Complex Jazz Voicing Support

Enable all rules with extended detection:

```javascript
const engine = getGlobalRuleEngine();
engine.enableAll();  // Use all detection rules
// Keep default rule set for maximum flexibility
```

## Performance Considerations

1. **Rule Order Matters**: Override rules (high priority) exit early, reducing processing
2. **Disable Unused Rules**: Each disabled rule saves execution time
3. **Custom Rules**: Keep `execute()` functions simple and fast
4. **MIDI Data**: Larger note arrays take slightly longer to process

## Backward Compatibility

The original `bestChordFilter()` API remains **completely unchanged**. All existing code continues to work without modification.

```javascript
// Old code still works exactly the same
const chord = bestChordFilter(list, bass, count, letters, current, midi, bends);
```

## Troubleshooting

### Rule Not Executing
- Verify rule is enabled: `engine.isActive("ruleName")`
- Check rule priority against other enabled rules
- Ensure `execute()` returns appropriate value (string or null)

### Unexpected Chord Detection
- Check which rules are enabled: `engine.getRuleStatus()`
- Try disabling conflicting rules
- Verify rule order via priorities

### Custom Rule Not Registered
- Ensure rule is added in `createChordRuleEngine()`
- Verify name matches export name
- Check for syntax errors in rule object

## Future Enhancements

Possible extensions:

- [ ] Rule conflict detection and resolution
- [ ] Performance profiling and optimization
- [ ] Rule testing framework
- [ ] Dynamic rule loading from JSON
- [ ] Machine learning-based rule weighting
- [ ] MIDI recording with rule analysis
