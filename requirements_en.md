# Spoken English Learning App - Requirements

## 1. Goals & Scope
- User: intermediate learners (listening ok; output hesitations, blank mind, self-correction breaks flow, weak retention).
- Positioning: LLM-based teaching scaffold, web/Android, open-source ASR/TTS.
- Outcome: lower cognitive load; progress from chunking -> English thinking -> coherent output; deliver ready-to-use situational speaking.

## 2. Core Principles
- Free choice: no gating/unlocks; three practice areas can be entered anytime; suggestions are skippable.
- Thematic focus: practice cycles center on chosen/recommended themes + communicative function to concentrate memory.
- Load control: limit variables per round; auto/manual difficulty shifts (prompts, slower pace, simpler substitutions).
- Fluency vs correction separation: do not interrupt during speaking; diagnose afterward.
- Reuse loop: daily phrase cards surface across modules to reinforce input → output.
- Localization & customization: user can define themes/intents in Chinese or English; filter out irrelevant expressions.

## 3. Modules (“Three Gyms”)
### 3.1 Reflex Gym
- Goal: chunk automatization and fast retrieval.
- Practice ladder: shadow → substitution → expansion; register ladder for same chunk (casual/polite/formal).
- Load control: change only one variable per round; if long pause or low ASR confidence, auto 3-word hint/slowdown; user can override level.
- Multimodal: audio shadowing, ambient scene sounds.
- Output: daily phrase card (editable) for cross-module reuse.

### 3.2 Mindset Lab
- Goal: cut translation; train paraphrase/circumlocution; build expansion logic.
- Tasks: image/audio naming -> action -> story; ELI5 with banned keywords; "describe without naming" riddles; Sentence Expansion (Who/When/Why/Tone with because/so/although).
- Load gauge: show current band (lexis/structure/speed); auto downshift or provide keyword scaffolds on hesitation; manual override allowed.
- Reuse: prompt to use phrase cards in outputs.

### 3.3 Deep Dive
- Goal: coherent reasoning and long turns.
- Tasks: Socratic guiding by angle (personal/company, time/money, etc.); retell 3–5 sentence stories with key-point comparison.
- Mode split: Fluency Mode (no interruption); Review Mode (diagnostics).
- Report: 1-2 chunk upgrades, <=2 major grammar issues, 1-2 prosody notes (stress/linking); one-click re-record weak snippet; optional "no-score" round.

## 4. Themes & Intents
- Recommend/deny: system proposes themes/intents; user can "refresh/skip"; skipped items temporarily suppressed and replaced.
- Bilingual define: user enters theme/intent in Chinese or English; system parses to slots (theme, sub-intent, register) for user confirmation/edit.
- Intent granularity: pick or add tasks per theme (e.g., dining: evaluate dish, recommend dish, ask spiciness, split bill); allow add/delete.
- Localization: filter out culturally misfit chunks; favor locally relevant expressions (e.g., taste/recommendation/price over "pass the salt").
- Material generation: images/audio/dialogues/retells are generated from confirmed theme + intent; user can supply a one-line prompt to shape scenes.

## 5. Feedback & Data
- In-session: minimal interruption; only necessary backchannels/prompts per mode.
- Post-session: layered feedback (chunk upgrades, major grammar, prosody) with limited volume.
- Phrase cards: collect key chunks with tags (theme/register) and surface as optional hints across modules.
- Metrics: track pause length, filler rate, chunk reuse rate, retell coverage; show as a timeline, not gates.

## 6. User Journey Example (free navigation)
- Day: user picks any mix, e.g., “home·requests” in Reflex, “office·paraphrase” in Mindset, “outdoor·ask directions” in Deep Dive; can repeat or jump anytime.
- Review: “today’s card pack” + diagnostic report; metrics logged to timeline.
- Next: if recommendations disliked, user re-describes in CN/EN (e.g., “night market, recommend crayfish”); system rebuilds chunks/scenes usable in all modules.

## 7. Config Options
- Speech: switchable open-source ASR/TTS; adjustable speed/accent.
- Scoring toggle: allow turning off scores, keep prompts only.
- Theme packs: subscribe/unsubscribe weekly/biweekly packs; user-defined mixed playlists for looping practice.

## 8. Non-Goals
- No forced progression/unlocks; no single exam lock-in (IELTS/workplace/academic can be covered via theme/intent config).
