# Ops Notes for Oral Practice Project

## Server Access
- SSH: `ssh wangyi@222.18.158.11 -p 10022`
- SCP root: `scp -P 10022 <local_path> wangyi@222.18.158.11:/srv/`
- Passwordless login; `sudo` does not require a password.

## Code/Service Layout (per plan.md and current tree)
- `/srv/orchestrator`: FastAPI bridge for Ollama/ASR/TTS (port 8002). Entrypoint `orchestrator.main:app`. Env vars: `ASR_URL`, `TTS_URL`, `OLLAMA_URL`, `OLLAMA_MODEL`, `ORCHESTRATOR_CORS`.
- `/srv/asr_service`: Faster-Whisper ASR (port 5001), GPU1 per plan.
- `/srv/tts_service`: Piper HTTP TTS (port 5002), CPU per plan.
- Ollama: runs on port 11434 (GPU0) with model `mistral` by default unless overridden.
- Frontend: Next.js app in `frontend/` (expects `NEXT_PUBLIC_ORCH_URL`, default http://127.0.0.1:8002).

## Recent Changes (local)
- Added Expansion APIs: `/expansion/start` returns seed + scaffolds; `/expansion/feedback` evaluates learner expansion and returns Chinese bullet feedback when `target_language=zh`, keeps improved example in English.
- Frontend Reflex flow now includes Expansion drill (seed fetch/play, record/transcribe, feedback playback).

## Run/Restart (if using systemd, names may vary)
- Example manual run:  
  `ASR_URL=http://127.0.0.1:5001 TTS_URL=http://127.0.0.1:5002 OLLAMA_URL=http://127.0.0.1:11434 OLLAMA_MODEL=mistral /srv/venv/bin/uvicorn orchestrator.main:app --host 0.0.0.0 --port 8002 --workers 1`
- If a systemd unit exists (e.g., `orchestrator.service`): `sudo systemctl restart orchestrator.service && sudo systemctl status orchestrator.service --no-pager -l`

## Notes
- CORS: `ORCHESTRATOR_CORS` can be set to allowed origins (comma-separated) or `*`.
- Theme/intent resolver: `/themes` returns phrase cards; outputs stored client-side for anchor reuse.
- Modules: Reflex (shadow → substitution → expansion), Mindset, Deep Dive per requirements.md/discuss.md.
