/**
 * Chord Rule Engine - Plugin Architecture for Chord Detection
 * Manages rule registration, loading, and execution pipeline
 */

export class ChordRuleEngine {
    constructor() {
        this.rules = new Map(); // name -> rule object
        this.activeRules = new Set(); // enabled rule names
        this.context = {}; // shared context for rules (utilities, constants)
    }

    /**
     * Register a rule in the engine
     * @param {string} name - Unique rule identifier
     * @param {Object} rule - Rule object with execute() and optional priority, type
     */
    registerRule(name, rule) {
        if (!rule.execute || typeof rule.execute !== 'function') {
            throw new Error(`Rule '${name}' must implement execute(context, data) method`);
        }
        this.rules.set(name, {
            name,
            execute: rule.execute,
            priority: rule.priority ?? 0, // Higher priority = runs first
            type: rule.type ?? 'default', // 'override', 'filter', 'fallback'
            description: rule.description ?? ''
        });
    }

    /**
     * Enable one or more rules
     * @param {...string} ruleNames - Names of rules to enable
     */
    enable(...ruleNames) {
        ruleNames.forEach(name => {
            if (!this.rules.has(name)) {
                console.warn(`Rule '${name}' not found in registry`);
                return;
            }
            this.activeRules.add(name);
        });
    }

    /**
     * Disable one or more rules
     * @param {...string} ruleNames - Names of rules to disable
     */
    disable(...ruleNames) {
        ruleNames.forEach(name => this.activeRules.delete(name));
    }

    /**
     * Enable all registered rules
     */
    enableAll() {
        this.rules.forEach((rule, name) => this.activeRules.add(name));
    }

    /**
     * Disable all rules
     */
    disableAll() {
        this.activeRules.clear();
    }

    /**
     * Get status of all rules
     * @returns {Array<{name, enabled, type, description}>}
     */
    getRuleStatus() {
        return Array.from(this.rules.values()).map(rule => ({
            name: rule.name,
            enabled: this.activeRules.has(rule.name),
            type: rule.type,
            description: rule.description
        }));
    }

    /**
     * Set shared context available to all rules
     * @param {Object} contextObj - Context object with utilities (e.g., FLATTENED_PITCHES, Midi)
     */
    setContext(contextObj) {
        this.context = contextObj;
    }

    /**
     * Execute rules in priority order
     * Rules are organized by type:
     * 1. 'override' - Early exit if match (highest priority)
     * 2. 'filter' - Modifies/refines result
     * 3. 'default' - Normal rules
     * 4. 'fallback' - Only runs if previous stages found nothing
     * 
     * @param {Object} data - MIDI/chord data to process
     * @returns {string|null} - Detected chord name or null
     */
    execute(data) {
        const allActive = Array.from(this.activeRules)
            .map(name => this.rules.get(name))
            .filter(rule => rule !== undefined)
            .sort((a, b) => b.priority - a.priority); // Higher priority first

        const overrides = allActive.filter(r => r.type === 'override');
        const filters = allActive.filter(r => r.type === 'filter');
        const defaults = allActive.filter(r => r.type === 'default');
        const fallbacks = allActive.filter(r => r.type === 'fallback');

        const executionPipeline = [...overrides, ...filters, ...defaults, ...fallbacks];

        for (const rule of executionPipeline) {
            try {
                const result = rule.execute(this.context, data);
                if (result !== null && result !== undefined) {
                    return result;
                }
            } catch (error) {
                console.error(`Error executing rule '${rule.name}':`, error);
            }
        }

        return null;
    }

    /**
     * Get a specific rule by name
     * @param {string} name - Rule name
     * @returns {Object|undefined}
     */
    getRule(name) {
        return this.rules.get(name);
    }

    /**
     * Check if a rule is active
     * @param {string} name - Rule name
     * @returns {boolean}
     */
    isActive(name) {
        return this.activeRules.has(name);
    }
}

export default ChordRuleEngine;
