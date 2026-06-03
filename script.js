import { Midi, Chord } from "./tonal.js"; 
import { bestChordFilter } from "./chordEngine.js";

const BUFFER_WINDOW_MS = 45; 
const MAX_WATERFALL_ROWS = 15; 
const ROW_CHAR_LIMIT = 48; 

// Track the base MIDI notes fretted on each channel
let channelActiveNotes = Array.from({ length: 16 }, () => new Set());
// Store latest raw Pitch Bend values (-8192 to 8191 offset from center 8192) per channel
let channelPitchBends = Array.from({ length: 16 }, () => 0);
// Track bending string directions for visual arrows
let channelBendingDirections = Array.from({ length: 16 }, () => new Map());

let currentChordName = "";
let lastWaterfallChordName = ""; 
let currentChordObject = null; 
let frozenMidiPitches = []; // Stabilizes center structural composition layout boxes
let bufferTimeout = null;
let lastAcceptedChordTime = 0; // ms timestamp when we last accepted a chord

// Persistent trackers for horizontal packing engine
let activeRowTrackLength = 0;
let currentActiveWaterfallRow = null;
let currentActiveWaterfallLeft = null;
let currentActiveWaterfallRight = null;

const settings = {
    composition: localStorage.getItem("set-composition") || "degrees",
    theme: localStorage.getItem("set-theme") || "bw-dark",
    font: localStorage.getItem("set-font") || "system",
    minFont: parseFloat(localStorage.getItem("set-min-font")) || 6,
    maxFont: parseFloat(localStorage.getItem("set-max-font")) || 38,
    waterfallMode: localStorage.getItem("set-waterfall-mode") || "phrase" // Defaulting to the readable phrase layout
};

// Performance mode: bypass confirmation and filters for lowest latency (for live shows)
settings.performanceMode = localStorage.getItem("set-performance-mode") === "true";

// Ghost-note filter settings (user adjustable)
settings.ghostHoldMs = parseInt(localStorage.getItem("set-ghost-hold-ms")) || 300;
settings.ghostOverlapPct = parseFloat(localStorage.getItem("set-ghost-overlap-pct")) || 60;
// Chord confirmation settings
settings.chordConfirmCount = parseInt(localStorage.getItem("set-chord-confirm-count")) || 2;
settings.chordConfirmMatchPct = parseFloat(localStorage.getItem("set-chord-confirm-match-pct")) || 50;
// Bass-root prioritization weight (user adjustable)
settings.bassWeight = parseFloat(localStorage.getItem("set-bass-weight")) || 4.0;
// Sticky retention threshold: percent overlap required to retain current chord when detection is noisy
settings.stickyRetentionPct = parseFloat(localStorage.getItem("set-sticky-retention-pct")) || 0.6;

// Pending candidate tracking for confirmation/debounce
let pendingCandidateName = null;
let pendingCandidateCount = 0;
let pendingCandidatePcs = [];

// Toggle: show octave labels and doubled-note styling (default true)
settings.showOctaves = localStorage.getItem("set-show-octave") === null ? true : (localStorage.getItem("set-show-octave") === "true");
// Toggle: compact cascade view to fit more notes per row
settings.compactCascade = localStorage.getItem("set-compact-cascade") === "true";

const currentDisplay = document.getElementById("current-chord");
const noteContainer = document.getElementById("note-composition-container");
const waterfallTerminal = document.getElementById("waterfall-terminal");

const toggleBtn = document.getElementById("settings-toggle");
const overlay = document.getElementById("settings-overlay");
const closeBtn = document.getElementById("settings-close");

if (navigator.requestMIDIAccess) {
    navigator.requestMIDIAccess().then(onMIDISuccess, onMIDIFailure);
} else {
    alert("Web MIDI API not supported. Please launch using Google Chrome.");
}

function onMIDISuccess(midiAccess) {
    console.log("MIDI Engine Online.");
    for (let input of midiAccess.inputs.values()) {
        input.onmidimessage = handleMIDIMessage;
    }
}
function onMIDIFailure() { console.error("Could not access system MIDI units."); }

function handleMIDIMessage(message) {
    const statusByte = message.data[0];
    const command = statusByte & 0xf0;
    const channel = statusByte & 0x0f; 
    const note = message.data[1];
    const velocity = message.data.length > 2 ? message.data[2] : 0;

    // Note On
    if (command === 0x90 && velocity > 0) {
        channelActiveNotes[channel].add(note);
        triggerBuffer();
    } 
    // Note Off
    else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
        channelActiveNotes[channel].delete(note);
        channelBendingDirections[channel].delete(note);
        triggerBuffer();
    }
    // Pitch Bend Message
    else if (command === 0xE0) {
        const lsb = message.data[1];
        const msb = message.data[2];
        const rawBendValue = (msb << 7) | lsb; 
        
        const bendOffset = rawBendValue - 8192;
        channelPitchBends[channel] = bendOffset;

        const activeNotesArray = Array.from(channelActiveNotes[channel]);
        if (activeNotesArray.length > 0) {
            const currentStringNote = activeNotesArray[activeNotesArray.length - 1];
            
            if (rawBendValue > 8240) {
                channelBendingDirections[channel].set(currentStringNote, "up");
            } else if (rawBendValue < 8144) {
                channelBendingDirections[channel].set(currentStringNote, "down");
            } else {
                channelBendingDirections[channel].delete(currentStringNote);
            }
        }
        triggerBuffer();
    }
}

function triggerBuffer() {
    if (bufferTimeout) clearTimeout(bufferTimeout);
    bufferTimeout = setTimeout(() => {
        const newlyDetectedChord = processChords();
        commitInstantSnapshotToWaterfall(newlyDetectedChord);
    }, BUFFER_WINDOW_MS);
}

function getQuantizedActiveNotes() {
    let resolvedNotes = new Set();
    
    for (let ch = 0; ch < 16; ch++) {
        const baseNotes = Array.from(channelActiveNotes[ch]);
        if (baseNotes.length === 0) continue;
        
        const currentBendOffset = channelPitchBends[ch];
        const semitoneShift = Math.round((currentBendOffset / 8192) * 2.0);
        
        baseNotes.forEach(rawNote => {
            const quantizedNote = rawNote + semitoneShift;
            resolvedNotes.add(quantizedNote);
        });
    }
    return Array.from(resolvedNotes).sort((a, b) => a - b);
}

function _normalizePitchClassFromMidi(midi) {
    let full = Midi.midiToNoteName(midi);
    let pc = full.replace(/\d/, '');
    if (pc === "A#") pc = "Bb";
    if (pc === "D#") pc = "Eb";
    if (pc === "G#") pc = "Ab";
    if (pc === "C#") pc = "Db";
    return pc.toUpperCase();
}

/**
 * Filter transient/ghost notes that are likely sustained from the previous accepted chord.
 * Rules:
 * - If there's a previous accepted chord (`frozenMidiPitches`) and the current active set
 *   mostly overlaps that chord (>=60% of previous pitch-classes), then drop any new
 *   singleton pitch-classes that are not part of the previous chord. This reduces
 *   false-positive chord detections caused by sustain, hammers, pull-offs and glissandi.
 */
function filterGhostNotes(calculatedPitches) {
    if (!currentChordName || !frozenMidiPitches || frozenMidiPitches.length === 0) return calculatedPitches;

    const HOLD_MS = settings.ghostHoldMs || 300; // time window after accepting a chord where we are stricter about transitions
    const now = Date.now();

    const prevPCs = new Set(frozenMidiPitches.map(_normalizePitchClassFromMidi));
    if (prevPCs.size === 0) return calculatedPitches;

    const currPCList = calculatedPitches.map(_normalizePitchClassFromMidi);
    const currPCs = new Set(currPCList);

    // compute overlap
    const sharedCount = Array.from(prevPCs).filter(x => currPCs.has(x)).length;
    const overlapRatio = sharedCount / prevPCs.size;
    const overlapThreshold = (settings.ghostOverlapPct || 60) / 100.0;

    // If large overlap and only a few new pitch classes appeared, consider them transient.
    // Be stricter within the short HOLD_MS window immediately after accepting a chord.
    const newPCs = Array.from(currPCs).filter(x => !prevPCs.has(x));
    const newCount = newPCs.length;

    const withinHold = (now - lastAcceptedChordTime) <= HOLD_MS;

    if (overlapRatio >= overlapThreshold && currPCs.size <= prevPCs.size + 1) {
        const counts = {};
        currPCList.forEach(pc => counts[pc] = (counts[pc] || 0) + 1);

        const filtered = calculatedPitches.filter(midi => {
            const pc = _normalizePitchClassFromMidi(midi);
            if (prevPCs.has(pc)) return true; // keep sustained chord tones
            // keep if the new pitch-class appears multiple times (likely intentional)
            if ((counts[pc] || 0) > 1) return true;
            // If this is a singleton new pitch-class:
            // - drop it when we're still within the HOLD_MS window (likely transient)
            // - otherwise keep it (player may have intentionally added a single note)
            if (newCount <= 1) {
                if (withinHold) return false; // drop transient during hold
                return true; // outside hold, keep single additions
            }
            // Default: keep
            return true;
        });

        // If we removed some notes, return the filtered set
        if (filtered.length !== calculatedPitches.length) {
            try { console.log('[GhostFilter] original=', calculatedPitches, 'filtered=', filtered, 'prev=', frozenMidiPitches); } catch (e) {}
            return filtered;
        }
    }

    return calculatedPitches;
}

function createNewWaterfallLineContainer() {
    const newRow = document.createElement("div");
    newRow.classList.add("waterfall-row");
    newRow.style.display = "flex";
    newRow.style.alignItems = "center";
    newRow.style.justifyContent = "space-between";
    newRow.style.padding = "6px 0";
    newRow.style.borderBottom = "1px solid rgba(255,255,255,0.05)";

    // Left column holds sequences / note bricks and can wrap
    const leftCol = document.createElement('div');
    leftCol.classList.add('wf-left');
    leftCol.style.display = 'flex';
    leftCol.style.flexWrap = 'wrap';
    leftCol.style.alignItems = 'center';
    leftCol.style.gap = '6px';
    leftCol.style.flex = '1 1 auto';

    // Right column holds the chord label for the row
    const rightCol = document.createElement('div');
    rightCol.classList.add('wf-right');
    // give chord labels more room so long names don't get truncated
    rightCol.style.minWidth = '24%';
    rightCol.style.maxWidth = '40%';
    rightCol.style.display = 'flex';
    rightCol.style.justifyContent = 'flex-end';
    rightCol.style.alignItems = 'center';

    newRow.appendChild(leftCol);
    newRow.appendChild(rightCol);

    insertAtTop(newRow);
    currentActiveWaterfallRow = newRow;
    currentActiveWaterfallLeft = leftCol;
    currentActiveWaterfallRight = rightCol;
    activeRowTrackLength = 0;

    pruneWaterfallOverflow();
}

function pruneWaterfallOverflow() {
    while (waterfallTerminal.children.length > MAX_WATERFALL_ROWS) {
        waterfallTerminal.removeChild(waterfallTerminal.lastChild);
    }
}

function commitInstantSnapshotToWaterfall(confirmedChordName) {
    const activePitches = getQuantizedActiveNotes();
    if (activePitches.length === 0) return;

    const displayChordLabel = confirmedChordName || currentChordName;

    // Keep octave-distinct pitches for UI (do not collapse duplicates across octaves)
    const filteredPitchesForUI = activePitches.slice();

    // Build standard pitch label arrays
    const notesStringArray = [];
    filteredPitchesForUI.forEach(midi => {
        let noteName = Midi.midiToNoteName(midi).replace(/\d/, '');
        noteName = noteName.substring(0, 1).toUpperCase() + noteName.substring(1);
        
        if (noteName === "A#") noteName = "Bb";
        if (noteName === "D#") noteName = "Eb";
        if (noteName === "G#") noteName = "Ab";
        if (noteName === "C#") noteName = "Db";
        
        let detectedDirection = null;
        for (let ch = 0; ch < 16; ch++) {
            if (channelBendingDirections[ch].has(midi)) {
                detectedDirection = channelBendingDirections[ch].get(midi);
                break;
            }
            const currentBendOffset = channelPitchBends[ch];
            const semitoneShift = Math.round((currentBendOffset / 8192) * 2.0);
            const baseFretEstimate = midi - semitoneShift;
            if (channelBendingDirections[ch].has(baseFretEstimate)) {
                detectedDirection = channelBendingDirections[ch].get(baseFretEstimate);
                break;
            }
        }

        if (detectedDirection === "up") noteName += "↗";
        else if (detectedDirection === "down") noteName += "↘";
        
        notesStringArray.push(noteName);
    });

    const formattedNotesText = `[${notesStringArray.join(" ")}]`;

    // Create a canonical JSON representation of the pitch list and chord for duplicate detection
    const pitchListKey = JSON.stringify(filteredPitchesForUI);
    const chordLabelKey = displayChordLabel || '';

    // ==========================================
    // VIEW MODE 1: ORIGINAL VERTICAL EVENT STREAM
    // ==========================================
    if (settings.waterfallMode === "stream") {
        // Create a single two-column row with notes on the left and chord label on the right
        const newRow = document.createElement('div');
        newRow.classList.add('waterfall-row');
        newRow.style.display = 'flex';
        newRow.style.alignItems = 'center';
        newRow.style.justifyContent = 'space-between';
        newRow.style.padding = '6px 0';
        newRow.style.borderBottom = '1px solid rgba(255,255,255,0.05)';

        const leftCol = document.createElement('div');
        leftCol.classList.add('wf-left');
        leftCol.style.display = 'flex';
        leftCol.style.gap = '6px';
        leftCol.style.flexWrap = 'wrap';
        leftCol.style.alignItems = 'center';
        leftCol.style.flex = '1 1 auto';

        const rightCol = document.createElement('div');
        rightCol.classList.add('wf-right');
        rightCol.style.minWidth = '24%';
        rightCol.style.maxWidth = '40%';
        rightCol.style.display = 'flex';
        rightCol.style.justifyContent = 'flex-end';
        rightCol.style.alignItems = 'center';

        const polyphonyCount = filteredPitchesForUI.length;
        newRow.setAttribute('data-count', polyphonyCount > 6 ? 6 : polyphonyCount);
        newRow.dataset.pitches = pitchListKey;
        newRow.dataset.chord = chordLabelKey;

        // Don't append duplicate consecutive rows (same pitch-group and same chord label)
        const top = waterfallTerminal.firstElementChild;
        if (top && top.dataset && top.dataset.pitches === newRow.dataset.pitches && top.dataset.chord === newRow.dataset.chord) {
            return; // skip duplicate
        }

        notesStringArray.forEach(noteStr => {
            const brickEl = document.createElement('div');
            brickEl.classList.add('wf-note-brick');
            if (noteStr.includes('↗') || noteStr.includes('↘')) {
                brickEl.classList.add('bending-note');
            }
            brickEl.textContent = noteStr;
            leftCol.appendChild(brickEl);
        });

        if (displayChordLabel && displayChordLabel !== lastWaterfallChordName) {
            const chordEl = document.createElement('div');
            chordEl.classList.add('waterfall-chord-row');
            chordEl.style.margin = '0';
            chordEl.style.background = 'transparent';
            chordEl.style.border = 'none';
            chordEl.textContent = displayChordLabel;
            rightCol.appendChild(chordEl);
            lastWaterfallChordName = displayChordLabel;
        }

        newRow.appendChild(leftCol);
        newRow.appendChild(rightCol);
        insertAtTop(newRow);
        pruneWaterfallOverflow();
        return;
    }

    // ==========================================
    // VIEW MODE 2: HORIZONTAL PHRASE WRAPPING
    // ==========================================
    if (!currentActiveWaterfallRow) {
        createNewWaterfallLineContainer();
    }

    const sequenceGroupEl = document.createElement("div");
    sequenceGroupEl.style.display = "inline-flex";
    sequenceGroupEl.style.alignItems = "center";
    sequenceGroupEl.style.gap = "4px";
    sequenceGroupEl.style.marginRight = "4px";

    if (displayChordLabel && displayChordLabel !== lastWaterfallChordName) {
        // Start a fresh waterfall row for any row that carries a chord label so
        // the right-column label is vertically aligned with the left note-group.
        // This prevents misalignment when the left column wraps across multiple
        // visual lines inside a single flex container.
        createNewWaterfallLineContainer();

        const chordLabelTag = document.createElement("span");
        chordLabelTag.style.fontWeight = "bold";
        chordLabelTag.style.color = "#ffffff";
        chordLabelTag.style.background = "rgba(255,255,255,0.15)";
        chordLabelTag.style.padding = "1px 5px";
        chordLabelTag.style.borderRadius = "3px";
        chordLabelTag.style.fontSize = "0.85rem";
        chordLabelTag.textContent = displayChordLabel;
        chordLabelTag.classList.add('waterfall-chord-row'); // Add class for phrase mode styling

        // Place chord label into the right column for the new active row
        if (currentActiveWaterfallRight) {
            currentActiveWaterfallRight.innerHTML = '';
            currentActiveWaterfallRight.appendChild(chordLabelTag);
        }

        lastWaterfallChordName = displayChordLabel;
        // reset track length for the new row
        activeRowTrackLength = displayChordLabel.length + 2;
    }

    // Build note bricks for phrase mode so we can control bricks per row
    const notesGroup = document.createElement('div');
    notesGroup.style.display = 'inline-flex';
    notesGroup.style.gap = '6px';
    notesGroup.style.alignItems = 'center';
    notesGroup.classList.add('phrase-notes-group');

    notesStringArray.forEach(noteStr => {
        const brickEl = document.createElement('div');
        brickEl.classList.add('wf-note-brick');
        if (noteStr.includes('↗') || noteStr.includes('↘')) brickEl.classList.add('bending-note');
        brickEl.textContent = noteStr;
        notesGroup.appendChild(brickEl);
    });
    sequenceGroupEl.appendChild(notesGroup);

    // For duplicate suppression, check the top-most row (newest). If it has identical
    // pitch-list and chord label, skip appending to avoid duplicate rows.
    const newestRow = waterfallTerminal.firstElementChild;
    if (newestRow && newestRow.dataset && newestRow.dataset.pitches === pitchListKey && newestRow.dataset.chord === chordLabelKey) {
        return; // duplicate; do not append
    }

    // Otherwise tag the current active row so future checks can compare
    if (currentActiveWaterfallRow) {
        currentActiveWaterfallRow.dataset.pitches = pitchListKey;
        currentActiveWaterfallRow.dataset.chord = chordLabelKey;
    }

    activeRowTrackLength += notesStringArray.join(' ').length;

    // Ensure up to 6 note bricks per left column row (count existing bricks)
    const existingBricks = currentActiveWaterfallLeft ? currentActiveWaterfallLeft.querySelectorAll('.wf-note-brick').length : 0;
    const newBricks = notesStringArray.length;
    const maxBricks = 6;

    if (existingBricks + newBricks > maxBricks) {
        // Try autoshrink to fit up to maxBricks when not in compact mode
        let appended = false;
        if (!settings.compactCascade && currentActiveWaterfallLeft) {
            appended = tryAutoshrinkAppend(currentActiveWaterfallLeft, sequenceGroupEl, notesGroup, maxBricks);
        }

        if (!appended) {
            createNewWaterfallLineContainer();
            if (currentActiveWaterfallLeft) currentActiveWaterfallLeft.appendChild(sequenceGroupEl);
            activeRowTrackLength = displayChordLabel.length + notesStringArray.join(' ').length;
            // tag the row with the pitch/chord keys so duplicates are detectable
            if (currentActiveWaterfallRow) {
                currentActiveWaterfallRow.dataset.pitches = pitchListKey;
                currentActiveWaterfallRow.dataset.chord = chordLabelKey;
            }
        }
    } else {
        if (currentActiveWaterfallLeft && currentActiveWaterfallLeft.children.length > 0) {
            const delimiterSpan = document.createElement("span");
            delimiterSpan.style.color = "rgba(255,255,255,0.25)";
            delimiterSpan.style.margin = "0 2px";
            delimiterSpan.textContent = "➔";
            currentActiveWaterfallLeft.appendChild(delimiterSpan);
            activeRowTrackLength += 2;
        }
        if (currentActiveWaterfallLeft) currentActiveWaterfallLeft.appendChild(sequenceGroupEl);
        if (currentActiveWaterfallRow) {
            currentActiveWaterfallRow.dataset.pitches = pitchListKey;
            currentActiveWaterfallRow.dataset.chord = chordLabelKey;
        }
    }

    // Show lightweight diagnostic overlay for this appended snapshot
    try { showDiagnosticOverlay(displayChordLabel, filteredPitchesForUI); } catch (e) {}
}

function insertAtTop(element) {
    if (waterfallTerminal.firstChild) {
        waterfallTerminal.insertBefore(element, waterfallTerminal.firstChild);
    } else {
        waterfallTerminal.appendChild(element);
    }
}

// Diagnostic overlay for quick on-screen debugging of what pitch-group produced the
// chord label. Hidden by default; populated briefly when a snapshot is committed.
function ensureDiagnosticOverlay() {
    let ov = document.getElementById('diagnostic-overlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'diagnostic-overlay';
    ov.style.position = 'fixed';
    ov.style.right = '12px';
    ov.style.top = '12px';
    ov.style.zIndex = '9999';
    ov.style.background = 'rgba(0,0,0,0.6)';
    ov.style.color = '#fff';
    ov.style.padding = '6px 8px';
    ov.style.borderRadius = '6px';
    ov.style.fontSize = '12px';
    ov.style.pointerEvents = 'none';
    ov.style.maxWidth = '320px';
    ov.style.display = 'none';
    document.body.appendChild(ov);
    return ov;
}

function showDiagnosticOverlay(chordLabel, pitchList) {
    const ov = ensureDiagnosticOverlay();
    if (!ov) return;
    let text = '';
    if (chordLabel) text += `Chord: ${chordLabel}`;
    if (pitchList && pitchList.length > 0) {
        const names = pitchList.map(m => Midi.midiToNoteName(m).replace(/\d/, ''));
        text += `\nPitches: [${names.join(' ')}]`;
    }
    ov.textContent = text;
    ov.style.display = 'block';
    // auto-hide after 1.8s
    setTimeout(() => { ov.style.display = 'none'; }, 1800);
}

/**
 * Attempt to autoshrink `notesGroup` inside `leftCol` so up to `maxBricks` fit.
 * Returns true if appended successfully (possibly scaled), false if it did not fit.
 */
function tryAutoshrinkAppend(leftCol, sequenceGroupEl, notesGroup, maxBricks) {
    if (!leftCol) return false;

    // Temporary append hidden to measure
    sequenceGroupEl.style.visibility = 'hidden';
    leftCol.appendChild(sequenceGroupEl);

    const bricks = leftCol.querySelectorAll('.wf-note-brick');
    const existingBricks = bricks.length - notesGroup.querySelectorAll('.wf-note-brick').length; // previous count
    const newBricks = notesGroup.querySelectorAll('.wf-note-brick').length;

    // If total bricks > maxBricks, try to shrink
    if (existingBricks + newBricks > maxBricks) {
        const leftWidth = leftCol.clientWidth || leftCol.getBoundingClientRect().width;
        const notesWidth = notesGroup.getBoundingClientRect().width;

        if (notesWidth === 0) {
            // fallback: remove and fail
            leftCol.removeChild(sequenceGroupEl);
            return false;
        }

        const minScale = 0.7; // don't shrink below this
        let scale = Math.min(1, leftWidth / notesWidth);
        scale = Math.max(minScale, scale);

        notesGroup.style.transform = `scale(${scale})`;
        // Re-measure after scaling
        const scaledWidth = notesGroup.getBoundingClientRect().width;
        const totalBricksAfter = existingBricks + newBricks;

        if (scaledWidth <= leftWidth && totalBricksAfter <= maxBricks) {
            sequenceGroupEl.style.visibility = 'visible';
            return true;
        }
        // If scaling to minScale didn't fit, revert and fail
        notesGroup.style.transform = '';
        leftCol.removeChild(sequenceGroupEl);
        return false;
    }

    // Otherwise OK: make visible and done
    sequenceGroupEl.style.visibility = 'visible';
    return true;
}

function processChords() {
    const calculatedPitches = getQuantizedActiveNotes();
    
    if (calculatedPitches.length === 0) {
        updateUI(false); 
        return null;
    }

    let activeBendsList = [];
    for (let ch = 0; ch < 16; ch++) {
        activeBendsList.push(...Array.from(channelBendingDirections[ch].keys()));
    }

    // Filter ghost/transient notes using the previous accepted chord as context
    const cleanedPitches = filterGhostNotes(calculatedPitches);
    const noteNamesWithOctaves = cleanedPitches.map(midi => Midi.midiToNoteName(midi));
    let uniqueNoteLetters = Array.from(new Set(noteNamesWithOctaves.map(n => n.replace(/\d/, '').toUpperCase())));
    const lowestNoteName = noteNamesWithOctaves[0] ? noteNamesWithOctaves[0].replace(/\d/, '') : '';

    const detectedChords = Chord.detect(noteNamesWithOctaves) || [];

    // Debug output: show raw MIDI, note names and detected chord candidates
    try {
        console.log('[ProcessChords] calculatedPitches=', calculatedPitches, 'noteNames=', noteNamesWithOctaves, 'candidates=', detectedChords);
    } catch (e) {}

    // Prefer candidates whose root matches the lowest (bass) note when present
    function _normalizeRootLetter(letter) {
        if (!letter) return '';
        let l = letter.toUpperCase();
        if (l === 'A#') l = 'BB';
        if (l === 'D#') l = 'EB';
        if (l === 'G#') l = 'AB';
        if (l === 'C#') l = 'DB';
        // normalize flats as two-letter tokens to avoid clash with sharps
        if (l.length === 1) return l;
        return l;
    }

    function chordRootFromName(name) {
        if (!name) return '';
        const base = name.split('/')[0];
        const m = base.match(/[A-G][b#]?/i);
        return m ? m[0] : '';
    }

    const lowestRoot = lowestNoteName ? _normalizeRootLetter(lowestNoteName.replace(/\s+/g, '')) : '';
    // Build pitch-class set for current detection
    const activePcSet = new Set(noteNamesWithOctaves.map(n => n.replace(/\d/, '')).map(s => {
        let x = s.toUpperCase();
        if (x === 'A#') x = 'BB'; if (x === 'D#') x = 'EB'; if (x === 'G#') x = 'AB'; if (x === 'C#') x = 'DB';
        return x;
    }));

    // Score and prioritize detected candidates: prefer candidates that include the bass pitch-class
    // and have higher overlap with the active pitch-class set.
    let prioritizedDetected = detectedChords.slice();
    if (detectedChords.length > 1) {
        try {
            const scored = detectedChords.map(cand => {
                const chordInfo = Chord.get(cand) || {};
                const chordNotes = (chordInfo.notes || chordInfo.tones || []).map(n => {
                    let t = n.replace(/\d/, '').toUpperCase();
                    if (t === 'A#') t = 'BB'; if (t === 'D#') t = 'EB'; if (t === 'G#') t = 'AB'; if (t === 'C#') t = 'DB';
                    return t;
                });
                const chordPcSet = Array.from(new Set(chordNotes));
                // overlap with active
                const overlap = chordPcSet.filter(x => activePcSet.has(x)).length;
                const overlapRatio = chordPcSet.length > 0 ? overlap / chordPcSet.length : 0;
                const hasBass = lowestRoot ? chordPcSet.includes(lowestRoot) : false;
                // score: weight bass inclusion higher, plus overlap ratio
                const score = (hasBass ? (settings.bassWeight || 4.0) : 0.0) + overlapRatio;
                return { cand, score, hasBass, overlap, chordPcSet };
            });

            scored.sort((a, b) => b.score - a.score);
            prioritizedDetected = scored.map(s => s.cand);
            try { console.log('[Priority] scored candidates=', scored); } catch (e) {}
        } catch (e) {
            prioritizedDetected = detectedChords.slice();
        }
    }

    // SUS helper: if player is fretting a sus4 voicing (root, 4, 5) prefer the sus4 candidate
    try {
        const activePcsArr = Array.from(activePcSet);
        for (const pc of activePcsArr) {
            // map two-letter flats back to single-letter for chord names (e.g., 'BB' -> 'A#' avoided)
            let rootName = pc;
            if (pc === 'BB') rootName = 'A#';
            if (pc === 'EB') rootName = 'D#';
            if (pc === 'AB') rootName = 'G#';
            if (pc === 'DB') rootName = 'C#';

            const susName = `${rootName}sus4`;
            const sus7Name = `${rootName}7sus4`;

            const susInfo = Chord.get(susName) || {};
            const susNotes = (susInfo.notes || []).map(n => {
                let x = n.replace(/\d/, '').toUpperCase();
                if (x === 'A#') x = 'BB'; if (x === 'D#') x = 'EB'; if (x === 'G#') x = 'AB'; if (x === 'C#') x = 'DB';
                return x;
            });

            const sus7Info = Chord.get(sus7Name) || {};
            const sus7Notes = (sus7Info.notes || []).map(n => {
                let x = n.replace(/\d/, '').toUpperCase();
                if (x === 'A#') x = 'BB'; if (x === 'D#') x = 'EB'; if (x === 'G#') x = 'AB'; if (x === 'C#') x = 'DB';
                return x;
            });

            const susOk = susNotes.length > 0 && susNotes.every(x => activePcSet.has(x));
            const sus7Ok = sus7Notes.length > 0 && sus7Notes.every(x => activePcSet.has(x));

            if (sus7Ok) {
                // prefer sus7 candidate at front
                if (!prioritizedDetected.includes(sus7Name)) prioritizedDetected.unshift(sus7Name);
                try { console.log('[SusFallback] preferring', sus7Name, 'because active contains', sus7Notes); } catch (e) {}
                break;
            }
            if (susOk) {
                if (!prioritizedDetected.includes(susName)) prioritizedDetected.unshift(susName);
                try { console.log('[SusFallback] preferring', susName, 'because active contains', susNotes); } catch (e) {}
                break;
            }
        }
    } catch (e) {}

    // Quick accept heuristic: if the top candidate's root equals the bass/root and
    // its pitch-class overlap with active notes is high enough, accept it immediately
    // to avoid excessive debounce when the player is clearly holding that chord.
    let immediateResolvedCandidate = null;
    if (prioritizedDetected.length > 0 && lowestRoot) {
        try {
            const top = prioritizedDetected[0];
            const info = Chord.get(top) || {};
            const chordNotes = (info.notes || info.tones || []).map(n => {
                let t = n.replace(/\d/, '').toUpperCase();
                if (t === 'A#') t = 'BB'; if (t === 'D#') t = 'EB'; if (t === 'G#') t = 'AB'; if (t === 'C#') t = 'DB';
                return t;
            });
            const chordPcSet = Array.from(new Set(chordNotes));
            const overlap = chordPcSet.filter(x => activePcSet.has(x)).length;
            const overlapRatio = chordPcSet.length > 0 ? overlap / chordPcSet.length : 0;
            const root = chordRootFromName(top);
            const normRoot = _normalizeRootLetter(root);
            if (normRoot === lowestRoot && overlapRatio >= 0.5) {
                immediateResolvedCandidate = top;
                try { console.log('[ImmediateAccept] accepting', top, 'rootMatch=', normRoot, 'overlap=', overlapRatio); } catch (e) {}
            }
        } catch (e) {}
    }

    let finalResolvedName = null;
    if (immediateResolvedCandidate) {
        finalResolvedName = immediateResolvedCandidate;
    } else {
        finalResolvedName = bestChordFilter(
            prioritizedDetected,
            lowestNoteName,
            cleanedPitches.length,
            uniqueNoteLetters,
            currentChordName,
            cleanedPitches,
            activeBendsList
        );
    }

    // If performance mode is enabled, or the immediate-accept heuristic fired, accept now.
    if (finalResolvedName && (settings.performanceMode || immediateResolvedCandidate)) {
        if (finalResolvedName !== currentChordName) {
            currentChordName = finalResolvedName;
            currentChordObject = Chord.get(currentChordName);
            frozenMidiPitches = [...calculatedPitches];
        }
        lastAcceptedChordTime = Date.now();
        pendingCandidateName = null;
        pendingCandidateCount = 0;
        pendingCandidatePcs = [];
    } else {
        // Confirmation/debounce logic: require the same candidate to appear N times
        // and meet a minimum pitch-class overlap percentage before accepting it.
        if (!finalResolvedName) {
            // no candidate; reset pending
            pendingCandidateName = null;
            pendingCandidateCount = 0;
            pendingCandidatePcs = [];
        } else if (finalResolvedName === currentChordName) {
            // chord unchanged: refresh frozen pitches and clear pending candidate
            frozenMidiPitches = [...calculatedPitches];
            lastAcceptedChordTime = Date.now();
            pendingCandidateName = null;
            pendingCandidateCount = 0;
            pendingCandidatePcs = [];
        } else {
            // new candidate
            const candidatePcs = cleanedPitches.map(_normalizePitchClassFromMidi);
            const candidatePcSet = Array.from(new Set(candidatePcs));

            if (pendingCandidateName === finalResolvedName) {
                pendingCandidateCount++;
            } else {
                pendingCandidateName = finalResolvedName;
                pendingCandidateCount = 1;
                pendingCandidatePcs = candidatePcSet;
            }

            // compute match ratio between last candidate pcs and current candidate pcs
            const overlap = pendingCandidatePcs.filter(x => candidatePcSet.includes(x)).length;
            const matchRatio = pendingCandidatePcs.length > 0 ? (overlap / pendingCandidatePcs.length) : 0;

            const requiredCount = settings.chordConfirmCount || 2;
            const requiredMatch = (settings.chordConfirmMatchPct || 50) / 100.0;

            if (pendingCandidateCount >= requiredCount && matchRatio >= requiredMatch) {
                // accept candidate
                currentChordName = finalResolvedName;
                currentChordObject = Chord.get(currentChordName);
                frozenMidiPitches = [...calculatedPitches];
                lastAcceptedChordTime = Date.now();
                pendingCandidateName = null;
                pendingCandidateCount = 0;
                pendingCandidatePcs = [];
            }
        }
    }

    // Sticky retention: if we did not accept a new chord, but the current active notes
    // still closely match the last accepted chord, keep the existing chord and refresh timestamp.
    if (!immediateResolvedCandidate && (!finalResolvedName || finalResolvedName !== currentChordName)) {
        if (currentChordName && frozenMidiPitches && frozenMidiPitches.length > 0) {
            const frozenPcs = new Set(frozenMidiPitches.map(_normalizePitchClassFromMidi));
            const currentPcs = new Set(cleanedPitches.map(_normalizePitchClassFromMidi));
            const shared = Array.from(frozenPcs).filter(x => currentPcs.has(x)).length;
            const retentionRatio = frozenPcs.size > 0 ? (shared / frozenPcs.size) : 0;
            if (retentionRatio >= (settings.stickyRetentionPct || 0.6)) {
                // refresh timestamp so UI retains previous chord
                lastAcceptedChordTime = Date.now();
                // update frozen pitches to current (allow slight voicing changes)
                frozenMidiPitches = [...cleanedPitches];
                try { console.log('[StickyRetention] kept', currentChordName, 'retentionRatio=', retentionRatio); } catch (e) {}
            }
        }
    }
    
    updateUI(true);
    return currentChordName;
}

function updateUI(hasActiveNotes) {
    currentDisplay.textContent = currentChordName ? currentChordName : "—";

    // Pending candidate indicator: show the pending candidate if it exists and differs
    let pendingEl = document.getElementById('pending-chord');
    if (pendingCandidateName && pendingCandidateName !== currentChordName) {
        if (!pendingEl) {
            pendingEl = document.createElement('div');
            pendingEl.id = 'pending-chord';
            pendingEl.classList.add('pending-chord');
            currentDisplay.parentElement.appendChild(pendingEl);
        }
        pendingEl.textContent = pendingCandidateName + ' …';
    } else {
        if (pendingEl) pendingEl.remove();
    }

    if (!hasActiveNotes && currentChordName) {
        currentDisplay.style.opacity = "0.25";
        noteContainer.style.opacity = "0.3";
    } else {
        currentDisplay.style.opacity = "1.0";
        noteContainer.style.opacity = "1.0";
    }

    noteContainer.innerHTML = ""; 

    if (settings.composition !== "false" && frozenMidiPitches.length > 0 && currentChordName) {
            // Build pitch-class counts so we can mark doubled notes (same note class across octaves)
            const pitchClassCounts = {};
            frozenMidiPitches.forEach(midi => {
                const fullNoteTmp = Midi.midiToNoteName(midi);
                const basicTmp = fullNoteTmp.replace(/\d/, '');
                let normTmp = basicTmp.toUpperCase();
                if (normTmp === "A#") normTmp = "BB";
                if (normTmp === "D#") normTmp = "EB";
                if (normTmp === "G#") normTmp = "AB";
                if (normTmp === "C#") normTmp = "DB";
                pitchClassCounts[normTmp] = (pitchClassCounts[normTmp] || 0) + 1;
            });

            // Render each pressed note and show octave label; mark doubled classes
            frozenMidiPitches.forEach((midi, index) => {
                const fullNote = Midi.midiToNoteName(midi);
                const basicLetter = fullNote.replace(/\d/, '');
                let normalizedLetter = basicLetter.toUpperCase();

                if (normalizedLetter === "A#") normalizedLetter = "BB";
                if (normalizedLetter === "D#") normalizedLetter = "EB";
                if (normalizedLetter === "G#") normalizedLetter = "AB";
                if (normalizedLetter === "C#") normalizedLetter = "DB";

                const octaveMatch = fullNote.match(/\d+/);
                const octave = octaveMatch ? octaveMatch[0] : '';
                const isDoubled = (pitchClassCounts[normalizedLetter] || 0) > 1;
                
                const noteBox = document.createElement("div");
                noteBox.classList.add("note-box");
                if (isDoubled && settings.showOctaves) noteBox.classList.add("note-box-doubled");

                let styledName = basicLetter.substring(0, 1).toUpperCase() + basicLetter.substring(1);
                if (styledName === "A#") styledName = "Bb";
                if (styledName === "D#") styledName = "Eb";
                if (styledName === "G#") styledName = "Ab";
                if (styledName === "C#") styledName = "Db";

                if (settings.composition === "notes") {
                    noteBox.textContent = styledName;
                } else if (settings.composition === "degrees" && currentChordObject) {
                    const intervalDistance = (currentChordObject.intervals && currentChordObject.intervals[index]) ? currentChordObject.intervals[index] : "•";
                    noteBox.textContent = intervalDistance;
                }

                // Small octave label in the corner (if enabled)
                if (settings.showOctaves) {
                    const octaveSpan = document.createElement('span');
                    octaveSpan.classList.add('octave-label');
                    octaveSpan.textContent = octave;
                    noteBox.appendChild(octaveSpan);
                }

                if (index === 0) noteBox.classList.add("bass-note");
                noteContainer.appendChild(noteBox);
            });
    }

    adjustFontSize(currentDisplay);
}

function adjustFontSize(element) {
    const parent = element.parentElement;
    if (!parent || element.textContent === "—" || !element.textContent) return;

    let parentWidth = parent.clientWidth;
    if (parentWidth <= 0) {
        parentWidth = window.innerWidth * 0.70; 
    }
    const maxAllowableTextWidth = parentWidth * 0.88;

    const text = element.textContent;
    const charCount = text.length;

    let scalarBase = 0.58; 
    if (charCount <= 2) scalarBase = 0.65;
    if (charCount >= 5) scalarBase = 0.52;
    if (charCount >= 7) scalarBase = 0.46;

    const calculatedPxSize = (maxAllowableTextWidth / charCount) * scalarBase;
    const vwConversion = (calculatedPxSize / window.innerWidth) * 100;

    let boundedFinalVw = Math.max(settings.minFont, Math.min(settings.maxFont, vwConversion));
    if (charCount >= 5) {
        boundedFinalVw = Math.min(boundedFinalVw, 22);
    }

    element.style.fontSize = boundedFinalVw + "vw";
}

function initializeSettingsPanel() {
    document.getElementById("set-composition").value = settings.composition;
    document.getElementById("set-theme").value = settings.theme;
    document.getElementById("set-font").value = settings.font;
    document.getElementById("set-min-font").value = settings.minFont;
    document.getElementById("set-max-font").value = settings.maxFont;
    document.getElementById("set-waterfall-mode").value = settings.waterfallMode;
    document.getElementById("set-show-octave").checked = !!settings.showOctaves;
    document.getElementById("set-compact-cascade").checked = !!settings.compactCascade;
    document.getElementById("set-ghost-hold").value = settings.ghostHoldMs;
    document.getElementById("ghost-hold-val").textContent = settings.ghostHoldMs;
    document.getElementById("set-ghost-overlap").value = settings.ghostOverlapPct;
    document.getElementById("ghost-overlap-val").textContent = settings.ghostOverlapPct;
    document.getElementById("set-confirm-count").value = settings.chordConfirmCount;
    document.getElementById("confirm-count-val").textContent = settings.chordConfirmCount;
    document.getElementById("set-confirm-match").value = settings.chordConfirmMatchPct;
    document.getElementById("confirm-match-val").textContent = settings.chordConfirmMatchPct;
    document.getElementById("set-bass-weight").value = settings.bassWeight;
    document.getElementById("bass-weight-val").textContent = settings.bassWeight;
    document.getElementById("set-sticky-retention").value = Math.round((settings.stickyRetentionPct || 0.6) * 100);
    document.getElementById("sticky-retention-val").textContent = Math.round((settings.stickyRetentionPct || 0.6) * 100);

    document.getElementById("min-font-val").textContent = settings.minFont;
    document.getElementById("max-font-val").textContent = settings.maxFont;

    document.body.setAttribute("data-theme", settings.theme);
    document.body.setAttribute("data-font", settings.font);
    if (settings.compactCascade) document.body.classList.add('compact-cascade');
    else document.body.classList.remove('compact-cascade');
    updateUI(false);
}

toggleBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
closeBtn.addEventListener("click", () => { overlay.classList.add("hidden"); updateUI(false); });
overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.classList.add("hidden"); updateUI(false); } });

document.getElementById("set-composition").addEventListener("change", (e) => {
    settings.composition = e.target.value;
    localStorage.setItem("set-composition", settings.composition);
    updateUI(false);
});
document.getElementById("set-theme").addEventListener("change", (e) => {
    settings.theme = e.target.value;
    localStorage.setItem("set-theme", settings.theme);
    document.body.setAttribute("data-theme", settings.theme);
    updateUI(false);
});
document.getElementById("set-font").addEventListener("change", (e) => {
    settings.font = e.target.value;
    localStorage.setItem("set-font", settings.font);
    document.body.setAttribute("data-font", settings.font);
    updateUI();
});
document.getElementById("set-waterfall-mode").addEventListener("change", (e) => {
    settings.waterfallMode = e.target.value;
    localStorage.setItem("set-waterfall-mode", settings.waterfallMode);
    waterfallTerminal.innerHTML = ""; // Flush stream layout tracking nodes on view shift
    currentActiveWaterfallRow = null;
    activeRowTrackLength = 0;
    updateUI(false);
});
document.getElementById("set-show-octave").addEventListener("change", (e) => {
    settings.showOctaves = !!e.target.checked;
    localStorage.setItem("set-show-octave", settings.showOctaves ? "true" : "false");
    updateUI(false);
});
document.getElementById("set-compact-cascade").addEventListener("change", (e) => {
    settings.compactCascade = !!e.target.checked;
    localStorage.setItem("set-compact-cascade", settings.compactCascade ? "true" : "false");
    if (settings.compactCascade) document.body.classList.add('compact-cascade'); else document.body.classList.remove('compact-cascade');
    waterfallTerminal.innerHTML = '';
    currentActiveWaterfallRow = null;
    currentActiveWaterfallLeft = null;
    currentActiveWaterfallRight = null;
    activeRowTrackLength = 0;
    updateUI(false);
});
document.getElementById("set-ghost-hold").addEventListener("input", (e) => {
    settings.ghostHoldMs = parseInt(e.target.value);
    document.getElementById("ghost-hold-val").textContent = settings.ghostHoldMs;
    localStorage.setItem("set-ghost-hold-ms", settings.ghostHoldMs);
});

document.getElementById("set-ghost-overlap").addEventListener("input", (e) => {
    settings.ghostOverlapPct = parseFloat(e.target.value);
    document.getElementById("ghost-overlap-val").textContent = settings.ghostOverlapPct;
    localStorage.setItem("set-ghost-overlap-pct", settings.ghostOverlapPct);
});
document.getElementById("set-confirm-count").addEventListener("input", (e) => {
    settings.chordConfirmCount = parseInt(e.target.value);
    document.getElementById("confirm-count-val").textContent = settings.chordConfirmCount;
    localStorage.setItem("set-chord-confirm-count", settings.chordConfirmCount);
});

document.getElementById("set-confirm-match").addEventListener("input", (e) => {
    settings.chordConfirmMatchPct = parseFloat(e.target.value);
    document.getElementById("confirm-match-val").textContent = settings.chordConfirmMatchPct;
    localStorage.setItem("set-chord-confirm-match-pct", settings.chordConfirmMatchPct);
});
document.getElementById("set-bass-weight").addEventListener("input", (e) => {
    settings.bassWeight = parseFloat(e.target.value);
    document.getElementById("bass-weight-val").textContent = settings.bassWeight.toFixed(1);
    localStorage.setItem("set-bass-weight", settings.bassWeight);
});
document.getElementById("set-sticky-retention").addEventListener("input", (e) => {
    const pct = parseFloat(e.target.value) / 100.0;
    settings.stickyRetentionPct = pct;
    document.getElementById("sticky-retention-val").textContent = Math.round(pct * 100);
    localStorage.setItem("set-sticky-retention-pct", pct);
});
document.getElementById("set-min-font").addEventListener("input", (e) => {
    settings.minFont = parseFloat(e.target.value);
    document.getElementById("min-font-val").textContent = settings.minFont;
    localStorage.setItem("set-min-font", settings.minFont);
    updateUI(false);
});
document.getElementById("set-max-font").addEventListener("input", (e) => {
    settings.maxFont = parseFloat(e.target.value);
    document.getElementById("max-font-val").textContent = settings.maxFont;
    localStorage.setItem("set-max-font", settings.maxFont);
    updateUI(false);
});

const centerZoneEl = document.getElementById("center-zone");
if (centerZoneEl) {
    const resizeObserver = new ResizeObserver(() => {
        adjustFontSize(currentDisplay);
    });
    resizeObserver.observe(centerZoneEl);
}

initializeSettingsPanel();