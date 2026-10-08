package com.antigravity.companion;

import android.content.Context;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonElement;
import java.io.IOException;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.RequestBody;
import okhttp3.MediaType;

final class ServerConnection implements AutoCloseable {
    private final OkHttpClient client = new OkHttpClient.Builder().connectTimeout(2, TimeUnit.SECONDS)
            .readTimeout(2, TimeUnit.SECONDS).callTimeout(3, TimeUnit.SECONDS)
            .followRedirects(false).build();
    private final String origin;
    private final String token;
    ServerConnection(Context context) {
        this(context, NativeSecrets.serverPort(context));
    }
    ServerConnection(Context context, int port) {
        origin = new OriginPolicy(port).origin();
        token = NativeSecrets.androidToken(context);
    }
    boolean healthReady() {
        try (Response response = client.newCall(new Request.Builder().url(origin + "/health").build()).execute()) {
            if (!response.isSuccessful() || response.body() == null) return false;
            JsonObject health = JsonParser.parseString(response.body().string()).getAsJsonObject();
            if (!health.has("service") || !health.get("service").isJsonPrimitive()
                    || !health.get("service").getAsJsonPrimitive().isString()
                    || !"antigravity-companion".equals(health.get("service").getAsString())) return false;
            if (!health.has("api_versions") || !health.get("api_versions").isJsonArray()) return false;
            return health.getAsJsonArray("api_versions").contains(new com.google.gson.JsonPrimitive(1));
        } catch (IOException | com.google.gson.JsonParseException | IllegalStateException | NumberFormatException invalid) {
            return false;
        }
    }
    static final class BootstrapUnauthorized extends IOException {
        BootstrapUnauthorized(String message) { super(message); }
    }
    String bootstrapCookie() throws IOException {
        if (!authenticServer()) throw new BootstrapUnauthorized("Server has not proved the private Android token");
        Request request = new Request.Builder().url(origin + "/api/v1/android/bootstrap")
                .header("Authorization", "Bearer " + token).header("Origin", origin)
                .post(RequestBody.create("{}", MediaType.get("application/json"))).build();
        try (Response response = client.newCall(request).execute()) {
            if (response.code() == 401) throw new BootstrapUnauthorized("Android bootstrap needs private token configuration");
            if (!response.isSuccessful()) throw new IOException("Android bootstrap rejected: " + response.code());
            String cookie = response.header("Set-Cookie");
            if (cookie == null) throw new IOException("Android bootstrap has no session cookie");
            return cookie;
        }
    }
    boolean authenticServer() throws IOException {
        return authenticHealth() != null;
    }
    void requireUpdateCompatibility(String apkVersion) throws IOException {
        JsonObject health = authenticHealth();
        if (health == null || !UpdateCompatibility.matches(health, apkVersion))
            throw new IOException("Install the matching signed server release in Termux and restart it before installing this APK");
    }
    private JsonObject authenticHealth() throws IOException {
        byte[] entropy = new byte[32]; new java.security.SecureRandom().nextBytes(entropy);
        StringBuilder nonce = new StringBuilder();
        for (byte octet : entropy) nonce.append(String.format(java.util.Locale.ROOT, "%02x", octet & 255));
        Request challenge = new Request.Builder().url(origin + "/health?android_nonce=" + nonce).build();
        try (Response response = client.newCall(challenge).execute()) {
            if (!response.isSuccessful() || response.body() == null) return null;
            JsonElement root = JsonParser.parseString(response.body().string());
            if (!root.isJsonObject()) return null;
            JsonObject health = root.getAsJsonObject();
            if (!health.has("service") || !health.get("service").isJsonPrimitive()
                    || !health.get("service").getAsJsonPrimitive().isString()
                    || !"antigravity-companion".equals(health.get("service").getAsString())
                    || !health.has("api_versions") || !health.get("api_versions").isJsonArray()
                    || !health.getAsJsonArray("api_versions").contains(new com.google.gson.JsonPrimitive(1))) return null;
            if (!health.has("android_proof") || !health.get("android_proof").isJsonPrimitive()
                    || !health.get("android_proof").getAsJsonPrimitive().isString()) return null;
            return NativeProof.verify(token, nonce.toString(), health.get("android_proof").getAsString()) ? health : null;
        } catch (com.google.gson.JsonParseException | IllegalStateException | NumberFormatException invalid) { return null; }
    }
    @Override public void close() {
        client.dispatcher().cancelAll(); client.dispatcher().executorService().shutdown(); client.connectionPool().evictAll();
    }
}
