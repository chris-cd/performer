# Product Backlog & Architectural Roadmap: Performer App

This document outlines upcoming extension layers to transform the app into a comprehensive, multi-source Stage Dashboard driven by network data strings, OnSong 2020 application broadcasts, and hardware rigs (BOSS VG-800 / GM-800 / Morningstar MC6 Pro).

## Phase A: Advanced MIDI Tracking & Core Voice Input Options
* [ ] **Channel Mode Selection Toggle**: Add an option in the Performance Control Panel to switch between:
  * `Omni/Mono Channel Mode`: Tailored for legacy gear (e.g., BOSS VG-800) throwing all notes onto a single shared MIDI stream.
  * `Multi-Channel Polyphonic Mode`: Dedicated string-per-channel processing (e.g., BOSS GM-800 routing Strings 1–6 to MIDI Channels 1–6) to maximize chord detection accuracy.
* [ ] **Per-String Pitch Bend Tracking Optimization**: Refactor bend state listeners to isolate calculations on a per-channel basis when Multi-Channel mode is active, ensuring individual string bends don't scramble adjacent fretted notes.
* [ ] **Dynamic Fretboard Diagram Module**: Integrate a rendering utility (like VexFlow) to optionally draw real-time chord shapes and fingerings directly underneath the main chord text when working in high-accuracy Multi-Channel mode.

## Phase B: Dashboard Shell Layout & Utility Clocks (HTML/CSS)
* [ ] **Modular Dashboard Header**: Implement a high-contrast global header area at the top of `index.html` featuring insulated text container slots for:
  * `SONG: [Song Title]`
  * `KEY: [Key Signature]`
* [ ] **Dual-Clock Curfew Engine**: Build a performance timer area in the header showing:
  * `CURRENT TIME`: Real-time local wall-clock (HH:MM).
  * `TIME LEFT`: Dynamic countdown timer tracking the remaining duration of the active set.
* [ ] **Emergency Stage Broadcast Banner**: Create a hidden, full-width overlay banner block (`#stage-broadcast-alert`) positioned to instantly flash custom text text across the screen when toggled, without altering or shrinking the active `#current-chord` font size layout.
* [ ] **Decoupled Grid Optimization**: Ensure the main layout splits the screen vertically between the Header/Clocks (15%), Core Chord Engine Zone (60%), and the Timeline Cascade Terminal (25%) to eliminate layout shifting.

## Phase C: OnSong 2020 Data Ingestion Layer (Network Sync)
* [ ] **OnSong 2020 Broadcast Receiver**: Establish a network script/listener capable of catching local network metadata payloads broadcast by the OnSong 2020 app layer.
* [ ] **Metadata Parsing Engine**: Build a parser to extract song titles, artists, keys, and set lengths from network events, updating the corresponding DOM header hooks instantly.

## Phase D: Custom Stage Actions & Messaging Command Gate
* [ ] **Quick Message Trigger Framework**: Build code listeners to watch for incoming macro text commands or specific MIDI CC/SysEx commands sent from your Morningstar MC6 Pro.
* [ ] **Quick Action Text Display Logic**: When an explicit directive is received (e.g., "SLOW DOWN", "SPEED UP", "KEY CHANGE", "RHYTHM CHANGE", "STOP", "TAKE SOLO"), inject the message text directly into the emergency banner, apply an aggressive CSS flash/pulse animation class, and set an automatic expiration timeout to clear it safely after a specified number of seconds.