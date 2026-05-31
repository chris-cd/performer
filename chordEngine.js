import { Chord } from "./tonal.js";

export function sanitizeTextFormatting(name) {
    if (!name) return null;
    let clean = name;
    
    // 1. Strip out literal omission tags like "no5", "no3"
    clean = clean.replace(/no\d+/g, '');
    
    // 2. Clean up Tonal's uppercase "M" markers safely to clear stage shorthand
    clean = clean.replace(/([A-G][#b]?)M(\d+)/g, '$1maj$2');
    clean = clean.replace(/([A-G][#b]?)M$/g, '$1');
    clean = clean.replace(/([A-G][#b]?)M\//g, '$1/');
    
    return clean;
}

/**
 * Advanced Interval-Distance Shell Identifier
 * Fixed to dynamically scan pitch class sets against standard guitar jazz fingerings.
 */
function checkRootlessShellChords(noteLetters) {
    const chrom = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
    
    for (let r = 0; r < 12; r++) {
        const rootName = chrom[r];

        const major3rd = chrom[(r + 4) % 12];
        const minor3rd = chrom[(r + 3) % 12];
        const perfect5th = chrom[(r + 7) % 12];
        const major6th = chrom[(r + 9) % 12]; // Note: Also acts as the 13th
        const minor7th = chrom[(r + 10) % 12];
        const major9th = chrom[(r + 2) % 12];
        const perfect11th = chrom[(r + 5) % 12];

        // 1. DOMINANT 13th SHELL CHECK (3rd + b7th + 13th)
        // e.g., G13 voiced as B, F, E (Root G skipped)
        if (noteLetters.includes(major3rd) && noteLetters.includes(minor7th) && noteLetters.includes(major6th)) {
            return rootName + "13";
        }

        // 2. MINOR 6th SHELL CHECK (b3rd + 5th + 6th) OR (b3rd + 6th with implicit root/5th)
        // e.g., Gm6 voiced as Bb, D, E
        if (noteLetters.includes(minor3rd) && noteLetters.includes(major6th) && (noteLetters.includes(perfect5th) || noteLetters.includes(rootName))) {
            return rootName + "m6";
        }

        // 3. MINOR 11th SHELL CHECK (b3rd + b7th + 11th)
        // e.g., Am11 voiced as C, G, D
        if (noteLetters.includes(minor3rd) && noteLetters.includes(minor7th) && noteLetters.includes(perfect11th)) {
            return rootName + "m11";
        }

        // 4. MINOR 9th SHELL CHECK (b3rd + b7th + 9th)
        // e.g., Gm9 voiced as Bb, F, A
        if (noteLetters.includes(minor3rd) && noteLetters.includes(minor7th) && noteLetters.includes(major9th)) {
            return rootName + "m9";
        }
    }
    return null;
}

export function bestChordFilter(chordList, bassNote, physicalKeyCount, noteLetters) {
    const upperLetters = noteLetters.map(n => n.toUpperCase());

    // =========================================================================
    // GLOBAL ROOTLESS/EXTENDED INTERCEPT GATE
    // =========================================================================
    const shellMatch = checkRootlessShellChords(upperLetters);
    if (shellMatch) {
        return sanitizeTextFormatting(shellMatch);
    }

    if (!chordList || chordList.length === 0) return null;

    const uniqueNoteCount = upperLetters.length;

    // =========================================================================
    // BRANCH 1: THE TRUE TRIAD ROUTE (Strictly 3 unique pitches)
    // =========================================================================
    if (physicalKeyCount === 3 || uniqueNoteCount === 3) {
        const literalSharpFive = chordList.find(c => c.includes("m#5"));
        if (literalSharpFive) {
            const majorAlternative = chordList.find(c => {
                const baseName = c.split('/')[0];
                return Chord.get(baseName).quality === "Major";
            });
            if (majorAlternative) {
                return sanitizeTextFormatting(majorAlternative.split('/')[0]);
            }
        }

        const pureRootChord = chordList.find(c => !c.includes('/'));
        if (pureRootChord) {
            return sanitizeTextFormatting(pureRootChord);
        }
        
        return sanitizeTextFormatting(chordList[0].split('/')[0]);
    }

    // =========================================================================
    // BRANCH 2: MULTI-NOTE CHORDS (4+ unique items or octave doubles)
    // =========================================================================
    const pureRootChords = chordList.filter(c => !c.includes('/'));
    if (pureRootChords.length > 0) {
        return sanitizeTextFormatting(pureRootChords[0]);
    }

    for (let chord of chordList) {
        if (chord.includes('/') && chord.endsWith('/' + bassNote)) {
            return sanitizeTextFormatting(chord);
        }
    }

    return sanitizeTextFormatting(chordList[0]);
}