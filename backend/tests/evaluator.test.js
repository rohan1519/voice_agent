/**
 * tests/evaluator.test.js
 *
 * Unit tests for scorecard parsing and validation.
 * Covers: clean JSON, JSON wrapped in markdown fences (open-source model quirk),
 * malformed JSON (no crash), missing fields, invalid score range, bad recommendation.
 */

'use strict';

const { parseScorecard, validateScorecard } = require('../agent/evaluator');

// ── Helpers ────────────────────────────────────────────────────────────────────

function validScorecard(overrides = {}) {
  return {
    candidate_id: 'session-123',
    role: 'Junior SDE',
    interview_duration_minutes: 10,
    overall_recommendation: 'HIRE',
    overall_score: 3.5,
    competencies: {
      problem_solving: {
        score: 4, rating: 'strong',
        strengths: ['Explained hash map O(n) solution unprompted'],
        concerns: ['Did not consider sorted array edge case'],
        evidence: 'Used hash set for O(n) detection, mentioned space tradeoff.',
      },
      data_structures: {
        score: 3, rating: 'adequate',
        strengths: ['Knows hash map use cases'],
        concerns: ['Could not explain collision handling'],
        evidence: 'Said "the language handles it automatically."',
      },
      debugging_approach: {
        score: 4, rating: 'strong',
        strengths: ['Systematic: reproduce → isolate → check env'],
        concerns: ['No mention of observability tools'],
        evidence: 'Described checking environment differences first.',
      },
      code_quality_and_communication: {
        score: 3, rating: 'adequate',
        strengths: ['Defined clean code as readable by others'],
        concerns: ['Could not give code review pushback example'],
        evidence: '"Code someone else can read in 6 months."',
      },
    },
    summary: 'Solid junior with good algorithmic instincts and a disciplined debugging mindset.',
    red_flags: [],
    notable_positives: ['Unprompted space-time tradeoff mention'],
    topics_not_covered: [],
    ...overrides,
  };
}

// ── parseScorecard ─────────────────────────────────────────────────────────────

describe('parseScorecard — clean JSON', () => {
  test('parses valid JSON string into an object', () => {
    const sc = validScorecard();
    const result = parseScorecard(JSON.stringify(sc));
    expect(result.overall_recommendation).toBe('HIRE');
    expect(result.overall_score).toBe(3.5);
  });

  test('strips leading ```json fence and trailing ``` before parsing', () => {
    const sc = validScorecard();
    const fenced = '```json\n' + JSON.stringify(sc) + '\n```';
    const result = parseScorecard(fenced);
    expect(result.role).toBe('Junior SDE');
  });

  test('strips plain ``` fences without language tag', () => {
    const sc = validScorecard();
    const fenced = '```\n' + JSON.stringify(sc) + '\n```';
    const result = parseScorecard(fenced);
    expect(result.overall_recommendation).toBe('HIRE');
  });

  test('handles leading/trailing whitespace around JSON', () => {
    const sc = validScorecard();
    const result = parseScorecard('   ' + JSON.stringify(sc) + '   ');
    expect(result.candidate_id).toBe('session-123');
  });
});

describe('parseScorecard — malformed input', () => {
  test('throws descriptive error on invalid JSON', () => {
    expect(() => parseScorecard('not json at all { broken')).toThrow(
      /not valid JSON/i
    );
  });

  test('throws on empty string', () => {
    expect(() => parseScorecard('')).toThrow(/empty or non-string/i);
  });

  test('throws on null input', () => {
    expect(() => parseScorecard(null)).toThrow(/empty or non-string/i);
  });

  test('throws on undefined input', () => {
    expect(() => parseScorecard(undefined)).toThrow(/empty or non-string/i);
  });

  test('error message includes a snippet of the raw response for debugging', () => {
    const rawBad = 'here is some text: {broken: json}';
    try {
      parseScorecard(rawBad);
    } catch (err) {
      expect(err.message).toContain('here is some text');
    }
  });
});

// ── validateScorecard ──────────────────────────────────────────────────────────

describe('validateScorecard — valid scorecards', () => {
  test('returns valid:true for a fully correct scorecard', () => {
    const { valid, errors } = validateScorecard(validScorecard());
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test('accepts all valid recommendation values', () => {
    for (const rec of ['STRONG_HIRE', 'HIRE', 'HOLD', 'NO_HIRE']) {
      const { valid } = validateScorecard(validScorecard({ overall_recommendation: rec }));
      expect(valid).toBe(true);
    }
  });

  test('accepts scores at boundary values 1 and 5', () => {
    const sc = validScorecard({ overall_score: 1 });
    expect(validateScorecard(sc).valid).toBe(true);
    const sc2 = validScorecard({ overall_score: 5 });
    expect(validateScorecard(sc2).valid).toBe(true);
  });
});

describe('validateScorecard — invalid top-level fields', () => {
  test('flags invalid overall_recommendation', () => {
    const { valid, errors } = validateScorecard(validScorecard({ overall_recommendation: 'MAYBE' }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('overall_recommendation'))).toBe(true);
  });

  test('flags overall_score outside 1-5 range', () => {
    const { valid, errors } = validateScorecard(validScorecard({ overall_score: 6 }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('overall_score'))).toBe(true);
  });

  test('flags missing competencies object', () => {
    const sc = validScorecard();
    delete sc.competencies;
    const { valid, errors } = validateScorecard(sc);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('competencies'))).toBe(true);
  });

  test('flags missing summary', () => {
    const sc = validScorecard({ summary: '' });
    const { valid, errors } = validateScorecard(sc);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('summary'))).toBe(true);
  });
});

describe('validateScorecard — invalid competency fields', () => {
  test('flags a missing competency key', () => {
    const sc = validScorecard();
    delete sc.competencies.data_structures;
    const { valid, errors } = validateScorecard(sc);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('data_structures'))).toBe(true);
  });

  test('flags score out of 1-5 range within a competency', () => {
    const sc = validScorecard();
    sc.competencies.problem_solving.score = 0;
    const { valid, errors } = validateScorecard(sc);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('problem_solving.score'))).toBe(true);
  });

  test('flags invalid rating value within a competency', () => {
    const sc = validScorecard();
    sc.competencies.debugging_approach.rating = 'excellent';
    const { valid, errors } = validateScorecard(sc);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('debugging_approach.rating'))).toBe(true);
  });

  test('flags non-array strengths', () => {
    const sc = validScorecard();
    sc.competencies.problem_solving.strengths = 'good problem solver';
    const { valid, errors } = validateScorecard(sc);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('problem_solving.strengths'))).toBe(true);
  });

  test('flags non-string evidence', () => {
    const sc = validScorecard();
    sc.competencies.code_quality_and_communication.evidence = null;
    const { valid, errors } = validateScorecard(sc);
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('code_quality_and_communication.evidence'))).toBe(true);
  });
});

describe('validateScorecard — null/garbage input', () => {
  test('handles null gracefully without crashing', () => {
    const { valid, errors } = validateScorecard(null);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('handles empty object gracefully', () => {
    const { valid, errors } = validateScorecard({});
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });
});
