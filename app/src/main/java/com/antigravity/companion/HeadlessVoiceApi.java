package com.antigravity.companion;

import android.content.Context;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.util.concurrent.TimeUnit;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/** Private native session; never shares browser cookies or exposes the bearer token. */
final class HeadlessVoiceApi implements HeadlessVoiceCommand.Api, AutoCloseable {
    private final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(2, TimeUnit.SECONDS).readTimeout(5, TimeUnit.SECONDS)
            .callTimeout(7, TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).build();
    private final String origin;
    private String cookie;
    private String csrf;

    HeadlessVoiceApi(Context context) throws IOException {
        origin = new OriginPolicy(NativeSecrets.serverPort(context)).origin();
        try {
            try (ServerConnection connection = new ServerConnection(context)) {
                cookie = connection.bootstrapCookie().split(";", 2)[0];
            }
            JsonObject session = request("GET", "/auth/session", null);
            if (!session.has("csrf_token") || !session.get("csrf_token").isJsonPrimitive()
                    || !session.getAsJsonPrimitive("csrf_token").isString()
                    || session.get("csrf_token").getAsString().isEmpty())
                throw new IOException("Native voice session missing CSRF token");
            csrf = session.get("csrf_token").getAsString();
        } catch (IOException | RuntimeException failure) { close(); throw failure; }
    }
    @Override public JsonObject request(String method, String path, JsonObject body) throws IOException {
        Request.Builder request = new Request.Builder().url(origin + "/api/v1" + path)
                .header("Origin", origin).header("Cookie", cookie);
        if (method.equals("POST")) {
            if (csrf == null) throw new IOException("Native voice session not initialized");
            request.header("X-CSRF-Token", csrf)
                    .post(RequestBody.create(body.toString(), MediaType.get("application/json")));
        } else if (!method.equals("GET")) throw new IOException("Unsupported native voice method");
        try (Response response = client.newCall(request.build()).execute()) {
            if (!response.isSuccessful() || response.body() == null)
                throw new IOException("Native voice API rejected request: " + response.code());
            String replacement = response.header("Set-Cookie");
            if (replacement != null) cookie = replacement.split(";", 2)[0];
            okio.BufferedSource source = response.body().source();
            source.request(1024 * 1024 + 1);
            if (source.buffer().size() > 1024 * 1024) throw new IOException("Native voice response exceeds limit");
            String json = source.buffer().readUtf8();
            try { return JsonParser.parseString(json).getAsJsonObject(); }
            catch (RuntimeException invalid) { throw new IOException("Invalid native voice response", invalid); }
        }
    }
    @Override public void close() {
        client.dispatcher().cancelAll(); client.dispatcher().executorService().shutdown(); client.connectionPool().evictAll();
    }
}
