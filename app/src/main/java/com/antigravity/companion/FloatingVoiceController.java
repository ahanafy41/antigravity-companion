package com.antigravity.companion;

import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.media.ToneGenerator;
import android.media.AudioManager;
import android.os.Build;
import android.os.Vibrator;
import android.os.VibrationEffect;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import java.util.logging.Logger;

public final class FloatingVoiceController {
    private static FloatingVoiceController instance;
    private final AntigravityAccessibilityService service;
    private final WindowManager window;
    private Button voiceButton;
    private Button agentButton;
    private LinearLayout panel;
    private Thread commandWorker;
    private boolean closed;

    public static void processVoiceCommand(Context context, com.google.gson.JsonObject speech, boolean agentMode) {
        FloatingVoiceController current = instance;
        if (!agentMode) {
            if (!MainActivity.deliverVoiceDictation(speech)) {
                if (current != null) current.announce("لا يوجد محرر مفتوح للإملاء. افتح المحادثة أولاً.");
                else android.widget.Toast.makeText(context, "لا يوجد محرر مفتوح للإملاء", android.widget.Toast.LENGTH_LONG).show();
            }
            return;
        }
        if (current == null || current.closed) {
            android.widget.Toast.makeText(context, "خدمة التحكم بالجهاز غير متصلة", android.widget.Toast.LENGTH_LONG).show();
            return;
        }
        current.startCommand(speech.get("text").getAsString(), speech.get("task_id").getAsString());
    }

    private void startCommand(String text, String requestId) {
        if (commandWorker != null) { announce("أمر صوتي جارٍ. ألغِه أولاً."); return; }
        Context application = service.getApplicationContext();
        commandWorker = new Thread(() -> {
            Thread worker = Thread.currentThread();
            try (HeadlessVoiceApi api = new HeadlessVoiceApi(application)) {
                if (worker.isInterrupted()) throw new InterruptedException();
                new HeadlessVoiceCommand(api, () -> Thread.sleep(500)).execute(text, requestId);
            } catch (InterruptedException cancelled) {
                worker.interrupt();
            } catch (java.io.IOException | IllegalArgumentException | IllegalStateException failure) {
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                    if (!closed) announce("تعذر إتمام الأمر الصوتي. تحقق من اتصال الخادم وحساب agy.");
                });
                Logger.getLogger(getClass().getName()).warning("Headless voice request failed: " + failure.getClass().getSimpleName());
            } finally {
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                    if (commandWorker == worker) commandWorker = null;
                    if (!closed && agentButton != null) {
                        agentButton.setEnabled(true);
                        agentButton.setText("تحكم صوتي");
                        agentButton.setContentDescription("بدء أمر صوتي للتحكم بالجهاز");
                    }
                });
            }
        }, "companion-headless-voice");
        if (agentButton != null) {
            agentButton.setText("إلغاء الأمر الجاري");
            agentButton.setContentDescription("إلغاء الأمر الصوتي الجاري");
        }
        commandWorker.start();
    }

    private void announce(String text) {
        com.google.gson.JsonObject args = new com.google.gson.JsonObject();
        args.addProperty("text", text); args.addProperty("language", "ar-EG");
        service.executeAction("speak", args, "voice-notice-" + java.util.UUID.randomUUID(), outcome -> {
            if (outcome.has("error") && !closed)
                android.widget.Toast.makeText(service, text, android.widget.Toast.LENGTH_LONG).show();
        });
    }
    private FloatingVoiceController(AntigravityAccessibilityService service) {
        this.service = service; window = (WindowManager) service.getSystemService(Context.WINDOW_SERVICE);
    }
    static synchronized void init(AntigravityAccessibilityService service) {
        if (instance != null) return;
        instance = new FloatingVoiceController(service); instance.attach();
    }
    private void attach() {
        if (window == null) return;
        panel = new LinearLayout(service); panel.setOrientation(LinearLayout.VERTICAL);
        voiceButton = new Button(service); voiceButton.setText("إملاء");
        voiceButton.setContentDescription("إملاء رسالة للمساعد");
        voiceButton.setOnClickListener(view -> {
            feedback(); service.startActivity(new Intent(service, VoiceCommandActivity.class)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        });
        agentButton = new Button(service); agentButton.setText("تحكم صوتي");
        agentButton.setContentDescription("بدء أمر صوتي للتحكم بالجهاز");
        agentButton.setOnClickListener(view -> {
            if (commandWorker != null) {
                agentButton.setEnabled(false); commandWorker.interrupt(); return;
            }
            feedback(); service.startActivity(new Intent(service, VoiceCommandActivity.class)
                    .putExtra("voice_agent", true)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP));
        });
        panel.addView(voiceButton); panel.addView(agentButton);
        WindowManager.LayoutParams position = new WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY, WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
                PixelFormat.TRANSLUCENT);
        position.gravity = Gravity.TOP | Gravity.END; position.y = 350; position.x = 24;
        try { window.addView(panel, position); }
        catch (WindowManager.BadTokenException | SecurityException failure) {
            Logger.getLogger(getClass().getName()).warning("Voice overlay unavailable: " + failure.getMessage()); voiceButton = null; agentButton = null; panel = null;
        }
    }
    private void feedback() {
        android.content.SharedPreferences preferences = service.getSharedPreferences("companion_settings", Context.MODE_PRIVATE);
        if (preferences.getBoolean("voice_vibration", true)) {
            Vibrator vibrator = (Vibrator) service.getSystemService(Context.VIBRATOR_SERVICE);
            if (vibrator != null && vibrator.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE));
                else vibrator.vibrate(50);
            }
        }
        if (preferences.getBoolean("voice_sound", false)) {
            ToneGenerator tone = new ToneGenerator(AudioManager.STREAM_NOTIFICATION, 40);
            tone.startTone(ToneGenerator.TONE_PROP_BEEP, 100);
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(tone::release, 200);
        }
    }
    static synchronized void destroy() {
        if (instance == null) return;
        instance.closed = true;
        if (instance.commandWorker != null) instance.commandWorker.interrupt();
        if (instance.panel != null && instance.window != null) {
            instance.voiceButton.setOnClickListener(null); instance.agentButton.setOnClickListener(null);
            instance.window.removeView(instance.panel);
            instance.voiceButton = null; instance.agentButton = null; instance.panel = null;
        }
        instance = null;
    }
}
