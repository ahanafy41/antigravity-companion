package com.antigravity.companion;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.IOException;
import java.util.concurrent.TimeUnit;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

/** Legacy endpoint has no bootstrap contract and must never receive native credentials. */
final class LegacyVoiceApi implements AutoCloseable {
    private final OkHttpClient client = new OkHttpClient.Builder()
            .connectTimeout(2, TimeUnit.SECONDS).readTimeout(120, TimeUnit.SECONDS)
            .callTimeout(125, TimeUnit.SECONDS).retryOnConnectionFailure(false)
            .followRedirects(false).followSslRedirects(false).build();
    private final String origin;

    LegacyVoiceApi(int port) { origin = new OriginPolicy(port).origin(); }

    JsonObject turn(String command, JsonObject screen, JsonObject continuation) throws IOException {
        JsonObject tree = new JsonObject(); tree.addProperty("status", "success");
        tree.add("root_node", screen.getAsJsonObject("root"));
        JsonObject payload = continuation.deepCopy(); payload.addProperty("command", command);
        payload.addProperty("ui_tree", tree.toString());
        Request request = new Request.Builder().url(origin + "/api/device_agent/turn")
                .post(oneShotBody(payload.toString())).build();
        try (Response response = client.newCall(request).execute()) {
            if (!response.isSuccessful() || response.body() == null)
                throw new IOException("Legacy voice request rejected: " + response.code());
            okio.BufferedSource source = response.body().source(); source.request(1024 * 1024 + 1);
            if (source.buffer().size() > 1024 * 1024) throw new IOException("Legacy voice response exceeds limit");
            return parseResponse(source.buffer().readUtf8());
        }
    }
    private static RequestBody oneShotBody(String json) {
        byte[] payload = json.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        return new RequestBody() {
            @Override public MediaType contentType() { return MediaType.get("application/json; charset=utf-8"); }
            @Override public long contentLength() { return payload.length; }
            @Override public boolean isOneShot() { return true; }
            @Override public void writeTo(okio.BufferedSink sink) throws IOException { sink.write(payload); }
        };
    }
    private static JsonObject parseResponse(String json) throws IOException {
        try {
            JsonObject response = JsonParser.parseString(json).getAsJsonObject();
            if (response.has("error") || !response.has("speech") || !response.get("speech").isJsonPrimitive()
                    || !response.getAsJsonPrimitive("speech").isString())
                throw new IOException("Invalid legacy voice response");
            if (response.has("code") && !response.get("code").isJsonNull()
                    && (!response.get("code").isJsonPrimitive() || !response.getAsJsonPrimitive("code").isString()))
                throw new IOException("Invalid legacy phone code");
            return response;
        } catch (com.google.gson.JsonParseException | IllegalStateException invalid) {
            throw new IOException("Invalid legacy voice response", invalid);
        }
    }
    @Override public void close() {
        client.dispatcher().cancelAll(); client.dispatcher().executorService().shutdown(); client.connectionPool().evictAll();
    }
}
