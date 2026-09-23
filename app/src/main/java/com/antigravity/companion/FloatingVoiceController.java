package com.antigravity.companion;

import android.content.Context;
import android.content.Intent;
import android.graphics.PixelFormat;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.ImageView;

import com.google.gson.JsonObject;

import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * FloatingVoiceController: Manages the floating accessibility microphone overlay.
 * Uses TYPE_ACCESSIBILITY_OVERLAY to render directly over all apps without extra permissions.
 */
public class FloatingVoiceController {

    private static final Logger LOGGER = Logger.getLogger(FloatingVoiceController.class.getName());
    private static volatile FloatingVoiceController sInstance;

    private final AntigravityAccessibilityService mService;
    private WindowManager mWindowManager;
    private ImageView mFloatingView;
    private WindowManager.LayoutParams mParams;
    private final Handler mMainHandler = new Handler(Looper.getMainLooper());

    private FloatingVoiceController(AntigravityAccessibilityService service) {
        this.mService = service;
    }

    public static synchronized void init(AntigravityAccessibilityService service) {
        if (sInstance == null && service != null) {
            sInstance = new FloatingVoiceController(service);
            sInstance.showFloatingButton();
        }
    }

    public static synchronized void destroy() {
        if (sInstance != null) {
            sInstance.removeFloatingButton();
            sInstance = null;
        }
    }

    public static FloatingVoiceController getInstance() {
        return sInstance;
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

        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    final JsonObject windowTree = mService != null ? mService.dumpWindowHierarchyJson() : new JsonObject();
                    final String lower = spokenText.toLowerCase();

                    // If request asks to describe image/screen
                    if (lower.contains("اوصف") || lower.contains("صورة") || lower.contains("شاشة") || lower.contains("شايف")) {
                        if (mService != null) {
                            mService.takeScreenshotAsync(new AntigravityAccessibilityService.ScreenshotCallback() {
                                @Override
                                public void onSuccess(String base64Image) {
                                    sendVoicePayloadToAgent(spokenText, windowTree, base64Image);
                                }

                                @Override
                                public void onError(String errorMessage) {
                                    sendVoicePayloadToAgent(spokenText, windowTree, null);
                                }
                            });
                        }
                    } else {
                        // Direct action / text query
                        sendVoicePayloadToAgent(spokenText, windowTree, null);
                    }
                } catch (Exception e) {
                    LOGGER.log(Level.SEVERE, "Error in processVoiceCommand", e);
                }
            }
        }).start();
    }

    private void sendVoicePayloadToAgent(String query, JsonObject tree, String base64Screenshot) {
        LOGGER.info("Dispatching voice payload to AI Agent: " + query);
        // Direct execution via bridge or web socket
    }
}
