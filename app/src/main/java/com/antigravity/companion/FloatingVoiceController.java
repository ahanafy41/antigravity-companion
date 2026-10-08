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
        if (instance.panel != null && instance.window != null) {
            instance.voiceButton.setOnClickListener(null); instance.agentButton.setOnClickListener(null);
            instance.window.removeView(instance.panel);
            instance.voiceButton = null; instance.agentButton = null; instance.panel = null;
        }
        instance = null;
    }
}
