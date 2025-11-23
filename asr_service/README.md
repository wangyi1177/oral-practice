ASR Service (FastAPI + faster-whisper)
======================================

Run
---

Use GPU1 and the locally stored medium.en model:

```
cd /srv
CUDA_VISIBLE_DEVICES=1 WHISPER_MODEL_PATH=/srv/models/whisper/medium.en WHISPER_DEVICE=cuda WHISPER_COMPUTE_TYPE=float16 \
    /srv/venv/bin/uvicorn asr_service.main:app --host 0.0.0.0 --port 5001 --workers 1
```

Notes
-----
- `--workers 1` lets the process keep a single Whisper model instance loaded on the GPU.
- Adjust `beam_size`/`language`/`vad_filter` per request; defaults are tuned for general English.

Quick test
----------

```
curl -F "audio=@/srv/asr_service/sample.wav" http://localhost:5001/transcribe
```

Health check: `curl http://localhost:5001/health`
