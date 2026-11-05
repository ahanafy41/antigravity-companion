package com.antigravity.companion;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFormat;
import android.media.AudioManager;
import android.media.AudioRecord;
import android.media.AudioTrack;
import android.media.MediaRecorder;
import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * High-performance Native Android Audio Engine for Antigravity Companion Live Voice.
 *
 * Implements 16kHz PCM recording with Acoustic Echo Cancellation (AEC),
 * 24kHz PCM low-latency playback on STREAM_MUSIC without seizing screen-reader audio,
 * and procedural non-visual earcon synthesis.
 */
public final class LiveVoiceEngine {
    private static final String TAG = "LiveVoiceEngine";

    public static final byte MAGIC_BYTE = (byte) 0xAA;
    public static final byte OPCODE_AUDIO = (byte) 0x01;
    public static final byte OPCODE_CONTROL = (byte) 0x02;

    private static final int SAMPLE_RATE_IN = 16000;
    private static final int SAMPLE_RATE_OUT = 24000;
    private static final int FRAME_SIZE_IN = 1280; // 80ms at 16kHz

    public interface VoiceListener {
        void onStateChanged(String state);
        void onTranscriptReceived(String role, String text, boolean isFinal);
        void onError(String message);
    }

    private final Context context;
    private final VoiceListener listener;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newFixedThreadPool(2);

    private final AtomicBoolean isRunning = new AtomicBoolean(false);
    private AudioRecord audioRecord;
    private AudioTrack audioTrack;
    private AcousticEchoCanceler echoCanceler;
    private NoiseSuppressor noiseSuppressor;

    public LiveVoiceEngine(Context context, VoiceListener listener) {
        this.context = context.getApplicationContext();
        this.listener = listener;
    }

    public boolean isActive() {
        return isRunning.get();
    }

    public synchronized void start() {
        if (isRunning.get()) return;
        isRunning.set(true);
        notifyState("connecting");

        executor.execute(this::runAudioCapture);
        executor.execute(this::runAudioPlayback);
        playProceduralEarcon("connect");
    }

    public synchronized void stop() {
        if (!isRunning.get()) return;
        isRunning.set(false);
        releaseAudioResources();
        notifyState("idle");
    }

    private void runAudioCapture() {
        int bufferSize = Math.max(
                AudioRecord.getMinBufferSize(SAMPLE_RATE_IN, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT),
                FRAME_SIZE_IN * 2
        );

        try {
            audioRecord = new AudioRecord(
                    MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                    SAMPLE_RATE_IN,
                    AudioFormat.CHANNEL_IN_MONO,
                    AudioFormat.ENCODING_PCM_16BIT,
                    bufferSize
            );

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                notifyError("فشل تهيئة مسجل الصوت");
                stop();
                return;
            }

            int audioSessionId = audioRecord.getAudioSessionId();
            if (AcousticEchoCanceler.isAvailable()) {
                echoCanceler = AcousticEchoCanceler.create(audioSessionId);
                if (echoCanceler != null) echoCanceler.setEnabled(true);
            }
            if (NoiseSuppressor.isAvailable()) {
                noiseSuppressor = NoiseSuppressor.create(audioSessionId);
                if (noiseSuppressor != null) noiseSuppressor.setEnabled(true);
            }

            audioRecord.startRecording();
            notifyState("listening");

            byte[] audioBuffer = new byte[FRAME_SIZE_IN * 2];
            while (isRunning.get()) {
                int bytesRead = audioRecord.read(audioBuffer, 0, audioBuffer.length);
                if (bytesRead > 0) {
                    // Frame and pipe raw PCM to local gateway
                }
            }
        } catch (SecurityException secErr) {
            notifyError("صلاحية الميكروفون غير ممنوحة");
            stop();
        } catch (Exception err) {
            Log.e(TAG, "Audio capture error: " + err.getMessage(), err);
            notifyError("خطأ في التقاط الصوت: " + err.getMessage());
            stop();
        }
    }

    private void runAudioPlayback() {
        int bufferSize = Math.max(
                AudioTrack.getMinBufferSize(SAMPLE_RATE_OUT, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT),
                2400 * 2
        );

        AudioAttributes attributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build();

        AudioFormat format = new AudioFormat.Builder()
                .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                .setSampleRate(SAMPLE_RATE_OUT)
                .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                .build();

        audioTrack = new AudioTrack(
                attributes,
                format,
                bufferSize,
                AudioTrack.MODE_STREAM,
                AudioManager.AUDIO_SESSION_ID_GENERATE
        );

        if (audioTrack.getState() == AudioTrack.STATE_INITIALIZED) {
            audioTrack.play();
        }
    }

    public void playProceduralEarcon(String name) {
        executor.execute(() -> {
            byte[] earconData = generateEarconTone(name);
            if (earconData != null && earconData.length > 0) {
                playDirectPcm(earconData, 24000);
            }
        });
    }

    private byte[] generateEarconTone(String name) {
        int sampleRate = 24000;
        int durationMs;
        double startFreq, endFreq;

        if ("connect".equalsIgnoreCase(name)) {
            durationMs = 80;
            startFreq = 440.0;
            endFreq = 880.0;
        } else if ("mute".equalsIgnoreCase(name)) {
            durationMs = 25;
            startFreq = 800.0;
            endFreq = 800.0;
        } else if ("tick".equalsIgnoreCase(name)) {
            durationMs = 30;
            startFreq = 500.0;
            endFreq = 500.0;
        } else if ("error".equalsIgnoreCase(name)) {
            durationMs = 150;
            startFreq = 600.0;
            endFreq = 250.0;
        } else {
            return null;
        }

        int numSamples = (sampleRate * durationMs) / 1000;
        byte[] pcm = new byte[numSamples * 2];

        for (int i = 0; i < numSamples; i++) {
            double fraction = (double) i / numSamples;
            double currentFreq = startFreq + (endFreq - startFreq) * fraction;
            double timeSec = (double) i / sampleRate;
            double angle = 2.0 * Math.PI * currentFreq * timeSec;

            // Apply soft envelope (fade in and fade out)
            double envelope = 1.0;
            if (fraction < 0.1) envelope = fraction / 0.1;
            else if (fraction > 0.9) envelope = (1.0 - fraction) / 0.1;

            short sample = (short) (Math.sin(angle) * 0.3 * 32767.0 * envelope);
            pcm[i * 2] = (byte) (sample & 0xFF);
            pcm[i * 2 + 1] = (byte) ((sample >> 8) & 0xFF);
        }
        return pcm;
    }

    private synchronized void playDirectPcm(byte[] pcm, int sampleRate) {
        try {
            AudioTrack track = new AudioTrack(
                    new AudioAttributes.Builder()
                            .setUsage(AudioAttributes.USAGE_ASSISTANCE_SONIFICATION)
                            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                            .build(),
                    new AudioFormat.Builder()
                            .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                            .setSampleRate(sampleRate)
                            .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
                            .build(),
                    pcm.length,
                    AudioTrack.MODE_STATIC,
                    AudioManager.AUDIO_SESSION_ID_GENERATE
            );
            track.write(pcm, 0, pcm.length);
            track.play();
            // Let track finish and release
            mainHandler.postDelayed(track::release, 300);
        } catch (Exception err) {
            Log.w(TAG, "Direct earcon play error: " + err.getMessage());
        }
    }

    private synchronized void releaseAudioResources() {
        if (echoCanceler != null) {
            try { echoCanceler.release(); } catch (Exception ignored) {}
            echoCanceler = null;
        }
        if (noiseSuppressor != null) {
            try { noiseSuppressor.release(); } catch (Exception ignored) {}
            noiseSuppressor = null;
        }
        if (audioRecord != null) {
            try {
                if (audioRecord.getRecordingState() == AudioRecord.RECORDSTATE_RECORDING) {
                    audioRecord.stop();
                }
                audioRecord.release();
            } catch (Exception ignored) {}
            audioRecord = null;
        }
        if (audioTrack != null) {
            try {
                if (audioTrack.getPlayState() == AudioTrack.PLAYSTATE_PLAYING) {
                    audioTrack.stop();
                }
                audioTrack.release();
            } catch (Exception ignored) {}
            audioTrack = null;
        }
    }

    private void notifyState(String state) {
        if (listener != null) {
            mainHandler.post(() -> listener.onStateChanged(state));
        }
    }

    private void notifyError(String message) {
        if (listener != null) {
            mainHandler.post(() -> listener.onError(message));
        }
    }
}
