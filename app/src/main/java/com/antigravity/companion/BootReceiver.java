package com.antigravity.companion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import java.util.logging.Logger;

/**
 * BootReceiver: Automatically wakes up the Termux background Python server upon device reboot.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final Logger LOGGER = Logger.getLogger(BootReceiver.class.getName());

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();

        if (Intent.ACTION_BOOT_COMPLETED.equals(action) ||
            "android.intent.action.QUICKBOOT_POWERON".equals(action) ||
            "com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {

            LOGGER.info("Device reboot completed. Triggering background Termux server startup...");
            TermuxBridge.ensureServerRunningAsync(context);
        }
    }
}
