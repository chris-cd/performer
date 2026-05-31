# Performer
This application interprets notes, chords, and events received by MIDI from a live performance and displays them for band members during live performances or for students as part of a lesson.

The app uses real-time MIDI chord detection dashboard designed specifically for live stage environments.
It processes incoming multi-channel or polyphonic MIDI data from a 6-string guitar performance system (such as the BOSS VG-800, GM-800, ROland GR-55, GP-10, Fishman TriplePlay, ...) and turns the stream of literal music-theory pitch data into clean, robust, split-second readable chord names tailored for a live rhythm section.

The original intent of this app is to be used on an external display, such as a tablet, connected via USB or Bluetooth (WIDI Jack).

The app relies on the wonderful tonal (https://github.com/tonaljs/tonal) music theory library for Javascript.

## Table of Contents
- [Scope](#-scope)
- [Architecture](#-architecture)
- [Performance Logic](#-performance-logic)
- [Advanced Global Intercepts](#-advanced-global-intercepts)
- [Stage-Hardened Display Logic](#-display)
- [Current Features & Interface Options](#-current-features--interface-options)
- [Roadmap](#-roadmap)
- [Installation & Quick Start](#-installation--quick-start)
- [License](#-license)

---

## SCOPE

Standard music theory libraries (like Tonal.js) are phenomenal for algorithmic evaluation, but they fail instantly on a live, dimly lit stage. When a guitarist plays a simple inversion, a raw library might output a complex, cluttered string like `Bm#5/G` or an abstract slash configuration. A keyboardist or bassist looking across the stage into a monitor does not have the cognitive bandwidth during a fast progression to decode hyper-literal music-theory jargon. They need to see **G** or **Gm**.

Furthermore, during physical chord transitions, string friction, finger lifts, and transient "Note Off" events send rapid-fire MIDI flurries. This causes generic visualizers to flicker violently between chords, throw up empty dashes, or distort the typography, inducing visual fatigue. 

The **Core Chord Monitor** acts as an intelligent performance profile filter. It intercepts raw pitch data, suppresses theory-heavy clutter, bridges transition gaps, and displays pristine structural chord names across a dual-zone landscape view.

---

## Architecture

The application is written completely in clean, modular, client-side Web standard languages to guarantee maximum execution speeds and cross-platform compatibility (Android, iOS, iPadOS, desktop browsers):

```
├── index.html       # Structural layout: optimized dual-zone view ports & settings cards
├── styles.css       # High-contrast, stage-ready CSS engines (Dark/Inversed profiles)
├── script.js        # Event listener, MIDI buffer, and visual rendering pipeline
├── chordEngine.js   # Advanced structural filtration, shell intercepts & sanitization
└── tonal.js         # Modular unpkg bundle for core pitch parsing
```

The application functions by listening directly to raw MIDI input commands (`0x90` Note On / `0x80` Note Off) using the **Web MIDI API**. These signals flow into a customizable buffer engine window (`90ms`) before reaching the custom analytical pipelines within `chordEngine.js`.

---

## Performance Logic

To map incoming fingerings cleanly, the analytical core breaks chord evaluation down into 3 distinct operational logic gates:

### 1: Only display chords
* **Trigger Condition:** Fired strictly when only 1 or 2 simultaneous notes are registered.
* **Rule:** Chord changes should only trigger for triads and above ( a chord is at least 2 intervals).

### 2: Managing triads
* **Trigger Condition:** Fired strictly when exactly 3 physical keys or unique pitch letters are registered.
* **The m#5 Intercept:** When Tonal.js captures a standard 1st-inversion major chord (e.g., `B, D, G`), it natively flags it as an altered minor chord (`Bm#5`). This engine runs an active intercept layer that identifies `m#5` choices and seamlessly re-maps them to their true, clean Major triad equivalent (`G`).
* **Rule:** There must **NEVER** be a slash chord or an inversion signature shown for a basic 3-note triad.
* **Root-Signature Priority:** If a 3-note layout forms a standard inversion (e.g., `Bb, D, G`), the engine forces priority back to the baseline root triad (`Gm`) rather than displaying an inversion name (`Gm/Bb`) or a confusing alternative rootless description (`Ebmaj7`).

### 3: Multi-Note Configuration
* **Trigger Condition:** Fired when 4 or more physical keys are pressed simultaneously.
* **Processing:** The engine bypasses triad safety gates entirely. Complex jazz voicings, structural multi-string extensions, and deliberate bass note alterations (`Chord/Bass`) are permitted to pass through completely unhindered to accurately reflect complex orchestration.

---

## 🔍 Advanced Global Intercepts

Before the engine ever divides the pitch data into standard triad or multi-note branches, it executes a global intercept query at the very top of the stack. This gate scans the active note arrays for exact semitone distance intervals to capture **rootless jazz shells** and specialized rhythm configurations that basic parsers either drop entirely or mangle into cluttered strings:

1. **Dominant 13th Shell:** Checks for the presence of the `[3rd, b7th, and 13th]` relative to a root (e.g., playing `F, B, E` targets and outputs a clean **G13**).
2. **Minor 6th Shell:** Checks for the presence of the `[b3rd, 5th, and 6th]` relative to a root (e.g., playing `E, Bb, D` targets and outputs a clean **Gm6**).
3. **Minor 11th Shell:** Checks for the presence of the `[b3rd, b7th, and 11th]` relative to a root (e.g., playing `G, C, D` targets and outputs a clean **Am11**).
4. **Minor 9th Shell:** Checks for the presence of the `[b3rd, b7th, and 9th]` relative to a root (e.g., playing `G, Bb, F, A` targets and outputs a clean **Gm9**).

---

## Display

### Text Sanitisation
All outputs undergo deep string filtering before rendering:
* **Omission Removal:** Cluttered theory indicators such as `no5` or `no3` are stripped out completely.
* **Major Marker Cleanup:** Redundant uppercase `M` markers are safely normalized (e.g., transforming text blocks or raw indicators into clear, standard stage notation like `AM7` -> `Amaj7` equivalents or clean baselines).

### Transition State Persistence (Anti-Flicker)
When a guitarist changes chords, there is a momentary window where all fingers leave the fretboard. This results in an immediate rush of "Note Off" events, driving the active notes map to absolute zero.
* **Isolate Displays:** The main stage text block readout is decoupled from underlying diagnostic containers.
* **Freeze on Note-Off:** When `activeNotes.size === 0`, the engine **NEVER** blanks out the screen or resets the main view to a dash. The last successfully calculated chord remains permanently frozen in place.
* **Clear Sub-Layers Only:** The physical pitch configuration boxes below the chord name clear immediately upon note-off, giving the player real-time visual feedback that their hands have left the fretboard, while keeping the structural chord anchored on screen for the rest of the band.
* **Conditional Overwrite:** The main readout changes *only* when a new, fully qualified configuration generates a valid, non-null chord.

---

## Current Features & Interface Options

The application features an interactive **Performance Control Panel** overlay (accessed via the gear icon) designed to alter runtime tracking behavior instantly during rehearsal or soundcheck:

* **Dual-Zone Visibility Toggle:** Enable or disable the left **PREVIOUS** column layout based on band preferences.
* **Lower Chord Composition View:** Toggle the secondary visual readout between **Scale Degrees** (e.g., `1, 3b, 5`), **Raw Pitch Names** (`A, C#, E`), or disable it entirely to clean up screen clutter.
* **Stage-Vetted Visual Themes:** Five high-visibility dark palettes designed for low-light venue stages (**Black & White**, **High Contrast Highlight**, **Matrix Blue**, **Darkroom Red**, and **Tactical Green**) along with matching inverted light modes for bright daytime outdoor sets.
* **Flexible Scale-to-Fit Typography:** Includes four distinctive structural typefaces (**System Sans**, **Roboto Condensed**, **Montserrat Bold**, and **Oswald Industrial**). The UI script handles programmatic viewport calculations via a smooth `while` resize loop, dynamically shrinking text between user-defined minimum and maximum `vw` bounds to make sure long chord names never warp or wrap line-breaks mid-song.

---

### Current Implementation Limitations:
Because this application is highly customized for personal stage requirements, certain features described in our architectural vision are still being decoupled or finalized for wide-scale hardware distribution:
1. **Dynamic Hardware Diagnostics Layer:** The 6-string real-time verification rows (`string-diagnostics-container`), which map MIDI input channels 1-6 explicitly to independent guitar strings for isolated hardware troubleshooting, are structurally configured within our technical rules but require specific multi-channel per-string MIDI settings out of your guitar's breakout box.
2. **Static Local Storage Profile:** Configured default profiles like `#profile-select` (switching between standard `rhythm` filters and advanced `jazz` extensions) and the `#slash-toggle` are currently wired into the code as deep core rules. They are managed through intuitive localized script parameters rather than separate HTML forms to save valuable screen space on small legacy tablet layouts.

---

## Roadmap

The current standalone MIDI tracking engine is explicitly designed as a modular, forward-compatible layer. The architecture is intentionally structured to scale into a holistic, multi-source **Stage Dashboard** driven by a master tablet running **OnSong 2026** via WebSockets or SysEx/CC network parsing:

1. **Active Song Metadata Block:** An upper structural window dedicated to rendering the currently running song title, artist name, structural key signature, and live BPM data pushed directly by the bandleader.
2. **Setlist Timing Monitor:** Integrated countdown timelines keeping track of the elapsed set length and displaying a precise warning clock before standard performance breaks.
3. **Emergency Broadcast Banner:** A full-width mid-screen text overlay that captures custom, real-time command strings pushed by the bandleader's controller to instantly broadcast flash notifications to the band's monitors (e.g., `*** ALERT: TAKE SOLO ***`, `SKIP CHORUS`, or `DYNAMIC DROP`).

---

## 💾 Installation & Quick Start

Since this app runs purely client-side without heavy compilation pipelines or Node.js backend requirements, setup takes seconds:

1. Clone or download this repository to your local drive or hosting unit.
2. Host the files on a local machine, a staging server, a **Raspberry Pi 4**, or push to an **AWS S3 static bucket**.
3. Open `index.html` in a Web MIDI compatible web browser (Google Chrome, Microsoft Edge, or a specialized MIDI-capable wrapper shell on iOS/Android).
4. Plug your guitar's MIDI interface or Morning Star controller directly into your device via **USB** or establish a **WIDI Jack** connection.
5. Tap the **Settings Gear** in the top-left to select your performance font limits, theme color rules, and chord composition views, then hit stage-ready save!

---

## 📄 License

This project is licensed under the **MIT License** — you are entirely free to take this code, modify the logic gates, expand the channel filters, adapt the display constraints, and use it in your own live performance rigs or commercial setups. 

*Built by a performer, for performers.*