package com.antigravity.companion;

import androidx.annotation.RequiresApi;
import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.graphics.Rect;
import android.hardware.HardwareBuffer;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import com.google.gson.JsonObject;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.Map;
import java.util.List;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.function.Consumer;
import java.util.logging.Logger;

public class AntigravityAccessibilityService extends AccessibilityService {
    private static volatile AntigravityAccessibilityService instance;
    private final Handler mainThread = new Handler(Looper.getMainLooper());
    private final ExecutorService screenshotExecutor = Executors.newSingleThreadExecutor();
    private final ScreenSnapshot snapshot = new ScreenSnapshot();
    private final Map<String, DeviceAction> actions = new HashMap<>();
    private LocalAutomationServer automationServer;
    private NativeSpeech speech;
    private interface DeviceAction { void execute(JsonObject args, Consumer<JsonObject> completion); }
    public static AntigravityAccessibilityService getInstance() { return instance; }
    public static boolean isAutomationServerReady() {
        AntigravityAccessibilityService service = instance;
        return service != null && service.automationServer != null && service.automationServer.isReady();
    }
    public static boolean isServiceRunning() { return instance != null; }
    @Override protected void onServiceConnected() {
        super.onServiceConnected(); instance = this; speech = new NativeSpeech(this); registerActions();
        try {
            automationServer = new LocalAutomationServer(this); automationServer.start();
        } catch (IOException failure) {
            Logger.getLogger(getClass().getName()).severe("Automation journal unavailable: " + failure.getMessage());
        }
        FloatingVoiceController.init(this);
    }
    private void registerActions() {
        actions.put("tree", (args, callback) -> callback.accept(captureTree()));
        actions.put("select", (args, callback) -> callback.accept(snapshot.select(ScreenSnapshot.required(args, "query"))));
        actions.put("click", this::click);
        actions.put("text", (args, callback) -> callback.accept(setText(args)));
        actions.put("scroll", (args, callback) -> callback.accept(scroll(args)));
        actions.put("back", (args, callback) -> callback.accept(performed(performGlobalAction(GLOBAL_ACTION_BACK))));
        actions.put("home", (args, callback) -> callback.accept(performed(performGlobalAction(GLOBAL_ACTION_HOME))));
        actions.put("recents", (args, callback) -> callback.accept(performed(performGlobalAction(GLOBAL_ACTION_RECENTS))));
        actions.put("notifications", (args, callback) -> callback.accept(performed(performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS))));
        actions.put("launch_app", (args, callback) -> callback.accept(launchApp(args)));
        actions.put("screenshot", (args, callback) -> screenshot(callback));
        actions.put("speech_cancel", (args, callback) -> callback.accept(speech.cancel(args)));
    }
    public void executeAction(String action, JsonObject args, String actionId, Consumer<JsonObject> completion) {
        mainThread.post(() -> {
            try {
                if (action.equals("speak")) { speech.speak(args, actionId, completion); return; }
                DeviceAction operation = actions.get(action);
                if (operation == null) throw new IllegalArgumentException("Unsupported phone action");
                operation.execute(args, completion);
            } catch (IllegalArgumentException | IllegalStateException | SecurityException failure) {
                completion.accept(failed(failure.getMessage()));
            }
        });
    }
    private JsonObject captureTree() {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) throw new IllegalStateException("No active screen");
        try {
            JsonObject tree = snapshot.capture(root);
            DisplayMetrics dimensions = getResources().getDisplayMetrics();
            tree.addProperty("width", dimensions.widthPixels); tree.addProperty("height", dimensions.heightPixels);
            tree.addProperty("coordinate_units", "pixels"); return tree;
        } finally { root.recycle(); }
    }
    private void click(JsonObject args, Consumer<JsonObject> completion) {
        if (args.has("element_id")) {
            AccessibilityNodeInfo target = snapshot.target(args);
            if (ElementClick.perform(new ClickNode(target), () -> {
                Rect bounds = new Rect(); snapshot.target(args).getBoundsInScreen(bounds);
                DisplayMetrics dimensions = getResources().getDisplayMetrics();
                if (bounds.isEmpty() || bounds.centerX() < 0 || bounds.centerY() < 0
                        || bounds.centerX() >= dimensions.widthPixels || bounds.centerY() >= dimensions.heightPixels)
                    throw new IllegalArgumentException("Element center outside screen");
                tap(bounds.centerX(), bounds.centerY(), completion);
            })) completion.accept(performed(true));
            return;
        }
        DisplayMetrics dimensions = getResources().getDisplayMetrics();
        float[] coordinates = DeviceArguments.coordinates(args, dimensions.widthPixels, dimensions.heightPixels);
        tap(coordinates[0], coordinates[1], completion);
    }
    private static final class ClickNode implements ElementClick.Node {
        private final AccessibilityNodeInfo node;
        ClickNode(AccessibilityNodeInfo node) { this.node = node; }
        public boolean click() {
            return node.isVisibleToUser() && node.isEnabled() && node.isClickable()
                    && node.performAction(AccessibilityNodeInfo.ACTION_CLICK);
        }
        public ElementClick.Node parent() {
            AccessibilityNodeInfo parent = node.getParent();
            if (parent != null && !parent.refresh()) { parent.recycle(); return null; }
            return parent == null ? null : new ClickNode(parent);
        }
        public void recycle() { node.recycle(); }
    }
    private void tap(float x, float y, Consumer<JsonObject> completion) {
        Path path = new Path(); path.moveTo(x, y);
        GestureDescription gesture = new GestureDescription.Builder()
                .addStroke(new GestureDescription.StrokeDescription(path, 0, 50)).build();
        boolean accepted = dispatchGesture(gesture, new GestureResultCallback() {
            @Override public void onCompleted(GestureDescription completed) { completion.accept(performed(true)); }
            @Override public void onCancelled(GestureDescription cancelled) { completion.accept(failed("Gesture cancelled")); }
        }, mainThread);
        if (!accepted) completion.accept(failed("Gesture rejected"));
    }
    private JsonObject setText(JsonObject args) {
        AccessibilityNodeInfo target = snapshot.target(args);
        if (!target.isEditable()) throw new IllegalArgumentException("Element is not editable");
        if (!args.has("text") || !args.get("text").isJsonPrimitive()
                || !args.get("text").getAsJsonPrimitive().isString()) throw new IllegalArgumentException("Missing text");
        Bundle text = new Bundle(); text.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                args.get("text").getAsString());
        return performed(target.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, text));
    }
    private JsonObject scroll(JsonObject args) {
        String direction = ScreenSnapshot.required(args, "direction");
        if (!direction.equals("forward") && !direction.equals("backward")) throw new IllegalArgumentException("Invalid direction");
        return performed(snapshot.target(args).performAction(direction.equals("forward")
                ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD));
    }
    private JsonObject launchApp(JsonObject args) {
        String target = ScreenSnapshot.required(args, "target");
        PackageManager packages = getPackageManager();
        List<AppLaunchTarget.App> apps = new ArrayList<>();
        for (ResolveInfo app : packages.queryIntentActivities(
                new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0)) {
            CharSequence label = app.activityInfo.applicationInfo.loadLabel(packages);
            apps.add(new AppLaunchTarget.App(app.activityInfo.packageName, label.toString()));
        }
        String packageName = AppLaunchTarget.resolve(target, apps);
        Intent launch = packages.getLaunchIntentForPackage(packageName);
        if (launch == null) return failed("Application has no launcher activity");
        try { startActivity(launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
        catch (ActivityNotFoundException unavailable) { return failed("Application launcher unavailable"); }
        JsonObject outcome = new JsonObject();
        outcome.addProperty("launch_state", "intent_dispatched");
        outcome.addProperty("package", packageName);
        return outcome;
    }
    private void screenshot(Consumer<JsonObject> completion) {
        if (Build.VERSION.SDK_INT < 30) { completion.accept(failed("Screenshot requires Android 11")); return; }
        captureScreenshot(completion);
    }
    @RequiresApi(30) private void captureScreenshot(Consumer<JsonObject> completion) {
        takeScreenshot(Display.DEFAULT_DISPLAY, screenshotExecutor, new TakeScreenshotCallback() {
            @Override public void onSuccess(ScreenshotResult captured) { encodeScreenshot(captured, completion); }
            @Override public void onFailure(int code) { completion.accept(failed("Screenshot failed: " + code)); }
        });
    }
    @RequiresApi(30) private void encodeScreenshot(ScreenshotResult captured, Consumer<JsonObject> completion) {
        Bitmap hardware = null, software = null;
        try (HardwareBuffer buffer = captured.getHardwareBuffer(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            hardware = Bitmap.wrapHardwareBuffer(buffer, captured.getColorSpace());
            if (hardware == null) throw new IllegalStateException("Cannot read screenshot buffer");
            software = hardware.copy(Bitmap.Config.ARGB_8888, false);
            if (software == null || !software.compress(Bitmap.CompressFormat.JPEG, 80, bytes))
                throw new IllegalStateException("Cannot encode screenshot");
            if (bytes.size() > 2 * 1024 * 1024) throw new IllegalStateException("Screenshot exceeds result limit");
            JsonObject image = new JsonObject(); image.addProperty("image_base64", Base64.encodeToString(bytes.toByteArray(), Base64.NO_WRAP));
            image.addProperty("mime_type", "image/jpeg"); completion.accept(image);
        } catch (IOException | IllegalStateException failure) { completion.accept(failed(failure.getMessage())); }
        finally { if (software != null) software.recycle(); if (hardware != null) hardware.recycle(); }
    }
    private static JsonObject performed(boolean completed) {
        if (!completed) return failed("Accessibility action rejected");
        JsonObject outcome = new JsonObject(); outcome.addProperty("performed", true); return outcome;
    }
    private static JsonObject failed(String error) {
        JsonObject outcome = new JsonObject(); outcome.addProperty("error", error); return outcome;
    }
    @Override public void onAccessibilityEvent(AccessibilityEvent event) {
        int type = event.getEventType();
        if (type == AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED || type == AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
                || type == AccessibilityEvent.TYPE_WINDOWS_CHANGED || type == AccessibilityEvent.TYPE_VIEW_SCROLLED
                || type == AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED) snapshot.close();
    }
    @Override public void onInterrupt() { snapshot.close(); }
    @Override public boolean onUnbind(Intent intent) { releaseResources(); return super.onUnbind(intent); }
    @Override public void onDestroy() { releaseResources(); super.onDestroy(); }
    private void releaseResources() {
        instance = null; snapshot.close(); FloatingVoiceController.destroy();
        if (speech != null) { speech.close(); speech = null; }
        mainThread.removeCallbacksAndMessages(null); screenshotExecutor.shutdownNow();
        if (automationServer != null) { automationServer.close(); automationServer = null; }
    }
}
