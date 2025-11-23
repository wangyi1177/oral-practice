Orchestrator Service (FastAPI)
=============================

Purpose: Bridge Ollama (LLM), ASR, and TTS services behind a single API.

Run (manual)
------------

```
cd /srv
ASR_URL=http://127.0.0.1:5001 \
TTS_URL=http://127.0.0.1:5002 \
OLLAMA_URL=http://127.0.0.1:11434 \
OLLAMA_MODEL=deepseek-r1:7b \
    /srv/venv/bin/uvicorn orchestrator.main:app --host 0.0.0.0 --port 8002 --workers 1
```

Endpoints
---------
- `GET /health`
- `POST /transcribe` (multipart with `audio=@file`) → forwards to ASR.
- `POST /synthesize` (JSON body matching TTS service) → returns `audio/wav`.
- `POST /chat` `{ "prompt": "...", "model": "optional", "options": {...} }` → forwards to Ollama `/api/generate`.

Quick tests
-----------

```
# health
curl http://localhost:8002/health

# transcribe via orchestrator
curl -F "audio=@/srv/asr_service/sample.wav" http://localhost:8002/transcribe

# chat via Ollama
curl -X POST http://localhost:8002/chat \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Hello!"}'
```
