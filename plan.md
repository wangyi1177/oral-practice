# Development Plan (server: Arch with 3x2080Ti, CUDA>=12, Ollama running)

- [x] Verify server environment
  - [x] Check GPU/driver/CUDA with `nvidia-smi`
  - [x] Confirm Ollama reachable and chosen LLM model/quant (e.g., mistral 7B/13B) running
  - [x] Ensure deps installed: `base-devel git ffmpeg sox portaudio python python-virtualenv nodejs npm` (Docker optional)

- [ ] Model downloads and placement
  - [x] ASR: pull faster-whisper `medium.en` to `/srv/models/whisper/`
  - [x] TTS: download Piper EN voice (e.g., `en_US-amy-low.onnx` + json) to `/srv/models/tts/`
  - [ ] (Optional) Coqui TTS voice as backup to `/srv/models/tts/`
  - [ ] Confirm sufficient disk and VRAM usage plan (ASR on GPU1, LLM on GPU0, TTS on CPU)

- [x] ASR service
  - [x] Create FastAPI service with faster-whisper, VAD front-end
  - [x] Expose streaming endpoint on port 5001
  - [x] Test latency/VRAM on medium.en

- [x] TTS service
  - [x] Create Piper HTTP service (speed/accent params)
  - [x] Expose on port 5002
  - [x] Test sample synthesis

- [x] Orchestrator API
  - [x] Implement FastAPI service on port 8002 to route Ollama (11434), ASR (5001), TTS (5002)
  - [x] Implement session control, mode enforcement (Fluency/Review), theme/intent resolver (CN/EN), phrase card generation
  - [x] Add feedback endpoint producing layered report (chunks, major grammar, prosody) and weak-clip re-record targets
  - [x] Shadow flow: `/shadow/start` and `/shadow/feedback` wired to feedback + TTS

- [x] Frontend
  - [x] Next.js app with module selector (3 gyms), theme/intent picker (refresh/skip, CN/EN input), phrase cards UI, timeline metrics
  - [x] Mic capture (single-shot WebM capture for now), streaming ASR consumer, TTS playback
  - [x] Flows
    - Reflex Gym
      - [x] Shadow
      - [x] Substitution
      - [ ] Expansion
    - Mindset Lab
      - [ ] ELI5
      - [ ] Riddles
      - [ ] Sentence expansion
    - Deep Dive
      - [ ] Socratic prompts
      - [ ] Retell
      - [ ] Review/diagnostic
  - [x] Shadow practice UI (reference playback, record + ASR, feedback play) tied to orchestrator

- [ ] Adaptation and metrics
  - [ ] Heuristics: pause length, ASR confidence, filler rate -> hint/slowdown/simplify/advance
  - [ ] Metrics pipeline: pause length, filler rate, chunk reuse, retell coverage stored and shown per session/timeline

- [ ] Hardening and deploy
  - [ ] Set service env (CUDA_VISIBLE_DEVICES, model paths)
  - [ ] Systemd or Docker Compose with GPU passthrough and port bindings (11434, 8000, 5001, 5002)
  - [ ] Logging/monitoring, rate limits, privacy toggles (audio retention on/off)
  - [ ] SSH tunneling recipe documented for Windows dev (`-L` forwards for 11434/8000/5001/5002)
