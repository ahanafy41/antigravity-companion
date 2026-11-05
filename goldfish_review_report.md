# Goldfish Annotated Review Report

**Status:** resolved (All 11 proposed fixes accepted and applied)
**Target:** `/data/data/com.termux/files/home/.gemini/antigravity-cli/scratch/antigravity-companion-app/design_draft.md` (`full file`)

## Prioritized Findings & AI Suggestions

### 1. Human Approval Bypass in Autonomous Voice Tool Calling [`egm-design`] - Severity: Blocker
*   **Affected Scope:** `design_draft.md#L75-L84` (Section 4.1 Architecture & Section 4.2.B Gateway)
*   **Discrepancy Description:** Gemini Live autonomously receiving `toolCall` frames for mutating commands (`run_command`, `edit_file`, `write_file`) and Termux executing them directly without an explicit human permission checkpoint violates the sandbox security policy.
*   **Rationale:** Executing arbitrary commands purely on model triggers without confirmation creates risk of accidental data deletion. Conversely, blocking on silent UI dialogs deadlocks the voice loop.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:** Introduce an explicit voice-first human approval gate: read-only tools run silently, while mutating/destructive tools require verbal confirmation ("نعم/موافق") or UI approval before execution.
*   ***Proposed Edit:***
    *   Location: Section 4.1 & Section 4.2.B
    *   Change: Add verbal approval branching in Sequence Diagram and mandate permission gate logic in `server/live_voice.py`.

---

### 2. Codebase Drift & Non-Existent File/Bridge Identifiers [`egm-codebase-details`] - Severity: Major
*   **Affected Scope:** `design_draft.md#L115`, `design_draft.md#L168`, `design_draft.md#L171` (Section 4.2.C & Section 6.1)
*   **Discrepancy Description:** The draft references modifying non-existent `server/web/ui.js` and calls non-existent `window.AntigravityJsBridge.toggleLiveVoice()`. The codebase actually uses `server/web/main-ui.js`, `server/web/native.js`, and `CompanionNative.postMessage(...)`.
*   **Rationale:** Referencing non-existent files and legacy bridge identifiers breaks frontend/backend integration and results in 404 errors.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:** Align all frontend file references and bridge calls with the actual repository implementation.
*   ***Proposed Edit:***
    *   Location: Section 4.2.C & Section 6.1
    *   Change: Replace `ui.js` references with `server/web/native.js` and `server/web/main-ui.js`, and standardize on `CompanionNative.postMessage(JSON.stringify({ action: "toggleLiveVoice" }))`.

---

### 3. Screen Reader Audio Ducking Collision on `STREAM_MUSIC` [`egm-design`] - Severity: Major
*   **Affected Scope:** `design_draft.md#L33`, `design_draft.md#L97`, `design_draft.md#L148-L149` (Section 3 & Section 4.2.A)
*   **Discrepancy Description:** `AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK` on `STREAM_MUSIC` protects TalkBack on `STREAM_ACCESSIBILITY`, but Chinese screen reader Jieshuo (CSR) frequently routes through `STREAM_MUSIC`, causing AI speech to lower CSR speech volume.
*   **Rationale:** Ducking Jieshuo speech impairs auditory comprehension for blind developers.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:** Provide a configurable "Concurrent Playback" mode in `LiveVoiceEngine` that disables ducking suppression so TalkBack and Jieshuo maintain unhindered speech clarity.
*   ***Proposed Edit:***
    *   Location: Section 3 & Section 4.2.A
    *   Change: Document screen-reader coexistence invariant and add concurrent playback setting in `LiveVoiceEngine`.

---

### 4. Acoustic Feedback & Inevitable False Barge-In Loops [`egm-implementation-readiness`] - Severity: Major
*   **Affected Scope:** `design_draft.md#L32`, `design_draft.md#L94`, `design_draft.md#L207` (Section 4.2.A & Section 6.2)
*   **Discrepancy Description:** Relying solely on Android's hardware `AcousticEchoCanceler` is unreliable on varied mobile hardware, especially during loudspeaker playback, causing AI speech to re-enter the mic and trigger false barge-in loops.
*   **Rationale:** False barge-in cuts off every AI spoken utterance mid-sentence.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:** Implement a software energy gate in `LiveVoiceEngine` that raises the voice detection threshold by +12dB during active loudspeaker playback unless headphones are connected.
*   ***Proposed Edit:***
    *   Location: Section 4.2.A
    *   Change: Specify software amplitude/energy gating in `LiveVoiceEngine` alongside hardware AEC.

---

### 5. Omission of Android 14 (API 34) Foreground Service & Permissions [`egm-codebase-details`] - Severity: Major
*   **Affected Scope:** `design_draft.md#L169`, `design_draft.md#L190-L196` (Section 4.2.A & Section 6.1)
*   **Discrepancy Description:** Android 14 (API 34) suspends background microphone capture without a declared `FOREGROUND_SERVICE` of type `microphone`.
*   **Rationale:** Switching from the companion app to Termux or browser immediately terminates audio streaming without this permission.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:** Declare `FOREGROUND_SERVICE_MICROPHONE` in `AndroidManifest.xml` and tie `LiveVoiceEngine` to a lightweight audio service.
*   ***Proposed Edit:***
    *   Location: Section 4.2.A & Section 6.1
    *   Change: Add `android.permission.FOREGROUND_SERVICE_MICROPHONE` to `AndroidManifest.xml` modifications.

---

### 6. Binary vs Control Protocol Framing Ambiguity on Loopback WebSocket [`egm-comprehension`] - Severity: Major
*   **Affected Scope:** `design_draft.md#L62`, `design_draft.md#L103-L107` (Section 4.1)
*   **Discrepancy Description:** The draft omitted the concrete wire protocol separating raw binary PCM audio from JSON control events over the single `/api/v1/voice/live` WebSocket.
*   **Rationale:** Lack of protocol framing creates ambiguity and parsing bugs during implementation.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:** Define an explicit two-byte binary header (`0xAA 0x01` for raw PCM audio, `0xAA 0x02` for UTF-8 JSON control messages).
*   ***Proposed Edit:***
    *   Location: Section 4.1 Wire Framing Specification
    *   Change: Add protocol framing specification detailing opcodes and magic byte.

---

### 7. Synthetic Voice Verbalization Cognitive Overload for CLI Output [`egm-zoom-out`] - Severity: Major
*   **Affected Scope:** `design_draft.md#L81-L83`, `design_draft.md#L110` (Section 4.2.B)
*   **Discrepancy Description:** Having the AI read aloud 30+ lines of raw bash output or test logs creates severe cognitive fatigue for blind developers who can skim text faster via TalkBack/Jieshuo.
*   **Rationale:** Verbalizing verbose logs degrades UX and causes conversational drag.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:** Instruct the system prompt to enforce concise (maximum 2-sentence) verbal summaries of tool results while streaming full raw output to the chat canvas.
*   ***Proposed Edit:***
    *   Location: Section 4.2.B
    *   Change: Add Cognitive Fatigue Guard to the gateway setup instructions.

---

### 8. Inconsistency with Session Store Serialization Architecture [`egm-codebase-details`] - Severity: Nit
*   **Affected Scope:** `design_draft.md#L121`, `design_draft.md#L172` (Section 4.2.C & Section 6.1)
*   **Discrepancy Description:** The draft claimed `live_voice.py` writes directly to `history.jsonl`, bypassing `AtomicStore` revision tracking and concurrency locks.
*   **Rationale:** Bypassing `AtomicStore` risks concurrency conflicts.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:** Persist turns through established `Sessions.record_turn()` and `AtomicStore` mutation handlers.
*   ***Proposed Edit:***
    *   Location: Section 4.2.C & Section 6.1
    *   Change: Replace raw file write references with `Sessions.record_turn()` and `AtomicStore`.

---

### 9. Under-specified Procedural Earcon Synthesizer Parameters [`egm-implementation-readiness`] - Severity: Nit
*   **Affected Scope:** `design_draft.md#L99-L101`, `design_draft.md#L196` (Section 4.2.A)
*   **Discrepancy Description:** Procedural earcons (`CONNECT`, `MUTE`, `TICK`, `ERROR`) lacked specific frequency and duration parameters.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:** Document exact sine sweep frequencies, intervals, and durations for immediate implementation readiness.
*   ***Proposed Edit:***
    *   Location: Section 4.2.A
    *   Change: Specify concrete Hz and ms parameters for all 4 procedural tones.

---

### 10. ARIA Label Conciseness & Humanizer Rule Alignment [`egm-style`] - Severity: Nit
*   **Affected Scope:** `design_draft.md#L117`, `design_draft.md#L199` (Section 4.2.C)
*   **Discrepancy Description:** Label `aria-label="بدء المحادثة الصوتية الحية"` was overly verbose for repeated screen-reader navigation.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:** Shorten to direct, concise label: `aria-label="محادثة صوتية: بدء"` / `"إيقاف"`.
*   ***Proposed Edit:***
    *   Location: Section 4.2.C
    *   Change: Update suggested ARIA label string.

---

### 11. Missing GitHub-Style Alert Callouts on Security Invariants [`egm-structural`] - Severity: Nit
*   **Affected Scope:** `design_draft.md#L39-L41` (Section 3 Non-Goals)
*   **Discrepancy Description:** Architectural non-goals were formatted as plain bullet points instead of prominent alert callouts.
*   ***AI Suggestion:*** PROPOSE FIX
*   ***Justification:** Wrap non-goals in a `> [!IMPORTANT]` blockquote to clearly isolate protected invariants.
*   ***Proposed Edit:***
    *   Location: Section 3 Non-Goals
    *   Change: Convert to `> [!IMPORTANT]` blockquote.
