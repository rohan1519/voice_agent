/**
 * evaluator.js — Scorecard parsing and validation.
 * No browser APIs — fully testable in Node.js.
 *
 * Groq (open-source models) occasionally wraps JSON in markdown fences
 * even when instructed not to. parseScorecard strips these defensively
 * before parsing, and validateScorecard confirms the shape is complete
 * before the UI renders it — preventing a silent null-access crash.
 */

'use strict';

const REQUIRED_COMPETENCIES = [
  'problem_solving',
  'data_structures',
  'debugging_approach',
  'code_quality_and_communication',
];

const VALID_RECOMMENDATIONS = ['STRONG_HIRE', 'HIRE', 'HOLD', 'NO_HIRE'];
const VALID_RATINGS          = ['exceptional', 'strong', 'adequate', 'weak', 'missing'];

/**
 * Strips markdown fences and parses the JSON scorecard from a raw LLM response.
 * Throws a descriptive error if parsing fails, so the caller can show a message
 * rather than silently crashing.
 *
 * @param {string} raw - Raw string from Groq response
 * @returns {object} Parsed scorecard object
 */
function parseScorecard(raw) {
  if (!raw || typeof raw !== 'string') {
    throw new Error('Scorecard: received empty or non-string response from LLM.');
  }

  // Strip markdown code fences — open-source models emit these despite instructions
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(`Scorecard: LLM response is not valid JSON. Raw: "${raw.slice(0, 200)}..."`);
  }

  return parsed;
}

/**
 * Validates that a parsed scorecard has the expected shape.
 * Returns { valid: true } or { valid: false, errors: string[] }.
 *
 * Used before rendering — surface a user-friendly error rather than
 * crashing on missing keys.
 *
 * @param {object} sc - Parsed scorecard object
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateScorecard(sc) {
  const errors = [];

  if (!sc || typeof sc !== 'object') {
    return { valid: false, errors: ['Scorecard is not an object.'] };
  }

  // Top-level required fields
  if (!VALID_RECOMMENDATIONS.includes(sc.overall_recommendation)) {
    errors.push(
      `overall_recommendation must be one of ${VALID_RECOMMENDATIONS.join(', ')}, got: "${sc.overall_recommendation}"`
    );
  }

  if (typeof sc.overall_score !== 'number' || sc.overall_score < 1 || sc.overall_score > 5) {
    errors.push(`overall_score must be a number between 1 and 5, got: ${sc.overall_score}`);
  }

  if (!sc.competencies || typeof sc.competencies !== 'object') {
    errors.push('Missing competencies object.');
    return { valid: errors.length === 0, errors };
  }

  // Each competency must have score, rating, strengths[], concerns[], evidence
  for (const key of REQUIRED_COMPETENCIES) {
    const c = sc.competencies[key];
    if (!c) {
      errors.push(`Missing competency: ${key}`);
      continue;
    }
    if (typeof c.score !== 'number' || c.score < 1 || c.score > 5) {
      errors.push(`${key}.score must be 1-5, got: ${c.score}`);
    }
    if (!VALID_RATINGS.includes(c.rating)) {
      errors.push(`${key}.rating must be one of ${VALID_RATINGS.join(', ')}, got: "${c.rating}"`);
    }
    if (!Array.isArray(c.strengths)) {
      errors.push(`${key}.strengths must be an array`);
    }
    if (!Array.isArray(c.concerns)) {
      errors.push(`${key}.concerns must be an array`);
    }
    if (typeof c.evidence !== 'string') {
      errors.push(`${key}.evidence must be a string`);
    }
  }

  if (typeof sc.summary !== 'string' || sc.summary.length < 10) {
    errors.push('summary must be a non-empty string (min 10 chars)');
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { parseScorecard, validateScorecard, REQUIRED_COMPETENCIES, VALID_RECOMMENDATIONS };
