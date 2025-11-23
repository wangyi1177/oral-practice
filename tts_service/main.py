import io
import os
import wave
from typing import Optional, Iterable

from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from piper import PiperVoice

app = FastAPI(title="TTS Service", version="0.1.0")

_voice: Optional[PiperVoice] = None


def get_voice() -> PiperVoice:
    """
    Lazy-load the Piper voice to keep startup light and reuse the model.
    """
    global _voice
    if _voice is None:
        model_path = os.getenv(
            "PIPER_MODEL_PATH", "/srv/models/tts/en_US-amy-low.onnx"
        )
        config_path = os.getenv(
            "PIPER_CONFIG_PATH", "/srv/models/tts/en_US-amy-low.onnx.json"
        )
        use_cuda = os.getenv("PIPER_USE_CUDA", "0") == "1"
        _voice = PiperVoice.load(model_path, config_path, use_cuda=use_cuda)
    return _voice


class SynthesisRequest(BaseModel):
    text: str = Field(..., min_length=1, description="Text to synthesize")
    volume: float = Field(1.0, description="Scalar to apply to PCM amplitude")


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


def _collect_pcm_bytes(chunks: Iterable[object]) -> tuple[bytes, Optional[int]]:
    pcm_parts: list[bytes] = []
    sample_rate = None
    for chunk in chunks:
        sr = getattr(chunk, "sample_rate", None)
        if sr:
            sample_rate = sr
        try:
            data = getattr(chunk, "audio_int16_bytes", None)
            if data is not None:
                pcm_parts.append(
                    data if isinstance(data, (bytes, bytearray)) else bytes(data)
                )
                continue
        except Exception:
            pass
        try:
            arr = getattr(chunk, "audio_int16_array", None)
            if arr is not None:
                pcm_parts.append(arr.astype("<i2").tobytes())
                continue
        except Exception:
            pass
        if hasattr(chunk, "tobytes"):
            pcm_parts.append(chunk.tobytes())
            continue
        if isinstance(chunk, (bytes, bytearray)):
            pcm_parts.append(bytes(chunk))
            continue
        raise TypeError(f"Unknown audio chunk type: {type(chunk)}")
    return b"".join(pcm_parts), sample_rate


@app.post("/synthesize")
async def synthesize(req: SynthesisRequest) -> StreamingResponse:
    """
    Synthesize text to WAV audio.
    """
    voice = get_voice()
    try:
        chunks = voice.synthesize(req.text)
        pcm_bytes, sr_from_chunks = _collect_pcm_bytes(chunks)
    except Exception as exc:  # pragma: no cover - runtime guard
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    sample_rate = sr_from_chunks or getattr(voice, "sample_rate", None)
    if sample_rate is None and getattr(voice, "config", None):
        cfg = voice.config
        if isinstance(cfg, dict):
            sample_rate = cfg.get("audio", {}).get("sample_rate")
    if sample_rate is None:
        sample_rate = 22050

    if req.volume != 1.0 and pcm_bytes:
        import numpy as np

        arr = np.frombuffer(pcm_bytes, dtype="<i2").astype("float32")
        arr = (arr * req.volume).clip(-32768, 32767).astype("<i2")
        pcm_bytes = arr.tobytes()

    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_bytes)

    buffer.seek(0)
    return StreamingResponse(buffer, media_type="audio/wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("tts_service.main:app", host="0.0.0.0", port=5002, reload=False)
