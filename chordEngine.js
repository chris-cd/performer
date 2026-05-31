// --- IMPORT FROM YOUR LOCAL PROJECT FILE ---
import { Midi, Chord } from "./tonal.js";

/**
 * Strips out overly literal music-theory jargon to ensure clear,
 * split-second readability for the band on stage.
 */
export function sanitizeTextFormatting(name) {
    if (!name) return null;
    
    let clean = name;
    
    // 1. Strip out literal omission tags like "no5", "no3"
    clean = clean.replace(/no\d+/g, '');
    
    // 2. Clean up Tonal's uppercase "M" markers safely
    if (/^[A-G][#b]?M$/.test(clean)) {
        clean = clean.replace("M", "");
    }
    if (/^[A-G][#b]?M\//.test(clean)) {
        clean = clean.replace("M/", "/");
    }
    if (/^[A-G][#b]?M\d/.test(clean)) {
        clean = clean.replace("M", "");
    }
    
    return clean;
}

/**
 * Normalizes all sharp/flat variations to a standardized chromatic array
 * to prevent lookup failures due to accidental enharmonics.
 */
function normalizePitchClass(note) {
    if (!note) return "";
    const map = {
        "DB": "C#", "EB": "D#", "FB": "E", "E#": "F",
        "GB": "F#", "AB": "G#", "BB": "A#", "CB": "B", "B#": "C"
    };
    const upper = note.toUpperCase();
    return map[upper] || upper;
}

/**
 * Advanced Interval-Distance Shell Identifier
 * Scans active note sets to identify specialized jazz/rhythm formulas.
 */
export function checkRootlessShellChords(noteLetters) {
    // Standardized sharp-based chromatic array
    const chrom = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    
    // Map incoming notes to ensure exact matches against our sharp-based chromatic wheel
    const normalizedInputs = noteLetters.map(normalizePitchClass);
    
    // Test all 12 pitch classes as potential roots
    for (let r = 0; r < 12; r++) {
        const rootName = chrom[r];

        // Core minor intervals common across calculations
        const m3 = chrom[(r + 3) % 12];   // Minor 3rd
        const d7 = chrom[(r + 10) % 12];  // Minor 7th (Dominant 7th step)

        // 1. DOMINANT 13th CHECK (3rd + b7th + 13th)
        const d3 = chrom[(r + 4) % 12];
        const d13 = chrom[(r + 9) % 12];
        
        if (normalizedInputs.includes(d3) && normalizedInputs.includes(d7) && normalizedInputs.includes(d13)) {
            return rootName + "13";
        }

        // 2. MINOR 6th CHECK (b3rd + 5th + 6th) OR (b3rd + 6th)
        const m5 = chrom[(r + 7) % 12];
        const m6 = chrom[(r + 9) % 12];
        
        if (normalizedInputs.includes(m3) && normalizedInputs.includes(m6)) {
            return rootName + "m6";
        }

        // 3. MINOR 11th CHECK (b3rd + b7th + 11th)
        const m11 = chrom[(r + 5) % 12];
        
        if (normalizedInputs.includes(m3) && normalizedInputs.includes(d7) && normalizedInputs.includes(m11)) {
            return rootName + "m11";
        }

        // 4. MINOR 9th CHECK (b3rd + b7th + 9th)
        const m9 = chrom[(r + 2) % 12];
        
        if (normalizedInputs.includes(m3) && normalizedInputs.includes(d7) && normalizedInputs.includes(m9)) {
            return rootName + "m9";
        }
    }
    return null;
}

/**
 * Main Dynamic Performance Profile Filter
 */
export function bestChordFilter(chordList, bassNote, physicalKeyCount, noteLetters) {
    const upperLetters = noteLetters.map(n => n.toUpperCase());

    // =========================================================================
    // PRIORITY 1: GLOBAL ROOTLESS/EXTENDED SHELL INTERCEPT GATE
    // =========================================================================
    const shellMatch = checkRootlessShellChords(upperLetters);
    if (shellMatch) {
        return sanitizeTextFormatting(shellMatch);
    }

    if (!chordList || chordList.length === 0) return null;

    // =========================================================================
    // PRIORITY 2: EXPLICIT ROOTED EXTENSION LOOKUP
    // =========================================================================
    const explicitTargets = ["13", "m6", "mi6", "min6", "m9", "mi9", "min9", "m11", "mi11", "min11"];
    for (let target of explicitTargets) {
        const foundExplicit = chordList.find(c => {
            const base = c.split('/')[0];
            return base.endsWith(target);
        });
        if (foundExplicit) {
            return sanitizeTextFormatting(foundExplicit);
        }
    }

    const uniqueNoteCount = upperLetters.length;

    // =========================================================================
    // BRANCH 1: THE TRUE TRIAD ROUTE (Strictly 3 physical keys pressed down)
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
    // BRANCH 2: MULTI-NOTE CHORDS (4, 5, or 6 physical keys pressed down)
    // =========================================================================
    const pureRootChords = chordList.filter(c => !c.includes('/'));
    if (pureRootChords.length > 0) {
        return sanitizeTextFormatting(pureRootChords[0]);
    }

    const normalizedBass = normalizePitchClass(bassNote);
    for (let chord of chordList) {
        if (chord.includes('/')) {
            const structuralSplit = chord.split('/');
            if (normalizePitchClass(structuralSplit[1]) === normalizedBass) {
                return sanitizeTextFormatting(chord);
            }
        }
    }

    return sanitizeTextFormatting(chordList[0]);
}