/**
 * stateManager.js — Pure interview state machine.
 * No browser APIs — fully testable in Node.js.
 *
 * Tracks which competencies are covered, turn counts per topic,
 * rephrase budget, and total elapsed turns. The state summary
 * is injected into the LLM system prompt each turn so the model
 * always knows where it is in the interview without us scripting
 * its next action.
 */

'use strict';

const COMPETENCIES = [
  'problem_solving',
  'data_structures',
  'debugging_approach',
  'code_quality_and_communication',
];

const COMPETENCY_LABELS = {
  problem_solving:                'Problem Solving',
  data_structures:                'Data Structures',
  debugging_approach:             'Debugging Approach',
  code_quality_and_communication: 'Code Quality & Communication',
};

const MAX_TURNS_PER_TOPIC = 3;
const TOTAL_TURN_BUDGET   = 14;  // ~10 min at ~40s per exchange

class InterviewStateManager {
  constructor() { this.reset(); }

  reset() {
    this.phase           = 'pre-interview'; // pre-interview | active | closing | done
    this.competencyIndex = 0;
    this.turnsOnTopic    = 0;
    this.rephraseUsed    = false;
    this.totalTurns      = 0;
    this.coveredTopics   = [];
  }

  get currentCompetency() {
    return COMPETENCIES[this.competencyIndex] || null;
  }

  get isComplete() {
    return this.phase === 'done' || this.phase === 'closing';
  }

  recordTurn() {
    this.totalTurns++;
    this.turnsOnTopic++;
  }

  advanceTopic() {
    if (this.currentCompetency) {
      this.coveredTopics.push(this.currentCompetency);
    }
    this.competencyIndex++;
    this.turnsOnTopic = 0;
    this.rephraseUsed = false;

    if (this.competencyIndex >= COMPETENCIES.length) {
      this.phase = 'closing';
    }
  }

  shouldAdvance() {
    return this.turnsOnTopic >= MAX_TURNS_PER_TOPIC;
  }

  shouldClose() {
    return this.totalTurns >= TOTAL_TURN_BUDGET || this.phase === 'closing';
  }

  // Returns a concise state block injected into the LLM system prompt.
  // The LLM uses this to decide dynamically: probe / move on / close.
  toPromptContext() {
    const remaining = COMPETENCIES.slice(this.competencyIndex + 1)
      .map(k => COMPETENCY_LABELS[k]).join(', ') || 'none';

    return [
      `Current topic: ${COMPETENCY_LABELS[this.currentCompetency] || 'closing'}`,
      `Exchanges on this topic: ${this.turnsOnTopic} of ${MAX_TURNS_PER_TOPIC} max`,
      `Total turns used: ${this.totalTurns} of ${TOTAL_TURN_BUDGET}`,
      `Rephrase used this question: ${this.rephraseUsed ? 'yes — do not rephrase again' : 'no'}`,
      `Topics remaining after this: ${remaining}`,
      `Covered topics: ${this.coveredTopics.map(k => COMPETENCY_LABELS[k]).join(', ') || 'none yet'}`,
    ].join('\n');
  }
}

module.exports = {
  InterviewStateManager,
  COMPETENCIES,
  COMPETENCY_LABELS,
  MAX_TURNS_PER_TOPIC,
  TOTAL_TURN_BUDGET,
};
