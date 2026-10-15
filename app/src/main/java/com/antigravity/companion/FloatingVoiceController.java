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
    private volatile LegacyVoiceApi activeLegacyApi;
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
            try (ServerConnection connection = new ServerConnection(application)) {
                if (worker.isInterrupted()) throw new InterruptedException();
                ServerConnection.Availability availability = connection.probe();
                if (availability == ServerConnection.Availability.LEGACY) executeLegacyCommand(text, requestId);
                else if (availability == ServerConnection.Availability.MODERN) {
                    try (HeadlessVoiceApi api = new HeadlessVoiceApi(application)) {
                        new HeadlessVoiceCommand(api, () -> Thread.sleep(500)).execute(text, requestId);
                    }
                } else throw new java.io.IOException("Voice server unavailable");
            } catch (InterruptedException cancelled) {
                worker.interrupt();
            } catch (java.io.IOException | IllegalArgumentException | IllegalStateException failure) {
                new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
                    if (!closed && !worker.isInterrupted()) announce("تعذر إتمام الأمر الصوتي. تحقق من اتصال الخادم وحساب agy.");
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

    private void executeLegacyCommand(String text, String requestId) throws java.io.IOException, InterruptedException {
        com.google.gson.JsonObject continuation = new com.google.gson.JsonObject();
        continuation.addProperty("session_id", requestId); continuation.add("history", new com.google.gson.JsonArray());
        try (LegacyVoiceApi api = new LegacyVoiceApi(NativeSecrets.serverPort(service))) {
            activeLegacyApi = api;
            for (int step = 1; step <= 5; step++) {
                continuation.addProperty("step", step);
                com.google.gson.JsonObject screen = legacyAction("tree", new com.google.gson.JsonObject(), requestId + "-tree-" + step);
                com.google.gson.JsonObject response = api.turn(text, screen, continuation);
                if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                String speech = response.get("speech").getAsString();
                if (!speech.trim().isEmpty()) announce(speech);
                String status = legacyString(response, "agent_status");
                String question = legacyString(response, "ask_user");
                if (!question.trim().isEmpty()) { announce(question); return; }
                if ("AWAIT_USER".equalsIgnoreCase(status)) return;
                String code = legacyString(response, "code");
                int count = executeLegacyCode(code, requestId + "-step-" + step);
                if (!"CONTINUE".equalsIgnoreCase(status)) return;
                if (step == 5) { announce("بلغ الأمر حد الخطوات. اطلب متابعة العمل إن شئت."); return; }
                appendLegacyHistory(continuation.getAsJsonArray("history"), speech, code, count);
                Thread.sleep(1500);
            }
        } finally { activeLegacyApi = null; }
    }
    private int executeLegacyCode(String code, String actionPrefix) throws java.io.IOException, InterruptedException {
        int index = 0;
        for (LegacyVoiceActions.Action action : LegacyVoiceActions.parse(code)) {
            executeLegacyAction(action, actionPrefix + "-action-" + index++);
            Thread.sleep(600);
        }
        return index;
    }
    private static String legacyString(com.google.gson.JsonObject response, String field) throws java.io.IOException {
        if (!response.has(field) || response.get(field).isJsonNull()) return "";
        if (!response.get(field).isJsonPrimitive() || !response.getAsJsonPrimitive(field).isString())
            throw new java.io.IOException("Invalid legacy voice field: " + field);
        return response.get(field).getAsString();
    }
    private static void appendLegacyHistory(com.google.gson.JsonArray history, String speech, String code, int count) {
        com.google.gson.JsonObject agent = new com.google.gson.JsonObject(); agent.addProperty("role", "agent");
        agent.addProperty("speech", speech); agent.addProperty("code", code); history.add(agent);
        com.google.gson.JsonObject confirmation = new com.google.gson.JsonObject(); confirmation.addProperty("role", "system");
        confirmation.addProperty("result", "Confirmed phone actions: " + count); history.add(confirmation);
    }
    private com.google.gson.JsonObject legacyAction(String action, com.google.gson.JsonObject args, String actionId)
            throws java.io.IOException, InterruptedException {
        if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
        java.util.concurrent.CompletableFuture<com.google.gson.JsonObject> completion = new java.util.concurrent.CompletableFuture<>();
        service.executeAction(action, args, actionId, completion::complete);
        try {
            com.google.gson.JsonObject outcome = completion.get(15, java.util.concurrent.TimeUnit.SECONDS);
            if (outcome.has("error")) throw new java.io.IOException("Legacy phone action failed: " + action);
            return outcome;
        } catch (java.util.concurrent.TimeoutException | java.util.concurrent.ExecutionException failure) {
            throw new java.io.IOException("Legacy phone action outcome unknown; do not replay", failure);
        }
    }
    private void executeLegacyAction(LegacyVoiceActions.Action action, String actionId)
            throws java.io.IOException, InterruptedException {
        com.google.gson.JsonObject args = action.args.deepCopy();
        if (action.name.equals("open_url")) { openLegacyUrl(args.get("url").getAsString()); return; }
        if (action.name.equals("click") || action.name.equals("text") || action.name.equals("scroll")) {
            com.google.gson.JsonObject screen = legacyAction("tree", new com.google.gson.JsonObject(), actionId + "-tree");
            if (args.has("query") || args.has("targets")) args = legacyClickArguments(args, actionId);
            else if (args.has("x")) args = legacyCoordinates(args, screen);
            else {
                com.google.gson.JsonObject target = LegacyVoiceActions.elementArguments(screen, action.name.equals("text") ? "editable" : "scrollable");
                for (java.util.Map.Entry<String, com.google.gson.JsonElement> entry : args.entrySet()) target.add(entry.getKey(), entry.getValue());
                args = target;
            }
        }
        legacyAction(action.name, args, actionId);
    }
    private com.google.gson.JsonObject legacyClickArguments(com.google.gson.JsonObject args, String actionId)
            throws java.io.IOException, InterruptedException {
        com.google.gson.JsonArray targets = new com.google.gson.JsonArray();
        if (args.has("targets")) targets = args.getAsJsonArray("targets"); else targets.add(args.get("query"));
        for (com.google.gson.JsonElement target : targets) {
            com.google.gson.JsonObject query = new com.google.gson.JsonObject(); query.add("query", target);
            com.google.gson.JsonObject selected = legacyAction("select", query, actionId + "-select");
            if (selected.getAsJsonArray("element_ids").isEmpty()) continue;
            com.google.gson.JsonObject click = new com.google.gson.JsonObject(); click.add("snapshot_id", selected.get("snapshot_id"));
            click.add("element_id", selected.getAsJsonArray("element_ids").get(0)); return click;
        }
        throw new java.io.IOException("Legacy click target not found");
    }
    private static com.google.gson.JsonObject legacyCoordinates(com.google.gson.JsonObject args, com.google.gson.JsonObject screen) {
        int width = screen.get("width").getAsInt(), height = screen.get("height").getAsInt();
        com.google.gson.JsonObject pixels = new com.google.gson.JsonObject(); pixels.addProperty("units", "pixels");
        pixels.addProperty("width", width); pixels.addProperty("height", height);
        pixels.addProperty("x", legacyCoordinate(args.get("x").getAsFloat(), width));
        pixels.addProperty("y", legacyCoordinate(args.get("y").getAsFloat(), height)); return pixels;
    }
    private static float legacyCoordinate(float coordinate, int dimension) {
        return coordinate > 0 && coordinate <= 1000 && dimension > 1000 ? coordinate * dimension / 1000 : coordinate;
    }
    private void openLegacyUrl(String url) throws java.io.IOException, InterruptedException {
        android.net.Uri uri = android.net.Uri.parse(url);
        if (!("https".equals(uri.getScheme()) || "http".equals(uri.getScheme())) || uri.getHost() == null)
            throw new IllegalArgumentException("Unsupported legacy URL");
        java.util.concurrent.CompletableFuture<Boolean> opened = new java.util.concurrent.CompletableFuture<>();
        new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
            try {
                service.startActivity(new Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); opened.complete(true);
            } catch (android.content.ActivityNotFoundException | SecurityException unavailable) { opened.completeExceptionally(unavailable); }
        });
        try { opened.get(5, java.util.concurrent.TimeUnit.SECONDS); }
        catch (java.util.concurrent.TimeoutException | java.util.concurrent.ExecutionException failure) {
            throw new java.io.IOException("Legacy URL launch failed", failure);
        }
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
                agentButton.setEnabled(false); commandWorker.interrupt();
                LegacyVoiceApi api = activeLegacyApi; if (api != null) api.close(); return;
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
        LegacyVoiceApi api = instance.activeLegacyApi; if (api != null) api.close();
        if (instance.panel != null && instance.window != null) {
            instance.voiceButton.setOnClickListener(null); instance.agentButton.setOnClickListener(null);
            instance.window.removeView(instance.panel);
            instance.voiceButton = null; instance.agentButton = null; instance.panel = null;
        }
        instance = null;
    }
}
