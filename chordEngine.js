import { Midi, Chord } from "./tonal.js";

const FLATTENED_PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function sanitizeTextFormatting(name) {
    if (!name) return null;
    let clean = name;
    clean = clean.replace(/no\d+/g, '');
    if (/^[A-G][#b]?M$/.test(clean)) clean = clean.replace("M", "");
    if (/^[A-G][#b]?M\//.test(clean)) clean = clean.replace("M/", "/");
    if (/^[A-G][#b]?M\d/.test(clean)) clean = clean.replace("M", "");
    return clean;
}

function normalizePitchClass(note) {
    if (!note) return "";
    let cleanNote = note.toUpperCase().replace(/\d/g, '');
    
    const accidentalMap = {
        "DB": "C#", "EB": "D#", "FB": "E", "E#": "F",
        "GB": "F#", "AB": "G#", "BB": "A#", "CB": "B", "B#": "C"
    };
    
    if (accidentalMap[cleanNote]) {
        cleanNote = accidentalMap[cleanNote];
    }
    
    if (cleanNote.endsWith("BB")) {
        const base = cleanNote.replace("BB", "");
        let idx = FLATTENED_PITCHES.indexOf(base);
        if (idx !== -1) {
            idx = (idx - 2 + 12) % 12;
            return FLATTENED_PITCHES[idx];
        }
    }
    
    return cleanNote;
}

function getSemitoneIntervals(rootMidi, rawMidiArray) {
    const rootChromValue = rootMidi % 12;
    return rawMidiArray.map(m => {
        let diff = (m % 12) - rootChromValue;
        if (diff < 0) diff += 12;
        return diff;
    });
}

export function checkRootlessShellChords(noteLetters, favoredBassLetter = null) {
    const normalizedInputs = noteLetters.map(normalizePitchClass);
    
    let rootScanOrder = [];
    if (favoredBassLetter) {
        const normalizedBass = normalizePitchClass(favoredBassLetter);
        const bassIdx = FLATTENED_PITCHES.indexOf(normalizedBass);
        if (bassIdx !== -1) rootScanOrder.push(bassIdx);
    }
    for (let i = 0; i < 12; i++) {
        if (!rootScanOrder.includes(i)) rootScanOrder.push(i);
    }
    
    for (let r of rootScanOrder) {
        const rootName = FLATTENED_PITCHES[r];
        const m3 = FLATTENED_PITCHES[(r + 3) % 12]; 
        const d7 = FLATTENED_PITCHES[(r + 10) % 12]; 
        const d3 = FLATTENED_PITCHES[(r + 4) % 12];
        const d13 = FLATTENED_PITCHES[(r + 9) % 12];

        if (normalizedInputs.includes(d3) && normalizedInputs.includes(d7) && normalizedInputs.includes(d13)) {
            return rootName + "13";
        }

        const m6 = FLATTENED_PITCHES[(r + 9) % 12];
        if (normalizedInputs.includes(m3) && normalizedInputs.includes(m6)) {
            const b5 = FLATTENED_PITCHES[(r + 6) % 12];
            if (normalizedInputs.includes(b5)) continue;
            return rootName + "m6";
        }

        const m11 = FLATTENED_PITCHES[(r + 5) % 12];
        if (normalizedInputs.includes(m3) && normalizedInputs.includes(d7) && normalizedInputs.includes(m11)) {
            return rootName + "m11";
        }

        const m9 = FLATTENED_PITCHES[(r + 2) % 12];
        if (normalizedInputs.includes(m3) && normalizedInputs.includes(d7) && normalizedInputs.includes(m9)) {
            return rootName + "m9";
        }
    }
    return null;
}

export function bestChordFilter(chordList, bassNote, physicalKeyCount, noteLetters, currentActiveChordName = "", rawActiveMidiArray = [], bendingMidiNotes = []) {
    let upperLetters = noteLetters.map(n => n.toUpperCase()).map(normalizePitchClass);
    let normalizedBass = normalizePitchClass(bassNote);

    // RESTORED WITH SMART RELEASE: If a real string expression bend is in progress on an active note, protect the current label
    if (bendingMidiNotes && bendingMidiNotes.length > 0 && currentActiveChordName) {
        const matchingFrettedBend = bendingMidiNotes.some(bm => rawActiveMidiArray.includes(bm));
        if (matchingFrettedBend) {
            return currentActiveChordName;
        }
    }

    if (rawActiveMidiArray && rawActiveMidiArray.length > 0) {
        const sortedMidi = [...rawActiveMidiArray].sort((a, b) => a - b);
        const rootMidi = sortedMidi[0];
        const relativeIntervals = getSemitoneIntervals(rootMidi, sortedMidi);
        const rootNoteName = Midi.midiToNoteName(rootMidi).replace(/\d/, '');
        const displayRoot = normalizePitchClass(rootNoteName);

        // Fully Diminished 7th structures
        if (relativeIntervals.includes(3) && relativeIntervals.includes(6) && relativeIntervals.includes(9)) {
            return displayRoot + "dim7";
        }

        // Half-Diminished 7th structures
        if (relativeIntervals.includes(3) && relativeIntervals.includes(6) && relativeIntervals.includes(10)) {
            return displayRoot + "m7b5";
        }

        // Minor 11 shell voicings
        if (relativeIntervals.includes(3) && relativeIntervals.includes(10) && relativeIntervals.includes(5)) {
            return displayRoot + "m11";
        }

        // Dominant 7 sharp 9 structure (Hendrix Chord)
        if (relativeIntervals.includes(10) && relativeIntervals.includes(4) && relativeIntervals.includes(3)) {
            return displayRoot + "7#9";
        }

        // Dominant 9th drop structures
        if (relativeIntervals.includes(10) && relativeIntervals.includes(4) && relativeIntervals.includes(2)) {
            return displayRoot + "9";
        }

        // Dominant 7 flat 5 drop frames
        if (relativeIntervals.includes(10) && relativeIntervals.includes(4) && relativeIntervals.includes(6)) {
            return displayRoot + "7b5";
        }

        // Dominant 7 flat 13 shapes
        if (relativeIntervals.includes(10) && relativeIntervals.includes(4) && relativeIntervals.includes(8)) {
            return displayRoot + "7b13";
        }

        // G6addb9 tracking distributions
        if (relativeIntervals.includes(1) && relativeIntervals.includes(4) && relativeIntervals.includes(9)) {
            return displayRoot + "6addb9";
        }

        // Dominant 13 structures
        if (relativeIntervals.includes(4) && relativeIntervals.includes(10) && relativeIntervals.includes(9)) {
            return displayRoot + "13";
        }

        // 9sus4 intercept blocks
        if (relativeIntervals.includes(5) && relativeIntervals.includes(10) && relativeIntervals.includes(2)) {
            return displayRoot + "9sus4";
        }

        // Major 7 structures
        if (relativeIntervals.includes(11)) {
            if (relativeIntervals.includes(1)) {
                const ghostMidiValue = sortedMidi.find(m => (m % 12) === ((rootMidi + 1) % 12));
                if (ghostMidiValue) {
                    const ghostLetter = Midi.midiToNoteName(ghostMidiValue).replace(/\d/, '').toUpperCase();
                    upperLetters = upperLetters.filter(n => normalizePitchClass(n) !== normalizePitchClass(ghostLetter));
                }
            }
            if (upperLetters.includes(normalizePitchClass(bassNote))) {
                const hasThird = relativeIntervals.includes(4);
                const hasFifth = relativeIntervals.includes(7);
                if (hasThird || hasFifth) {
                    return displayRoot + "Maj7";
                }
            }
        }

        // Minor 7 / Dominant 7 validation routing engine
        if (relativeIntervals.includes(10)) {
            if (relativeIntervals.includes(1)) {
                const ghostMidiValue = sortedMidi.find(m => (m % 12) === ((rootMidi + 1) % 12));
                if (ghostMidiValue) {
                    const ghostLetter = Midi.midiToNoteName(ghostMidiValue).replace(/\d/, '').toUpperCase();
                    upperLetters = upperLetters.filter(n => normalizePitchClass(n) !== normalizePitchClass(ghostLetter));
                }
            }

            if (relativeIntervals.includes(4)) {
                return displayRoot + "7";
            }
            
            if (!relativeIntervals.includes(9)) {
                return displayRoot + "m7";
            }
        }

        if (relativeIntervals.includes(3) && (relativeIntervals.includes(9) || relativeIntervals.includes(8))) {
            return displayRoot + "m6";
        }
    }

    const uniqueNoteCount = upperLetters.length;

    if (physicalKeyCount === 3 || uniqueNoteCount === 3) {
        const perfectBassMatch = chordList.find(c => {
            const base = c.split('/')[0];
            return normalizePitchClass(base).startsWith(normalizedBass);
        });
        if (perfectBassMatch) return sanitizeTextFormatting(perfectBassMatch);

        const pureRootChord = chordList.find(c => !c.includes('/'));
        if (pureRootChord) return sanitizeTextFormatting(pureRootChord);
    }

    if (chordList && chordList.length > 0) {
        const bassLeadMatch = chordList.find(c => normalizePitchClass(c.split('/')[0]).startsWith(normalizedBass));
        if (bassLeadMatch) return sanitizeTextFormatting(bassLeadMatch);
    }

    const shellMatch = checkRootlessShellChords(upperLetters, bassNote);
    if (shellMatch) return sanitizeTextFormatting(shellMatch);

    if (!chordList || chordList.length === 0) return null;

    const explicitTargets = ["dim7", "m7b5", "m11", "7#9", "9", "7b5", "7b13", "7", "13", "9sus4", "Maj7", "m7", "m6", "mi6", "min6", "m9"];
    for (let target of explicitTargets) {
        const foundExplicit = chordList.find(c => {
            const base = c.split('/')[0];
            const cleanBase = base.replace(new RegExp("^" + normalizedBass), "");
            return cleanBase === target || base.endsWith(target);
        });
        if (foundExplicit) return sanitizeTextFormatting(foundExplicit);
    }

    const pureRootChords = chordList.filter(c => !c.includes('/'));
    if (pureRootChords.length > 0) return sanitizeTextFormatting(pureRootChords[0]);

    return sanitizeTextFormatting(chordList[0]);
}