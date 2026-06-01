/**
 * Text Formatting and Sanitization Rules
 * Post-processing rules for chord name formatting and cleanup
 */

/**
 * Sanitize Text Formatting Rule
 * Removes omission tags (no3, no5) and normalizes uppercase M
 */
export const SanitizeTextFormattingRule = {
    name: 'sanitizeFormatting',
    type: 'filter',
    priority: 60,
    description: 'Clean chord names: remove no3/no5, normalize M notation',
    execute(context, data) {
        let { chordName } = data;
        
        if (!chordName) return null;
        
        let clean = chordName;
        
        // Remove omission tags like no3, no5, no9, etc.
        clean = clean.replace(/no\d+/g, '');
        
        // Normalize uppercase M patterns
        if (/^[A-G][#b]?M$/.test(clean)) {
            clean = clean.replace('M', '');
        }
        if (/^[A-G][#b]?M\//.test(clean)) {
            clean = clean.replace('M/', '/');
        }
        if (/^[A-G][#b]?M\d/.test(clean)) {
            clean = clean.replace('M', '');
        }
        
        return clean || null;
    }
};

/**
 * Normalize Pitch Class Rule
 * Converts enharmonic equivalents to preferred notation
 */
export const NormalizePitchClassRule = {
    name: 'normalizePitchClass',
    type: 'filter',
    priority: 61,
    description: 'Convert enharmonic spellings to standard notation',
    execute(context, data) {
        let { note } = data;
        
        if (!note) return null;
        
        const { FLATTENED_PITCHES, accidentalMap } = context;
        
        let cleanNote = note.toUpperCase().replace(/\d/g, '');
        
        if (accidentalMap && accidentalMap[cleanNote]) {
            cleanNote = accidentalMap[cleanNote];
        }
        
        if (cleanNote.endsWith('BB')) {
            const base = cleanNote.replace('BB', '');
            let idx = FLATTENED_PITCHES.indexOf(base);
            if (idx !== -1) {
                idx = (idx - 2 + 12) % 12;
                return FLATTENED_PITCHES[idx];
            }
        }
        
        return cleanNote || null;
    }
};

/**
 * Enforce Triad Rules
 * For 3-note chords, strip inversions and slashes; keep clean voicings
 */
export const EnforceTriadRulesRule = {
    name: 'enforceTriadRules',
    type: 'filter',
    priority: 62,
    description: 'For 3-note chords: strip slashes and inversions',
    execute(context, data) {
        const { chordName, physicalKeyCount, uniqueNoteCount } = data;
        
        if (!chordName) return null;
        
        // Only enforce for actual 3-note voicings
        if (physicalKeyCount !== 3 && uniqueNoteCount !== 3) {
            return chordName;
        }
        
        // Strip trailing slash notation for triad voicings
        if (chordName.includes('/')) {
            return chordName.split('/')[0];
        }
        
        return chordName;
    }
};

/**
 * Complex Voicing Allowance Rule
 * For 4+ note chords, allow slashes and complex voicings
 */
export const AllowComplexVoicingRule = {
    name: 'allowComplexVoicing',
    type: 'filter',
    priority: 63,
    description: 'For 4+ notes: preserve slash chords and complex voicings',
    execute(context, data) {
        const { chordName, physicalKeyCount, uniqueNoteCount } = data;
        
        if (!chordName) return null;
        
        // For 4+ notes, pass through as-is (already complex)
        if (physicalKeyCount >= 4 || uniqueNoteCount >= 4) {
            return chordName;
        }
        
        return null; // Let other rules handle it
    }
};

/**
 * Uppercase Normalization Rule
 * Ensures consistent capitalization (e.g., AM7 -> Amaj7)
 */
export const UppercaseNormalizationRule = {
    name: 'uppercaseNormalization',
    type: 'filter',
    priority: 64,
    description: 'Normalize uppercase chord notation to standard form',
    execute(context, data) {
        let { chordName } = data;
        
        if (!chordName) return null;
        
        // Handle special cases like AM7 -> Amaj7
        if (/^[A-G][#b]?M7$/.test(chordName)) {
            chordName = chordName.replace(/M7$/, 'maj7');
        }
        if (/^[A-G][#b]?M$/.test(chordName)) {
            chordName = chordName.replace(/M$/, 'maj');
        }
        
        return chordName || null;
    }
};
