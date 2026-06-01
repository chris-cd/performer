import { Midi, Chord } from "./tonal.js";
import ChordRuleEngine from "./ruleEngine.js";

// Import all rule modules
import * as IntervalRules from "./rules/intervalRules.js";
import * as FallbackRules from "./rules/fallbackRules.js";
import * as FormattingRules from "./rules/formattingRules.js";

// ============================================
// CONSTANTS AND UTILITIES
// ============================================

const FLATTENED_PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const ACCIDENTAL_MAP = {
    "DB": "C#", "EB": "D#", "FB": "E", "E#": "F",
    "GB": "F#", "AB": "G#", "BB": "A#", "CB": "B", "B#": "C"
};

/**
 * Normalize pitch class - convert enharmonic equivalents
 */
export function normalizePitchClass(note) {
    if (!note) return "";
    let cleanNote = note.toUpperCase().replace(/\d/g, '');
    
    if (ACCIDENTAL_MAP[cleanNote]) {
        cleanNote = ACCIDENTAL_MAP[cleanNote];
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

/**
 * Calculate semitone intervals from root
 */
function getSemitoneIntervals(rootMidi, rawMidiArray) {
    const rootChromValue = rootMidi % 12;
    return rawMidiArray.map(m => {
        let diff = (m % 12) - rootChromValue;
        if (diff < 0) diff += 12;
        return diff;
    });
}

/**
 * Sanitize text formatting (legacy function, now also a rule)
 */
export function sanitizeTextFormatting(name) {
    if (!name) return null;
    let clean = name;
    clean = clean.replace(/no\d+/g, '');
    if (/^[A-G][#b]?M$/.test(clean)) clean = clean.replace("M", "");
    if (/^[A-G][#b]?M\//.test(clean)) clean = clean.replace("M/", "/");
    if (/^[A-G][#b]?M\d/.test(clean)) clean = clean.replace("M", "");
    return clean;
}

/**
 * Rootless shell chord detection (legacy function)
 */
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

// ============================================
// CHORD RULE ENGINE FACTORY
// ============================================

/**
 * Create and configure a ChordFilterEngine with all rules
 * This sets up the plugin architecture with all available rules
 * You can enable/disable rules as needed
 */
export function createChordRuleEngine() {
    const engine = new ChordRuleEngine();
    
    // Set shared context for all rules
    engine.setContext({
        FLATTENED_PITCHES,
        Midi,
        normalizePitchClass,
        accidentalMap: ACCIDENTAL_MAP
    });
    
    // Register all interval-based detection rules
    engine.registerRule(IntervalRules.BendHoldCheckRule.name, IntervalRules.BendHoldCheckRule);
    engine.registerRule(IntervalRules.Minor9Rule.name, IntervalRules.Minor9Rule);
    engine.registerRule(IntervalRules.MajorTriadSafetyRule.name, IntervalRules.MajorTriadSafetyRule);
    engine.registerRule(IntervalRules.FullyDiminished7Rule.name, IntervalRules.FullyDiminished7Rule);
    engine.registerRule(IntervalRules.HalfDiminished7Rule.name, IntervalRules.HalfDiminished7Rule);
    engine.registerRule(IntervalRules.Minor11Rule.name, IntervalRules.Minor11Rule);
    engine.registerRule(IntervalRules.Dominant7Sharp9Rule.name, IntervalRules.Dominant7Sharp9Rule);
    engine.registerRule(IntervalRules.Dominant9Rule.name, IntervalRules.Dominant9Rule);
    engine.registerRule(IntervalRules.Dominant7Flat5Rule.name, IntervalRules.Dominant7Flat5Rule);
    engine.registerRule(IntervalRules.Dominant7Flat13Rule.name, IntervalRules.Dominant7Flat13Rule);
    engine.registerRule(IntervalRules.G6addB9Rule.name, IntervalRules.G6addB9Rule);
    engine.registerRule(IntervalRules.Dominant13Rule.name, IntervalRules.Dominant13Rule);
    engine.registerRule(IntervalRules.Sus4With9Rule.name, IntervalRules.Sus4With9Rule);
    engine.registerRule(IntervalRules.Major7Rule.name, IntervalRules.Major7Rule);
    engine.registerRule(IntervalRules.Dominant7AndMinor7Rule.name, IntervalRules.Dominant7AndMinor7Rule);
    engine.registerRule(IntervalRules.Minor6Rule.name, IntervalRules.Minor6Rule);
    
    // Register all fallback rules
    engine.registerRule(FallbackRules.BassMatchingRule.name, FallbackRules.BassMatchingRule);
    engine.registerRule(FallbackRules.BassLeadMatchRule.name, FallbackRules.BassLeadMatchRule);
    engine.registerRule(FallbackRules.RootlessShellChordRule.name, FallbackRules.RootlessShellChordRule);
    engine.registerRule(FallbackRules.ExplicitTargetRule.name, FallbackRules.ExplicitTargetRule);
    engine.registerRule(FallbackRules.PureRootChordRule.name, FallbackRules.PureRootChordRule);
    engine.registerRule(FallbackRules.AnyChordRule.name, FallbackRules.AnyChordRule);
    
    // Register formatting rules
    engine.registerRule(FormattingRules.SanitizeTextFormattingRule.name, FormattingRules.SanitizeTextFormattingRule);
    engine.registerRule(FormattingRules.NormalizePitchClassRule.name, FormattingRules.NormalizePitchClassRule);
    engine.registerRule(FormattingRules.EnforceTriadRulesRule.name, FormattingRules.EnforceTriadRulesRule);
    engine.registerRule(FormattingRules.AllowComplexVoicingRule.name, FormattingRules.AllowComplexVoicingRule);
    engine.registerRule(FormattingRules.UppercaseNormalizationRule.name, FormattingRules.UppercaseNormalizationRule);
    
    // Enable all rules by default
    engine.enableAll();
    
    return engine;
}

// Singleton engine instance
let globalRuleEngine = null;

export function getGlobalRuleEngine() {
    if (!globalRuleEngine) {
        globalRuleEngine = createChordRuleEngine();
    }
    return globalRuleEngine;
}

// ============================================
// FORMATTING HELPER
// ============================================

/**
 * Apply formatting rules to a detected chord name
 */
function applyFormattingRules(chordName, ruleData) {
    if (!chordName) return null;
    
    let result = chordName;
    
    // Apply text sanitization
    result = FormattingRules.SanitizeTextFormattingRule.execute(null, { chordName: result });
    if (!result) return null;
    
    // Apply uppercase normalization
    result = FormattingRules.UppercaseNormalizationRule.execute(null, { chordName: result });
    if (!result) return null;
    
    // For 3-note voicings, enforce triads (strip slashes)
    if (ruleData.uniqueNoteCount === 3 || ruleData.physicalKeyCount === 3) {
        result = FormattingRules.EnforceTriadRulesRule.execute(null, { 
            chordName: result, 
            physicalKeyCount: ruleData.physicalKeyCount,
            uniqueNoteCount: ruleData.uniqueNoteCount
        });
    }
    
    return result || chordName;
}

// ============================================
// MAIN CHORD FILTER FUNCTION (Plugin-Based)
// ============================================

/**
 * Main chord filtering function using the rule engine
 * Processes MIDI data through a configurable pipeline of chord detection rules
 * 
 * @param {Array<string>} chordList - Tonal.js detected chords
 * @param {string} bassNote - Lowest note name
 * @param {number} physicalKeyCount - Number of active MIDI notes
 * @param {Array<string>} noteLetters - Note name letters
 * @param {string} currentActiveChordName - Previously detected chord
 * @param {Array<number>} rawActiveMidiArray - Raw MIDI note values
 * @param {Array<number>} bendingMidiNotes - Notes with active pitch bends
 * @returns {string|null} - Final chord name
 */
export function bestChordFilter(
    chordList, 
    bassNote, 
    physicalKeyCount, 
    noteLetters, 
    currentActiveChordName = "", 
    rawActiveMidiArray = [], 
    bendingMidiNotes = []
) {
    let upperLetters = noteLetters.map(n => n.toUpperCase()).map(normalizePitchClass);
    let normalizedBass = normalizePitchClass(bassNote);
    
    // CHORD VALIDITY GATE: A chord requires minimum 3 unique notes
    // Single notes and dual note combinations do not constitute valid chords
    // They should only appear in the Cascade view, not update CURRENT display
    if (upperLetters.length < 3) {
        return null;
    }
    
    // Prepare data object for rule engine
    const ruleData = {
        // Original parameters
        chordList,
        bassNote,
        physicalKeyCount,
        noteLetters: upperLetters,
        currentActiveChordName,
        rawActiveMidiArray,
        bendingMidiNotes,
        
        // Derived data
        upperLetters,
        normalizedBass,
        uniqueNoteCount: upperLetters.length,
        
        // MIDI analysis data
        sortedMidi: rawActiveMidiArray.length > 0 ? [...rawActiveMidiArray].sort((a, b) => a - b) : [],
        rootMidi: rawActiveMidiArray.length > 0 ? [...rawActiveMidiArray].sort((a, b) => a - b)[0] : null,
        relativeIntervals: rawActiveMidiArray.length > 0 
            ? getSemitoneIntervals(
                [...rawActiveMidiArray].sort((a, b) => a - b)[0],
                [...rawActiveMidiArray].sort((a, b) => a - b)
              )
            : null,
        displayRoot: null, // Will be set below
        
        // Helper functions and utilities
        normalizePitchClass,
        FLATTENED_PITCHES,
        Midi,
        
        // Current chord name (for formatting pass-through)
        chordName: null
    };
    
    // Calculate display root if MIDI data available
    if (ruleData.sortedMidi.length > 0) {
        const rootNoteName = Midi.midiToNoteName(ruleData.rootMidi).replace(/\d/, '');
        ruleData.displayRoot = normalizePitchClass(rootNoteName);
    }
    
    // Get the global rule engine and execute the pipeline
    const engine = getGlobalRuleEngine();
    const detectedChord = engine.execute(ruleData);
    
    // Apply formatting rules to the detected chord
    if (detectedChord) {
        return applyFormattingRules(detectedChord, ruleData);
    }
    
    return null;
}