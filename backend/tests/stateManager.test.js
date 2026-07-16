/**
 * tests/stateManager.test.js
 *
 * Unit tests for InterviewStateManager.
 * Verifies: state initialises correctly, turns are tracked per topic,
 * competencies are marked covered on advance, time-boxing triggers at
 * the right threshold, and the prompt context string is accurate.
 */

'use strict';

const {
  InterviewStateManager,
  COMPETENCIES,
  MAX_TURNS_PER_TOPIC,
  TOTAL_TURN_BUDGET,
} = require('../agent/stateManager');

describe('InterviewStateManager — initialisation', () => {
  test('starts with correct defaults', () => {
    const sm = new InterviewStateManager();
    expect(sm.phase).toBe('pre-interview');
    expect(sm.competencyIndex).toBe(0);
    expect(sm.turnsOnTopic).toBe(0);
    expect(sm.totalTurns).toBe(0);
    expect(sm.rephraseUsed).toBe(false);
    expect(sm.coveredTopics).toEqual([]);
  });

  test('currentCompetency returns first competency on init', () => {
    const sm = new InterviewStateManager();
    expect(sm.currentCompetency).toBe(COMPETENCIES[0]);
  });

  test('isComplete is false on init', () => {
    const sm = new InterviewStateManager();
    expect(sm.isComplete).toBe(false);
  });
});

describe('InterviewStateManager — recordTurn', () => {
  test('increments both totalTurns and turnsOnTopic', () => {
    const sm = new InterviewStateManager();
    sm.recordTurn();
    expect(sm.totalTurns).toBe(1);
    expect(sm.turnsOnTopic).toBe(1);
    sm.recordTurn();
    expect(sm.totalTurns).toBe(2);
    expect(sm.turnsOnTopic).toBe(2);
  });

  test('turnsOnTopic resets after advanceTopic but totalTurns does not', () => {
    const sm = new InterviewStateManager();
    sm.recordTurn();
    sm.recordTurn();
    sm.advanceTopic();
    expect(sm.turnsOnTopic).toBe(0);
    expect(sm.totalTurns).toBe(2); // cumulative, not reset
  });
});

describe('InterviewStateManager — advanceTopic', () => {
  test('adds current competency to coveredTopics', () => {
    const sm = new InterviewStateManager();
    const firstTopic = sm.currentCompetency;
    sm.advanceTopic();
    expect(sm.coveredTopics).toContain(firstTopic);
  });

  test('increments competencyIndex', () => {
    const sm = new InterviewStateManager();
    sm.advanceTopic();
    expect(sm.competencyIndex).toBe(1);
    expect(sm.currentCompetency).toBe(COMPETENCIES[1]);
  });

  test('resets rephraseUsed when advancing', () => {
    const sm = new InterviewStateManager();
    sm.rephraseUsed = true;
    sm.advanceTopic();
    expect(sm.rephraseUsed).toBe(false);
  });

  test('sets phase to closing after all competencies are covered', () => {
    const sm = new InterviewStateManager();
    COMPETENCIES.forEach(() => sm.advanceTopic());
    expect(sm.phase).toBe('closing');
    expect(sm.isComplete).toBe(true);
  });

  test('all 4 competencies end up in coveredTopics after full walkthrough', () => {
    const sm = new InterviewStateManager();
    COMPETENCIES.forEach(() => sm.advanceTopic());
    expect(sm.coveredTopics).toEqual(COMPETENCIES);
  });
});

describe('InterviewStateManager — shouldAdvance (time-boxing)', () => {
  test('returns false when under the per-topic turn budget', () => {
    const sm = new InterviewStateManager();
    for (let i = 0; i < MAX_TURNS_PER_TOPIC - 1; i++) sm.recordTurn();
    expect(sm.shouldAdvance()).toBe(false);
  });

  test('returns true exactly at the per-topic turn budget', () => {
    const sm = new InterviewStateManager();
    for (let i = 0; i < MAX_TURNS_PER_TOPIC; i++) sm.recordTurn();
    expect(sm.shouldAdvance()).toBe(true);
  });
});

describe('InterviewStateManager — shouldClose', () => {
  test('returns false before total turn budget is hit', () => {
    const sm = new InterviewStateManager();
    for (let i = 0; i < TOTAL_TURN_BUDGET - 1; i++) sm.recordTurn();
    expect(sm.shouldClose()).toBe(false);
  });

  test('returns true at total turn budget', () => {
    const sm = new InterviewStateManager();
    for (let i = 0; i < TOTAL_TURN_BUDGET; i++) sm.recordTurn();
    expect(sm.shouldClose()).toBe(true);
  });

  test('returns true if phase is closing regardless of turn count', () => {
    const sm = new InterviewStateManager();
    sm.phase = 'closing';
    expect(sm.shouldClose()).toBe(true);
  });
});

describe('InterviewStateManager — toPromptContext', () => {
  test('returns a non-empty string', () => {
    const sm = new InterviewStateManager();
    const ctx = sm.toPromptContext();
    expect(typeof ctx).toBe('string');
    expect(ctx.length).toBeGreaterThan(0);
  });

  test('mentions current topic name in prompt context', () => {
    const sm = new InterviewStateManager();
    const ctx = sm.toPromptContext();
    expect(ctx).toContain('Problem Solving'); // first competency label
  });

  test('shows correct exchange count after recording turns', () => {
    const sm = new InterviewStateManager();
    sm.recordTurn();
    sm.recordTurn();
    const ctx = sm.toPromptContext();
    expect(ctx).toContain(`2 of ${MAX_TURNS_PER_TOPIC} max`);
  });

  test('shows covered topics after advancing', () => {
    const sm = new InterviewStateManager();
    sm.advanceTopic(); // covers problem_solving
    const ctx = sm.toPromptContext();
    expect(ctx).toContain('Problem Solving');
  });

  test('rephrase status appears correctly', () => {
    const sm = new InterviewStateManager();
    sm.rephraseUsed = true;
    const ctx = sm.toPromptContext();
    expect(ctx).toContain('yes — do not rephrase again');
  });
});

describe('InterviewStateManager — reset', () => {
  test('restores all fields to initial values', () => {
    const sm = new InterviewStateManager();
    sm.recordTurn();
    sm.recordTurn();
    sm.advanceTopic();
    sm.rephraseUsed = true;
    sm.reset();
    expect(sm.phase).toBe('pre-interview');
    expect(sm.competencyIndex).toBe(0);
    expect(sm.turnsOnTopic).toBe(0);
    expect(sm.totalTurns).toBe(0);
    expect(sm.rephraseUsed).toBe(false);
    expect(sm.coveredTopics).toEqual([]);
  });
});
