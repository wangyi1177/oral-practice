TTS Service (FastAPI + Piper)
=============================

Run (manual)
------------

```
cd /srv
PIPER_MODEL_PATH=/srv/models/tts/en_US-amy-low.onnx \
PIPER_CONFIG_PATH=/srv/models/tts/en_US-amy-low.onnx.json \
PIPER_USE_CUDA=0 \
    /srv/venv/bin/uvicorn tts_service.main:app --host 0.0.0.0 --port 5002 --workers 1
```

API
---
- `GET /health` → `{"status": "ok"}`
- `POST /synthesize` JSON body:
  - `text` (string, required)
  - `speaker` (int, default 0)
  - `length_scale` (float, default 1.0)
  - `noise_scale` (float, default 0.667)
  - `noise_w` (float, default 0.8)
  - `volume` (float, default 1.0)
Returns `audio/wav`.

Quick test
----------

```
curl -X POST http://localhost:5002/synthesize \
  -H "Content-Type: application/json" \
  -o out.wav \
  -d '{"text": "Hello from Piper"}'
```

Health check: `curl http://localhost:5002/health`
