package com.antigravity.companion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.os.Build;
import androidx.core.app.NotificationCompat;

public final class BootReceiver extends BroadcastReceiver {
    private static final int RECOVERY_NOTIFICATION = 2003;
    private static final String CHANNEL = "server_recovery";

    @Override public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) return;
        context.getSharedPreferences("companion_settings", Context.MODE_PRIVATE)
                .edit().putBoolean("server_restart_needed", true).apply();
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        if (notifications == null || !notifications.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= 26)
            notifications.createNotificationChannel(new NotificationChannel(CHANNEL,
                    "استعادة اتصال الخادم", NotificationManager.IMPORTANCE_LOW));
        Intent open = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent recovery = PendingIntent.getActivity(context, RECOVERY_NOTIFICATION, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        try {
            notifications.notify(RECOVERY_NOTIFICATION, new NotificationCompat.Builder(context, CHANNEL)
                    .setSmallIcon(R.drawable.ic_launcher).setContentTitle("استعادة اتصال Antigravity")
                    .setContentText("افتح التطبيق لتشغيل خادم Termux بعد إعادة تشغيل الهاتف.")
                    .setContentIntent(recovery).setAutoCancel(true).build());
        } catch (SecurityException denied) {
            android.util.Log.w("CompanionRecovery", "Notification denied; recovery remains pending until the app opens");
        }
    }

    static boolean restartNeeded(Context context) {
        return context.getSharedPreferences("companion_settings", Context.MODE_PRIVATE)
                .getBoolean("server_restart_needed", false);
    }

    static void recovered(Context context) {
        if (!restartNeeded(context)) return;
        context.getSharedPreferences("companion_settings", Context.MODE_PRIVATE)
                .edit().remove("server_restart_needed").apply();
        NotificationManager notifications = context.getSystemService(NotificationManager.class);
        if (notifications != null) notifications.cancel(RECOVERY_NOTIFICATION);
    }
}
