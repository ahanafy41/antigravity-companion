package com.antigravity.companion;

import android.os.Handler;
import android.os.Looper;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonParseException;
import org.java_websocket.WebSocket;
import org.java_websocket.drafts.Draft;
import org.java_websocket.exceptions.InvalidDataException;
import org.java_websocket.exceptions.WebsocketNotConnectedException;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.handshake.ServerHandshakeBuilder;
import org.java_websocket.server.WebSocketServer;
import java.io.File;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.logging.Logger;

public final class LocalAutomationServer extends WebSocketServer implements AutoCloseable {
    public static final int PORT = 8765;
    private static final Logger LOGGER = Logger.getLogger(LocalAutomationServer.class.getName());
    private final AntigravityAccessibilityService service;
    private final byte[] authorization;
    private final ActionLedger ledger;
    private final java.util.concurrent.ExecutorService journalWriter = java.util.concurrent.Executors.newSingleThreadExecutor();
    private final Handler deadlines = new Handler(Looper.getMainLooper());
    LocalAutomationServer(AntigravityAccessibilityService service) throws IOException {
        super(new InetSocketAddress("127.0.0.1", PORT), 1, java.util.Collections.singletonList(
                new org.java_websocket.drafts.Draft_6455(java.util.Collections.emptyList(), 1024 * 1024)));
        this.service = service;
        authorization = ("Bearer " + NativeSecrets.androidToken(service)).getBytes(StandardCharsets.UTF_8);
        ledger = new ActionLedger(new File(service.getNoBackupFilesDir(), "phone_actions.json"));
        setReuseAddr(true); setConnectionLostTimeout(30);
    }
    @Override public ServerHandshakeBuilder onWebsocketHandshakeReceivedAsServer(
            WebSocket socket, Draft draft, ClientHandshake request) throws InvalidDataException {
        byte[] supplied = request.getFieldValue("Authorization").getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(authorization, supplied) || socket.getRemoteSocketAddress() == null
                || !socket.getRemoteSocketAddress().getAddress().isLoopbackAddress())
            throw new InvalidDataException(1008, "Unauthorized");
        return super.onWebsocketHandshakeReceivedAsServer(socket, draft, request);
    }
    @Override public void onMessage(WebSocket socket, String message) {
        String actionId = "";
        try {
            if (message.length() > 1024 * 1024) throw new IllegalArgumentException("Phone request too large");
            com.google.gson.JsonElement root = JsonParser.parseString(message);
            if (!root.isJsonObject()) throw new IllegalArgumentException("Phone request must be an object");
            JsonObject request = root.getAsJsonObject();
            actionId = ScreenSnapshot.required(request, "action_id");
            if (!actionId.matches("[A-Za-z0-9._:-]{1,128}")) throw new IllegalArgumentException("Invalid action_id");
            String action = ScreenSnapshot.required(request, "action");
            if (!request.has("args") || !request.get("args").isJsonObject()) throw new IllegalArgumentException("Missing args object");
            JsonObject args = request.getAsJsonObject("args");
            final String requestId = actionId;
            if (DeviceActionPolicy.isReadOnly(action)) {
                dispatch(action, args, actionId, outcome -> send(socket, PhoneResultBudget.bounded(outcome))); return;
            }
            if (!DeviceActionPolicy.supported(action))
                throw new IllegalArgumentException("Unsupported phone action");
            JsonObject previous = ledger.reserve(actionId, action, args);
            if (previous != null) { send(socket, previous); return; }
            dispatch(action, args, actionId, outcome -> publishEffect(socket, requestId, outcome));
        } catch (ActionLedger.RetiredEpochException retired) {
            JsonObject rejected = response(actionId, "failed", error(retired.getMessage()));
            rejected.addProperty("error_code", "stale_epoch"); send(socket, rejected);
        } catch (JsonParseException | IllegalArgumentException | IllegalStateException | IOException malformed) {
            send(socket, response(actionId, "failed", error(malformed.getMessage())));
        }
    }
    private void dispatch(String action, JsonObject args, String actionId, java.util.function.Consumer<JsonObject> publish) {
        AtomicBoolean completed = new AtomicBoolean();
        Runnable timeout = () -> completeOnce(
                response(actionId, "outcome_unknown", error("Phone action timeout; do not replay")), completed, publish);
        deadlines.postDelayed(timeout, action.equals("speak") ? 120000 : 15000);
        service.executeAction(action, args, actionId, outcome -> {
            deadlines.removeCallbacks(timeout);
            String status = outcome.has("error") ? "failed" : "completed";
            completeOnce(response(actionId, status, outcome), completed, publish);
        });
    }
    private static void completeOnce(JsonObject outcome, AtomicBoolean completed, java.util.function.Consumer<JsonObject> publish) {
        if (completed.compareAndSet(false, true)) publish.accept(outcome);
    }
    private void publishEffect(WebSocket socket, String actionId, JsonObject outcome) {
        try { journalWriter.execute(() -> persistResult(socket, actionId, outcome)); }
        catch (java.util.concurrent.RejectedExecutionException stopped) {
            send(socket, response(actionId, "outcome_unknown", error("Service closed before result was recorded")));
        }
    }
    private void persistResult(WebSocket socket, String actionId, JsonObject outcome) {
        try {
            JsonObject bounded = PhoneResultBudget.bounded(outcome);
            ledger.complete(actionId, bounded); send(socket, bounded);
        }
        catch (IOException failure) {
            send(socket, response(actionId, "outcome_unknown", error("Cannot persist action result; do not replay")));
        }
    }
    private static JsonObject response(String actionId, String status, JsonObject outcome) {
        JsonObject response = new JsonObject(); response.addProperty("action_id", actionId);
        response.addProperty("status", status);
        if (outcome.has("error")) response.add("error", outcome.get("error")); else response.add("result", outcome);
        return response;
    }
    private static JsonObject error(String message) {
        JsonObject failure = new JsonObject(); failure.addProperty("error", message); return failure;
    }
    private static void send(WebSocket socket, JsonObject response) {
        if (!socket.isOpen()) return;
        try { socket.send(response.toString()); }
        catch (WebsocketNotConnectedException disconnected) { LOGGER.fine("Phone client disconnected before result"); }
    }
    @Override public void onMessage(WebSocket socket, java.nio.ByteBuffer binary) { socket.close(1003, "Text JSON only"); }
    @Override public void onOpen(WebSocket socket, ClientHandshake request) {
        try {
            JsonObject ready = new JsonObject(); ready.addProperty("type", "journal_ready");
            ready.addProperty("epoch", ledger.currentEpoch()); send(socket, ready);
        } catch (IOException failure) { socket.close(1011, "Action journal unavailable"); }
    }
    @Override public void onClose(WebSocket socket, int code, String reason, boolean remote) { }
    @Override public void onError(WebSocket socket, Exception failure) { LOGGER.warning("Phone WebSocket failure: " + failure.getClass().getSimpleName()); }
    @Override public void onStart() { LOGGER.info("Authenticated phone automation ready on loopback"); }
    @Override public void close() {
        deadlines.removeCallbacksAndMessages(null); journalWriter.shutdown();
        try { stop(1000); } catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); }
    }
}
