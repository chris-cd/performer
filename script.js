// --- LOCALIZED IMPORTS WITH MULTIPLE FILE SHARING REMOVED ---
import { Midi, Chord } from "./tonal.js"; 
import { bestChordFilter } from "./chordEngine.js";

const BUFFER_WINDOW_MS = 90; 

let activeNotes = new Set();
// Historical cache to keep notes visible but dimmed when you lift your hands
let cachedSortedNotes = [];

let currentChordName = "";
let previousChordName = "";
let rawMidiPitches = []; 
let currentChordObject = null; 
let bufferTimeout = null;

const settings = {
    prevChord: localStorage.getItem("set-prev-chord") !== "false",
    composition: localStorage.getItem("set-composition") || "degrees",
    theme: localStorage.getItem("set-theme") || "bw-dark",
    font: localStorage.getItem("set-font") || "system",
    minFont: parseFloat(localStorage.getItem("set-min-font")) || 6,
    maxFont: parseFloat(localStorage.getItem("set-max-font")) || 20 
};

const currentDisplay = document.getElementById("current-chord");
const prevDisplay = document.getElementById("prev-chord");
const noteContainer = document.getElementById("note-composition-container");
const liveNotesRow = document.getElementById("live-notes-container");
const leftZone = document.getElementById("left-zone");

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
        processChords();
        updateLiveNotesUI();
    }, BUFFER_WINDOW_MS);
}

function processChords() {
    if (activeNotes.size === 0) {
        updateUI();
        return;
    }

    rawMidiPitches = Array.from(activeNotes).sort((a, b) => a - b);
    cachedSortedNotes = [...rawMidiPitches]; // Keep memory safe for display dimming

    const noteNamesWithOctaves = rawMidiPitches.map(midi => Midi.midiToNoteName(midi));
    const uniqueNoteLetters = new Set(noteNamesWithOctaves.map(n => n.replace(/\d/, '')));
    const lowestNoteName = noteNamesWithOctaves[0].replace(/\d/, '');

    const detectedChords = Chord.detect(noteNamesWithOctaves);

    if (detectedChords && detectedChords.length > 0) {
        let selectedChord = bestChordFilter(detectedChords, lowestNoteName, activeNotes.size, Array.from(uniqueNoteLetters));
        
        if (selectedChord && selectedChord !== currentChordName) {
            previousChordName = currentChordName || previousChordName;
            currentChordName = selectedChord;
            currentChordObject = Chord.get(currentChordName); 
        }
    }
    updateUI();
}

/**
 * LOW-TO-HIGH POLYPHONIC ENGINE:
 * Takes the active or last-played note sequence, formats them beautifully
 * with sharp/flat handling, and appends them left-to-right on your screen.
 */
function updateLiveNotesUI() {
    // If there's no data yet, leave it empty
    if (cachedSortedNotes.length === 0) {
        liveNotesRow.innerHTML = "";
        return;
    }

    liveNotesRow.innerHTML = "";
    const systemIsQuiet = (activeNotes.size === 0);

    cachedSortedNotes.forEach((midi) => {
        const slotEl = document.createElement("div");
        slotEl.classList.add("live-note-slot");

        // Format pitch name clean (e.g. "c#4" -> "C#")
        let noteName = Midi.midiToNoteName(midi).replace(/\d/, '');
        noteName = noteName.substring(0, 1).toUpperCase() + noteName.substring(1);
        slotEl.textContent = noteName;

        if (systemIsQuiet) {
            // Hands lifted completely: Dim layout block elements
            slotEl.classList.add("is-dimmed");
        } else if (!activeNotes.has(midi)) {
            // This specific pitch was released while others remain held down
            slotEl.classList.add("is-dimmed");
        }

        liveNotesRow.appendChild(slotEl);
    });
}

function updateUI() {
    currentDisplay.textContent = currentChordName ? currentChordName : "—";
    prevDisplay.textContent = previousChordName ? previousChordName : "—";

    leftZone.classList.toggle("hidden", !settings.prevChord);

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
                const intervalDistance = currentChordObject.intervals[index] || "•";
                noteBox.textContent = intervalDistance;
            }

            if (index === 0) noteBox.classList.add("bass-note");
            noteContainer.appendChild(noteBox);
        });
    }

    setTimeout(() => {
        adjustFontSize(currentDisplay);
        adjustFontSize(prevDisplay);
    }, 0);
}

function adjustFontSize(element) {
    const parent = element.parentElement;
    if (!parent || element.textContent === "—") return;

    let size = settings.maxFont; 
    element.style.fontSize = size + "vw";
    const maxPermittedWidth = parent.clientWidth * 0.88;

    while (element.scrollWidth > maxPermittedWidth && size > settings.minFont) {
        size -= 0.5;
        element.style.fontSize = size + "vw";
    }
}

function initializeSettingsPanel() {
    document.getElementById("set-prev-chord").checked = settings.prevChord;
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
    updateLiveNotesUI();
}

toggleBtn.addEventListener("click", () => overlay.classList.remove("hidden"));
closeBtn.addEventListener("click", () => { overlay.classList.add("hidden"); updateUI(); });
overlay.addEventListener("click", (e) => { if (e.target === overlay) { overlay.classList.add("hidden"); updateUI(); } });

document.getElementById("set-prev-chord").addEventListener("change", (e) => {
    settings.prevChord = e.target.checked;
    localStorage.setItem("set-prev-chord", settings.prevChord);
    updateUI();
});
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
    adjustFontSize(prevDisplay);
});
resizeObserver.observe(document.getElementById("left-zone"));
resizeObserver.observe(document.getElementById("right-zone"));

initializeSettingsPanel();