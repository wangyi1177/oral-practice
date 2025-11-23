/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ModuleKey = "reflex" | "mindset" | "deepdive";

type FeedbackPayload = {
  chunks: string[];
  grammar_notes: string[];
  prosody_notes: string[];
  rerecord_targets: string[];
};

const MODULES: Record<ModuleKey, string> = {
  reflex: "Reflex (shadow → substitution → expansion)",
  mindset: "Mindset (ELI5, riddles, sentence expansion)",
  deepdive: "Deep Dive (Socratic + retell + review)",
};

const FLOW_STEPS: Record<
  ModuleKey,
  { title: string; bullets: string[]; cta: string }[]
> = {
  reflex: [
    {
      title: "Shadow",
      bullets: [
        "Repeat with matching rhythm and pauses",
        "Focus on chunking and linking",
      ],
      cta: "Give me a sentence to shadow about my last weekend.",
    },
    {
      title: "Substitution",
      bullets: [
        "Swap nouns/verbs to build variants",
        "Keep tense/aspect consistent",
      ],
      cta: "Give 3 substitution drills for travel plans.",
    },
    {
      title: "Expansion",
      bullets: [
        "Add detail and cause/effect",
        "Use connectors (because, so, although)",
      ],
      cta: "Expand this idea: I missed my train.",
    },
  ],
  mindset: [
    {
      title: "ELI5",
      bullets: ["Explain simply", "Use analogies/examples"],
      cta: "Explain inflation like I'm 10.",
    },
    {
      title: "Riddles",
      bullets: ["Compact clues", "Test concise thinking"],
      cta: "Give me a short riddle about technology.",
    },
    {
      title: "Sentence expansion",
      bullets: ["Grow a sentence step by step", "Keep coherence"],
      cta: "Start with a short sentence and expand it three times.",
    },
  ],
  deepdive: [
    {
      title: "Socratic",
      bullets: ["Ask probing questions", "Challenge assumptions"],
      cta: "Ask me 3 Socratic questions about remote work.",
    },
    {
      title: "Retell",
      bullets: ["Summarize in your own words", "Preserve key facts"],
      cta: "Give me a short story to retell in 3 sentences.",
    },
    {
      title: "Review",
      bullets: ["Highlight weak spots", "Suggest re-record clips"],
      cta: "Review my last answer and list 3 improvement targets.",
    },
  ],
};

const API_BASE = process.env.NEXT_PUBLIC_ORCH_URL ?? "http://127.0.0.1:8002";

const todayKey = () => {
  return new Date().toISOString().slice(0, 10);
};

const stripMarkdown = (text: string) => {
  if (!text) return "";
  let cleaned = text;
  cleaned = cleaned.replace(/`([^`]*)`/g, "$1"); // inline code
  cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, "$1"); // bold
  cleaned = cleaned.replace(/__([^_]+)__/g, "$1"); // bold alt
  cleaned = cleaned.replace(/\*([^*]+)\*/g, "$1"); // italics
  cleaned = cleaned.replace(/_([^_]+)_/g, "$1"); // italics alt
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1"); // links
  cleaned = cleaned.replace(/^\s{0,3}[-*+]\s+/gm, ""); // bullets
  cleaned = cleaned.replace(/^\s{0,3}\d+\.\s+/gm, ""); // ordered lists
  cleaned = cleaned.replace(/^\s{0,3}#{1,6}\s+/gm, ""); // headings
  cleaned = cleaned.replace(/>\s?/g, ""); // blockquotes
  return cleaned.trim();
};

export default function Home() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("reflex");
  const [themeLanguage, setThemeLanguage] = useState<"en" | "zh">("en");
  const [themeInput, setThemeInput] = useState("");
  const [themeLoading, setThemeLoading] = useState(false);
  const [todayTheme, setTodayTheme] = useState("");
  const [phraseCards, setPhraseCards] = useState<
    { phrase: string; translation?: string; cue?: string; difficulty?: string }[]
  >([]);
  const [intentSummary, setIntentSummary] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedFlow, setSelectedFlow] = useState("");
  const [anchorPhrase, setAnchorPhrase] = useState("");
  const [anchorDifficulty, setAnchorDifficulty] = useState("");

  const [micError, setMicError] = useState("");
  const [transcription, setTranscription] = useState("");
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const shadowRecorderRef = useRef<MediaRecorder | null>(null);
  const shadowChunksRef = useRef<Blob[]>([]);
  const [shadowSentence, setShadowSentence] = useState("");
  const [shadowCue, setShadowCue] = useState<string | null>(null);
  const [shadowHidden, setShadowHidden] = useState(false);
  const [shadowTranscript, setShadowTranscript] = useState("");
  const [shadowFeedback, setShadowFeedback] = useState("");
  const [shadowLoading, setShadowLoading] = useState(false);
  const [shadowError, setShadowError] = useState("");
  const [shadowRecording, setShadowRecording] = useState(false);
  const [shadowStartLoading, setShadowStartLoading] = useState(false);
  const [shadowFeedbackLoading, setShadowFeedbackLoading] = useState(false);
  const shadowFeedbackAbortRef = useRef<AbortController | null>(null);

  type Slot = { label: string; options: string[] };
  const [subsBase, setSubsBase] = useState("");
  const [subsSlots, setSubsSlots] = useState<Slot[]>([]);
  const [subsHidden, setSubsHidden] = useState(false);
  const [subsTranscript, setSubsTranscript] = useState("");
  const [subsFeedback, setSubsFeedback] = useState("");
  const [subsLoading, setSubsLoading] = useState(false);
  const [subsError, setSubsError] = useState("");
  const [subsRecording, setSubsRecording] = useState(false);

  const expansionRecorderRef = useRef<MediaRecorder | null>(null);
  const expansionChunksRef = useRef<Blob[]>([]);
  const [expSeed, setExpSeed] = useState("");
  const [expScaffolds, setExpScaffolds] = useState<string[]>([]);
  const [expHidden, setExpHidden] = useState(false);
  const [expTranscript, setExpTranscript] = useState("");
  const [expFeedback, setExpFeedback] = useState("");
  const [expError, setExpError] = useState("");
  const [expLoading, setExpLoading] = useState(false);
  const [expRecording, setExpRecording] = useState(false);

  type ReviewMessage = { role: "agent" | "user"; text: string };
  const [reviewMessages, setReviewMessages] = useState<ReviewMessage[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [reviewAttempt, setReviewAttempt] = useState(1);
  const [selectedModel, setSelectedModel] = useState<string>("deepseek-chat");
  const reviewRecorderRef = useRef<MediaRecorder | null>(null);
  const reviewChunksRef = useRef<Blob[]>([]);
  const [reviewRecording, setReviewRecording] = useState(false);
  const [reviewTextReply, setReviewTextReply] = useState("");
  const [autoPlayReviewReply, setAutoPlayReviewReply] = useState(true);

  const [sessionId, setSessionId] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatResponse, setChatResponse] = useState("");

  const [feedbackInput, setFeedbackInput] = useState("");
  const [feedback, setFeedback] = useState<FeedbackPayload | null>(null);

  const [ttsText, setTtsText] = useState("Hello from Piper");
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioQueue, setAudioQueue] = useState<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audioRef.current = audio;
    }
  }, []);

  const pumpAudioQueue = () => {
    if (isPlaying) return;
    const next = audioQueue[0];
    if (!next || !audioRef.current) return;

    const url = URL.createObjectURL(next);
    const audio = audioRef.current;
    setIsPlaying(true);
    audio.src = url;
    audio.onended = () => {
      URL.revokeObjectURL(url);
      setAudioQueue((prev) => prev.slice(1));
      setIsPlaying(false);
    };
    audio.play().catch((err) => {
      console.error("Audio play failed", err);
      setAudioQueue((prev) => prev.slice(1));
      setIsPlaying(false);
    });
  };

  const stopAudio = () => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.src = "";
    }
    setAudioQueue([]);
    setIsPlaying(false);
  };

  useEffect(() => {
    if (!isPlaying && audioQueue.length > 0) {
      pumpAudioQueue();
    }
  }, [audioQueue, isPlaying]);

  const moduleDescription = useMemo(() => MODULES[activeModule], [activeModule]);

  useEffect(() => {
    const stored = localStorage.getItem("todayTheme");
    const storedDate = localStorage.getItem("todayThemeDate");
    const today = todayKey();
    if (stored && storedDate === today) {
      setTodayTheme(stored);
      setThemeInput(stored);
      const anchor = localStorage.getItem("anchorPhrase") || "";
      const anchorDiff = localStorage.getItem("anchorDifficulty") || "";
      setAnchorPhrase(anchor);
      setAnchorDifficulty(anchorDiff);
    } else {
      setTodayTheme("");
      setThemeInput("");
      localStorage.removeItem("todayTheme");
      localStorage.removeItem("todayThemeDate");
      setAnchorPhrase("");
      setAnchorDifficulty("");
    }
  }, []);

  const handleThemeSubmit = async () => {
    if (!themeInput.trim()) {
      setErrorMessage("Enter a theme or intent first.");
      return;
    }

    setThemeLoading(true);
    setErrorMessage("");
    try {
      const res = await fetch(`${API_BASE}/themes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: themeLanguage,
          theme: themeInput.trim(),
          count: 4,
          model: selectedModel,
        }),
      });
      if (!res.ok) {
        throw new Error(`Theme resolver failed: ${res.status}`);
      }
      const data = await res.json();
      setIntentSummary(data.intent);
      setPhraseCards(data.phrase_cards ?? []);
      setTodayTheme(themeInput.trim());
      if (data.phrase_cards?.length) {
        setAnchorPhrase(data.phrase_cards[0].phrase);
        setAnchorDifficulty(data.phrase_cards[0].difficulty || "");
        localStorage.setItem("anchorPhrase", data.phrase_cards[0].phrase);
        localStorage.setItem("anchorDifficulty", data.phrase_cards[0].difficulty || "");
      }
      const today = todayKey();
      localStorage.setItem("todayTheme", themeInput.trim());
      localStorage.setItem("todayThemeDate", today);
    } catch (err: any) {
      setErrorMessage(err?.message ?? "Failed to resolve theme.");
    } finally {
      setThemeLoading(false);
    }
  };

  const playText = async (text: string) => {
    if (!text) return;
    try {
      const res = await fetch(`${API_BASE}/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
      const blob = await res.blob();
      setAudioQueue((prev) => [...prev, blob]);
    } catch (err: any) {
      setErrorMessage(err?.message ?? "TTS failed.");
    }
  };

  const startStreaming = async () => {
    setMicError("");
    setTranscription("");
    chunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      recorderRef.current = rec;
      setRecording(true);
      rec.start();
      rec.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        chunksRef.current.push(event.data);
      };
      rec.onstop = () => {
        setRecording(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;
        const form = new FormData();
        form.append("audio", blob, `session-${Date.now()}.webm`);
        fetch(`${API_BASE}/transcribe`, { method: "POST", body: form })
          .then(async (resp) => {
            if (!resp.ok) throw new Error(`ASR failed: ${resp.status}`);
            return resp.json();
          })
          .then((json) => setTranscription(json.transcription ?? ""))
          .catch((err: any) =>
            setMicError(err?.message ?? "ASR request failed.")
          );
      };
    } catch (err: any) {
      setMicError(err?.message ?? "Microphone permissions blocked.");
    }
  };

  const stopStreaming = () => {
    recorderRef.current?.stop();
  };

  const handleTtsPlay = async () => {
    playText(ttsText);
  };

  const fetchShadowSentence = async () => {
    setShadowError("");
    setShadowFeedback("");
    setShadowTranscript("");
    shadowFeedbackAbortRef.current?.abort();
    setShadowFeedbackLoading(false);
    setShadowStartLoading(true);
    try {
      const res = await fetch(`${API_BASE}/shadow/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: themeInput.trim() || todayTheme || "general conversation",
          anchor_phrase: anchorPhrase || undefined,
          difficulty: anchorDifficulty || "medium",
          language: themeLanguage,
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error(`Shadow start failed: ${res.status}`);
      const data = await res.json();
      setShadowSentence(data.sentence ?? "");
      setShadowCue(data.cue ?? null);
      if (data.sentence) {
        await playText(data.sentence);
      }
    } catch (err: any) {
      setShadowError(err?.message ?? "Failed to start shadowing.");
    } finally {
      setShadowStartLoading(false);
    }
  };

  const stopShadowRecording = () => {
    shadowRecorderRef.current?.stop();
  };

  const stopSubsRecording = () => {
    shadowRecorderRef.current?.stop();
  };

  const stopExpRecording = () => {
    expansionRecorderRef.current?.stop();
  };

  const recordShadow = async () => {
    if (!shadowSentence) {
      setShadowError("No reference sentence. Click 'New sentence' first.");
      return;
    }
    setShadowError("");
    setShadowFeedback("");
    setShadowTranscript("");
    shadowChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      shadowRecorderRef.current = rec;
      setShadowRecording(true);
      rec.start();
      rec.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        shadowChunksRef.current.push(event.data);
      };
      rec.onstop = () => {
        setShadowRecording(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(shadowChunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;
        const form = new FormData();
        form.append("audio", blob, `shadow-${Date.now()}.webm`);
        setShadowFeedbackLoading(true);
        shadowFeedbackAbortRef.current?.abort();
        const controller = new AbortController();
        shadowFeedbackAbortRef.current = controller;
        (async () => {
          try {
            const asrResp = await fetch(`${API_BASE}/transcribe`, {
              method: "POST",
              body: form,
              signal: controller.signal,
            });
            if (!asrResp.ok) throw new Error(`ASR failed: ${asrResp.status}`);
            const asrJson = await asrResp.json();
            const transcript = asrJson.transcription ?? "";
            setShadowTranscript(transcript);
            const feedbackRes = await fetch(`${API_BASE}/shadow/feedback`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reference: shadowSentence,
                transcript,
                target_language: themeLanguage,
              }),
              signal: controller.signal,
            });
            if (!feedbackRes.ok)
              throw new Error(`Shadow feedback failed: ${feedbackRes.status}`);
            const fb = await feedbackRes.json();
            setShadowFeedback(fb.feedback ?? "");
          } catch (err: any) {
            if (err?.name === "AbortError") {
              // cancelled, do nothing
            } else {
              setShadowError(err?.message ?? "Shadow failed.");
            }
          } finally {
            setShadowFeedbackLoading(false);
          }
        })();
      };
    } catch (err: any) {
      setShadowError(err?.message ?? "Microphone permission blocked.");
    }
  };

  const fetchSubstitutionSet = async () => {
    setSubsError("");
    setSubsFeedback("");
    setSubsTranscript("");
    setSubsSlots([]);
    setSubsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/substitution/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: themeInput.trim() || todayTheme || "coffee shop",
          anchor_phrase: anchorPhrase || undefined,
          difficulty: anchorDifficulty || "medium",
          language: themeLanguage,
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error(`Substitution start failed: ${res.status}`);
      const data = await res.json();
      setSubsBase(data.base_sentence ?? "");
      setSubsSlots(data.slots ?? []);
      if (data.base_sentence) {
        await playText(data.base_sentence);
      }
    } catch (err: any) {
      setSubsError(err?.message ?? "Failed to load substitution set.");
    } finally {
      setSubsLoading(false);
    }
  };

  const fetchExpansionSet = async () => {
    setExpError("");
    setExpFeedback("");
    setExpTranscript("");
    setExpScaffolds([]);
    setExpLoading(true);
    try {
      const res = await fetch(`${API_BASE}/expansion/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: themeInput.trim() || todayTheme || "daily life",
          anchor_phrase: anchorPhrase || undefined,
          difficulty: anchorDifficulty || "medium",
          language: themeLanguage,
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error(`Expansion start failed: ${res.status}`);
      const data = await res.json();
      setExpSeed(data.seed ?? "");
      setExpScaffolds(data.scaffolds ?? []);
      if (data.seed) {
        await playText(data.seed);
      }
    } catch (err: any) {
      setExpError(err?.message ?? "Failed to load expansion seed.");
    } finally {
      setExpLoading(false);
    }
  };

  const recordSubstitution = async () => {
    if (!subsBase) {
      setSubsError("No base sentence. Click 'New set' first.");
      return;
    }
    setSubsError("");
    setSubsFeedback("");
    setSubsTranscript("");
    shadowChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      shadowRecorderRef.current = rec;
      setSubsRecording(true);
      rec.start();
      rec.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        shadowChunksRef.current.push(event.data);
      };
      rec.onstop = () => {
        setSubsRecording(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(shadowChunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;
        const form = new FormData();
        form.append("audio", blob, `subs-${Date.now()}.webm`);
        setSubsLoading(true);
        fetch(`${API_BASE}/transcribe`, { method: "POST", body: form })
          .then(async (resp) => {
            if (!resp.ok) throw new Error(`ASR failed: ${resp.status}`);
            return resp.json();
          })
          .then(async (json) => {
            const transcript = json.transcription ?? "";
            setSubsTranscript(transcript);
            const feedbackRes = await fetch(
              `${API_BASE}/substitution/feedback`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  base_sentence: subsBase,
                  transcript,
                  slots: subsSlots,
                  target_language: themeLanguage,
                }),
              }
            );
            if (!feedbackRes.ok)
              throw new Error(`Substitution feedback failed: ${feedbackRes.status}`);
            const fb = await feedbackRes.json();
            setSubsFeedback(fb.feedback ?? "");
          })
          .catch((err: any) => setSubsError(err?.message ?? "Substitution failed."))
          .finally(() => setSubsLoading(false));
      };
    } catch (err: any) {
      setSubsError(err?.message ?? "Microphone permission blocked.");
    }
  };

  const recordExpansion = async () => {
    if (!expSeed) {
      setExpError("No seed sentence. Click 'New seed' first.");
      return;
    }
    setExpError("");
    setExpFeedback("");
    setExpTranscript("");
    expansionChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      expansionRecorderRef.current = rec;
      setExpRecording(true);
      rec.start();
      rec.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        expansionChunksRef.current.push(event.data);
      };
      rec.onstop = () => {
        setExpRecording(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(expansionChunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;
        const form = new FormData();
        form.append("audio", blob, `expansion-${Date.now()}.webm`);
        setExpLoading(true);
        fetch(`${API_BASE}/transcribe`, { method: "POST", body: form })
          .then(async (resp) => {
            if (!resp.ok) throw new Error(`ASR failed: ${resp.status}`);
            return resp.json();
          })
          .then(async (json) => {
            const transcript = json.transcription ?? "";
            setExpTranscript(transcript);
            const feedbackRes = await fetch(`${API_BASE}/expansion/feedback`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                seed: expSeed,
                transcript,
                scaffolds: expScaffolds,
                target_language: themeLanguage,
              }),
            });
            if (!feedbackRes.ok)
              throw new Error(`Expansion feedback failed: ${feedbackRes.status}`);
            const fb = await feedbackRes.json();
            setExpFeedback(fb.feedback ?? "");
          })
          .catch((err: any) => setExpError(err?.message ?? "Expansion failed."))
          .finally(() => setExpLoading(false));
      };
    } catch (err: any) {
      setExpError(err?.message ?? "Microphone permission blocked.");
    }
  };

  const startReviewConversation = async () => {
    setReviewError("");
    setReviewMessages([]);
    setReviewAttempt(1);
    setReviewTextReply("");
    setReviewLoading(true);
    try {
      const res = await fetch(`${API_BASE}/review/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: themeInput.trim() || todayTheme || "general topic",
          difficulty: anchorDifficulty || "medium",
          language: themeLanguage,
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error(`Review start failed: ${res.status}`);
      const data = await res.json();
      const opening = data.opening ?? "";
      if (opening) {
        setReviewMessages([{ role: "agent", text: opening }]);
        if (autoPlayReviewReply) {
          playText(stripMarkdown(opening));
        }
        setTimeout(() => {
          if (!reviewRecording) {
            recordReviewReply(true);
          }
        }, 400);
      }
    } catch (err: any) {
      setReviewError(err?.message ?? "Failed to start review dialog.");
    } finally {
      setReviewLoading(false);
    }
  };

  const sendReviewTurn = async (replyOverride?: string) => {
    if (!reviewMessages.length) {
      setReviewError("Start the dialog first.");
      return;
    }
    const replyText = (replyOverride ?? reviewTextReply).trim();
    if (!replyText) {
      setReviewError("Provide a reply first.");
      return;
    }
    console.log("reviewMessages before /review/turn:", reviewMessages);
    setReviewError("");
    setReviewLoading(true);
    try {
      const history = reviewMessages
        .filter((m) => m.role === "agent" || m.role === "user")
        .map((m) => ({
          role: m.role,
          content: m.text,
        }));
      const res = await fetch(`${API_BASE}/review/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme: themeInput.trim() || todayTheme || "general topic",
          difficulty: anchorDifficulty || "medium",
          language: themeLanguage,
          history,
          user_reply: replyText,
          attempt: reviewAttempt,
          model: selectedModel,
        }),
      });
      if (!res.ok) throw new Error(`Review turn failed: ${res.status}`);
      const data = await res.json();
      const agentReply = (data.reply ?? "").trim();
      setReviewMessages((prev) => {
        const updated: ReviewMessage[] = [...prev, { role: "user", text: replyText }];
        if (agentReply) {
          updated.push({ role: "agent", text: agentReply });
        }
        return updated;
      });
      setReviewTextReply("");
      if (agentReply && autoPlayReviewReply) {
        playText(stripMarkdown(agentReply));
      }
      if (agentReply) {
        setTimeout(() => {
          if (!reviewRecording) {
            recordReviewReply(true);
          }
        }, 500);
      }
      setReviewAttempt(1);
    } catch (err: any) {
      setReviewError(err?.message ?? "Review turn failed.");
    } finally {
      setReviewLoading(false);
    }
  };

  const recordReviewReply = async (autoSend: boolean = true) => {
    setReviewError("");
    reviewChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
      reviewRecorderRef.current = rec;
      setReviewRecording(true);
      rec.start();
      rec.ondataavailable = (event) => {
        if (event.data.size === 0) return;
        reviewChunksRef.current.push(event.data);
      };
      rec.onstop = () => {
        setReviewRecording(false);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(reviewChunksRef.current, { type: "audio/webm" });
        if (blob.size === 0) return;
        const form = new FormData();
        form.append("audio", blob, `review-${Date.now()}.webm`);
        fetch(`${API_BASE}/transcribe`, { method: "POST", body: form })
          .then(async (resp) => {
            if (!resp.ok) throw new Error(`ASR failed: ${resp.status}`);
            return resp.json();
          })
          .then((json) => {
            const transcript = json.transcription ?? "";
            if (transcript && autoSend) {
              sendReviewTurn(transcript);
            }
          })
          .catch((err: any) =>
            setReviewError(err?.message ?? "ASR request failed.")
          );
      };
    } catch (err: any) {
      setReviewError(err?.message ?? "Microphone permissions blocked.");
    }
  };

  const stopReviewRecording = () => {
    reviewRecorderRef.current?.stop();
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="flex flex-col gap-2 border-b border-slate-200 bg-white px-6 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Oral Practice Orchestrator</h1>
          <p className="text-sm text-slate-500">
            GPU0: LLM · GPU1: ASR · Piper on CPU — Frontend v0.1
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          <span className="text-xs font-semibold uppercase text-slate-500">Model</span>
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="rounded-md border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="deepseek-chat">deepseek-chat (default)</option>
            <option value="ollama">ollama</option>
          </select>
          <span role="img" aria-label="settings">
            ⚙️
          </span>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-8">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">1. Today&apos;s theme &amp; phrase cards</h2>
          <p className="text-sm text-slate-500">
            Resolve a learner intent (inputs can be English or Chinese) to generate phrase cards.
          </p>
          <div className="mt-2 flex flex-col gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
            <div>{todayTheme || "No theme set today"}</div>
            {anchorPhrase && (
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <span className="rounded bg-slate-200 px-2 py-1 font-semibold text-slate-700">
                  Anchor
                </span>
                <span>{anchorPhrase}</span>
                {anchorDifficulty && (
                  <span className="rounded bg-slate-300 px-2 py-1 text-slate-700">
                    {anchorDifficulty}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="mt-4 flex flex-col gap-3 md:flex-row">
            <select
              value={themeLanguage}
              onChange={(e) => setThemeLanguage(e.target.value as "en" | "zh")}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="en">English intent</option>
              <option value="zh">Chinese intent</option>
            </select>
            <input
              value={themeInput}
              onChange={(e) => setThemeInput(e.target.value)}
              placeholder="e.g. Coffee shop small talk"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={handleThemeSubmit}
              disabled={themeLoading}
              className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white transition disabled:opacity-50"
            >
              {themeLoading ? "Resolving..." : "Resolve"}
            </button>
          </div>
          {errorMessage && (
            <p className="mt-2 text-sm text-red-600">{errorMessage}</p>
          )}
          {intentSummary && (
            <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
              {intentSummary}
            </div>
          )}
          {phraseCards.length > 0 && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {phraseCards.map((card, idx) => (
                <button
                  key={`${card.phrase}-${idx}`}
                  type="button"
                  onClick={() => {
                    setAnchorPhrase(card.phrase);
                    setAnchorDifficulty(card.difficulty || "");
                    localStorage.setItem("anchorPhrase", card.phrase);
                    localStorage.setItem("anchorDifficulty", card.difficulty || "");
                  }}
                  className={`rounded-lg border p-4 text-left transition ${
                    anchorPhrase === card.phrase
                      ? "border-blue-500 bg-blue-50"
                      : "border-slate-200 bg-white hover:border-blue-200"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium">{card.phrase}</p>
                    {card.difficulty && (
                      <span className="rounded bg-slate-200 px-2 py-1 text-xs uppercase text-slate-600">
                        {card.difficulty}
                      </span>
                    )}
                  </div>
                  {card.translation && (
                    <p className="text-sm text-slate-500">{card.translation}</p>
                  )}
                  {card.cue && (
                    <p className="mt-2 text-xs uppercase text-slate-400">
                      {card.cue}
                    </p>
                  )}
                  <p className="mt-2 text-xs text-blue-700">
                    {anchorPhrase === card.phrase ? "Current anchor" : "Set as anchor"}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">2. Choose a module</h2>
          <p className="text-sm text-slate-500">
            Modules drive the prompt templates and VAD pacing.
          </p>
          {anchorPhrase && (
            <p className="mt-1 text-xs text-slate-600">
              Current anchor: {anchorPhrase} {anchorDifficulty && `(${anchorDifficulty})`}
            </p>
          )}
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {(Object.keys(MODULES) as ModuleKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setActiveModule(key);
                  setSelectedFlow("");
                }}
                className={`rounded-lg border p-4 text-left transition ${
                  activeModule === key
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-blue-200"
                }`}
              >
                <div className="font-medium capitalize">{key}</div>
                <div className="text-sm text-slate-500">{MODULES[key]}</div>
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-600">{moduleDescription}</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">3. Flow guide</h2>
          <p className="text-sm text-slate-500">
            Sub-steps and tips follow the module selection above. Click a card to pick the current drill.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {FLOW_STEPS[activeModule].map((step) => (
              <button
                key={step.title}
                type="button"
                onClick={async () => {
                  setSelectedFlow(step.title);
                  if (step.title.toLowerCase() === "shadow") {
                    await fetchShadowSentence();
                  } else if (step.title.toLowerCase() === "substitution") {
                    await fetchSubstitutionSet();
                  } else if (step.title.toLowerCase() === "expansion") {
                    await fetchExpansionSet();
                  } else {
                    setChatInput(step.cta);
                  }
                }}
                className={`rounded-lg border p-4 text-left text-sm transition ${
                  selectedFlow === step.title
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 bg-white hover:border-blue-200"
                }`}
              >
                <p className="text-base font-semibold text-slate-800">
                  {step.title}
                </p>
                <ul className="mt-2 list-disc pl-4 text-slate-600">
                  {step.bullets.map((b, i) => (
                    <li key={`${step.title}-${i}`}>{b}</li>
                  ))}
                </ul>
                <div className="mt-3 rounded-md border border-blue-200 px-3 py-2 text-xs font-medium text-blue-700">
                  {selectedFlow === step.title ? "Selected" : "Select / use prompt"}
                </div>
              </button>
            ))}
          </div>
        </section>

        {activeModule === "reflex" && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">4. Shadow practice</h2>
            <p className="text-sm text-slate-500">
              Get a sentence → listen → shadow → ASR → feedback (also spoken).
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={fetchShadowSentence}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={shadowStartLoading}
              >
                {shadowStartLoading ? "Loading..." : "New sentence"}
              </button>
              <button
                type="button"
                onClick={() => playText(shadowSentence)}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={!shadowSentence}
              >
                Play reference
              </button>
              <button
                type="button"
                onClick={() => setShadowHidden((prev) => !prev)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                disabled={!shadowSentence}
              >
                {shadowHidden ? "Show text" : "Hide text"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (shadowRecording) stopShadowRecording();
                  else recordShadow();
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                  shadowRecording ? "bg-red-600" : "bg-green-600"
                }`}
                disabled={shadowStartLoading}
              >
                {shadowRecording ? "Stop & transcribe" : "Record & shadow"}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopAudio();
                  playText(stripMarkdown(shadowFeedback));
                }}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={!shadowFeedback}
              >
                Play feedback
              </button>
              <button
                type="button"
                onClick={stopAudio}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                disabled={!shadowFeedback && audioQueue.length === 0 && !isPlaying}
              >
                Stop playback
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="text-xs uppercase text-slate-500">Reference</p>
              {shadowCue && <p className="text-xs text-slate-500">Cue: {shadowCue}</p>}
              <p className={`mt-1 text-base font-medium ${shadowHidden ? "blur-sm" : ""}`}>
                {shadowSentence || "Click New sentence to start shadowing"}
              </p>
            </div>

            {shadowTranscript && (
              <div className="mt-3 rounded-lg border border-slate-200 p-4 text-sm">
                <p className="text-xs uppercase text-slate-500">Your transcript</p>
                <p className="mt-1 font-medium text-slate-800">{shadowTranscript}</p>
              </div>
            )}

            {shadowFeedback && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
                <p className="text-xs uppercase text-emerald-600">Agent feedback</p>
                <p className="mt-1 text-emerald-900">{shadowFeedback}</p>
              </div>
            )}

            {shadowError && (
              <p className="mt-2 text-sm text-red-600">{shadowError}</p>
            )}
          </section>
        )}

        {activeModule === "reflex" && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">5. Substitution practice</h2>
            <p className="text-sm text-slate-500">
              Coffee-shop scene: swap key words to make variants while keeping tense and politeness.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={fetchSubstitutionSet}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={subsLoading}
              >
                {subsLoading ? "Loading..." : "New set"}
              </button>
              <button
                type="button"
                onClick={() => playText(subsBase)}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={!subsBase}
              >
                Play base
              </button>
              <button
                type="button"
                onClick={() => setSubsHidden((prev) => !prev)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                disabled={!subsBase}
              >
                {subsHidden ? "Show text" : "Hide text"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (subsRecording) stopSubsRecording();
                  else recordSubstitution();
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                  subsRecording ? "bg-red-600" : "bg-green-600"
                }`}
                disabled={subsLoading}
              >
                {subsRecording ? "Stop & transcribe" : "Record variant"}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopAudio();
                  playText(stripMarkdown(subsFeedback));
                }}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={!subsFeedback}
              >
                Play feedback
              </button>
              <button
                type="button"
                onClick={stopAudio}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                disabled={!subsFeedback && audioQueue.length === 0 && !isPlaying}
              >
                Stop playback
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="text-xs uppercase text-slate-500">Base sentence</p>
              <p className={`mt-1 text-base font-medium ${subsHidden ? "blur-sm" : ""}`}>
                {subsBase || "Click New set to get a sentence"}
              </p>
            </div>

            {subsSlots.length > 0 && (
              <div className="mt-3 rounded-lg border border-slate-200 p-4 text-sm">
                <p className="text-xs uppercase text-slate-500">Slots</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {subsSlots.map((slot) => (
                    <div
                      key={slot.label}
                      className="rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <p className="text-xs uppercase text-slate-500">
                        {slot.label}
                      </p>
                      <p className="text-sm text-slate-800">
                        {slot.options?.join(" / ")}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {subsTranscript && (
              <div className="mt-3 rounded-lg border border-slate-200 p-4 text-sm">
                <p className="text-xs uppercase text-slate-500">Your transcript</p>
                <p className="mt-1 font-medium text-slate-800">{subsTranscript}</p>
              </div>
            )}

            {subsFeedback && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
                <p className="text-xs uppercase text-emerald-600">Agent feedback</p>
                <p className="mt-1 text-emerald-900">{subsFeedback}</p>
              </div>
            )}

            {subsError && <p className="mt-2 text-sm text-red-600">{subsError}</p>}
          </section>
        )}

        {activeModule === "reflex" && (
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-semibold">6. Expansion practice</h2>
            <p className="text-sm text-slate-500">
              Grow the idea with connectors and detail. Use the scaffolds as cues.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={fetchExpansionSet}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={expLoading}
              >
                {expLoading ? "Loading..." : "New seed"}
              </button>
              <button
                type="button"
                onClick={() => playText(expSeed)}
                className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={!expSeed}
              >
                Play seed
              </button>
              <button
                type="button"
                onClick={() => setExpHidden((prev) => !prev)}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
                disabled={!expSeed}
              >
                {expHidden ? "Show text" : "Hide text"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (expRecording) stopExpRecording();
                  else recordExpansion();
                }}
                className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                  expRecording ? "bg-red-600" : "bg-green-600"
                }`}
                disabled={expLoading}
              >
                {expRecording ? "Stop & transcribe" : "Record expansion"}
              </button>
              <button
                type="button"
                onClick={() => {
                  stopAudio();
                  playText(stripMarkdown(expFeedback));
                }}
                className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={!expFeedback}
              >
                Play feedback
              </button>
              <button
                type="button"
                onClick={stopAudio}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 disabled:opacity-50"
                disabled={!expFeedback && audioQueue.length === 0 && !isPlaying}
              >
                Stop playback
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="text-xs uppercase text-slate-500">Seed</p>
              <p className={`mt-1 text-base font-medium ${expHidden ? "blur-sm" : ""}`}>
                {expSeed || "Click New seed to start expansion drills"}
              </p>
            </div>

            {expScaffolds.length > 0 && (
              <div className="mt-3 rounded-lg border border-slate-200 p-4 text-sm">
                <p className="text-xs uppercase text-slate-500">Scaffolds</p>
                <ul className="mt-2 list-disc pl-4 text-slate-700">
                  {expScaffolds.map((s, i) => (
                    <li key={`scaf-${i}`}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {expTranscript && (
              <div className="mt-3 rounded-lg border border-slate-200 p-4 text-sm">
                <p className="text-xs uppercase text-slate-500">Your transcript</p>
                <p className="mt-1 font-medium text-slate-800">{expTranscript}</p>
              </div>
            )}

            {expFeedback && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm">
                <p className="text-xs uppercase text-emerald-600">Agent feedback</p>
                <p className="mt-1 text-emerald-900">{expFeedback}</p>
              </div>
            )}

            {expError && <p className="mt-2 text-sm text-red-600">{expError}</p>}
          </section>
        )}

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">7. Deep Dive · Review dialog</h2>
          <p className="text-sm text-slate-500">
            Agent opens, you respond (voice-first); Agent points one concrete error (word/tense/grammar/naturalness) if any, you correct; otherwise it continues. Conversation stays in English and shows roles plus corrections.
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <label className="flex items-center gap-2 text-slate-700">
              Model
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="rounded-md border border-slate-300 px-2 py-1 text-sm"
              >
                <option value="deepseek-chat">deepseek-chat (default)</option>
                <option value="ollama">ollama</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={startReviewConversation}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={reviewLoading}
            >
              {reviewLoading ? "Loading..." : "Start dialog"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (reviewRecording) {
                  stopReviewRecording();
                } else {
                  recordReviewReply();
                }
              }}
              className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                reviewRecording ? "bg-red-600" : "bg-emerald-600"
              }`}
              disabled={reviewLoading}
            >
              {reviewRecording ? "Stop & send" : "Record reply"}
            </button>
          </div>
          <div className="mt-4 flex w-full flex-col gap-3">
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                value={reviewTextReply}
                onChange={(e) => setReviewTextReply(e.target.value)}
                placeholder="Type your reply here..."
                className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                disabled={reviewLoading || !reviewMessages.length}
              />
              <button
                type="button"
                onClick={() => sendReviewTurn(reviewTextReply)}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                disabled={
                  reviewLoading || !reviewMessages.length || !reviewTextReply.trim()
                }
              >
                Send text
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={autoPlayReviewReply}
                onChange={(e) => setAutoPlayReviewReply(e.target.checked)}
              />
              Auto-play agent replies
            </label>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
            <p className="text-xs uppercase text-slate-500">Transcript</p>
            <div className="mt-2 flex min-h-[120px] flex-col gap-1">
              {reviewMessages.length === 0 && (
                <p className="text-slate-500">Click Start dialog to begin.</p>
              )}
              {reviewMessages.map((m, idx) => (
                <div key={`rev-${idx}`} className="leading-relaxed">
                  <span className="font-semibold text-slate-700">
                    {m.role === "agent" ? "Agent" : "User"}:
                  </span>{" "}
                  {m.text}
                </div>
              ))}
            </div>
            {reviewError && <p className="mt-2 text-sm text-red-600">{reviewError}</p>}
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">8. Mic &amp; streaming hooks</h2>
          <p className="text-sm text-slate-500">
            Browser-side capture and streaming to ASR/TTS will land here.
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              <p className="font-medium text-slate-700">Mic Capture</p>
              <p className="mb-2">
                {recording
                  ? "Recording... tap stop to send audio to /transcribe."
                  : "Start recording to capture a WebM blob and send once."}
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (recording) {
                      stopStreaming();
                    } else {
                      startStreaming();
                    }
                  }}
                  className={`rounded-md px-4 py-2 text-sm font-medium text-white ${
                    recording ? "bg-red-500" : "bg-green-600"
                  }`}
                >
                  {recording ? "Stop" : "Start"}
                </button>
              </div>
              {micError && <p className="mt-2 text-xs text-red-600">{micError}</p>}
            </div>
            <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
              <p className="font-medium text-slate-700">Playback</p>
              <p className="mb-2">Request TTS and play the queue.</p>
              <div className="flex flex-col gap-2 md:flex-row">
                <input
                  value={ttsText}
                  onChange={(e) => setTtsText(e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  onClick={handleTtsPlay}
                  className="rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-white"
                >
                  Play TTS
                </button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Queue: {audioQueue.length} | {isPlaying ? "Playing" : "Idle"}
              </p>
              {transcription && (
                <p className="mt-2 text-sm text-slate-700">
                  Latest transcript: {transcription}
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">9. Session chat</h2>
          <p className="text-sm text-slate-500">
            Create a session and chat with the orchestrator (mode-aware).
          </p>
          <div className="mt-3 flex flex-col gap-3 md:flex-row">
            <button
              type="button"
              onClick={async () => {
                try {
                  const res = await fetch(`${API_BASE}/sessions`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ mode: "fluency" }),
                  });
                  if (!res.ok) throw new Error(`Session failed: ${res.status}`);
                  const data = await res.json();
                  setSessionId(data.session_id);
                  setChatResponse(`Session created: ${data.session_id}`);
                } catch (err: any) {
                  setChatResponse(err?.message ?? "Session create failed.");
                }
              }}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white"
            >
              New session
            </button>
            <input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Ask a question..."
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
            <button
              type="button"
              disabled={!sessionId}
              onClick={async () => {
                if (!sessionId) {
                  setChatResponse("Create a session first.");
                  return;
                }
                try {
                  const res = await fetch(
                    `${API_BASE}/sessions/${sessionId}/chat`,
                    {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ prompt: chatInput }),
                    }
                  );
                  if (!res.ok) throw new Error(`Chat failed: ${res.status}`);
                  const data = await res.json();
                  setChatResponse(data.response ?? "");
                } catch (err: any) {
                  setChatResponse(err?.message ?? "Chat failed.");
                }
              }}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
          {chatResponse && (
            <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-4 text-sm text-slate-700">
              {chatResponse}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold">10. Feedback</h2>
          <p className="text-sm text-slate-500">
            Send a transcript to /feedback for grammar/prosody suggestions.
          </p>
          <textarea
            value={feedbackInput}
            onChange={(e) => setFeedbackInput(e.target.value)}
            placeholder="Paste transcript here..."
            className="mt-3 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            rows={4}
          />
          <button
            type="button"
            onClick={async () => {
              try {
                const res = await fetch(`${API_BASE}/feedback`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    transcript: feedbackInput,
                    segments: [],
                    target_language: themeLanguage,
                  }),
                });
                if (!res.ok) throw new Error(`Feedback failed: ${res.status}`);
                const data = await res.json();
                setFeedback(data);
              } catch (err: any) {
                setErrorMessage(err?.message ?? "Feedback failed.");
              }
            }}
            className="mt-3 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white"
          >
            Get feedback
          </button>
          {feedback && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-4 text-sm">
                <p className="font-medium text-slate-800">Grammar</p>
                <ul className="mt-2 list-disc pl-4 text-slate-600">
                  {feedback.grammar_notes.map((g, i) => (
                    <li key={`g-${i}`}>{g}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-lg border border-slate-200 p-4 text-sm">
                <p className="font-medium text-slate-800">Prosody</p>
                <ul className="mt-2 list-disc pl-4 text-slate-600">
                  {feedback.prosody_notes.map((p, i) => (
                    <li key={`p-${i}`}>{p}</li>
                  ))}
                </ul>
                {feedback.rerecord_targets.length > 0 && (
                  <>
                    <p className="mt-2 font-medium text-slate-800">
                      Re-record
                    </p>
                    <ul className="mt-1 list-disc pl-4 text-slate-600">
                      {feedback.rerecord_targets.map((r, i) => (
                        <li key={`r-${i}`}>{r}</li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          )}
        </section>

      </main>
    </div>
  );
}
