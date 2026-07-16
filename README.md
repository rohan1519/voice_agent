# AI Voice Interviewer — Junior SDE Screener

A voice agent that conducts a real, structured 10-minute screening interview for Junior SDE candidates — then generates a scored evaluation at the end. The differentiator isn't the voice pipeline; it's the interview policy embedded in the system prompt. The agent dynamically decides whether to probe deeper, rephrase, move on, or redirect based on the actual semantic content of what the candidate said, not keyword matching. It maintains an explicit state machine tracking which competencies have been covered and how many turns have been spent on each topic, so it behaves like a time-aware interviewer rather than a chatbot that happens to ask questions.

## Stack

| Layer | What |
|---|---|
| STT | Web Speech API — browser-native, free, unlimited |
| LLM | [Groq](https://groq.com) — `llama-3.3-70b-versatile`, free tier |
| TTS | Web Speech API — browser-native, free |
| UI | Vanilla HTML / CSS / JS — no framework, no build step |
| Deploy | Vercel (static) |
| Tests | Jest (Node.js) |

No backend. No build step. No framework overhead.

## Setup

**Requires Chrome or Edge** — Firefox and Safari do not support the Web Speech API.

```bash
# 1. Clone
git clone https://github.com/YOUR_USERNAME/voice_agent.git
cd voice_agent

# 2. Install dev dependencies (Jest only — not needed to run the app)
npm install

# 3. Get a free Groq API key at https://console.groq.com/keys
#    The app prompts for it in the browser. No .env needed to run.

# 4. Start the local server
python -m http.server 8080

# 5. Open http://localhost:8080 in Chrome or Edge
#    Enter your Groq key when prompted, click Start Interview
```

## Deploy

A `deploy.sh` script at the project root handles the full go-live flow — git init, checks, and Vercel deploy in one command.

```bash
chmod +x deploy.sh

# Dry run (checks everything, skips actual deploy):
./deploy.sh --dry-run

# Real deploy:
./deploy.sh
```

Requires [Vercel CLI](https://vercel.com/docs/cli) installed (`npm i -g vercel`) and logged in (`vercel login`). The script initialises git if needed, checks for uncommitted changes, and prints the live URL on success.

## Project Structure

```
├── app.js                    # All application logic: state machine, Groq calls, UI
├── index.html                # Three-screen SPA: Setup → Interview → Scorecard
├── style.css                 # Full design system — dark theme, all three screens
├── vercel.json               # Static deploy config
├── prompts/
│   ├── interviewer.md        # Full system prompt with interview policy and rubric
│   └── evaluator.md          # Scorecard generation prompt
├── examples/
│   └── sample_scorecard.json # Real evaluation output from a test run
├── src/agent/
│   ├── stateManager.js       # Pure state machine — testable without browser
│   └── evaluator.js          # Scorecard parsing + validation
├── tests/
│   ├── stateManager.test.js  # 21 tests — state, time-boxing, topic advancement
│   └── evaluator.test.js     # 23 tests — JSON parsing, fence stripping, validation
└── .github/workflows/ci.yml  # Runs tests on push; opens GitHub Issue on failure
```

## Design Decisions & Tradeoffs

- **Groq over OpenAI/Anthropic** — free tier (14,400 req/day, 6,000 tokens/min) is enough for a 10-minute interview with margin. The downside: `llama-3.3-70b-versatile` follows complex multi-part system prompts less reliably than frontier models. Compensated by injecting explicit interview state context every turn and writing the policy with concrete examples rather than abstract rules.

- **Web Speech API over Vapi/Deepgram/ElevenLabs** — Vapi's free trial is ~30 minutes total, which burns out during development before the evaluator can try it. Browser-native STT/TTS is unlimited and costs nothing. The tradeoff is Chrome/Edge-only, and voice quality is less polished. For a take-home demo this is the right call.

- **No framework** — Next.js adds 4-6 hours of boilerplate setup for zero benefit here. The IP is the interview logic and prompt design, not the rendering layer. Vanilla JS deploys identically to Next.js on Vercel.

- **State injected into the prompt every turn** — Rather than relying on the LLM to implicitly track progress from conversation history, we inject a compact state block (`current topic`, `exchanges on this topic`, `rephrase budget`) into the system prompt each turn. This makes the time-boxing and topic-advancement behaviour explicit and auditable, and it's why the agent actually moves on rather than looping.

- **Groq key in browser, not server** — There's no backend to protect. The key lives in `localStorage` and is sent only from the user's browser to Groq directly. This means no server to manage, no secrets to rotate, and zero hosting cost — acceptable for a screening demo, not for a production multi-tenant tool.

## Testing

```bash
# Run the full test suite (44 tests across 2 files)
npm test
```

Tests cover the two extractable pure-logic modules: `InterviewStateManager` (state transitions, turn accounting, time-boxing thresholds, prompt context generation) and the scorecard evaluator (JSON parsing, markdown fence stripping, full shape validation, all failure modes without crashing).

**Manual conversational tests** — to verify the agent's dynamic behaviour, run through these five scenarios and check the actual responses:
1. Strong answer → expect a genuine follow-up probing what was actually said
2. Vague/weak answer → expect one rephrase attempt or a clean move-on
3. "I don't know" → expect an acknowledgment and immediate topic change, no penalty loop
4. Off-topic ramble → expect a redirect back within one turn
5. Long-winded answer → expect the agent to interrupt and move on (time-boxing policy)
