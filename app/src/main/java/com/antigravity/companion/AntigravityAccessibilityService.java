package com.antigravity.companion;

import android.accessibilityservice.AccessibilityService;
import android.accessibilityservice.GestureDescription;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.Path;
import android.graphics.Rect;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.accessibility.AccessibilityEvent;
import android.view.accessibility.AccessibilityNodeInfo;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.io.ByteArrayOutputStream;
import java.util.List;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Core Accessibility Service for Antigravity Companion.
 * Runs in its own dedicated process/thread context to guarantee zero latency
 * or interference with primary screen readers (TalkBack or Jieshuo/CSR).
 */
public class AntigravityAccessibilityService extends AccessibilityService {

    private static final Logger LOGGER = Logger.getLogger(AntigravityAccessibilityService.class.getName());
    private static volatile AntigravityAccessibilityService sInstance;

    private final Handler mMainHandler = new Handler(Looper.getMainLooper());
    private final Executor mBackgroundExecutor = Executors.newSingleThreadExecutor();

    public interface ScreenshotCallback {
        void onSuccess(String base64Image);
        void onError(String errorMessage);
    }

    public static AntigravityAccessibilityService getInstance() {
        return sInstance;
    }

    public static boolean isServiceRunning() {
        return sInstance != null;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        LOGGER.info("AntigravityAccessibilityService created.");
    }

    @Override
    protected void onServiceConnected() {
        super.onServiceConnected();
        sInstance = this;
        LOGGER.info("AntigravityAccessibilityService connected and ready.");

        // Start Local WebSocket Server when Accessibility Service connects
        LocalAutomationServer.startServer();

        // Attach Floating Voice Button overlay
        FloatingVoiceController.init(this);

        // Ensure Termux background server is active
        TermuxBridge.ensureServerRunningAsync(this);
    }

    @Override
    public void onAccessibilityEvent(AccessibilityEvent event) {
        // Event listener hook (minimal processing to avoid UI thread overhead)
    }

    @Override
    public void onInterrupt() {
        LOGGER.warning("AntigravityAccessibilityService interrupted.");
    }

    @Override
    public boolean onUnbind(Intent intent) {
        sInstance = null;
        LOGGER.info("AntigravityAccessibilityService unbound.");
        return super.onUnbind(intent);
    }

    @Override
    public void onDestroy() {
        sInstance = null;
        FloatingVoiceController.destroy();
        LocalAutomationServer.stopServer();
        super.onDestroy();
        LOGGER.info("AntigravityAccessibilityService destroyed.");
    }

    /**
     * Dumps the entire active window hierarchy into a clean JSON tree for AI agent reasoning.
     */
    public JsonObject dumpWindowHierarchyJson() {
        JsonObject result = new JsonObject();
        AccessibilityNodeInfo root = null;
        try {
            root = getRootInActiveWindow();
            if (root == null) {
                result.addProperty("status", "error");
                result.addProperty("message", "No active window root found.");
                return result;
            }

            result.addProperty("status", "success");
            result.addProperty("package_name", root.getPackageName() != null ? root.getPackageName().toString() : "");
            result.add("root_node", serializeNode(root));
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to dump window hierarchy", e);
            result.addProperty("status", "error");
            result.addProperty("message", e.getMessage());
        } finally {
            if (root != null) {
                root.recycle();
            }
        }
        return result;
    }

    private JsonObject serializeNode(AccessibilityNodeInfo node) {
        JsonObject json = new JsonObject();
        if (node == null) return json;

        CharSequence text = node.getText();
        CharSequence desc = node.getContentDescription();
        CharSequence viewId = node.getViewIdResourceName();
        CharSequence className = node.getClassName();

        json.addProperty("text", text != null ? text.toString() : "");
        json.addProperty("content_description", desc != null ? desc.toString() : "");
        json.addProperty("view_id", viewId != null ? viewId.toString() : "");
        json.addProperty("class_name", className != null ? className.toString() : "");
        json.addProperty("clickable", node.isClickable());
        json.addProperty("focusable", node.isFocusable());
        json.addProperty("editable", node.isEditable());
        json.addProperty("scrollable", node.isScrollable());

        Rect bounds = new Rect();
        node.getBoundsInScreen(bounds);
        JsonObject boundsJson = new JsonObject();
        boundsJson.addProperty("left", bounds.left);
        boundsJson.addProperty("top", bounds.top);
        boundsJson.addProperty("right", bounds.right);
        boundsJson.addProperty("bottom", bounds.bottom);
        json.add("bounds", boundsJson);

        int childCount = node.getChildCount();
        if (childCount > 0) {
            JsonArray children = new JsonArray();
            for (int i = 0; i < childCount; i++) {
                AccessibilityNodeInfo child = node.getChild(i);
                if (child != null) {
                    children.add(serializeNode(child));
                    child.recycle();
                }
            }
            json.add("children", children);
        }

        return json;
    }

    /**
     * Clicks a node matched by text or resource ID with hierarchical parent fallback
     * and physical coordinate gesture tap fallback.
     */
    public boolean clickNode(String query) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;

        try {
            AccessibilityNodeInfo target = findMatchingNode(root, query);
            if (target != null) {
                // 1. Try direct node click
                boolean clicked = target.performAction(AccessibilityNodeInfo.ACTION_CLICK);

                // 2. If node is not clickable, search parent chain
                if (!clicked) {
                    AccessibilityNodeInfo parent = target.getParent();
                    int depth = 0;
                    while (parent != null && depth < 4) {
                        if (parent.isClickable()) {
                            clicked = parent.performAction(AccessibilityNodeInfo.ACTION_CLICK);
                            parent.recycle();
                            break;
                        }
                        AccessibilityNodeInfo nextParent = parent.getParent();
                        parent.recycle();
                        parent = nextParent;
                        depth++;
                    }
                }

                // 3. Fallback: tactile gesture tap at center of bounds
                if (!clicked) {
                    Rect bounds = new Rect();
                    target.getBoundsInScreen(bounds);
                    if (!bounds.isEmpty()) {
                        clicked = clickAtCoordinates(bounds.centerX(), bounds.centerY());
                    }
                }

                target.recycle();
                return clicked;
            }
        } finally {
            root.recycle();
        }
        return false;
    }

    private AccessibilityNodeInfo findMatchingNode(AccessibilityNodeInfo node, String query) {
        if (node == null || query == null) return null;

        CharSequence text = node.getText();
        CharSequence desc = node.getContentDescription();
        CharSequence id = node.getViewIdResourceName();

        if (matchesQuery(text, query)) return AccessibilityNodeInfo.obtain(node);
        if (matchesQuery(desc, query)) return AccessibilityNodeInfo.obtain(node);
        if (matchesQuery(id, query)) return AccessibilityNodeInfo.obtain(node);

        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            AccessibilityNodeInfo match = findMatchingNode(child, query);
            if (child != null) child.recycle();
            if (match != null) return match;
        }
        return null;
    }

    private boolean matchesQuery(CharSequence target, String query) {
        if (target == null || query == null) return false;
        String t = normalizeArabic(target.toString().toLowerCase().trim());
        String q = normalizeArabic(query.toLowerCase().trim());
        return t.contains(q) || q.contains(t);
    }

    private String normalizeArabic(String str) {
        if (str == null) return "";
        return str.replace('أ', 'ا')
                  .replace('إ', 'ا')
                  .replace('آ', 'ا')
                  .replace('ة', 'ه')
                  .replace('ى', 'ي');
    }

    /**
     * Performs a tactile tap at exact screen coordinates using GestureDescription (API 24+).
     * Supports relative 0..1000 coordinate scaling.
     */
    public boolean clickAtCoordinates(float x, float y) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            return false;
        }

        DisplayMetrics dm = getResources().getDisplayMetrics();
        float realX = (x <= 1000f && x > 0f && dm.widthPixels > 1000) ? (x / 1000f) * dm.widthPixels : x;
        float realY = (y <= 1000f && y > 0f && dm.heightPixels > 1000) ? (y / 1000f) * dm.heightPixels : y;

        Path clickPath = new Path();
        clickPath.moveTo(realX, realY);

        GestureDescription.StrokeDescription stroke =
                new GestureDescription.StrokeDescription(clickPath, 0, 50);

        GestureDescription.Builder builder = new GestureDescription.Builder();
        builder.addStroke(stroke);

        return dispatchGesture(builder.build(), null, mMainHandler);
    }

    /**
     * Launches an application by package name, common alias, or application label.
     */
    public boolean launchApp(String nameOrPackage) {
        if (nameOrPackage == null || nameOrPackage.trim().isEmpty()) return false;
        PackageManager pm = getPackageManager();

        // 1. Direct package name
        Intent intent = pm.getLaunchIntentForPackage(nameOrPackage.trim());
        if (intent != null) {
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
            return true;
        }

        // 2. Common shortcuts
        String q = nameOrPackage.toLowerCase().trim();
        String targetPkg = null;
        if (q.contains("واتس") || q.contains("whatsapp")) {
            targetPkg = "com.whatsapp";
        } else if (q.contains("يوتيوب") || q.contains("youtube")) {
            targetPkg = "com.google.android.youtube";
        } else if (q.contains("كروم") || q.contains("chrome")) {
            targetPkg = "com.android.chrome";
        } else if (q.contains("تليجرام") || q.contains("telegram")) {
            targetPkg = "org.telegram.messenger";
        } else if (q.contains("إعدادات") || q.contains("اعدادات") || q.contains("settings")) {
            targetPkg = "com.android.settings";
        } else if (q.contains("تيرمكس") || q.contains("termux")) {
            targetPkg = "com.termux";
        }

        if (targetPkg != null) {
            intent = pm.getLaunchIntentForPackage(targetPkg);
            if (intent != null) {
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
                return true;
            }
        }

        // 3. Search installed applications by label
        try {
            List<ApplicationInfo> apps = pm.getInstalledApplications(PackageManager.GET_META_DATA);
            for (ApplicationInfo app : apps) {
                String label = pm.getApplicationLabel(app).toString();
                if (matchesQuery(label, q)) {
                    intent = pm.getLaunchIntentForPackage(app.packageName);
                    if (intent != null) {
                        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        startActivity(intent);
                        return true;
                    }
                }
            }
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Error matching app label", e);
        }
        return false;
    }

    /**
     * Scrolls the currently focused or first scrollable container.
     */
    public boolean scroll(boolean forward) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;

        try {
            AccessibilityNodeInfo scrollable = findFirstScrollable(root);
            if (scrollable != null) {
                int action = forward ? AccessibilityNodeInfo.ACTION_SCROLL_FORWARD
                                     : AccessibilityNodeInfo.ACTION_SCROLL_BACKWARD;
                boolean result = scrollable.performAction(action);
                scrollable.recycle();
                return result;
            }
        } finally {
            root.recycle();
        }
        return false;
    }

    private AccessibilityNodeInfo findFirstScrollable(AccessibilityNodeInfo node) {
        if (node == null) return null;
        if (node.isScrollable()) return AccessibilityNodeInfo.obtain(node);

        for (int i = 0; i < node.getChildCount(); i++) {
            AccessibilityNodeInfo child = node.getChild(i);
            AccessibilityNodeInfo match = findFirstScrollable(child);
            if (child != null) child.recycle();
            if (match != null) return match;
        }
        return null;
    }

    /**
     * Sets text on the currently focused editable node.
     */
    public boolean setTextOnFocused(String text) {
        AccessibilityNodeInfo root = getRootInActiveWindow();
        if (root == null) return false;

        try {
            AccessibilityNodeInfo focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
            if (focused != null) {
                Bundle args = new Bundle();
                args.putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text);
                boolean result = focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args);
                focused.recycle();
                return result;
            }
        } finally {
            root.recycle();
        }
        return false;
    }

    /**
     * Executes standard system navigation actions (Back, Home, Recents, Notifications).
     */
    public boolean performGlobal(int action) {
        return performGlobalAction(action);
    }

    /**
     * Captures a high-resolution screenshot asynchronously using API 30+ takeScreenshot.
     */
    public void takeScreenshotAsync(final ScreenshotCallback callback) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            callback.onError("Screenshot requires Android 11 (API 30) or above.");
            return;
        }

        try {
            takeScreenshot(Display.DEFAULT_DISPLAY, mBackgroundExecutor, new TakeScreenshotCallback() {
                @Override
                public void onSuccess(ScreenshotResult screenshotResult) {
                    try {
                        Bitmap bitmap = Bitmap.wrapHardwareBuffer(
                                screenshotResult.getHardwareBuffer(),
                                screenshotResult.getColorSpace()
                        );
                        if (bitmap != null) {
                            ByteArrayOutputStream stream = new ByteArrayOutputStream();
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 80, stream);
                            byte[] byteArray = stream.toByteArray();
                            String base64 = Base64.encodeToString(byteArray, Base64.NO_WRAP);
                            callback.onSuccess(base64);
                        } else {
                            callback.onError("Failed to convert hardware buffer to bitmap.");
                        }
                    } catch (Exception e) {
                        LOGGER.log(Level.SEVERE, "Error encoding screenshot", e);
                        callback.onError(e.getMessage());
                    }
                }

                @Override
                public void onFailure(int errorCode) {
                    callback.onError("Accessibility screenshot failed with error code: " + errorCode);
                }
            });
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Exception triggering takeScreenshot", e);
            callback.onError(e.getMessage());
        }
    }
}
