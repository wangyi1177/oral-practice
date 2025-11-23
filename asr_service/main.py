import os
import tempfile
from typing import Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from faster_whisper import WhisperModel


app = FastAPI(title="ASR Service", version="0.1.0")

_model: Optional[WhisperModel] = None


def get_model() -> WhisperModel:
    """
    Lazy-load the Whisper model so the process can start quickly and reuse GPU memory.
    """
    global _model
    if _model is None:
        model_path = os.getenv("WHISPER_MODEL_PATH", "/srv/models/whisper/medium.en")
        device = os.getenv("WHISPER_DEVICE", "cuda")
        compute_type = os.getenv("WHISPER_COMPUTE_TYPE", "float16")
        _model = WhisperModel(model_path, device=device, compute_type=compute_type)
    return _model


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    language: Optional[str] = None,
    beam_size: int = 5,
    vad_filter: bool = True,
) -> JSONResponse:
    """
    Transcribe an uploaded audio file.
    """
    if not audio.filename:
        raise HTTPException(status_code=400, detail="audio file is required")

    suffix = os.path.splitext(audio.filename)[-1] or ".wav"

    try:
        with tempfile.NamedTemporaryFile(delete=True, suffix=suffix) as tmp:
            payload = await audio.read()
            tmp.write(payload)
            tmp.flush()

            model = get_model()
            segments, info = model.transcribe(
                tmp.name,
                language=language,
                beam_size=beam_size,
                vad_filter=vad_filter,
            )

        segment_payload: List[Dict[str, float | str]] = []
        for seg in segments:
            segment_payload.append(
                {
                    "start": seg.start,
                    "end": seg.end,
                    "text": seg.text.strip(),
                }
            )

        return JSONResponse(
            {
                "language": info.language,  # auto-detected if language not provided
                "duration": info.duration,
                "transcription": " ".join(s["text"] for s in segment_payload),
                "segments": segment_payload,
            }
        )
    except HTTPException:
        raise
    except Exception as exc:  # pragma: no cover - runtime protection
        raise HTTPException(status_code=500, detail=str(exc)) from exc


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("asr_service.main:app", host="0.0.0.0", port=5001, reload=False)
