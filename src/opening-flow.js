'use strict';
class OpeningFlow {
    constructor() { this.reset(); }
    reset() { this.phase = 'search'; this.candidate = null; this.warnings = []; }
    select(project) {
        if (!project?.id || !project?.name)
            throw new Error('Select a valid project.');
        this.candidate = structuredClone(project);
        this.warnings = [];
        this.phase = 'selected';
        return this.snapshot();
    }
    require(phase) {
        if (this.phase !== phase)
            throw new Error(`Project opening is at "${this.phase}". Required step: ${phase}.`);
        if (!this.candidate)
            throw new Error('Choose a project before continuing.');
    }
    tested(warnings = []) { this.require('selected'); this.warnings = [...warnings]; this.phase = 'tested'; return this.snapshot(); }
    initialized() { this.require('tested'); this.phase = 'initialized'; return this.snapshot(); }
    opened() { this.require('initialized'); this.phase = 'open'; return this.snapshot(); }
    snapshot() {
        return { phase: this.phase, candidate: this.candidate ? {
                id: this.candidate.id, name: this.candidate.name, settings: {
                    jira: { projectKey: this.candidate.settings?.jira?.projectKey || '' },
                    confluence: { ...this.candidate.settings?.confluence },
                    github: { owner: this.candidate.settings?.github?.owner || '', repo: this.candidate.settings?.github?.repo || '' }
                }
            } : null, warnings: this.warnings };
    }
}
module.exports = { OpeningFlow };
