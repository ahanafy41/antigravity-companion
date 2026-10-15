package com.antigravity.companion;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.FutureTask;
import org.junit.Test;
import static org.junit.Assert.*;

public class LegacyVoiceApiTest {
    @Test public void unavailableLegacyTurnIsNeverReplayedEvenWhenServerRequestsRetry() throws Exception {
        try (ServerSocket listener = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            listener.setSoTimeout(700);
            FutureTask<Integer> requests = new FutureTask<>(() -> {
                int count = 0;
                while (count < 2) {
                    try (Socket socket = listener.accept()) {
                        socket.setSoTimeout(2000);
                        BufferedReader input = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
                        int length = 0; String header;
                        while (!(header = input.readLine()).isEmpty())
                            if (header.toLowerCase().startsWith("content-length:")) length = Integer.parseInt(header.substring(15).trim());
                        while (length-- > 0) if (input.read() < 0) throw new IOException("Incomplete request");
                        count++;
                        socket.getOutputStream().write("HTTP/1.1 503 Unavailable\r\nContent-Length: 0\r\nRetry-After: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));
                    } catch (java.net.SocketTimeoutException completed) { break; }
                }
                return count;
            });
            Thread fixture = new Thread(requests, "legacy-no-replay-fixture"); fixture.setDaemon(true); fixture.start();
            JsonObject screen = JsonParser.parseString("{\"root\":{}}").getAsJsonObject();
            try (LegacyVoiceApi api = new LegacyVoiceApi(listener.getLocalPort())) {
                try { api.turn("back", screen, new JsonObject()); fail("Unavailable turn accepted"); }
                catch (IOException expected) { }
            }
            assertEquals(Integer.valueOf(1), requests.get(4, java.util.concurrent.TimeUnit.SECONDS));
        }
    }

    @Test public void malformedLegacyCodeIsRejectedBeforePhoneDispatch() throws Exception {
        for (String code : new String[]{"{}", "[]", "123"}) {
            try (ServerSocket listener = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
                FutureTask<Void> served = new FutureTask<>(() -> {
                    try (Socket socket = listener.accept()) {
                        socket.setSoTimeout(3000);
                        consumeRequest(socket);
                        byte[] body = ("{\"speech\":\"reply\",\"code\":" + code + "}").getBytes(StandardCharsets.UTF_8);
                        socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                        socket.getOutputStream().write(body);
                    }
                    return null;
                });
                Thread fixture = new Thread(served, "legacy-malformed-fixture"); fixture.setDaemon(true); fixture.start();
                try (LegacyVoiceApi api = new LegacyVoiceApi(listener.getLocalPort())) {
                    try { api.turn("back", JsonParser.parseString("{\"root\":{}}").getAsJsonObject(), new JsonObject()); fail("Malformed code accepted"); }
                    catch (IOException expected) { }
                }
                served.get(4, java.util.concurrent.TimeUnit.SECONDS);
            }
        }
    }
    @Test public void closingLegacyApiCancelsAnInFlightTurn() throws Exception {
        try (ServerSocket listener = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"));
                LegacyVoiceApi api = new LegacyVoiceApi(listener.getLocalPort())) {
            java.util.concurrent.CountDownLatch received = new java.util.concurrent.CountDownLatch(1);
            java.util.concurrent.CountDownLatch release = new java.util.concurrent.CountDownLatch(1);
            FutureTask<Void> served = new FutureTask<>(() -> {
                try (Socket socket = listener.accept()) {
                    socket.setSoTimeout(3000); consumeRequest(socket); received.countDown();
                    if (!release.await(4, java.util.concurrent.TimeUnit.SECONDS)) throw new IOException("Fixture not released");
                }
                return null;
            });
            Thread fixture = new Thread(served, "legacy-cancel-fixture"); fixture.setDaemon(true); fixture.start();
            FutureTask<Boolean> command = new FutureTask<>(() -> {
                try { api.turn("back", JsonParser.parseString("{\"root\":{}}").getAsJsonObject(), new JsonObject()); return false; }
                catch (IOException cancelled) { return true; }
            });
            Thread worker = new Thread(command, "legacy-cancel-command"); worker.setDaemon(true); worker.start();
            try {
                assertTrue(received.await(3, java.util.concurrent.TimeUnit.SECONDS));
                api.close();
                assertTrue(command.get(2, java.util.concurrent.TimeUnit.SECONDS));
            } finally { release.countDown(); }
            served.get(4, java.util.concurrent.TimeUnit.SECONDS);
        }
    }
    private static void consumeRequest(Socket socket) throws IOException {
        BufferedReader input = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.US_ASCII));
        String header; int length = 0;
        while (!(header = input.readLine()).isEmpty())
            if (header.toLowerCase().startsWith("content-length:")) length = Integer.parseInt(header.substring(15).trim());
        while (length-- > 0) if (input.read() < 0) throw new IOException("Incomplete request");
    }

    @Test public void oldCodeMapsOnlyRecognizedCallsAndRejectsShell() {
        java.util.List<LegacyVoiceActions.Action> actions = LegacyVoiceActions.parse("smartStartApp(\"settings\")\nforceClick('Network')\nsmartClick(500, 250)\nservice.toBack()");
        assertEquals(4, actions.size());
        assertEquals("launch_app", actions.get(0).name);
        assertEquals("settings", actions.get(0).args.get("target").getAsString());
        assertEquals("click", actions.get(1).name);
        assertEquals("Network", actions.get(1).args.get("query").getAsString());
        assertEquals(500, actions.get(2).args.get("x").getAsInt());
        assertEquals("back", actions.get(3).name);
        for (String code : new String[]{"os.execute('rm anything')", "forceClick('x'); service.toHome()", "smartClick(-1, 500)"}) {
            try { LegacyVoiceActions.parse(code); fail("Unsupported code accepted: " + code); }
            catch (IllegalArgumentException expected) { }
        }
    }

    @Test public void legacyTurnPostsRealTreeWithoutCredentialsAndReturnsSpeech() throws Exception {
        try (ServerSocket listener = new ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))) {
            FutureTask<String> captured = new FutureTask<>(() -> {
                try (Socket socket = listener.accept()) {
                    socket.setSoTimeout(3000);
                    BufferedReader input = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                    String requestLine = input.readLine();
                    assertEquals("POST /api/device_agent/turn HTTP/1.1", requestLine);
                    int length = 0;
                    String header;
                    while (!(header = input.readLine()).isEmpty()) {
                        assertFalse(header.toLowerCase().startsWith("authorization:"));
                        assertFalse(header.toLowerCase().startsWith("cookie:"));
                        if (header.toLowerCase().startsWith("content-length:")) length = Integer.parseInt(header.substring(15).trim());
                    }
                    char[] payload = new char[length];
                    int read = 0;
                    while (read < length) {
                        int count = input.read(payload, read, length - read);
                        if (count < 0) throw new IOException("Incomplete request");
                        read += count;
                    }
                    byte[] response = "{\"speech\":\"screen reply\",\"code\":\"service.toHome()\"}".getBytes(StandardCharsets.UTF_8);
                    socket.getOutputStream().write(("HTTP/1.1 200 OK\r\nContent-Length: " + response.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                    socket.getOutputStream().write(response);
                    return new String(payload);
                }
            });
            Thread fixture = new Thread(captured, "legacy-voice-fixture"); fixture.setDaemon(true); fixture.start();
            JsonObject screen = JsonParser.parseString("{\"snapshot_id\":\"actual\",\"root\":{\"text\":\"active screen\",\"children\":[]}}").getAsJsonObject();
            try (LegacyVoiceApi api = new LegacyVoiceApi(listener.getLocalPort())) {
                assertEquals("screen reply", api.turn("describe screen", screen, JsonParser.parseString("{\"step\":2,\"session_id\":\"voice-123\",\"history\":[{\"role\":\"system\",\"result\":\"confirmed\"}]}").getAsJsonObject()).get("speech").getAsString());
            }
            JsonObject payload = JsonParser.parseString(captured.get(4, java.util.concurrent.TimeUnit.SECONDS)).getAsJsonObject();
            assertEquals("describe screen", payload.get("command").getAsString());
            assertEquals(2, payload.get("step").getAsInt());
            assertEquals("voice-123", payload.get("session_id").getAsString());
            assertEquals("confirmed", payload.getAsJsonArray("history").get(0).getAsJsonObject().get("result").getAsString());
            assertTrue(payload.get("ui_tree").getAsJsonPrimitive().isString());
            JsonObject tree = JsonParser.parseString(payload.get("ui_tree").getAsString()).getAsJsonObject();
            assertEquals("active screen", tree.getAsJsonObject("root_node").get("text").getAsString());
            assertEquals("success", tree.get("status").getAsString());
        }
    }
}
