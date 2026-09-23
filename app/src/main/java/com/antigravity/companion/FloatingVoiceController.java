package com.antigravity.companion;

import android.accessibilityservice.AccessibilityService;
import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.speech.tts.TextToSpeech;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * FloatingVoiceController: Manages the floating accessibility microphone overlay,
 * interactive voice commands, bidirectional TextToSpeech synthesis, and agentic actions.
 */
public class FloatingVoiceController {

    private static final Logger LOGGER = Logger.getLogger(FloatingVoiceController.class.getName());
    private static volatile FloatingVoiceController sInstance;

    private static final String AGENT_ENDPOINT = "http://127.0.0.1:7681/api/device_agent/turn";
    private static final MediaType JSON_MEDIA = MediaType.get("application/json; charset=utf-8");

    private final AntigravityAccessibilityService mService;
    private WindowManager mWindowManager;
    private ImageView mFloatingView;
    private WindowManager.LayoutParams mParams;
    private final Handler mMainHandler = new Handler(Looper.getMainLooper());

    private TextToSpeech mTTS;
    private volatile boolean mTTSReady = false;

    private final OkHttpClient mHttpClient = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(60, TimeUnit.SECONDS)
            .writeTimeout(60, TimeUnit.SECONDS)
            .build();

    private FloatingVoiceController(AntigravityAccessibilityService service) {
        this.mService = service;
    }

    public static synchronized void init(AntigravityAccessibilityService service) {
        if (sInstance == null && service != null) {
            sInstance = new FloatingVoiceController(service);
            sInstance.initTTS();
            sInstance.showFloatingButton();
        }
    }

    public static synchronized void destroy() {
        if (sInstance != null) {
            sInstance.removeFloatingButton();
            sInstance.shutdownTTS();
            sInstance = null;
        }
    }

    public static FloatingVoiceController getInstance() {
        return sInstance;
    }

    private void initTTS() {
        mMainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    mTTS = new TextToSpeech(mService.getApplicationContext(), new TextToSpeech.OnInitListener() {
                        @Override
                        public void onInit(int status) {
                            if (status == TextToSpeech.SUCCESS) {
                                int res = mTTS.setLanguage(new Locale("ar"));
                                if (res == TextToSpeech.LANG_MISSING_DATA || res == TextToSpeech.LANG_NOT_SUPPORTED) {
                                    LOGGER.warning("Arabic TTS missing or not supported, using default locale");
                                    mTTS.setLanguage(Locale.getDefault());
                                }
                                mTTSReady = true;
                                LOGGER.info("TTS initialized successfully.");
                            } else {
                                LOGGER.severe("TTS initialization failed: " + status);
                            }
                        }
                    });
                } catch (Exception e) {
                    LOGGER.log(Level.SEVERE, "Failed to initialize TextToSpeech", e);
                }
            }
        });
    }

    public void speak(final String text) {
        if (text == null || text.trim().isEmpty()) return;
        mMainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (mTTS != null && mTTSReady) {
                    mTTS.speak(text, TextToSpeech.QUEUE_FLUSH, null, "AGY_TTS_" + System.currentTimeMillis());
                } else {
                    mMainHandler.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            if (mTTS != null) {
                                mTTS.speak(text, TextToSpeech.QUEUE_FLUSH, null, "AGY_TTS_" + System.currentTimeMillis());
                            }
                        }
                    }, 400);
                }
            }
        });
    }

    private void shutdownTTS() {
        mMainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (mTTS != null) {
                    try {
                        mTTS.stop();
                        mTTS.shutdown();
                    } catch (Exception ignored) {}
                    mTTS = null;
                    mTTSReady = false;
                }
            }
        });
    }

    private void showFloatingButton() {
        mMainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    mWindowManager = (WindowManager) mService.getSystemService(Context.WINDOW_SERVICE);
                    if (mWindowManager == null) return;

                    mFloatingView = new ImageView(mService);
                    mFloatingView.setImageResource(R.drawable.ic_mic);
                    mFloatingView.setContentDescription("زر مساعد Antigravity الصوتي. اضغط للتحدث بأمر فوري");
                    mFloatingView.setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
                    mFloatingView.setFocusable(true);

                    int layoutType = WindowManager.LayoutParams.TYPE_ACCESSIBILITY_OVERLAY;

                    mParams = new WindowManager.LayoutParams(
                            WindowManager.LayoutParams.WRAP_CONTENT,
                            WindowManager.LayoutParams.WRAP_CONTENT,
                            layoutType,
                            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                                    | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                            PixelFormat.TRANSLUCENT
                    );

                    mParams.gravity = Gravity.TOP | Gravity.END;
                    mParams.x = 24;
                    mParams.y = 350;

                    setupTouchListener(mFloatingView);

                    mWindowManager.addView(mFloatingView, mParams);
                    LOGGER.info("Floating Voice Button attached successfully via TYPE_ACCESSIBILITY_OVERLAY.");
                } catch (Exception e) {
                    LOGGER.log(Level.SEVERE, "Failed to attach floating overlay view", e);
                }
            }
        });
    }

    private void setupTouchListener(final View view) {
        view.setOnTouchListener(new View.OnTouchListener() {
            private int initialX;
            private int initialY;
            private float initialTouchX;
            private float initialTouchY;
            private long touchStartTime;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        initialX = mParams.x;
                        initialY = mParams.y;
                        initialTouchX = event.getRawX();
                        initialTouchY = event.getRawY();
                        touchStartTime = System.currentTimeMillis();
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        mParams.x = initialX - (int) (event.getRawX() - initialTouchX);
                        mParams.y = initialY + (int) (event.getRawY() - initialTouchY);
                        if (mWindowManager != null && mFloatingView != null) {
                            mWindowManager.updateViewLayout(mFloatingView, mParams);
                        }
                        return true;

                    case MotionEvent.ACTION_UP:
                        long duration = System.currentTimeMillis() - touchStartTime;
                        float diffX = Math.abs(event.getRawX() - initialTouchX);
                        float diffY = Math.abs(event.getRawY() - initialTouchY);
                        if (duration < 300 && diffX < 20 && diffY < 20) {
                            onFloatingButtonClicked();
                        }
                        return true;
                }
                return false;
            }
        });
    }

    private void onFloatingButtonClicked() {
        triggerHapticFeedback();
        LOGGER.info("Floating button clicked - Launching VoiceCommandActivity...");

        Intent voiceIntent = new Intent(mService, VoiceCommandActivity.class);
        voiceIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        mService.startActivity(voiceIntent);
    }

    private void triggerHapticFeedback() {
        try {
            Vibrator v = (Vibrator) mService.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createOneShot(50, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(50);
                }
            }
        } catch (Exception ignored) {}
    }

    private void removeFloatingButton() {
        mMainHandler.post(new Runnable() {
            @Override
            public void run() {
                try {
                    if (mWindowManager != null && mFloatingView != null) {
                        mWindowManager.removeView(mFloatingView);
                        mFloatingView = null;
                        LOGGER.info("Floating Voice Button removed cleanly.");
                    }
                } catch (Exception e) {
                    LOGGER.log(Level.WARNING, "Error removing floating overlay view", e);
                }
            }
        });
    }

    /**
     * Handles spoken voice commands dispatched from VoiceCommandActivity.
     */
    public void processVoiceCommand(final String spokenText) {
        LOGGER.info("Processing voice command: " + spokenText);
        if (spokenText == null || spokenText.trim().isEmpty()) return;

        speak("حاضر، ثواني...");

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    // Check and auto-heal Termux Python server if not responding
                    if (!TermuxBridge.isPortOpen("127.0.0.1", 7681, 600)) {
                        speak("جاري تشغيل خادم المساعد في تيرمكس...");
                        TermuxBridge.ensureServerRunningAsync(mService);
                        for (int i = 0; i < 10; i++) {
                            try {
                                Thread.sleep(600);
                            } catch (InterruptedException ignored) {}
                            if (TermuxBridge.isPortOpen("127.0.0.1", 7681, 400)) {
                                break;
                            }
                        }
                    }

                    final JsonObject windowTree = mService != null ? mService.dumpWindowHierarchyJson() : new JsonObject();
                    final String lower = spokenText.toLowerCase();

                    // If request asks to describe image/screen
                    if (lower.contains("اوصف") || lower.contains("صورة") || lower.contains("شاشة") || lower.contains("شايف")) {
                        if (mService != null) {
                            mService.takeScreenshotAsync(new AntigravityAccessibilityService.ScreenshotCallback() {
                                @Override
                                public void onSuccess(String base64Image) {
                                    sendVoicePayloadToAgent(spokenText, windowTree, base64Image, 1, new JsonArray());
                                }

                                @Override
                                public void onError(String errorMessage) {
                                    sendVoicePayloadToAgent(spokenText, windowTree, null, 1, new JsonArray());
                                }
                            });
                        }
                    } else {
                        // Direct action / text query
                        sendVoicePayloadToAgent(spokenText, windowTree, null, 1, new JsonArray());
                    }
                } catch (Exception e) {
                    LOGGER.log(Level.SEVERE, "Error in processVoiceCommand", e);
                    speak("معلش يا أحمد، حصل خطأ غير متوقع.");
                }
            }
        }).start();
    }

    private void sendVoicePayloadToAgent(final String query, final JsonObject tree, final String base64Screenshot,
                                         final int step, final JsonArray history) {
        LOGGER.info("Dispatching voice payload to AI Agent (step " + step + "): " + query);

        try {
            JsonObject req = new JsonObject();
            req.addProperty("command", query);
            req.addProperty("step", step);
            req.addProperty("session_id", "voice-companion-" + (System.currentTimeMillis() / 60000));
            if (tree != null) {
                req.addProperty("ui_tree", tree.toString());
            }
            if (base64Screenshot != null && !base64Screenshot.isEmpty()) {
                req.addProperty("image_base64", base64Screenshot);
            }
            if (history != null && history.size() > 0) {
                req.add("history", history);
            }

            RequestBody body = RequestBody.create(req.toString(), JSON_MEDIA);
            Request request = new Request.Builder()
                    .url(AGENT_ENDPOINT)
                    .post(body)
                    .build();

            Response response = mHttpClient.newCall(request).execute();
            if (!response.isSuccessful() || response.body() == null) {
                LOGGER.severe("Agent HTTP error: " + response.code());
                speak("معلش يا أحمد، الخادم رجع استجابة غير متوقعة.");
                return;
            }

            String respStr = response.body().string();
            LOGGER.info("Agent response: " + respStr);
            JsonObject resJson = JsonParser.parseString(respStr).getAsJsonObject();

            String speech = resJson.has("speech") && !resJson.get("speech").isJsonNull()
                    ? resJson.get("speech").getAsString() : "";
            String code = resJson.has("code") && !resJson.get("code").isJsonNull()
                    ? resJson.get("code").getAsString() : "";
            String agentStatus = resJson.has("agent_status") && !resJson.get("agent_status").isJsonNull()
                    ? resJson.get("agent_status").getAsString() : "DONE";

            if (!speech.isEmpty()) {
                speak(speech);
            }

            if (!code.isEmpty()) {
                executeCodeActions(code);
            }

            // Multi-step continuation
            if ("CONTINUE".equalsIgnoreCase(agentStatus) && step < 5) {
                sleepQuietly(1500);
                JsonObject nextTree = mService != null ? mService.dumpWindowHierarchyJson() : new JsonObject();

                JsonObject histEntry = new JsonObject();
                histEntry.addProperty("role", "agent");
                histEntry.addProperty("speech", speech);
                histEntry.addProperty("code", code);
                history.add(histEntry);

                JsonObject resultEntry = new JsonObject();
                resultEntry.addProperty("role", "system");
                resultEntry.addProperty("result", "Action executed successfully");
                history.add(resultEntry);

                sendVoicePayloadToAgent(query, nextTree, null, step + 1, history);
            }

        } catch (IOException e) {
            LOGGER.log(Level.SEVERE, "Network error communicating with agent", e);
            speak("معلش يا أحمد، تعذر الاتصال بالمساعد. تأكد إن سيرفر تيرمكس شغال.");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Unexpected error communicating with agent", e);
            speak("حصل خطأ أثناء معالجة الأمر.");
        }
    }

    public void executeCodeActions(String code) {
        if (code == null || code.trim().isEmpty() || mService == null) return;
        LOGGER.info("Executing agent code actions:\n" + code);

        String[] lines = code.split("\n");
        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty() || line.startsWith("--") || line.startsWith("//") || line.startsWith("#")) {
                continue;
            }

            try {
                if (line.contains("smartStartApp(") || line.contains("launchApp(")) {
                    String arg = extractStringArgument(line);
                    if (arg != null && !arg.isEmpty()) {
                        mService.launchApp(arg);
                        sleepQuietly(1200);
                    }
                } else if (line.contains("service.toHome()") || line.contains("toHome()")) {
                    mService.performGlobal(AccessibilityService.GLOBAL_ACTION_HOME);
                    sleepQuietly(600);
                } else if (line.contains("service.toBack()") || line.contains("toBack()")) {
                    mService.performGlobal(AccessibilityService.GLOBAL_ACTION_BACK);
                    sleepQuietly(400);
                } else if (line.contains("service.toRecents()") || line.contains("toRecents()")) {
                    mService.performGlobal(AccessibilityService.GLOBAL_ACTION_RECENTS);
                    sleepQuietly(600);
                } else if (line.contains("forceClick(") || line.contains("clickNode(")) {
                    String arg = extractStringArgument(line);
                    if (arg != null && !arg.isEmpty()) {
                        mService.clickNode(arg);
                        sleepQuietly(600);
                    }
                } else if (line.contains("advancedClick(")) {
                    List<String> targets = extractStringList(line);
                    for (String target : targets) {
                        if (mService.clickNode(target)) {
                            break;
                        }
                    }
                    sleepQuietly(600);
                } else if (line.contains("smartClick(") || line.contains("clickAtCoordinates(")) {
                    float[] coords = extractTwoFloats(line);
                    if (coords != null) {
                        mService.clickAtCoordinates(coords[0], coords[1]);
                        sleepQuietly(500);
                    }
                } else if (line.contains("setText(") || line.contains("paste(")) {
                    String text = extractStringArgument(line);
                    if (text != null) {
                        mService.setTextOnFocused(text);
                        sleepQuietly(400);
                    }
                } else if (line.contains("scroll(") || line.contains("swipe(")) {
                    boolean forward = !line.contains("up") && !line.contains("backward");
                    mService.scroll(forward);
                    sleepQuietly(600);
                } else if (line.contains("openUrl(")) {
                    String url = extractStringArgument(line);
                    if (url != null && !url.isEmpty()) {
                        Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                        browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        mService.startActivity(browserIntent);
                        sleepQuietly(1000);
                    }
                }
            } catch (Exception e) {
                LOGGER.log(Level.WARNING, "Error executing action: " + line, e);
            }
        }
    }

    private String extractStringArgument(String line) {
        int firstQuote = -1;
        char quoteChar = '"';
        int dq = line.indexOf('"');
        int sq = line.indexOf('\'');
        if (dq != -1 && (sq == -1 || dq < sq)) {
            firstQuote = dq;
            quoteChar = '"';
        } else if (sq != -1) {
            firstQuote = sq;
            quoteChar = '\'';
        }

        if (firstQuote != -1) {
            int secondQuote = line.indexOf(quoteChar, firstQuote + 1);
            if (secondQuote != -1) {
                return line.substring(firstQuote + 1, secondQuote);
            }
        }
        return null;
    }

    private List<String> extractStringList(String line) {
        List<String> list = new ArrayList<>();
        int openBrace = line.indexOf('{');
        int closeBrace = line.lastIndexOf('}');
        if (openBrace != -1 && closeBrace > openBrace) {
            String content = line.substring(openBrace + 1, closeBrace);
            String[] tokens = content.split(",");
            for (String token : tokens) {
                String val = extractStringArgument(token);
                if (val != null && !val.trim().isEmpty()) {
                    list.add(val.trim());
                }
            }
        }
        return list;
    }

    private float[] extractTwoFloats(String line) {
        int openParen = line.indexOf('(');
        int closeParen = line.lastIndexOf(')');
        if (openParen != -1 && closeParen > openParen) {
            String inside = line.substring(openParen + 1, closeParen);
            String[] parts = inside.split(",");
            if (parts.length >= 2) {
                try {
                    float x = Float.parseFloat(parts[0].trim());
                    float y = Float.parseFloat(parts[1].trim());
                    return new float[]{x, y};
                } catch (NumberFormatException ignored) {}
            }
        }
        return null;
    }

    private void sleepQuietly(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {}
    }
}
