import io
import os
import uuid
import json
import logging
import re
from enum import Enum
from typing import Any, Dict, List, Optional
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field


app = FastAPI(title="Orchestrator", version="0.1.0")

logger = logging.getLogger("uvicorn.error")
logger.setLevel(logging.INFO)


def _load_env_file() -> None:
    """Load .env alongside this file if systemd did not export variables."""
    env_path = Path(__file__).with_name(".env")
    if not env_path.is_file():
        return
    try:
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
    except Exception as exc:  # pragma: no cover - best-effort load
        logger.warning("Failed to load .env: %s", exc)


_load_env_file()

ASR_URL = os.getenv("ASR_URL", "http://127.0.0.1:5001")
TTS_URL = os.getenv("TTS_URL", "http://127.0.0.1:5002")
OLLAMA_URL = os.getenv("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")
DEEPSEEK_API_BASE = os.getenv("DEEPSEEK_API_BASE", "https://api.deepseek.com")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEFAULT_MODEL = os.getenv("DEFAULT_MODEL", "deepseek-chat")
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ORCHESTRATOR_CORS", "*").split(",")
    if origin.strip()
]
BEVERAGE_TERMS = {
    "coffee",
    "latte",
    "espresso",
    "cappuccino",
    "tea",
    "drink",
    "juice",
    "beverage",
    "order",
    "brew",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS if ALLOWED_ORIGINS != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class Mode(str, Enum):
    fluency = "fluency"
    review = "review"


class ChatRequest(BaseModel):
    prompt: str = Field(..., description="Prompt forwarded to Ollama")
    model: Optional[str] = Field(None, description="Override default model")
    stream: bool = Field(False, description="Currently always False for JSON response")
    options: Dict[str, Any] = Field(default_factory=dict)


class TtsRequest(BaseModel):
    text: str
    speaker: int = 0
    length_scale: float = 1.0
    noise_scale: float = 0.667
    noise_w: float = 0.8
    volume: float = 1.0


class SessionCreateRequest(BaseModel):
    user_id: Optional[str] = None
    mode: Mode = Mode.fluency


class SessionUpdateRequest(BaseModel):
    mode: Mode


class SessionChatRequest(BaseModel):
    prompt: str
    options: Dict[str, Any] = Field(default_factory=dict)
    model: Optional[str] = None


class SessionInfo(BaseModel):
    session_id: str
    mode: Mode
    turns: int


class ThemeRequest(BaseModel):
    language: str = Field("en", description="Language code, 'en' or 'zh'")
    theme: str = Field(..., description="Topic or intent requested")
    difficulty: Optional[str] = Field(
        None, description="Optional difficulty hint (easy/medium/hard)"
    )
    count: int = Field(3, ge=1, le=10, description="Number of phrase cards to return")
    model: Optional[str] = None


class PhraseCard(BaseModel):
    phrase: str
    translation: Optional[str] = None
    cue: Optional[str] = None
    difficulty: Optional[str] = None


class ThemeResponse(BaseModel):
    language: str
    theme: str
    phrase_cards: List[PhraseCard]
    intent: str


class FeedbackRequest(BaseModel):
    transcript: str = Field(..., description="Full transcript text")
    segments: List[Dict[str, Any]] = Field(
        default_factory=list, description="Optional ASR segments with timing/confidence"
    )
    target_language: str = Field("en", description="en or zh")


class FeedbackResponse(BaseModel):
    chunks: List[str]
    grammar_notes: List[str]
    prosody_notes: List[str]
    rerecord_targets: List[str]


class ShadowStartRequest(BaseModel):
    theme: str
    difficulty: Optional[str] = None
    language: str = "en"
    anchor_phrase: Optional[str] = None
    model: Optional[str] = None


class ShadowStartResponse(BaseModel):
    sentence: str
    cue: Optional[str] = None


class ShadowFeedbackRequest(BaseModel):
    reference: str = Field(..., description="Reference sentence that user shadowed")
    transcript: str = Field(..., description="User transcript from ASR")
    target_language: str = Field("en", description="en or zh")
    options: Dict[str, Any] = Field(default_factory=dict)


class ShadowFeedbackResponse(BaseModel):
    feedback: str


class SubstitutionSlot(BaseModel):
    label: str
    options: List[str]


class SubstitutionStartRequest(BaseModel):
    theme: str
    difficulty: Optional[str] = None
    language: str = "en"
    anchor_phrase: Optional[str] = None
    model: Optional[str] = None


class SubstitutionStartResponse(BaseModel):
    base_sentence: str
    slots: List[SubstitutionSlot]


class SubstitutionFeedbackRequest(BaseModel):
    base_sentence: str
    transcript: str
    slots: List[SubstitutionSlot] = Field(default_factory=list)
    target_language: str = "en"
    options: Dict[str, Any] = Field(default_factory=dict)


class SubstitutionFeedbackResponse(BaseModel):
    feedback: str
    next_variant: Optional[str] = None


class ExpansionStartRequest(BaseModel):
    theme: str
    difficulty: Optional[str] = None
    language: str = "en"
    anchor_phrase: Optional[str] = None
    model: Optional[str] = None


class ExpansionStartResponse(BaseModel):
    seed: str
    scaffolds: List[str]


class ExpansionFeedbackRequest(BaseModel):
    seed: str
    transcript: str
    scaffolds: List[str] = Field(default_factory=list)
    target_language: str = "en"
    options: Dict[str, Any] = Field(default_factory=dict)


class ExpansionFeedbackResponse(BaseModel):
    feedback: str
    improved_variant: Optional[str] = None

class ConversationMessage(BaseModel):
    role: str
    content: str


class ReviewStartRequest(BaseModel):
    theme: str
    difficulty: Optional[str] = None
    language: str = "en"
    model: Optional[str] = None


class ReviewStartResponse(BaseModel):
    opening: str


class ReviewTurnRequest(BaseModel):
    theme: str
    difficulty: Optional[str] = None
    language: str = "en"
    history: List[ConversationMessage] = Field(default_factory=list)
    user_reply: str
    attempt: int = Field(1, ge=1, description="1 for first try on current agent line")
    model: Optional[str] = None
    options: Dict[str, Any] = Field(default_factory=dict)


class ReviewTurnReply(BaseModel):
    reply: str

MODE_INSTRUCTIONS: Dict[Mode, str] = {
    Mode.fluency: (
        "You are a friendly oral English coach focused on fluency. Encourage natural "
        "conversation, offer gentle nudges, and avoid long corrective monologues."
    ),
    Mode.review: (
        "You are a meticulous reviewer. Highlight grammar or pronunciation issues "
        "explicitly and provide concise actionable feedback."
    ),
}

SESSIONS: Dict[str, Dict[str, Any]] = {}


@app.on_event("startup")
async def startup() -> None:
    app.state.http = httpx.AsyncClient(timeout=60)


@app.on_event("shutdown")
async def shutdown() -> None:
    http: httpx.AsyncClient = app.state.http
    await http.aclose()


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/transcribe")
async def proxy_transcribe(audio: UploadFile = File(...)) -> JSONResponse:
    """
    Forward audio to ASR service.
    """
    if not audio.filename:
        raise HTTPException(status_code=400, detail="audio file is required")

    payload = await audio.read()
    files = {
        "audio": (
            audio.filename,
            payload,
            audio.content_type or "application/octet-stream",
        )
    }

    client: httpx.AsyncClient = app.state.http
    try:
        resp = await client.post(f"{ASR_URL}/transcribe", files=files)
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=exc.response.text or str(exc),
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return JSONResponse(resp.json())


@app.post("/synthesize")
async def proxy_synthesize(req: TtsRequest) -> StreamingResponse:
    """
    Forward synthesis request to TTS service and stream audio back.
    """
    client: httpx.AsyncClient = app.state.http
    try:
        resp = await client.post(f"{TTS_URL}/synthesize", json=req.dict())
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=502,
            detail=exc.response.text or str(exc),
        ) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    buffer = io.BytesIO(resp.content)
    buffer.seek(0)
    media_type = resp.headers.get("content-type", "audio/wav")
    return StreamingResponse(buffer, media_type=media_type)


async def _query_ollama(
    prompt: str,
    model: Optional[str],
    options: Dict[str, Any],
    context: Optional[List[int]] = None,
) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "model": model or OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
        "options": options,
    }
    if context:
        payload["context"] = context

    client: httpx.AsyncClient = app.state.http
    resp = await client.post(f"{OLLAMA_URL}/api/generate", json=payload)
    resp.raise_for_status()
    return resp.json()


async def _query_deepseek(prompt: str, model: Optional[str], options: Dict[str, Any]) -> Dict[str, Any]:
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=500, detail="DEEPSEEK_API_KEY not set")
    payload = {
        "model": model or DEEPSEEK_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": options.get("temperature", 0.6),
        "top_p": options.get("top_p", 0.9),
        "stream": False,
    }
    headers = {"Authorization": f"Bearer {DEEPSEEK_API_KEY}"}
    client: httpx.AsyncClient = app.state.http
    resp = await client.post(f"{DEEPSEEK_API_BASE}/v1/chat/completions", json=payload, headers=headers)
    resp.raise_for_status()
    data = resp.json()
    choice = (data.get("choices") or [{}])[0]
    content = choice.get("message", {}).get("content", "")
    return {"response": content, "context": None}


async def _query_llm(
    prompt: str,
    model: Optional[str],
    options: Dict[str, Any],
    context: Optional[List[int]] = None,
) -> Dict[str, Any]:
    chosen_model = model or DEFAULT_MODEL or OLLAMA_MODEL
    name = (chosen_model or "").lower()
    logger.info(f'use mode: {name}')
    if name.startswith("deepseek"):
        return await _query_deepseek(prompt, chosen_model, options)
    return await _query_ollama(prompt, chosen_model, options, context)


@app.post("/chat")
async def chat(req: ChatRequest) -> Dict[str, Any]:
    """
    Forward prompt to Ollama (non-streaming) and return response text.
    """
    try:
        data = await _query_ollama(req.prompt, req.model, req.options)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    return {"response": data.get("response", ""), "context": data.get("context")}


def _get_session(session_id: str) -> Dict[str, Any]:
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    return session


@app.post("/sessions", response_model=SessionInfo)
async def create_session(req: SessionCreateRequest) -> SessionInfo:
    session_id = uuid.uuid4().hex
    SESSIONS[session_id] = {
        "user_id": req.user_id,
        "mode": req.mode,
        "history": [],
        "context": None,
    }
    return SessionInfo(session_id=session_id, mode=req.mode, turns=0)


@app.get("/sessions/{session_id}", response_model=SessionInfo)
async def get_session(session_id: str) -> SessionInfo:
    session = _get_session(session_id)
    return SessionInfo(
        session_id=session_id, mode=session["mode"], turns=len(session["history"])
    )


@app.patch("/sessions/{session_id}", response_model=SessionInfo)
async def update_session(session_id: str, req: SessionUpdateRequest) -> SessionInfo:
    session = _get_session(session_id)
    session["mode"] = req.mode
    return SessionInfo(
        session_id=session_id, mode=session["mode"], turns=len(session["history"])
    )


@app.post("/sessions/{session_id}/chat")
async def session_chat(session_id: str, req: SessionChatRequest) -> Dict[str, Any]:
    session = _get_session(session_id)
    mode: Mode = session["mode"]
    system_prompt = MODE_INSTRUCTIONS.get(mode, "")
    composed_prompt = f"{system_prompt}\nUser: {req.prompt}"

    try:
        data = await _query_ollama(
            composed_prompt, req.model, req.options, context=session.get("context")
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    response_text = data.get("response", "")
    session["context"] = data.get("context")
    session["history"].append({"prompt": req.prompt, "response": response_text})

    return {
        "session_id": session_id,
        "mode": mode,
        "response": response_text,
        "turns": len(session["history"]),
    }


@app.post("/themes", response_model=ThemeResponse, response_model_exclude_none=True)
async def resolve_theme(req: ThemeRequest) -> ThemeResponse:
    """
    Resolve theme/intent and return anchor phrase cards across difficulty.
    """
    language = req.language.lower()
    if language not in {"en", "zh"}:
        language = "en"

    # Always request the intent summary in English so downstream anchors stay consistent.
    if language == "zh":
        intent_prompt = (
            "Summarize the following (Chinese) theme in English, and describe a practice scenario or role: "
            f"{req.theme}"
        )
    else:
        intent_prompt = (
            "Summarize the learning intent in English in one sentence and provide a context "
            f"or persona for practice: {req.theme}"
        )

    try:
        intent_data = await _query_llm(
            intent_prompt, req.model, {"temperature": 0.3, "top_p": 0.9}
        )
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    intent_text = intent_data.get("response", req.theme)

    anchor_prompt = (
        "Return JSON ONLY: {\"anchors\": [{\"difficulty\": \"easy|medium|hard|expert\", "
        "\"phrase\": \"natural spoken line, 6-12 words, no numbering, no the word 'phrase'\", "
        "\"translation\": \"omit this field\", "
        "\"cue\": \"specific delivery hint like 'slow and polite', 'warm and upbeat', 'brisk and concise' (avoid generic 'context hint')\"} ...]}. "
        "Keep the scenario aligned to the given theme and make each phrase distinct. "
        "Avoid food/drink ordering or coffee requests unless the theme explicitly demands it. "
        "Do not output anchors about buying/making/ordering coffee or drinks; focus on conversational moves only. "
        "Spread across different social moves (greeting, quick status, offer help, ask opinion, share update) so anchors do not repeat the same intent. "
        f"Theme: {intent_text}. Language: en. Provide {req.count} anchors with varied difficulty. "
        "Example anchors (adapt to the theme, not necessarily coffee): "
        "{\"difficulty\": \"easy\", \"phrase\": \"Need a quick update before the meeting\", \"cue\": \"calm and clear\"}, "
        "{\"difficulty\": \"hard\", \"phrase\": \"Could you summarize yesterday's decisions quickly?\", \"cue\": \"brisk and concise\"}"
    )
    logger.info("anchor_prompt: %s", anchor_prompt)
    cards: List[PhraseCard] = []
    try:
        anchor_data = await _query_llm(
            anchor_prompt, req.model, {"temperature": 0.8, "top_p": 0.9}
        )
        logger.info("anchor_raw_response: %s", anchor_data.get("response", "")[:500])
        raw_text = anchor_data.get("response", "") or "{}"
        # Handle code fences like ```json ... ``` from some models.
        if raw_text.strip().startswith("```"):
            lines = [
                line for line in raw_text.splitlines() if not line.strip().startswith("```")
            ]
            raw_text = "\n".join(lines)
        parsed = {}
        try:
            parsed = json.loads(raw_text)
        except Exception:
            # Best-effort: extract the first JSON object substring.
            start = raw_text.find("{")
            end = raw_text.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    parsed = json.loads(raw_text[start : end + 1])
                except Exception:
                    parsed = {}
        for item in parsed.get("anchors", [])[: req.count]:
            phrase = (item.get("phrase") or "").strip()
            if not phrase or "phrase" in phrase.lower():
                continue
            cue = (item.get("cue") or "").strip()
            difficulty = (item.get("difficulty") or "").strip().lower()
            if not cue or "context hint" in cue.lower() or "hint" in cue.lower():
                fallback = {
                    "easy": "Delivery: slow and polite",
                    "medium": "Delivery: clear and upbeat",
                    "hard": "Delivery: brisk and concise",
                    "expert": "Delivery: confident and fast",
                }
                cue = fallback.get(difficulty, "Delivery: clear and polite")
            cards.append(
                PhraseCard(
                    phrase=phrase,
                    translation=None,
                    cue=cue,
                    difficulty=item.get("difficulty"),
                )
            )
    except Exception:
        raise

    return ThemeResponse(
        language=language, theme=req.theme, phrase_cards=cards, intent=intent_text
    )


@app.post("/shadow/start", response_model=ShadowStartResponse)
async def shadow_start(req: ShadowStartRequest) -> ShadowStartResponse:
    """
    Return a short sentence for shadowing based on theme and difficulty.
    """
    anchor_note = (
        f"Use this as the base idea and keep a similar vibe: {req.anchor_phrase}. "
        if req.anchor_phrase
        else ""
    )
    diff = (req.difficulty or "medium").lower()
    difficulty_style = {
        "easy": "simple, short, friendly, polite, 6-10 words",
        "medium": "everyday tone, concise, 8-12 words",
        "hard": "denser info, brisk delivery, 10-14 words",
        "expert": "fast-paced, confident, 12-16 words, natural collocations",
    }.get(diff, "everyday tone, concise, 8-12 words")
    prompt = (
        "You are writing one natural spoken line for a brief dialogue. "
        "Sound like a real participant in the theme context (no narration). "
        f"Keep it {difficulty_style}. "
        f"Theme/context hint: {req.theme}. {anchor_note}"
        f"Difficulty label: {diff}. "
        "Respond in English. Format exactly:\nSentence: <line>\nCue: <short stage cue like tone/speed>"
    )
    try:
        data = await _query_llm(prompt, req.model, {})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    resp_text = data.get("response", "").strip()
    sentence = resp_text
    cue = None
    if "Sentence:" in resp_text:
        # Expected format: Sentence: ... \n Cue: ...
        for line in resp_text.splitlines():
            if line.lower().startswith("sentence:"):
                sentence = line.split(":", 1)[1].strip()
            if line.lower().startswith("cue:"):
                cue = line.split(":", 1)[1].strip()
    elif "Cue:" in resp_text:
        parts = resp_text.split("Cue:", 1)
        sentence = parts[0].strip()
        cue = parts[1].strip()
    return ShadowStartResponse(sentence=sentence, cue=cue)


@app.post("/shadow/feedback", response_model=ShadowFeedbackResponse)
async def shadow_feedback(req: ShadowFeedbackRequest) -> ShadowFeedbackResponse:
    """
    Compare user transcript with reference and return concise feedback for shadowing.
    """
    lang = "zh"
    prompt = (
        f"参考句子: {req.reference}\n用户转写: {req.transcript}\n"
        "对比参考句与转写，只指出词汇/语法/语义不一致之处；如果无差异，明确说明“朗读正确，无明显错误”。"
        "不要建议替换正确的词或添加新词，不要口语化改写。"
        "仅额外给一条发声建议（发音/节奏/重音），避免冗长。精简回答。"
    )
    try:
        opts = dict(req.options or {})
        opts.update({"temperature": 0.2, "top_p": 0.9})
        data = await _query_ollama(prompt, None, req.options)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    feedback_text = data.get("response", "").strip()
    return ShadowFeedbackResponse(feedback=feedback_text)


@app.post("/substitution/start", response_model=SubstitutionStartResponse)
async def substitution_start(
    req: SubstitutionStartRequest,
) -> SubstitutionStartResponse:
    """
    Return a base sentence and substitution slots for drills.
    """
    diff = (req.difficulty or "medium").lower()
    slot_counts = {"easy": 1, "medium": 2, "hard": 3, "expert": 4}
    slot_count = slot_counts.get(diff, 2)
    options_count = {"easy": 3, "medium": 3, "hard": 4, "expert": 5}.get(diff, 3)
    anchor_note = (
        f"Base it on this anchor and keep scenario/tense similar: {req.anchor_phrase}. "
        if req.anchor_phrase
        else ""
    )
    prompt = (
        "Generate exactly ONE short dialog line (6-12 words), first-person, spoken (no narration). "
        f"Provide exactly {slot_count} substitution slots. Each slot must have {options_count} options. "
        "Return JSON ONLY with keys: base_sentence (string), slots (array of {label, options[]} ). "
        "Slots must correspond to words/phrases present in the base_sentence (nouns/verbs/adjectives typical of the theme). "
        "In the base_sentence, mark each slot with square brackets using the slot LABEL only (e.g., \"I need a [drink] right now\"). "
        "The slot label inside brackets must match the slot label in JSON. Options must grammatically replace that placeholder verbatim; do NOT bracket a different phrase. "
        "Do not add slots unrelated to the sentence. "
        f"Theme hint: {req.theme}. {anchor_note}"
        f"Difficulty: {diff}. Language: en. "
        "Example: {\"base_sentence\": \"Could I get a small [drink] to go?\", \"slots\": [{\"label\": \"drink\", \"options\": [\"latte\",\"americano\",\"tea\"]}]}"
    )
    logger.info("substitution_prompt: %s", prompt)

    attempts = 0
    base_sentence = ""
    slots: List[SubstitutionSlot] = []
    while attempts < 2:
        attempts += 1
        try:
            data = await _query_llm(
                prompt, req.model, {"temperature": 0.5, "top_p": 0.9}
            )
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        resp_text = data.get("response", "").strip()
        slots = []
        base_sentence = ""
        try:
            parsed = json.loads(resp_text)
            base_sentence = parsed.get("base_sentence", "").strip()
            slots_data = parsed.get("slots", [])
            for slot in slots_data:
                label = slot.get("label") or slot.get("type") or ""
                options = slot.get("options") or []
                if isinstance(options, list) and label:
                    slots.append(SubstitutionSlot(label=str(label), options=[str(o) for o in options]))
        except Exception:
            base_sentence = resp_text.splitlines()[0] if resp_text else ""

        labels_in_sentence = re.findall(r"\[([^\]]+)\]", base_sentence)
        if len(labels_in_sentence) == len(slots) == slot_count:
            break

    # Fallback if missing slots/placeholders
    if len(slots) != slot_count or len(re.findall(r"\[([^\]]+)\]", base_sentence)) != slot_count:
        labels = labels_in_sentence or [f"slot{i+1}" for i in range(slot_count)]
        if not base_sentence:
            base_sentence = "I need a [slot1] right now."
        for lbl in labels[:slot_count]:
            if not any(s.label == lbl for s in slots):
                slots.append(SubstitutionSlot(label=lbl, options=["option1", "option2", "option3"]))
        slots = slots[:slot_count]
        # ensure placeholders exist
        for lbl in labels:
            if f"[{lbl}]" not in base_sentence:
                base_sentence += f" [{lbl}]"

    return SubstitutionStartResponse(base_sentence=base_sentence, slots=slots)


@app.post("/substitution/feedback", response_model=SubstitutionFeedbackResponse)
async def substitution_feedback(
    req: SubstitutionFeedbackRequest,
) -> SubstitutionFeedbackResponse:
    """
    Evaluate a substitution attempt.
    """
    lang = req.target_language.lower()
    if lang not in {"en", "zh"}:
        lang = "en"
    slot_lines = "\n".join(
        f"- {slot.label}: {', '.join(slot.options)}" for slot in req.slots
    )
    prompt = (
        f"Base sentence: {req.base_sentence}\n"
        f"Learner transcript: {req.transcript}\n"
        f"Substitution slots:\n{slot_lines}\n"
        "Check against the slots only: did the learner use the provided options and keep tense/grammar? "
        "Do not suggest new words outside the options. "
        "Give 2 short bullet fixes (slot usage or grammar) and propose one next variant using different provided options."
    )
    if lang == "zh":
        prompt = (
            f"基准句: {req.base_sentence}\n"
            f"学习者转写: {req.transcript}\n"
            f"可替换槽位:\n{slot_lines}\n"
            "仅根据给定槽位检查：是否使用了提供的选项并保持时态语法？不要引入槽位之外的新词。"
            "用中文给2条简短改进建议，并给出一个使用不同已提供选项的示例句。"
        )
    try:
        opts = dict(req.options or {})
        opts.update({"temperature": 0.3, "top_p": 0.9})
        data = await _query_ollama(prompt, None, opts)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    feedback_text = data.get("response", "").strip()
    return SubstitutionFeedbackResponse(feedback=feedback_text, next_variant=None)


@app.post("/expansion/start", response_model=ExpansionStartResponse)
async def expansion_start(req: ExpansionStartRequest) -> ExpansionStartResponse:
    """
    Return a seed sentence and scaffolds for expansion drills.
    """
    diff = (req.difficulty or "medium").lower()
    scaffold_count = {"easy": 2, "medium": 3, "hard": 4, "expert": 4}.get(diff, 3)
    anchor_note = (
        f"Keep scenario/tone aligned with this anchor: {req.anchor_phrase}. "
        if req.anchor_phrase
        else ""
    )
    prompt = (
        "Return JSON ONLY: {\"seed\": \"6-10 word spoken line, first-person\", "
        "\"scaffolds\": [\"short guidance for adding detail or connectors\"]}. "
        "Seed should be a natural spoken line, not narration, tied to the theme. "
        "Scaffolds guide the learner to expand with who/when/where and connectors "
        "(because, so, although, and, with). Use concrete cues like "
        "\"Add when/where with 'when/while'\" or \"Add result with 'so'\". "
        f"Provide exactly {scaffold_count} scaffolds. "
        f"Theme hint: {req.theme}. {anchor_note}"
        f"Difficulty: {diff}. Language: en."
    )
    logger.info("expansion_prompt: %s", prompt)

    seed = ""
    scaffolds: List[str] = []
    try:
        data = await _query_ollama(
            prompt,
            None,
            {"temperature": 0.65, "top_p": 0.9},
        )
        parsed = json.loads(data.get("response", "{}"))
        seed = (parsed.get("seed") or "").strip()
        scaffolds = [
            str(item).strip()
            for item in parsed.get("scaffolds", [])[:scaffold_count]
            if str(item).strip()
        ]
    except Exception:
        seed = "I missed my train this morning."
        scaffolds = [
            "Add when/where it happened",
            "Add a cause with because",
            "Add what you did next with so",
        ][:scaffold_count]

    if not seed:
        seed = "I need to leave early today."
    if len(scaffolds) < scaffold_count:
        defaults = [
            "Add who you were with",
            "Add a reason with because",
            "Add a result with so",
            "Add feeling/tone with although",
        ]
        for item in defaults:
            if len(scaffolds) >= scaffold_count:
                break
            if item not in scaffolds:
                scaffolds.append(item)

    return ExpansionStartResponse(seed=seed, scaffolds=scaffolds)


@app.post("/expansion/feedback", response_model=ExpansionFeedbackResponse)
async def expansion_feedback(
    req: ExpansionFeedbackRequest,
) -> ExpansionFeedbackResponse:
    """
    Evaluate an expansion attempt focused on connectors and added detail.
    """
    lang = req.target_language.lower()
    if lang not in {"en", "zh"}:
        lang = "en"
    scaffold_lines = "\n".join(f"- {s}" for s in req.scaffolds)
    base_prompt = (
        f"Seed idea: {req.seed}\n"
        f"Learner transcript: {req.transcript}\n"
        f"Expansion goals:\n{scaffold_lines}\n"
        "Judge if the learner expanded beyond the seed with clear connectors and "
        "added detail. Give 3 concise bullet notes: 1 strength, 2 fixes "
        "(connectors, coherence, grammar). Then offer one improved variant in "
        "natural spoken English (14-22 words) following the goals."
    )
    prompt = base_prompt
    if lang == "zh":
        prompt = (
            f"{base_prompt}\n"
            "Return the feedback bullets in Chinese. The improved example line should stay in English."
        )
    try:
        opts = dict(req.options or {})
        opts.update({"temperature": 0.35, "top_p": 0.9})
        data = await _query_ollama(prompt, None, opts)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    text = data.get("response", "").strip()
    improved_variant = None
    # Try to pull an example line from the response if present.
    for line in text.splitlines()[::-1]:
        clean = line.strip("-•").strip()
        if len(clean.split()) >= 6:
            improved_variant = clean
            break
    return ExpansionFeedbackResponse(feedback=text, improved_variant=improved_variant)


@app.post("/review/start", response_model=ReviewStartResponse)
async def review_start(req: ReviewStartRequest) -> ReviewStartResponse:
    """
    Start a guided review dialog with an opening agent line.
    """
    diff = (req.difficulty or "medium").lower()
    tone = {
        "easy": "warm, short, concrete",
        "medium": "friendly, concise, everyday tone",
        "hard": "brisk, slightly challenging",
        "expert": "concise, probing, assumes background knowledge",
    }.get(diff, "friendly, concise, everyday tone")
    prompt = (
        "Return JSON ONLY: {\"opening\": \"one agent line, 8-14 words\"}. "
        "Start a role-play dialog on the given theme. Sound like a real person, not a narrator. "
        f"Theme/context: {req.theme}. Tone: {tone}. Language: en."
    )
    opening = ""
    try:
        data = await _query_llm(
            prompt,
            req.model,
            {"temperature": 0.6, "top_p": 0.9},
        )
        parsed = json.loads(data.get("response", "{}"))
        opening = (parsed.get("opening") or "").strip()
    except Exception:
        opening = "Hey, can I ask your take on this topic?"

    if not opening:
        opening = "I'd like your thoughts on this."
    return ReviewStartResponse(opening=opening)


@app.post("/review/turn", response_model=ReviewTurnReply)
async def review_turn(req: ReviewTurnRequest) -> ReviewTurnReply:
    """
    Return the next agent line for the review dialog using the teacher system prompt.
    """
    lang = req.language.lower()
    if lang not in {"en", "zh"}:
        lang = "en"

    history_lines = "\n".join(
        f"{msg.role.capitalize()}: {msg.content}" for msg in req.history if msg.content
    )
    latest = req.user_reply.strip()
    logger.info("review_turn user_reply: %s | attempt: %s", latest, req.attempt)

    system_prompt = (
        "You are a English teacher who teach oral English to a user in the form of dialog. "
        "You will pick a topic and begin the conversion. If user's reply has some issue, point one issue a time, explain the issue to the user, ask the user to reply again. "
        "If the user's reply keeps failed, you'll prompt the user the correct reply. Once the user reply correctly, you'll move on to the next round of the dialog without any comment. "
        "Keep you reply as brief as possible. Only provide brief explanation of the issue and give a suggestion. Or, just move on to next round. Do not praise user. Exchange words naturally."
    )
    prompt = (
        f"{system_prompt}\n\n"
        "Conversation so far (exclude the latest reply):\n"
        f"{history_lines or 'Agent: (start the dialog)'}\n\n"
        f"Latest user reply:\nUser: {latest}\n\n"
        "Respond with the next agent line only."
    )
    try:
        opts = dict(req.options or {})
        opts.update({"temperature": 0.4, "top_p": 0.9})
        data = await _query_llm(prompt, req.model, opts)
        reply_text = (data.get("response") or "").strip()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not reply_text:
        reply_text = "Could you share a quick response so we can continue?"

    return ReviewTurnReply(reply=reply_text)

@app.post("/feedback", response_model=FeedbackResponse)
async def generate_feedback(req: FeedbackRequest) -> FeedbackResponse:
    """
    Produce a layered feedback report using Ollama.
    """
    lang = "zh"

    chunks: List[str] = []
    for part in req.transcript.split('.'):
        clean = part.strip()
        if clean:
            chunks.append(clean)

    grammar_prompt = "用中文提供语法反馈（条列）：\n" + req.transcript
    prosody_prompt = "用中文列出两点语调或发音改进建议：\n" + req.transcript
    rerecord_prompt = "用中文列出最多五个需要重录的短语：\n" + req.transcript

    try:
        grammar_data = await _query_ollama(grammar_prompt, None, {})
        prosody_data = await _query_ollama(prosody_prompt, None, {})
        rerecord_data = await _query_ollama(rerecord_prompt, None, {})
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    grammar_notes = [
        line for line in grammar_data.get("response", "").splitlines() if line.strip()
    ]
    prosody_notes = [
        line for line in prosody_data.get("response", "").splitlines() if line.strip()
    ]
    rerecord_targets = [
        line for line in rerecord_data.get("response", "").splitlines() if line.strip()
    ][:5]

    return FeedbackResponse(
        chunks=chunks,
        grammar_notes=grammar_notes,
        prosody_notes=prosody_notes,
        rerecord_targets=rerecord_targets,
    )
