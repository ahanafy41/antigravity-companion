package com.antigravity.companion;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Base64;
import java.security.SecureRandom;

final class NativeSecrets {
    static synchronized String androidToken(Context context) {
        SharedPreferences security = context.getSharedPreferences("native_security", Context.MODE_PRIVATE);
        String token = security.getString("android_token", "");
        if (!token.isEmpty()) return token;
        byte[] entropy = new byte[32]; new SecureRandom().nextBytes(entropy);
        token = Base64.encodeToString(entropy, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING);
        if (!security.edit().putString("android_token", token).commit())
            throw new IllegalStateException("Cannot persist Android authentication token");
        return token;
    }
    static int serverPort(Context context) {
        return context.getSharedPreferences("companion_settings", Context.MODE_PRIVATE).getInt("server_port", 7681);
    }
}
