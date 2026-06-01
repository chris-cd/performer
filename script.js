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

// Persistent trackers for horizontal packing engine
let activeRowTrackLength = 0;
let currentActiveWaterfallRow = null;

const settings = {
    composition: localStorage.getItem("set-composition") || "degrees",
    theme: localStorage.getItem("set-theme") || "bw-dark",
    font: localStorage.getItem("set-font") || "system",
    minFont: parseFloat(localStorage.getItem("set-min-font")) || 6,
    maxFont: parseFloat(localStorage.getItem("set-max-font")) || 38,
    waterfallMode: localStorage.getItem("set-waterfall-mode") || "phrase" // Defaulting to the readable phrase layout
};

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

function pruneWaterfallOverflow() {
    while (waterfallNotesColumn.children.length > MAX_WATERFALL_ROWS) {
        waterfallNotesColumn.removeChild(waterfallNotesColumn.lastChild);
    }
    while (waterfallChordsColumn.children.length > MAX_WATERFALL_ROWS) {
        waterfallChordsColumn.removeChild(waterfallChordsColumn.lastChild);
    }
}

// A generalized helper to insert an element at the top of a given container
function insertAtTop(element, container) {
    if (container.firstChild) {
        container.insertBefore(element, container.firstChild);
    } else {
        container.appendChild(element);
    }
}

function commitInstantSnapshotToWaterfall(confirmedChordName) {
    const activePitches = getQuantizedActiveNotes();
    const displayChordLabel = confirmedChordName || currentChordName;

    // --- Notes Column Logic ---
    const notesRowEl = document.createElement("div");
    notesRowEl.classList.add("wf-row-entry", "wf-note-row");
    
    if (activePitches.length === 0) {
        // Display an empty or placeholder row if no notes are active
        notesRowEl.textContent = "—";
        notesRowEl.style.opacity = "0.3";
    } else {
        const uniqueClassTracker = new Set();
        const filteredPitchesForUI = activePitches.filter(pitch => {
            let name = Midi.midiToNoteName(pitch).replace(/\d/, '').toUpperCase();
            if (name === "A#") name = "BB";
            if (name === "D#") name = "EB";
            if (name === "G#") name = "AB";
            if (name === "C#") name = "DB";
            if (uniqueClassTracker.has(name)) return false;
            uniqueClassTracker.add(name);
            return true;
        });

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

        const polyphonyCount = filteredPitchesForUI.length;
        notesRowEl.setAttribute("data-count", polyphonyCount > 6 ? 6 : polyphonyCount);

        notesStringArray.forEach(noteStr => {
            const brickEl = document.createElement("div");
            brickEl.classList.add("wf-note-brick");
            if (noteStr.includes("↗") || noteStr.includes("↘")) {
                brickEl.classList.add("bending-note");
            }
            brickEl.textContent = noteStr;
            notesRowEl.appendChild(brickEl);
        });
    }

    insertAtTop(notesRowEl, waterfallNotesColumn);


    // --- Chords Column Logic ---
    const chordRowEl = document.createElement("div");
    chordRowEl.classList.add("wf-row-entry", "wf-chord-entry");

    if (displayChordLabel) {
        chordRowEl.textContent = displayChordLabel;
        lastWaterfallChordName = displayChordLabel; // Update lastWaterfallChordName here
    } else {
        chordRowEl.textContent = "—"; // Placeholder if no chord is detected
        chordRowEl.style.opacity = "0.3";
    }
    
    insertAtTop(chordRowEl, waterfallChordsColumn);

    pruneWaterfallOverflow();
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

    const noteNamesWithOctaves = calculatedPitches.map(midi => Midi.midiToNoteName(midi));
    let uniqueNoteLetters = Array.from(new Set(noteNamesWithOctaves.map(n => n.replace(/\d/, '').toUpperCase())));
    const lowestNoteName = noteNamesWithOctaves[0].replace(/\d/, '');

    const detectedChords = Chord.detect(noteNamesWithOctaves) || [];

    const finalResolvedName = bestChordFilter(
        detectedChords, 
        lowestNoteName, 
        calculatedPitches.length, 
        uniqueNoteLetters, 
        currentChordName, 
        calculatedPitches,
        activeBendsList
    );

    if (finalResolvedName && finalResolvedName !== currentChordName) {
        currentChordName = finalResolvedName;
        currentChordObject = Chord.get(currentChordName);
        frozenMidiPitches = [...calculatedPitches]; 
    } else if (!currentChordName && finalResolvedName) {
        currentChordName = finalResolvedName;
        currentChordObject = Chord.get(currentChordName);
        frozenMidiPitches = [...calculatedPitches];
    }
    
    updateUI(true);
    return currentChordName;
}

function updateUI(hasActiveNotes) {
    currentDisplay.textContent = currentChordName ? currentChordName : "—";

    if (!hasActiveNotes && currentChordName) {
        currentDisplay.style.opacity = "0.25";
        noteContainer.style.opacity = "0.3";
    } else {
        currentDisplay.style.opacity = "1.0";
        noteContainer.style.opacity = "1.0";
    }

    noteContainer.innerHTML = ""; 

    if (settings.composition !== "false" && frozenMidiPitches.length > 0 && currentChordName) {
        const uniqueClassDisplayTracker = new Set();
        
        frozenMidiPitches.forEach((midi, index) => {
            const fullNote = Midi.midiToNoteName(midi);
            const basicLetter = fullNote.replace(/\d/, '');
            let normalizedLetter = basicLetter.toUpperCase();
            
            if (normalizedLetter === "A#") normalizedLetter = "BB";
            if (normalizedLetter === "D#") normalizedLetter = "EB";
            if (normalizedLetter === "G#") normalizedLetter = "AB";
            if (normalizedLetter === "C#") normalizedLetter = "DB";

            if (uniqueClassDisplayTracker.has(normalizedLetter)) return;
            uniqueClassDisplayTracker.add(normalizedLetter);

            const noteBox = document.createElement("div");
            noteBox.classList.add("note-box");

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

    document.getElementById("min-font-val").textContent = settings.minFont;
    document.getElementById("max-font-val").textContent = settings.maxFont;

    document.body.setAttribute("data-theme", settings.theme);
    document.body.setAttribute("data-font", settings.font);
    
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
