const { parseScorecard, validateScorecard } = require('../agent/evaluator');

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

function buildEvaluatorPrompt(transcript, durationMinutes) {
  const transcriptText = transcript
    .map(t => `${t.role === 'user' ? 'CANDIDATE' : 'INTERVIEWER'}: ${t.content}`)
    .join('\n');

  return {
    system: `You are an experienced engineering hiring manager reviewing a recorded junior SDE screening interview.
Analyze the transcript and output a JSON scorecard. Ground every rating in specific things the candidate actually said. Do not infer things they did not say. If a topic was not covered, mark score as 1 and rating as "missing".

SCORING RUBRIC (1-5):
5 Exceptional: Explains WHY, concrete examples, anticipates tradeoffs unprompted.
4 Strong: Correct and clear, some depth. Minor gaps.
3 Adequate: Knows basics, struggles with depth. Needs guidance.
2 Weak: Surface knowledge only. Significant gaps.
1 Missing: Did not answer, said "I don't know", or fundamentally wrong.

RECOMMENDATION:
STRONG_HIRE: 4+ on 3 of 4 competencies, no 1s
HIRE: Average ≥ 3.0, no more than one 2
HOLD: Mixed signals. Needs second interview.
NO_HIRE: Average < 2.5 or two or more 1s/2s

REQUIRED OUTPUT: Respond with ONLY valid JSON. No explanation outside the JSON. No markdown fences.

{
  "candidate_id": "session-${Date.now()}",
  "role": "Junior SDE",
  "interview_duration_minutes": ${durationMinutes},
  "overall_recommendation": "HIRE or STRONG_HIRE or HOLD or NO_HIRE",
  "overall_score": 0.0,
  "competencies": {
    "problem_solving": { "score": 0, "rating": "...", "strengths": [], "concerns": [], "evidence": "..." },
    "data_structures": { "score": 0, "rating": "...", "strengths": [], "concerns": [], "evidence": "..." },
    "debugging_approach": { "score": 0, "rating": "...", "strengths": [], "concerns": [], "evidence": "..." },
    "code_quality_and_communication": { "score": 0, "rating": "...", "strengths": [], "concerns": [], "evidence": "..." }
  },
  "summary": "2-3 sentence plain-English summary for a hiring committee",
  "red_flags": [],
  "notable_positives": [],
  "topics_not_covered": []
}`,
    user: `INTERVIEW TRANSCRIPT:\n${transcriptText}`,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { transcript, durationMinutes } = req.body;
  
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: missing API key' });
  }

  const { system, user } = buildEvaluatorPrompt(transcript, durationMinutes);

  try {
    const groqRes = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        max_tokens: 1500,
        temperature: 0.7,
        top_p: 0.9,
      }),
    });

    if (groqRes.status === 429) {
      return res.status(429).json({ error: 'Rate limit hit. Wait a moment and try again.' });
    }

    if (!groqRes.ok) {
      const err = await groqRes.json().catch(() => ({}));
      return res.status(groqRes.status).json({ error: err?.error?.message || 'Groq API error' });
    }

    const data = await groqRes.json();
    const raw = data.choices?.[0]?.message?.content?.trim() || '';
    
    // Parse the JSON safely using the evaluator logic
    const scorecard = parseScorecard(raw);
    
    const validation = validateScorecard(scorecard);
    if (!validation.valid) {
      return res.status(500).json({ error: 'LLM returned malformed scorecard: ' + validation.errors.join(', ') });
    }
    
    return res.status(200).json(scorecard);
  } catch (error) {
    console.error('Scorecard generation failed:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};
