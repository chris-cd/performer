# Quick Reference: Chord Rules Plugin System

## TL;DR

Your chord detection code is now modular. The public API hasn't changed, but you can now enable/disable rules.

## File Locations

```
✓ ruleEngine.js                 (Core plugin manager)
✓ rules/intervalRules.js        (16 detection rules)  
✓ rules/fallbackRules.js        (6 fallback rules)
✓ rules/formattingRules.js      (5 formatting rules)
✓ CHORD_RULES_ARCHITECTURE.md   (Full docs)
✓ REFACTORING_SUMMARY.md        (What changed)
```

## Common Tasks

### Print All Available Rules
```javascript
import { getGlobalRuleEngine } from "./chordEngine.js";

const engine = getGlobalRuleEngine();
engine.getRuleStatus().forEach(r => {
    console.log(`${r.enabled ? '✓' : '✗'} ${r.name} - ${r.description}`);
});
```

### Disable Rules You Don't Need
```javascript
const engine = getGlobalRuleEngine();
engine.disable("m7b5", "6addb9");  // Remove these detections
```

### Create a Simple Custom Rule
```javascript
// In rules/myRules.js
export const MyRule = {
    name: 'customChord',
    type: 'default',
    priority: 70,
    description: 'My custom chord detection',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        if (relativeIntervals && relativeIntervals.includes(3)) {
            return displayRoot + "m7";
        }
        return null;
    }
};
```

Then register it in `chordEngine.js`:
```javascript
import * as MyRules from "./rules/myRules.js";

export function createChordRuleEngine() {
    const engine = new ChordRuleEngine();
    // ... existing code ...
    engine.registerRule(MyRules.MyRule.name, MyRules.MyRule);
    engine.enableAll();
    return engine;
}
```

## Rule Names & Types

### Override Rules (High Priority)
| Rule | Priority | Purpose |
|------|----------|---------|
| `bendHoldCheck` | 100 | Maintain chord during bends |
| `minor9Override` | 95 | Enforce m9 detection |
| `majorTriadSafety` | 90 | Fix m#5 misclassifications |

### Interval Detection Rules
| Rule | Priority | Intervals |
|------|----------|-----------|
| `dim7` | 80 | [3,6,9] |
| `m7b5` | 79 | [3,6,10] |
| `minor9Override` | 95 | [3,10,2] |
| `7sharp9` | 77 | [10,4,3] |
| `dominant9` | 76 | [10,4,2] |
| `Maj7` | 70 | [11,...] |
| `7MinorValidation` | 69 | [10,...] |

### Fallback Rules
| Rule | Priority | Purpose |
|------|----------|---------|
| `bassMatching` | 50 | Match by bass (3-note only) |
| `rootlessShellChord` | 48 | Rootless voicings |
| `explicitTargets` | 47 | Specific chord types |
| `pureRootChord` | 46 | Root position fallback |
| `anyChord` | 1 | Last resort |

## Rule Execution Flow

```
Input: MIDI notes
   ↓
Override Rules? → Yes → Return chord (DONE)
   ↓ No
Interval Rules? → Yes → Return chord (DONE)
   ↓ No
Fallback Rules? → Yes → Return chord (DONE)
   ↓ No
Return null
   ↓
Apply Formatting (sanitize, normalize)
   ↓
Output: Chord name or null
```

## How Rules Match

Rules check `relativeIntervals` (semitone distances from root):
- 0 = Root
- 1 = Minor 2nd
- 2 = Major 2nd / Minor 9th
- 3 = Minor 3rd
- 4 = Major 3rd
- 5 = Perfect 4th
- 6 = Tritone
- 7 = Perfect 5th
- 8 = Minor 6th
- 9 = Major 6th
- 10 = Minor 7th
- 11 = Major 7th

Example: Minor 7 = [3, 7, 10]

## Data Available to Rules

Every rule receives:
- `relativeIntervals` - Semitone array from root
- `displayRoot` - Root note name
- `chordList` - Tonal.js detections
- `upperLetters` - Note letters
- `normalizedBass` - Bass note
- `physicalKeyCount` - Number of active notes
- Context utilities (Midi, normalizePitchClass, etc.)

## Enabling/Disabling Patterns

```javascript
// Enable only major chords
engine.disableAll();
engine.enable("Maj7", "anyChord");

// Remove ambiguous chords
engine.disable("m7b5", "6addb9", "7b5");

// Add your custom rule
engine.enable("myCustomRule");

// Reset to defaults
engine.enableAll();
```

## Testing a Custom Rule

```javascript
import * as MyRules from "./rules/myRules.js";

const testData = {
    relativeIntervals: [3, 10],  // Minor 7 intervals
    displayRoot: "C"
};

const result = MyRules.MyRule.execute(null, testData);
console.log(result);  // Should return "Cm7" or null
```

## Performance Tips

1. **Disable unused rules** for faster detection
2. **Prioritize high-priority rules** for common chords
3. **Keep execute() functions simple** - no heavy computation
4. **Profile rule execution** - most common chords should match early

## API Stability

✅ `bestChordFilter()` - Fully backward compatible  
✅ `getGlobalRuleEngine()` - Stable public API  
✅ `createChordRuleEngine()` - Can customize initialization  
✅ Rule objects - Follow standard interface

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Rule not running | Check: `engine.isActive("ruleName")` |
| Wrong chord detected | Disable conflicting rules |
| Custom rule ignored | Verify it's registered in `createChordRuleEngine()` |
| Performance issue | Profile and disable unused rules |

## See Also

- [CHORD_RULES_ARCHITECTURE.md](CHORD_RULES_ARCHITECTURE.md) - Full reference
- [REFACTORING_SUMMARY.md](REFACTORING_SUMMARY.md) - What changed
- [chordEngine.js](chordEngine.js) - Implementation
- [ruleEngine.js](ruleEngine.js) - Plugin system core
