/**
 * Fallback Chord Detection Rules
 * Rules for bass matching, shell chords, and other fallback mechanisms
 */

export const BassMatchingRule = {
    name: 'bassMatching',
    type: 'fallback',
    priority: 50,
    description: 'Match chord based on bass note for 3-note voicings',
    execute(context, data) {
        const { physicalKeyCount, uniqueNoteCount, chordList, bassNote, normalizedBass, normalizePitchClass } = data;
        
        if (physicalKeyCount !== 3 && uniqueNoteCount !== 3) return null;
        
        // Perfect bass match
        const perfectBassMatch = chordList.find(c => {
            const base = c.split('/')[0];
            return normalizePitchClass(base).startsWith(normalizedBass);
        });
        if (perfectBassMatch) return perfectBassMatch;
        
        // Pure root chord fallback
        const pureRootChord = chordList.find(c => !c.includes('/'));
        if (pureRootChord) return pureRootChord;
        
        return null;
    }
};

export const BassLeadMatchRule = {
    name: 'bassLeadMatch',
    type: 'fallback',
    priority: 49,
    description: 'Find bass-leading slash chord in detection list',
    execute(context, data) {
        const { chordList, normalizedBass, normalizePitchClass } = data;
        
        if (!chordList || chordList.length === 0) return null;
        
        const bassLeadMatch = chordList.find(c => {
            const base = c.split('/')[0];
            return normalizePitchClass(base).startsWith(normalizedBass);
        });
        
        return bassLeadMatch || null;
    }
};

/**
 * Octave Weighting Rule
 * Scores detected chord candidates using octave-aware pitch-class counts
 * Prefers chords whose chord tones match the most frequently occurring pitch classes,
 * rewards compact octave clusters, and gives bonus for explicit bass matches.
 */
export const OctaveWeightingRule = {
    name: 'octaveWeighting',
    type: 'filter',
    priority: 60,
    description: 'Score chord candidates by octave-weighted pitch-class counts',
    execute(context, data) {
        const { chordList, normalizedBass, normalizePitchClass, pitchClassCounts, rawActiveMidiArray } = data;
        if (!chordList || chordList.length <= 1) return null;

        // Tunable weights
        const baseMatchWeight = 1.2; // per octave occurrence
        const perNoteProximityWeight = 0.8; // reward when multiple matches of same chord tone are close in octave
        const clusterWeight = 1.5; // reward when all matched chord tones are clustered closely
        const explicitBassBonus = 4;
        const rootMatchBonus = 2;

        const rawMidi = Array.isArray(rawActiveMidiArray) ? rawActiveMidiArray.slice().sort((a,b) => a - b) : [];

        const scores = new Map();
        for (const c of chordList) {
            const base = c.split('/')[0];
            let chordObj = null;
            try { chordObj = context.Chord.get(base); } catch (e) { chordObj = null; }

            const chordNotes = (chordObj && (chordObj.notes || chordObj.tones || chordObj.pcset || [])) || [];
            let score = 0;
            const allMatched = [];

            // For each chord tone, count octave matches and reward proximity among those matches
            chordNotes.forEach(n => {
                const pc = normalizePitchClass(n);
                const matched = rawMidi.filter(m => {
                    const nm = context.Midi.midiToNoteName(m).replace(/\d/, '');
                    return normalizePitchClass(nm) === pc;
                }).sort((a,b) => a - b);

                const count = matched.length;
                if (count > 0) {
                    score += count * baseMatchWeight;
                    allMatched.push(...matched);

                    if (count > 1) {
                        const spreadOctaves = (matched[matched.length - 1] - matched[0]) / 12.0;
                        const proximityScore = Math.max(0, 2 - spreadOctaves) * perNoteProximityWeight;
                        score += proximityScore;
                    }
                }
            });

            // Cluster proximity across all matched chord tones (prefer compact voicings)
            if (allMatched.length > 1) {
                const overallSpreadOctaves = (allMatched[allMatched.length - 1] - allMatched[0]) / 12.0;
                const clusterScore = Math.max(0, 2 - overallSpreadOctaves) * clusterWeight;
                score += clusterScore;
            }

            // Bonus if detected bass aligns with chord's expected bass/root
            if (normalizedBass) {
                const bassBase = c.split('/')[1] || null; // explicit slash bass
                if (bassBase) {
                    const normBassLead = normalizePitchClass(bassBase);
                    if (normBassLead === normalizedBass) score += explicitBassBonus;
                } else {
                    // If no explicit bass, prefer chords whose root matches normalizedBass
                    const rootName = chordNotes.length > 0 ? normalizePitchClass(chordNotes[0]) : null;
                    if (rootName === normalizedBass) score += rootMatchBonus;
                }
            }

            scores.set(c, score);
        }

        // Choose highest scoring chord (ties prefer earlier candidate)
        let best = null;
        let bestScore = -1;
        for (const c of chordList) {
            const s = scores.get(c) || 0;
            if (s > bestScore) { bestScore = s; best = c; }
        }

        // Debug: print scoring breakdown to console for inspection
        try {
            const scoreObj = {};
            for (const [k, v] of scores.entries()) scoreObj[k] = v;
            console.log('[OctaveWeighting] rawMidi=', rawActiveMidiArray, 'scores=', scoreObj, 'selected=', best, 'score=', bestScore);
        } catch (e) {
            // ignore console failures
        }

        return bestScore > 0 ? best : null;
    }
};

/**
 * Rootless Shell Chord Rule
 * Detects chord voicings without the root note
 */
export const RootlessShellChordRule = {
    name: 'rootlessShellChord',
    type: 'fallback',
    priority: 48,
    description: 'Detect rootless shell chord voicings',
    execute(context, data) {
        const { upperLetters, bassNote, normalizePitchClass, FLATTENED_PITCHES } = data;
        
        const normalizedInputs = upperLetters.map(n => normalizePitchClass(n));
        const normalizedBass = normalizePitchClass(bassNote);
        
        let rootScanOrder = [];
        const bassIdx = FLATTENED_PITCHES.indexOf(normalizedBass);
        if (bassIdx !== -1) rootScanOrder.push(bassIdx);
        
        for (let i = 0; i < 12; i++) {
            if (!rootScanOrder.includes(i)) rootScanOrder.push(i);
        }
        
        for (let r of rootScanOrder) {
            const rootName = FLATTENED_PITCHES[r];
            
            // Check for specific shell voicings
            const m3 = FLATTENED_PITCHES[(r + 3) % 12];
            const d7 = FLATTENED_PITCHES[(r + 10) % 12];
            const d13 = FLATTENED_PITCHES[(r + 9) % 12];
            const d3 = FLATTENED_PITCHES[(r + 4) % 12];

            // 13th voicing: 3, b7, 13
            if (normalizedInputs.includes(d3) && normalizedInputs.includes(d7) && normalizedInputs.includes(d13)) {
                return rootName + '13';
            }

            // Minor 6: m3, 6 (but not b5)
            const m6 = FLATTENED_PITCHES[(r + 9) % 12];
            if (normalizedInputs.includes(m3) && normalizedInputs.includes(m6)) {
                const b5 = FLATTENED_PITCHES[(r + 6) % 12];
                if (!normalizedInputs.includes(b5)) {
                    return rootName + 'm6';
                }
            }

            // Minor 11: m3, b7, 11
            const m11 = FLATTENED_PITCHES[(r + 5) % 12];
            if (normalizedInputs.includes(m3) && normalizedInputs.includes(d7) && normalizedInputs.includes(m11)) {
                return rootName + 'm11';
            }

            // Minor 9: m3, b7, 9
            const m9 = FLATTENED_PITCHES[(r + 2) % 12];
            if (normalizedInputs.includes(m3) && normalizedInputs.includes(d7) && normalizedInputs.includes(m9)) {
                return rootName + 'm9';
            }
        }
        
        return null;
    }
};

export const ExplicitTargetRule = {
    name: 'explicitTargets',
    type: 'fallback',
    priority: 47,
    description: 'Match against explicit chord type targets',
    execute(context, data) {
        const { chordList, normalizedBass, normalizePitchClass } = data;
        
        if (!chordList || chordList.length === 0) return null;
        
        const explicitTargets = ['dim7', 'm7b5', 'm11', '7#9', '9', '7b5', '7b13', '7', '13', '9sus4', 'Maj7', 'm7', 'm6', 'mi6', 'min6', 'm9'];
        
        for (let target of explicitTargets) {
            const foundExplicit = chordList.find(c => {
                const base = c.split('/')[0];
                const cleanBase = base.replace(new RegExp('^' + normalizedBass), '');
                return cleanBase === target || base.endsWith(target);
            });
            if (foundExplicit) return foundExplicit;
        }
        
        return null;
    }
};

export const PureRootChordRule = {
    name: 'pureRootChord',
    type: 'fallback',
    priority: 46,
    description: 'Fall back to any root position chord without slash notation',
    execute(context, data) {
        const { chordList } = data;
        
        if (!chordList || chordList.length === 0) return null;
        
        const pureRootChords = chordList.filter(c => !c.includes('/'));
        if (pureRootChords.length > 0) return pureRootChords[0];
        
        return null;
    }
};

export const AnyChordRule = {
    name: 'anyChord',
    type: 'fallback',
    priority: 1,
    description: 'Ultimate fallback: return first detected chord',
    execute(context, data) {
        const { chordList } = data;
        
        if (!chordList || chordList.length === 0) return null;
        
        return chordList[0];
    }
};
