/**
 * Chord Detection Rules
 * Individual rule modules for specific chord types
 */

// ============================================
// OVERRIDE RULES (High Priority, Early Exit)
// ============================================

export const BendHoldCheckRule = {
    name: 'bendHoldCheck',
    type: 'override',
    priority: 100,
    description: 'Maintain chord during pitch bends on active strings',
    execute(context, data) {
        const { bendingMidiNotes, currentActiveChordName, rawActiveMidiArray } = data;
        
        if (!bendingMidiNotes || bendingMidiNotes.length === 0 || !currentActiveChordName) {
            return null;
        }
        
        const matchingFrettedBend = bendingMidiNotes.some(bm => rawActiveMidiArray.includes(bm));
        return matchingFrettedBend ? currentActiveChordName : null;
    }
};

/**
 * Minor 9th Override Rule
 * Intercepts [3, 10, 2] to enforce m9 suffix
 * Prevents Tonal.js from misclassifying as m7
 */
export const Minor9Rule = {
    name: 'minor9Override',
    type: 'override',
    priority: 95,
    description: 'Enforce m9 chord detection ([3, 10, 2] intervals)',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        const hasMinorThird = relativeIntervals.includes(3);
        const hasMinor7th = relativeIntervals.includes(10);
        const hasNinth = relativeIntervals.includes(2);
        
        if (hasMinorThird && hasMinor7th && hasNinth) {
            return displayRoot + 'm9';
        }
        return null;
    }
};

/**
 * M#5 Safety Intercept
 * Maps first-inversion major triads (flagged as Bm#5) back to true major
 */
export const MajorTriadSafetyRule = {
    name: 'majorTriadSafety',
    type: 'override',
    priority: 90,
    description: 'Convert misclassified m#5 to true major triad',
    execute(context, data) {
        const { chordList, normalizedBass } = data;
        
        if (!chordList || chordList.length === 0) return null;
        
        const m5Chord = chordList.find(c => c.includes('m#5'));
        if (m5Chord) {
            const base = m5Chord.split('m#5')[0];
            return base; // Return clean major triad
        }
        return null;
    }
};

// ============================================
// INTERVAL-BASED DETECTION RULES
// ============================================

export const FullyDiminished7Rule = {
    name: 'dim7',
    type: 'default',
    priority: 80,
    description: 'Detect fully diminished 7th ([3, 6, 9] intervals)',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        if (relativeIntervals.includes(3) && relativeIntervals.includes(6) && relativeIntervals.includes(9)) {
            return displayRoot + 'dim7';
        }
        return null;
    }
};

export const HalfDiminished7Rule = {
    name: 'm7b5',
    type: 'default',
    priority: 79,
    description: 'Detect half-diminished 7th ([3, 6, 10] intervals)',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        if (relativeIntervals.includes(3) && relativeIntervals.includes(6) && relativeIntervals.includes(10)) {
            return displayRoot + 'm7b5';
        }
        return null;
    }
};

export const Minor11Rule = {
    name: 'm11Shell',
    type: 'default',
    priority: 78,
    description: 'Detect minor 11 shell voicings ([3, 10, 5] intervals)',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        if (relativeIntervals.includes(3) && relativeIntervals.includes(10) && relativeIntervals.includes(5)) {
            return displayRoot + 'm11';
        }
        return null;
    }
};

export const Dominant7Sharp9Rule = {
    name: '7sharp9',
    type: 'default',
    priority: 77,
    description: 'Detect Hendrix chord ([10, 4, 3] intervals)',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        if (relativeIntervals.includes(10) && relativeIntervals.includes(4) && relativeIntervals.includes(3)) {
            return displayRoot + '7#9';
        }
        return null;
    }
};

export const Dominant9Rule = {
    name: 'dominant9',
    type: 'default',
    priority: 76,
    description: 'Detect dominant 9th ([10, 4, 2] intervals)',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        if (relativeIntervals.includes(10) && relativeIntervals.includes(4) && relativeIntervals.includes(2)) {
            return displayRoot + '9';
        }
        return null;
    }
};

export const Dominant7Flat5Rule = {
    name: '7b5',
    type: 'default',
    priority: 75,
    description: 'Detect dominant 7 flat 5 ([10, 4, 6] intervals)',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        if (relativeIntervals.includes(10) && relativeIntervals.includes(4) && relativeIntervals.includes(6)) {
            return displayRoot + '7b5';
        }
        return null;
    }
};

export const Dominant7Flat13Rule = {
    name: '7b13',
    type: 'default',
    priority: 74,
    description: 'Detect dominant 7 flat 13 ([10, 4, 8] intervals)',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        if (relativeIntervals.includes(10) && relativeIntervals.includes(4) && relativeIntervals.includes(8)) {
            return displayRoot + '7b13';
        }
        return null;
    }
};

export const G6addB9Rule = {
    name: '6addb9',
    type: 'default',
    priority: 73,
    description: 'Detect G6addb9 tracking ([1, 4, 9] intervals)',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        if (relativeIntervals.includes(1) && relativeIntervals.includes(4) && relativeIntervals.includes(9)) {
            return displayRoot + '6addb9';
        }
        return null;
    }
};

export const Dominant13Rule = {
    name: '13',
    type: 'default',
    priority: 72,
    description: 'Detect dominant 13th ([4, 10, 9] intervals)',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        if (relativeIntervals.includes(4) && relativeIntervals.includes(10) && relativeIntervals.includes(9)) {
            return displayRoot + '13';
        }
        return null;
    }
};

export const Sus4With9Rule = {
    name: '9sus4',
    type: 'default',
    priority: 71,
    description: 'Detect 9sus4 ([5, 10, 2] intervals)',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        if (relativeIntervals.includes(5) && relativeIntervals.includes(10) && relativeIntervals.includes(2)) {
            return displayRoot + '9sus4';
        }
        return null;
    }
};

export const Major7Rule = {
    name: 'Maj7',
    type: 'default',
    priority: 70,
    description: 'Detect major 7 chords with ghost note filtering',
    execute(context, data) {
        const { relativeIntervals, displayRoot, sortedMidi, rootMidi, upperLetters, bassNote, FLATTENED_PITCHES, Midi, normalizePitchClass } = data;
        
        if (!relativeIntervals || !relativeIntervals.includes(11)) return null;
        
        let filteredLetters = [...upperLetters];
        
        // Filter ghost note (minor second)
        if (relativeIntervals.includes(1)) {
            const ghostMidiValue = sortedMidi.find(m => (m % 12) === ((rootMidi + 1) % 12));
            if (ghostMidiValue) {
                const ghostLetter = Midi.midiToNoteName(ghostMidiValue).replace(/\d/, '').toUpperCase();
                filteredLetters = filteredLetters.filter(n => normalizePitchClass(n) !== normalizePitchClass(ghostLetter));
            }
        }
        
        const normalizedBass = normalizePitchClass(bassNote);
        if (filteredLetters.map(n => normalizePitchClass(n)).includes(normalizedBass)) {
            const hasThird = relativeIntervals.includes(4);
            const hasFifth = relativeIntervals.includes(7);
            if (hasThird || hasFifth) {
                return displayRoot + 'Maj7';
            }
        }
        return null;
    }
};

export const Dominant7AndMinor7Rule = {
    name: '7MinorValidation',
    type: 'default',
    priority: 69,
    description: 'Detect dominant 7 and minor 7 with ghost note filtering',
    execute(context, data) {
        const { relativeIntervals, displayRoot, sortedMidi, rootMidi, upperLetters, bassNote, FLATTENED_PITCHES, Midi, normalizePitchClass } = data;
        
        if (!relativeIntervals || !relativeIntervals.includes(10)) return null;
        
        let filteredLetters = [...upperLetters];
        
        // Filter ghost note
        if (relativeIntervals.includes(1)) {
            const ghostMidiValue = sortedMidi.find(m => (m % 12) === ((rootMidi + 1) % 12));
            if (ghostMidiValue) {
                const ghostLetter = Midi.midiToNoteName(ghostMidiValue).replace(/\d/, '').toUpperCase();
                filteredLetters = filteredLetters.filter(n => normalizePitchClass(n) !== normalizePitchClass(ghostLetter));
            }
        }
        
        if (relativeIntervals.includes(4)) {
            return displayRoot + '7';
        }
        
        if (!relativeIntervals.includes(9)) {
            return displayRoot + 'm7';
        }
        
        return null;
    }
};

export const Minor6Rule = {
    name: 'm6',
    type: 'default',
    priority: 68,
    description: 'Detect minor 6th chords ([3, 9] or [3, 8] intervals)',
    execute(context, data) {
        const { relativeIntervals, displayRoot } = data;
        
        if (!relativeIntervals) return null;
        
        if (relativeIntervals.includes(3) && (relativeIntervals.includes(9) || relativeIntervals.includes(8))) {
            return displayRoot + 'm6';
        }
        return null;
    }
};
