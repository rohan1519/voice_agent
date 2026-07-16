# AI Voice Interviewer — Junior SDE Screener

A portfolio demo of a browser-based voice agent that conducts structured technical screening interviews using the Web Speech API and Groq.

## What this is / what this isn't

**What this is:** A portfolio demonstration of prompt engineering and explicit state-machine management. It showcases how to dynamically guide an LLM through a multi-topic technical interview without relying on implicit conversational history alone.
**What this isn't:** A production-ready or secure hiring tool. State is client-authoritative, making it trivially easy to cheat. It lacks a real backend, session management, or authentication.

## Demo

*(No live demo or screen recording is currently available.)* <!-- TODO: Add demo link or GIF here -->

## Architecture Overview

**Architecture Pattern:** Serverless Monolith / Thick Client

- **Thick Client:** The frontend (`frontend/app.js`) acts as the primary state manager, holding the entire interview state and conversation history.
- **Stateless API:** Vercel serverless functions (`/api/chat` and `/api/evaluate`) act as a proxy to the Groq API. They receive the full state from the client on each turn, mutate it via the LLM and the `InterviewStateManager`, and return the updated state.

```mermaid
flowchart TD
    Client[Browser (Thick Client)\nWeb Speech API]
    API[Vercel Serverless Functions\n/api/chat, /api/evaluate]
    Groq[Groq API\nllama-3.3-70b-versatile]

    Client -- Sends transcript & full state --> API
    API -- Injects state matrix & prompts --> Groq
    Groq -- Returns LLM response --> API
    API -- Updates & returns new state --> Client
```

## Tech Stack

- **Frontend:** Vanilla HTML / CSS / JS (No framework)
- **STT / TTS:** Web Speech API (Browser-native)
- **Backend/API:** Node.js Serverless Functions (Vercel)
- **LLM:** Groq (`llama-3.3-70b-versatile`)
- **Testing:** Jest (Node.js)

## Setup / Running Locally

**Requirements:** Chrome or Edge (Firefox and Safari do not support the Web Speech API). Requires the [Vercel CLI](https://vercel.com/docs/cli).

1. **Clone the repository**
   ```bash
   git clone https://github.com/umanggoel21/voice_agent.git
   cd voice_agent
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   Create a `.env` file in the project root based on the backend example:
   ```bash
   cp backend/.env.example .env
   ```
   Add your free Groq API key to the `.env` file (`GROQ_API_KEY=your_key`).

4. **Run the local server**
   ```bash
   vercel dev
   ```

5. **Open the App**
   Navigate to `http://localhost:3000` in Chrome or Edge and click "Start Interview".

## Known Limitations

This project has several structural limitations documented during its architecture audit:

- **Client-Authoritative State:** The frontend completely controls the `conversationHistory` and `stateData`. In a real hiring scenario, a candidate could intercept the API request and rewrite the history to bypass questions entirely.
- **God Object Frontend:** `frontend/app.js` tightly couples DOM manipulation, Web Speech API integration, state management, and HTTP networking into a single unmaintainable file.
- **Hardcoded Prompts:** Prompts are deeply embedded within the API controllers (`chat.js` and `evaluate.js`), making it impossible to scale to new interview roles without code duplication.
- **Unused Scorecard Validation:** While validation logic exists (`validateScorecard`), it is not called in the `/api/evaluate` production endpoint. LLM hallucinations regarding the scorecard shape will inevitably crash the UI.
- **Serverless Timeouts:** The evaluation endpoint uses a high token limit (`max_tokens: 1500`), which on slower API days can easily exceed Vercel's strict 10s serverless timeout on free tiers.
- **Duplicated Initial State:** The initial state definition is hardcoded independently in both the frontend and backend, risking silent drift and data wiping if the backend state changes.

## Design Decisions Worth Noting

- **`InterviewStateManager` Isolation:** The logic for advancing topics and enforcing time-boxing is cleanly extracted into a pure, testable class (`stateManager.js`), preventing the LLM from unpredictably governing the interview flow.
- **Dynamic Prompt Context:** Instead of relying on abstract rules, the agent dynamically injects a state matrix (`toPromptContext()`) into the LLM system prompt every turn. This explicitly enforces interview time-boxing and topic advancement.
- **Defensive LLM Parsing:** The scorecard evaluator deliberately strips markdown fences (e.g., ```json) before parsing, a robust pattern for handling open-source model output quirks.
- **Zero-Dependency Core:** Achieving a full voice-to-voice pipeline using only the native Web Speech API and simple fetch calls is highly efficient and minimizes the attack surface.

## What I'd Do Differently / Next Steps

To transition this from a portfolio demo to a real system:

1. **Server-Authoritative Session:** Move state management to a real backend (e.g., Node.js + Redis/PostgreSQL) to ensure interview integrity.
2. **Extract Prompt Layer:** Decouple prompts from the API controllers into a dedicated `prompts/` module, enabling multi-role scalability.
3. **Refactor Frontend:** Break the vanilla JS "God Object" into clean ES modules (`api.js`, `speech.js`, `ui.js`) or adopt a minimal framework.
4. **Implement Validation:** Wire up the existing `validateScorecard` logic to gracefully handle LLM shape hallucinations and prevent UI crashes.
5. **Centralize Configuration:** Move hardcoded model and API URL strings to a dedicated configuration layer.

## License

MIT License
