# Breezy

Complicated inside. Calm outside. Chat, multi-model research (Solo / Trio) and BYOK provider setup.
Vite + React + TypeScript. No backend. Keys and data live in localStorage (known hack until the backend step).

## Run locally
    npm install
    npm run dev        # http://localhost:5173
    npm run build      # typechecks, then builds to dist/
    npm test           # 44 unit tests (mocked fetch, no real provider calls)

## Deploy free (no card)
### Cloudflare Pages
1. Push this folder to a GitHub repo.
2. Cloudflare dashboard -> Workers & Pages -> Create -> Pages -> Connect to Git.
3. Framework preset: Vite. Build command: `npm run build`. Output directory: `dist`.
4. Deploy. Every push to main redeploys.

### Vercel
1. Push to GitHub, then vercel.com -> Add New -> Project -> import the repo.
2. Framework preset: Vite (auto-detected). Leave defaults. Deploy.

## Provider notes
- Groq and OpenRouter are expected to allow browser calls. Not verified in this build.
- Ollama: `OLLAMA_ORIGINS="*" ollama serve`. A deployed https site calling http://localhost may be blocked as mixed content (Chrome usually allows localhost, Safari and Firefox may not). Use `npm run dev` if so.
- A "Reachable" badge only means the /models endpoint answered. It does not prove chat works.

## Keys and storage
- API keys are held in memory only unless you tick "Remember this key" on a provider. Remembered keys are stored unencrypted in localStorage.
- Chats and runs are saved with one throttled write per second. Corrupt saved data is copied to `<key>.corrupt` and reported in a banner.
- Not implemented: backend, auth, IndexedDB, native Gemini/Anthropic/Puter adapters, web search, evidence verification.
