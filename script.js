// --- LOCALIZED IMPORTS WITH MULTIPLE FILE SHARING REMOVED ---
import { Midi, Chord } from "./tonal.js"; 
import { bestChordFilter, checkRootlessShellChords } from "./chordEngine.js";

const BUFFER_WINDOW_MS = 90; 
const MAX_WATERFALL_ROWS = 15; 

let activeNotes = new Set();
let instantFrameNotes = new Set();

let currentChordName = "";
let rawMidiPitches = []; 
let currentChordObject = null; 
let bufferTimeout = null;

const settings = {
    composition: localStorage.getItem("set-composition") || "degrees",
    theme: localStorage.getItem("set-theme") || "bw-dark",
    font: localStorage.getItem("set-font") || "system",
    minFont: parseFloat(localStorage.getItem("set-min-font")) || 6,
    maxFont: parseFloat(localStorage.getItem("set-max-font")) || 38 
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
    const command = message.data[0] & 0xf0;
    const note = message.data[1];
    const velocity = message.data.length > 2 ? message.data[2] : 0;

    if (command === 0x90 && velocity > 0) {
        activeNotes.add(note);
        instantFrameNotes.add(note);
        triggerBuffer();
    } 
    else if (command === 0x80 || (command === 0x90 && velocity === 0)) {
        activeNotes.delete(note);
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

function commitInstantSnapshotToWaterfall(confirmedChordName) {
    if (instantFrameNotes.size === 0) return;

    const sortedFramePitches = Array.from(instantFrameNotes).sort((a, b) => a - b);
    instantFrameNotes.clear();

    if (confirmedChordName) {
        const chordRowEl = document.createElement("div");
        chordRowEl.classList.add("waterfall-chord-row");
        chordRowEl.textContent = confirmedChordName;
        insertAtTop(chordRowEl);
    }

    const notesRowEl = document.createElement("div");
    notesRowEl.classList.add("waterfall-row");
    
    const polyphonyCount = sortedFramePitches.length;
    notesRowEl.setAttribute("data-count", polyphonyCount > 6 ? 6 : polyphonyCount);

    sortedFramePitches.forEach(midi => {
        const brickEl = document.createElement("div");
        brickEl.classList.add("wf-note-brick");

        let noteName = Midi.midiToNoteName(midi).replace(/\d/, '');
        noteName = noteName.substring(0, 1).toUpperCase() + noteName.substring(1);
        
        brickEl.textContent = noteName;
        notesRowEl.appendChild(brickEl);
    });

    insertAtTop(notesRowEl);

    while (waterfallTerminal.children.length > MAX_WATERFALL_ROWS) {
        waterfallTerminal.removeChild(waterfallTerminal.lastChild);
    }
}

function insertAtTop(element) {
    if (waterfallTerminal.firstChild) {
        waterfallTerminal.insertBefore(element, waterfallTerminal.firstChild);
    } else {
        waterfallTerminal.appendChild(element);
    }
}

function processChords() {
    // If no keys are being held down, clean reset the engine state entirely
    if (activeNotes.size === 0) {
        currentChordName = "";
        currentChordObject = null;
        rawMidiPitches = [];
        updateUI();
        return null;
    }

    rawMidiPitches = Array.from(activeNotes).sort((a, b) => a - b);
    const noteNamesWithOctaves = rawMidiPitches.map(midi => Midi.midiToNoteName(midi));
    const uniqueNoteLetters = Array.from(new Set(noteNamesWithOctaves.map(n => n.replace(/\d/, ''))));
    const lowestNoteName = noteNamesWithOctaves[0].replace(/\d/, '');

    // FIX STEP 1: Always test custom extension shells first before checking standard libraries
    const upperLetters = uniqueNoteLetters.map(n => n.toUpperCase());
    const fallbackShell = checkRootlessShellChords(upperLetters);

    let finalResolvedName = null;

    if (fallbackShell) {
        finalResolvedName = fallbackShell;
    } else {
        // FIX STEP 2: Use Tonal.js detection as a secondary fallback choice
        const detectedChords = Chord.detect(noteNamesWithOctaves);
        if (detectedChords && detectedChords.length > 0) {
            finalResolvedName = bestChordFilter(detectedChords, lowestNoteName, activeNotes.size, uniqueNoteLetters);
        }
    }

    // FIX STEP 3: If both lookups fail, force wipe old data so the display doesn't repeat old positions
    let chordNameToReturn = null;
    if (finalResolvedName) {
        if (finalResolvedName !== currentChordName) {
            currentChordName = finalResolvedName;
            currentChordObject = Chord.get(currentChordName);
            chordNameToReturn = currentChordName;
        }
    } else {
        currentChordName = "";
        currentChordObject = null;
    }
    
    updateUI();
    return chordNameToReturn;
}

function updateUI() {
    currentDisplay.textContent = currentChordName ? currentChordName : "—";

    if (activeNotes.size === 0 && currentChordName) {
        currentDisplay.style.opacity = "0.25";
        noteContainer.style.opacity = "0.3";
    } else {
        currentDisplay.style.opacity = "1.0";
        noteContainer.style.opacity = "1.0";
    }

    noteContainer.innerHTML = ""; 

    if (settings.composition !== "false" && rawMidiPitches.length > 0 && currentChordName) {
        rawMidiPitches.forEach((midi, index) => {
            const noteBox = document.createElement("div");
            noteBox.classList.add("note-box");

            const fullNote = Midi.midiToNoteName(midi);
            const basicLetter = fullNote.replace(/\d/, '');
            let styledName = basicLetter.substring(0, 1).toUpperCase() + basicLetter.substring(1);

            if (settings.composition === "notes") {
                noteBox.textContent = styledName;
            } else if (settings.composition === "degrees" && currentChordObject) {
                // Safe check if interval array mapping exists for custom manual shell entries
                const intervalDistance = (currentChordObject.intervals && currentChordObject.intervals[index]) ? currentChordObject.intervals[index] : "•";
                noteBox.textContent = intervalDistance;
            }

            if (index === 0) noteBox.classList.add("bass-note");
            noteContainer.appendChild(noteBox);
        });
    }

    setTimeout(() => {
        adjustFontSize(currentDisplay);
    }, 0);
}

function adjustFontSize(element) {
    const parent = element.parentElement;
    if (!parent || element.textContent === "—") return;

    let size = settings.maxFont; 
    element.style.fontSize = size + "vw";
    const maxPermittedWidth = parent.clientWidth * 0.94;

    while (element.scrollWidth > maxPermittedWidth && size > settings.minFont) {
        size -= 0.5;
        element.style.fontSize = size + "vw";
    }
}

function initializeSettingsPanel() {
    document.getElementById("set-composition").value = settings.composition;
    document.getElementById("set-theme").value = settings.theme;
    document.getElementById("set-font").value = settings.font;
    document.getElementById("set-min-font").value = settings.minFont;
    document.getElementById("set-max-font").value = settings.maxFont;

    document.getElementById("min-font-val").textContent = settings.minFont;
    document.getElementById("max-font-val").textContent = settings.maxFont;

    document.body.setAttribute("data-theme", settings.theme);
    document.body.setAttribute("data-font", settings.font);
    
    updateUI();
}

toggleBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
closeBtn.addEventListener("click", () => { overlay.classList.add("hidden"); updateUI(); });
overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.classList.add("hidden"); updateUI(); } });

document.getElementById("set-composition").addEventListener("change", (e) => {
    settings.composition = e.target.value;
    localStorage.setItem("set-composition", settings.composition);
    updateUI();
});
document.getElementById("set-theme").addEventListener("change", (e) => {
    settings.theme = e.target.value;
    localStorage.setItem("set-theme", settings.theme);
    document.body.setAttribute("data-theme", settings.theme);
    updateUI();
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
    updateUI();
});
document.getElementById("set-max-font").addEventListener("input", (e) => {
    settings.maxFont = parseFloat(e.target.value);
    document.getElementById("max-font-val").textContent = settings.maxFont;
    localStorage.setItem("set-max-font", settings.maxFont);
    updateUI();
});

const resizeObserver = new ResizeObserver(() => {
    adjustFontSize(currentDisplay);
});
resizeObserver.observe(document.getElementById("center-zone"));

initializeSettingsPanel();