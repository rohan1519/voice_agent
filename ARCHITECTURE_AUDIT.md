# MASTER PROMPT — FULL CODEBASE ARCHITECTURE & DESIGN AUDIT

## 1. Executive Summary
- **Critical Security/Integrity Flaw**: Interview state and transcript are client-authoritative. The client controls the `conversationHistory` and `stateData` sent to the serverless functions, allowing trivial prompt injection or interview bypassing.
- **Critical Omission**: The LLM output validation logic (`validateScorecard`) was written and tested, but never actually called in the production endpoint (`evaluate.js`), meaning LLM hallucinations will crash the UI.
- **God Object Frontend**: `frontend/app.js` is 586 lines of tightly coupled DOM manipulation, Web Speech API integration, state management, and HTTP networking.
- **Hardcoded Prompts**: Prompts are deeply embedded within the API controllers (`chat.js` and `evaluate.js`), making it impossible to scale to new roles without duplicating the endpoints.
- **Unscalable Hardcoding**: `GROQ_MODEL` and `GROQ_API_URL` are duplicated across multiple files rather than centralized.

## 2. System Overview
**Architecture Pattern**: Serverless Monolith / Thick Client. 
- The frontend acts as a thick client maintaining all state. 
- The backend is a stateless API layer consisting of two Vercel serverless functions (`/api/chat` and `/api/evaluate`).
- **Data Flow**: The frontend sends the entire transcript and state object to the backend on every request. The backend deserializes it, mutates it via the LLM and StateManager, and returns the updated state to the frontend.
- **Dependency Graph**:
  - `frontend/app.js` -> `/api/chat`, `/api/evaluate`
  - `/api/chat` -> `backend/agent/stateManager.js`, Groq API
  - `/api/evaluate` -> `backend/agent/evaluator.js` (partial), Groq API

## 3. Findings

### Layering & boundaries
- **Finding**: Business logic is mixed with infrastructure in the API layer.
- **Evidence**: `backend/api/chat.js:6-79` contains a massive hardcoded system prompt string inside the controller file. 
- **Severity**: High
- **Growth Condition**: Adding a second role (e.g., Senior SDE, Product Manager) will require duplicating the entire endpoint or turning the file into a giant unreadable switch statement.

### Coupling & cohesion
- **Finding**: `frontend/app.js` is a God Module with high fan-in and high fan-out responsibilities.
- **Evidence**: `app.js` manages Web Speech API (`initRecognition`), DOM manipulation (`els.micBtn.addEventListener`), application state (`interviewState`), and networking (`kickoffInterview`).
- **Severity**: High
- **Growth Condition**: As the UI becomes more complex (e.g., adding a transcript editor, settings panel, or error recovery UI), this file will become unmaintainable and highly prone to regression bugs.

### Abstraction quality
- **Finding**: Duplicated initial state definitions.
- **Evidence**: `frontend/app.js:87-95` defines `getInitialState()` which hardcodes the exact same data structure expected by `backend/agent/stateManager.js:34-40`. 
- **Severity**: Medium
- **Growth Condition**: If the backend adds a new state field, the frontend will overwrite it or fail to initialize it properly, causing silent drift.

### State management & data flow
- **Finding**: State is entirely Client-Authoritative.
- **Evidence**: `backend/api/chat.js:86-97` receives `messages` and `stateData` directly from the client and trusts them implicitly: `Object.assign(state, stateData)`. 
- **Severity**: Critical
- **Growth Condition**: If this system were used for actual hiring, a candidate could intercept the API request and rewrite `conversationHistory` to make it look like they answered perfectly, or alter `stateData.competencyIndex` to skip questions entirely.

### Failure & error-handling architecture
- **Finding**: Scorecard validation is written but completely unused, allowing silent crashes.
- **Evidence**: `backend/agent/evaluator.js:62` defines `validateScorecard` to check for required fields like `sc.competencies`. However, `backend/api/evaluate.js:96-99` only calls `parseScorecard` and returns the output directly to the client. If `sc.competencies` is missing, `frontend/app.js:463` (`Object.entries(sc.competencies)`) will throw a TypeError and crash the UI.
- **Severity**: Critical
- **Growth Condition**: As LLMs occasionally hallucinate or change output shapes, this will cause intermittent, unhandled UI crashes in production that are incredibly hard to trace.

### Configuration & environment management
- **Finding**: Magic strings and duplicate configuration.
- **Evidence**: `GROQ_API_URL` and `GROQ_MODEL` are hardcoded at the top of both `backend/api/chat.js` (lines 3-4) and `backend/api/evaluate.js` (lines 3-4).
- **Severity**: Low
- **Growth Condition**: Switching to a different model (e.g., Llama 3.1) or a different provider requires tracking down and updating every individual API file.

### Testing architecture
- **Finding**: Critical paths are entirely untested.
- **Evidence**: Tests exist for `stateManager.test.js` and `evaluator.test.js`, but there are zero tests for `chat.js`, `evaluate.js`, or `app.js`.
- **Severity**: High
- **Growth Condition**: The system has no automated verification that the prompts actually produce the expected results from the Groq API, nor that the frontend correctly handles the API responses.

## 4. Adversarial Review

**Steelmanning the Client-Authoritative State (Critical Finding):**
One could argue that for a zero-cost, stateless demo application meant to showcase prompt engineering, a database is overkill. By keeping state on the client, the developer avoided setting up Postgres/Redis, authentication, and session management, allowing the project to be deployed as static files + serverless functions for free. 
*Verdict*: This justification holds **only** for a portfolio demo. However, if positioned as an actual "Junior SDE Screener" for hiring, this is a catastrophic vulnerability. A real screening tool must have a server-authoritative session.

**Steelmanning the God Object Frontend (High Finding):**
The README explicitly states "No framework — Next.js adds 4-6 hours of boilerplate setup for zero benefit here." The developer deliberately chose vanilla JS to reduce overhead.
*Verdict*: While avoiding React/Next.js is valid, putting 586 lines of mixed concerns into a single file is a false dichotomy. Vanilla JS supports ES modules. The Web Speech API, Networking, and State Management could have been easily separated into `speech.js`, `api.js`, and `ui.js` without any framework overhead.

**Blindspot Check:** What would break this system in a way its own tests wouldn't catch?
- **Network timeouts during evaluation**: `evaluate.js` sets `max_tokens: 1500`. On a slower LLM API day, this could easily exceed Vercel's default serverless timeout (typically 10-15 seconds on the hobby tier), causing a 504 Gateway Timeout that leaves the user stranded on the loading screen forever.

## 5. Prioritized Action Table

| # | Finding | Location | Severity | Proven/Suspected/Assumed | Blast radius if unaddressed | Effort to fix |
|---|---------|----------|----------|--------------------------|------------------------------|----------------|
| 1 | Unused scorecard validation leading to UI crash | `evaluate.js:96`, `app.js:463` | Critical | Proven | Breaks the entire evaluation screen for the user if the LLM hallucinates shape. | Low (1-line fix in evaluate.js) |
| 2 | Client-authoritative state allows trivial cheating | `chat.js:96`, `app.js:352` | Critical | Proven | Invalidates the integrity of the entire interview process. | High (Requires DB/Redis for session state) |
| 3 | Hardcoded prompts in API controllers | `chat.js:6-79` | High | Proven | Prevents adding new roles/interviews without massive code duplication. | Low (Extract to `prompts/` layer) |
| 4 | God object frontend mixes all concerns | `frontend/app.js` | High | Proven | UI becomes unmaintainable and highly susceptible to regressions. | Medium (Split into ES modules) |
| 5 | Duplicated initial state between frontend/backend | `app.js:87`, `stateManager.js:34` | Medium | Proven | Silent drift and data wiping when backend state changes. | Low (Sync logic or make backend authoritative) |
| 6 | Hardcoded config strings | `chat.js:3`, `evaluate.js:3` | Low | Proven | Wasted developer time when updating models. | Low (Move to `config.js`) |

## 6. What's Actually Good
- **`InterviewStateManager` Isolation**: The logic for advancing topics and enforcing time-boxing is cleanly extracted into a pure, testable class (`stateManager.js`) rather than relying on the LLM to govern the flow.
- **Prompt Design**: Injecting the state matrix (`toPromptContext()`) dynamically into the LLM system prompt is an elegant way to enforce interview time-boxing without complex agents.
- **Defensive Parsing**: `evaluator.js:37` explicitly strips markdown fences (` ```json `) before parsing, demonstrating a clear understanding of open-source model quirks.
- **Zero-Dependency Core**: Achieving a full voice-to-voice pipeline using only the native Web Speech API and simple fetch calls is highly efficient and minimizes attack surface.

## 7. Open Questions
- **Vercel Timeout Limits**: (Assumed) Vercel's free tier imposes a strict 10s timeout on serverless functions. Does the `llama-3.3-70b-versatile` model consistently return 1500 tokens for the evaluation endpoint within that window? If not, the application will fail frequently in production.
- **Browser Compatibility**: The README states Firefox and Safari are unsupported. Does `initRecognition()` gracefully handle users on iOS Chrome (which uses WebKit and may not support the API)? (Suspected incomplete failure path).
