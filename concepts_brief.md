# Native Live Voice Mode in Antigravity Companion App

* **Author:** ahanafy41
* **Date:** 2026-11-05

## Overview

The Native Live Voice Mode introduces real-time, full-duplex conversational voice interaction directly into the Antigravity Companion App (`antigravity-companion-app`). It allows hands-free voice conversations with sub-second latency, barge-in interruptions, autonomous tool execution during live audio, and non-blocking coexistence with Android screen readers (TalkBack and Jieshuo/CSR). All operations run through the existing local Termux server (`127.0.0.1:7681`) to maintain security, session state, and direct access to local workspace files and CLI tools.

## Analysis

### 1. Accessibility & Audio Routing
* **Screen Reader Invariant:** The AI speech must never seize or mute `STREAM_ACCESSIBILITY`. Screen readers (TalkBack and Jieshuo) continue vocalizing system events simultaneously without audio collision or abrupt ducking.
* **Acoustic Echo Cancellation (AEC):** Playing AI speech via device loudspeakers requires hardware AEC (`AcousticEchoCanceler`) attached to the Android audio session ID to prevent the microphone from feeding the AI's own output back into the Live stream and causing false barge-in loops.
* **Auditory Earcons & Haptics:** Non-visual audio cues indicate connection states: gentle chime on mic start, soft mute tick on barge-in, periodic background tick while executing long tools, and descending alert tone on network drops.

### 2. Architecture & Data Flow
* **Three-Tier Topology:**
  1. **Android Audio Layer (`LiveVoiceEngine`):** Captures raw 16kHz 16-bit Mono PCM audio via `AudioRecord` with AEC and plays 24kHz PCM audio via low-latency `AudioTrack`.
  2. **Termux Backend Gateway (`server.py`):** Provides a local WebSocket endpoint (`/api/v1/voice/live`). Multiplexes raw audio to the upstream Google Gemini Live WebSocket while authenticating via the existing OAuth session token.
  3. **Local Tool Execution:** When the model calls a tool, the Termux backend intercepts the call, executes it locally against the workspace, and returns the result into the live socket without roundtrip client overhead.
* **Canvas Synchronization:** Spoken turns and tool execution outputs write atomically to the active chat session in `sessions.py`, keeping the visual canvas and screen-reader history in perfect sync with the voice conversation.

## Goals vs. Non-Goals

### In-Scope Goals
* Bidirectional full-duplex PCM audio streaming over local WebSocket.
* Integration with the official Gemini Multimodal Live API using stored OAuth credentials.
* Autonomous execution of existing CLI and workspace tools during active speech.
* Hardware-level Acoustic Echo Cancellation (AEC) and non-blocking audio focus for screen readers.
* Real-time bidirectional transcript sync with the existing Companion chat canvas.
* Clear auditory earcons for connection states, tool computation, and network drops.

### Out-of-Scope Non-Goals
* Re-enabling the retired Android AccessibilityService or port 8765 services.
* Direct cloud-to-mobile audio streaming that bypasses the Termux environment.
* Heavy third-party WebRTC native libraries or external API proxy wrappers.
* Replacing the visual chat canvas; voice operates as a parallel interactive modality.

## Alternatives Weighed

1. **WebView Web Speech API (Browser STT/TTS)**:
   * *Status:* Rejected by author and architects.
   * *Rationale:* Creates 2-4 second turn latency, lacks affective voice inflections, does not support mid-sentence barge-in, and fails when the WebView is backgrounded.
2. **Direct Android-to-Cloud WebSocket Connection**:
   * *Status:* Rejected by architects.
   * *Rationale:* Breaks autonomous tool execution. The cloud model would be unable to access local Termux files, shell commands, or git repositories without an expensive secondary tunnel.
3. **Exclusive Audio Focus Seizure (`AUDIOFOCUS_GAIN`)**:
   * *Status:* Rejected by author.
   * *Rationale:* Silences screen readers (TalkBack / Jieshuo), creating severe accessibility disorientation for blind users.

## Key Decisions & Staging for Next Steps

* **Decision 1:** Termux server (`server.py`) acts as the stateful, authenticated WebSocket proxy between Android audio and Google Live servers.
* **Decision 2:** Android native layer handles mic recording and speaker playback using lightweight native Java `AudioRecord` and `AudioTrack` with hardware AEC.
* **Decision 3:** Audio focus is set to transient concurrent playback (`AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK`) to ensure screen reader priority.
* **Staging:** Proceed to `/egm-draft` to specify exact WebSocket framing schemas, packet buffers, Java audio bridge interfaces, and session state machine transitions.
