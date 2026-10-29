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
    enum Availability { MODERN, LEGACY, OFFLINE }
    private final OkHttpClient client = new OkHttpClient.Builder().connectTimeout(2, TimeUnit.SECONDS)
            .readTimeout(2, TimeUnit.SECONDS).callTimeout(3, TimeUnit.SECONDS)
            .retryOnConnectionFailure(false).followRedirects(false).followSslRedirects(false).build();
    private final String origin;
    private final String token;
    ServerConnection(Context context) {
        this(context, NativeSecrets.serverPort(context));
    }
    ServerConnection(Context context, int port) {
        this(port, NativeSecrets.androidToken(context));
    }
    ServerConnection(int port, String token) {
        origin = new OriginPolicy(port).origin();
        this.token = token;
    }
    boolean healthReady() {
        return probe() != Availability.OFFLINE;
    }
    Availability probe() {
        try (Response response = client.newCall(new Request.Builder().url(origin + "/health").build()).execute()) {
            if (!response.isSuccessful() || response.body() == null) return probeLegacyRoot();
            okio.BufferedSource source = response.body().source();
            source.request(65537);
            if (source.buffer().size() > 65536) return probeLegacyRoot();
            String body = source.buffer().readUtf8();
            String contentType = response.header("Content-Type", "");
            String beginning = body.trim().toLowerCase(java.util.Locale.ROOT);
            if (response.code() == 200 && (contentType.toLowerCase(java.util.Locale.ROOT).contains("text/html")
                    || beginning.startsWith("<!doctype html") || beginning.startsWith("<html")))
                return Availability.LEGACY;
            JsonObject health = JsonParser.parseString(body).getAsJsonObject();
            if (!health.has("service") || !health.get("service").isJsonPrimitive()
                    || !health.get("service").getAsJsonPrimitive().isString()
                    || !"antigravity-companion".equals(health.get("service").getAsString())) return probeLegacyRoot();
            if (!health.has("api_versions") || !health.get("api_versions").isJsonArray()) return probeLegacyRoot();
            return health.getAsJsonArray("api_versions").contains(new com.google.gson.JsonPrimitive(1))
                    ? Availability.MODERN : probeLegacyRoot();
        } catch (IOException | com.google.gson.JsonParseException | IllegalStateException | NumberFormatException invalid) {
            return probeLegacyRoot();
        }
    }
    private Availability probeLegacyRoot() {
        try (Response response = client.newCall(new Request.Builder().url(origin + "/").build()).execute()) {
            return response.code() == 200 ? Availability.LEGACY : Availability.OFFLINE;
        } catch (IOException offline) { return Availability.OFFLINE; }
    }
    void stopServerDirect() throws IOException {
        Request request = new Request.Builder().url(origin + "/api/shutdown")
                .header("Origin", origin)
                .post(oneShotJson()).build();
        try (Response response = client.newCall(request).execute()) {
            if (!response.isSuccessful() && response.code() != 202) throw new IOException("Shutdown rejected: " + response.code());
        }
    }
    void stopLegacy() throws IOException {
        Request request = new Request.Builder().url(origin + "/api/shutdown")
                .post(oneShotJson()).build();
        try (Response response = client.newCall(request).execute()) {
            if (!response.isSuccessful()) throw new IOException("Legacy shutdown rejected: " + response.code());
        }
    }
    // OkHttp can replay a 503 Retry-After: 0 POST even when transport retries are disabled.
    private static RequestBody oneShotJson() {
        return new RequestBody() {
            @Override public MediaType contentType() { return MediaType.get("application/json"); }
            @Override public long contentLength() { return 2; }
            @Override public boolean isOneShot() { return true; }
            @Override public void writeTo(okio.BufferedSink sink) throws IOException { sink.writeUtf8("{}"); }
        };
    }
    void stopModern() throws IOException {
        String cookie = bootstrapCookie().split(";", 2)[0];
        Request sessionRequest = new Request.Builder().url(origin + "/api/v1/auth/session")
                .header("Origin", origin).header("Cookie", cookie).build();
        String csrf;
        try (Response response = client.newCall(sessionRequest).execute()) {
            JsonObject session = boundedJson(response);
            String replacement = response.header("Set-Cookie");
            if (replacement != null) cookie = replacement.split(";", 2)[0];
            try { csrf = NativeActionArguments.required(session, "csrf_token"); }
            catch (IllegalArgumentException invalid) { throw new IOException("Native session missing CSRF token", invalid); }
        }
        Request shutdown = new Request.Builder().url(origin + "/api/v1/system/shutdown")
                .header("Origin", origin).header("Cookie", cookie).header("X-CSRF-Token", csrf)
                .post(oneShotJson()).build();
        try (Response response = client.newCall(shutdown).execute()) { boundedJson(response); }
    }
    private static JsonObject boundedJson(Response response) throws IOException {
        if (!response.isSuccessful() || response.body() == null)
            throw new IOException("Native API rejected request: " + response.code());
        okio.BufferedSource source = response.body().source();
        source.request(65537);
        if (source.buffer().size() > 65536) throw new IOException("Native response exceeds limit");
        try { return JsonParser.parseString(source.buffer().readUtf8()).getAsJsonObject(); }
        catch (com.google.gson.JsonParseException | IllegalStateException invalid) { throw new IOException("Invalid native response", invalid); }
    }
    static final class BootstrapUnauthorized extends IOException {
        BootstrapUnauthorized(String message) { super(message); }
    }
    String bootstrapCookie() throws IOException {
        if (!authenticServer()) throw new BootstrapUnauthorized("Server has not proved the private Android token");
        Request request = new Request.Builder().url(origin + "/api/v1/android/bootstrap")
                .header("Authorization", "Bearer " + token).header("Origin", origin)
                .post(oneShotJson()).build();
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
        if (health != null && !UpdateCompatibility.matches(health, apkVersion)) {
            if (health.has("device_protocol") && "legacy".equals(health.get("device_protocol").getAsString())) {
                throw new IOException("Install the matching signed server release in Termux and restart it before installing this APK");
            }
        }
    }
    private JsonObject authenticHealth() throws IOException {
        byte[] entropy = new byte[32]; new java.security.SecureRandom().nextBytes(entropy);
        StringBuilder nonce = new StringBuilder();
        for (byte octet : entropy) nonce.append(String.format(java.util.Locale.ROOT, "%02x", octet & 255));
        Request challenge = new Request.Builder().url(origin + "/health?android_nonce=" + nonce).build();
        try (Response response = client.newCall(challenge).execute()) {
            if (!response.isSuccessful() || response.body() == null) return null;
            com.google.gson.JsonElement root = JsonParser.parseString(response.body().string());
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
