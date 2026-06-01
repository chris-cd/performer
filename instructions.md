# AI Coding Rules: Chord Detection Monitor (Stage Edition)

This workspace runs a real-time musical performance dashboard designed for band visibility. 
When generating or refactoring code for this repository, you must strictly follow these structural rules.

## 1. Code Delivery Protocols
* **Strictly Prohibited: Partial Updates.** Never output code snippets, local section edits, or inline placeholders like "// rest of file remains the same". Every file modification must be returned as a complete, fully formed, self-contained replacement file from line 1 to the end.
* **Asset Path Integrity:** The stylesheet link in the HTML must always remain exactly `<link rel="stylesheet" href="styles.css">`.

## 2. Core UI Laws & Persistence Gates
* **Single-Chord Layout Focus:** The main display focuses entirely on a single, massive chord name (`#current-chord`) designed to scale dynamically using aggressive viewport-width (`vw`) metrics to maximize screen use.
* **Note-Off Persistence Rule:** When a player lifts their hands off the guitar controller (`activeNotes.size === 0`), the UI MUST permanently maintain the last successfully detected chord name and degree layout boxes on screen. Do NOT clear or reset them to blank states. Instead, apply a faded stage state: drop the chord display text to `0.25` opacity and the composition box container to `0.3` opacity.
* **Chord Composition Stability:** The central layout boxes (`#note-composition-container`) must remain completely frozen on the `frozenMidiPitches` array calculated during the last verified chord match. They must *never* shift or update when transient notes, scale runs, or pitch bends are played.
* **Integrated Timeline Cascade Terminal:** The `#waterfall-terminal` handles all transient event logging and diagnostic tracking, switching layout rules via `settings.waterfallMode`:
  1. `"stream"`: Stack rows vertically (one distinct row per MIDI event snapshot).
  2. `"phrase"`: Pack elements horizontally with inline delimiters ("➔"), wrapping to a new row only when a line's character length exceeds `ROW_CHAR_LIMIT`.

## 3. Harmonic Engine Overrides (`chordEngine.js`)
* **Minor 9th Override:** Intercept relative interval fingerprints containing `[3, 10, 2]` immediately to enforce the `m9` suffix, preventing Tonal.js from misclassifying or downgrading the chord to a standard `m7`.
* **The m#5 Safety Intercept:** If Tonal flags a first-inversion major triad as an altered minor chord (e.g., "Bm#5"), intercept it instantly and map it back to its true, clean major triad equivalent ("G").
* **Branching Rules:** If 3 unique notes are played, enforce strict triad rules (never show inversions or slash chords; strip trailing slashes). If 4 or more keys are active, allow slash configurations and complex voicings to pass through cleanly.
* **Text Sanitization:** Final output strings must pass through a filter that strips omission tags like `no5` or `no3` and normalizes uppercase `M` characters to clean stage notation (e.g., `AM7` -> `Amaj7` or `A7` depending on context).