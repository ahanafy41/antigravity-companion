package com.antigravity.companion;

import java.io.IOException;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URI;
import java.util.Map;
import java.util.TreeMap;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public class ServerConnectionTest {
    private static final String MODERN = "{\"service\":\"antigravity-companion\",\"api_versions\":[1]}";
    private static final String HTML = "<!DOCTYPE html><html><body>Legacy</body></html>";

    private interface RequestHandler { void accept(HttpExchange exchange) throws IOException; }

    private static final class HttpServer {
        private final ServerSocket listener;
        private RequestHandler handler;
        private String contextPath;
        private Thread worker;
        private volatile Throwable failure;
        private volatile boolean stopped;

        private HttpServer(InetSocketAddress address, int backlog) throws IOException {
            listener = new ServerSocket();
            listener.bind(address, backlog);
        }
        static HttpServer create(InetSocketAddress address, int backlog) throws IOException {
            return new HttpServer(address, backlog);
        }
        void createContext(String path, RequestHandler callback) {
            contextPath = path; handler = callback;
        }
        InetSocketAddress getAddress() {
            return (InetSocketAddress) listener.getLocalSocketAddress();
        }
        void start() {
            worker = new Thread(() -> {
                while (!stopped) {
                    try (Socket socket = listener.accept()) {
                        socket.setSoTimeout(3000);
                        HttpExchange exchange = new HttpExchange(socket);
                        if (exchange.getRequestURI().getPath().startsWith(contextPath)) handler.accept(exchange);
                        else reply(exchange, 404, "missing");
                    } catch (IOException | RuntimeException rejected) {
                        if (!stopped) failure = rejected;
                        break;
                    }
                }
            }, "companion-http-fixture");
            worker.setDaemon(true); worker.start();
        }
        void stop(int ignoredDelay) throws Exception {
            stopped = true; listener.close(); worker.join(4000);
            assertFalse("HTTP fixture failed to stop", worker.isAlive());
            if (failure != null) throw new AssertionError("HTTP fixture failed", failure);
        }
    }

    private static final class RequestHeaders {
        private final Map<String, String> headers = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        String getFirst(String name) { return headers.get(name); }
    }

    private static final class HttpExchange {
        private final Socket socket;
        private final String method;
        private final URI uri;
        private final RequestHeaders headers = new RequestHeaders();
        private String responseHeaders = "";

        HttpExchange(Socket socket) throws IOException {
            this.socket = socket;
            BufferedReader reader = new BufferedReader(new InputStreamReader(
                    socket.getInputStream(), StandardCharsets.US_ASCII));
            String line = reader.readLine();
            if (line == null) throw new IOException("Missing HTTP request");
            String[] request = line.split(" ", 3);
            if (request.length != 3) throw new IOException("Invalid HTTP request");
            method = request[0]; uri = URI.create(request[1]);
            while ((line = reader.readLine()) != null && !line.isEmpty()) {
                int colon = line.indexOf(':');
                if (colon < 1) throw new IOException("Invalid HTTP header");
                headers.headers.put(line.substring(0, colon), line.substring(colon + 1).trim());
            }
            String length = headers.getFirst("Content-Length");
            for (int remaining = length == null ? 0 : Integer.parseInt(length); remaining > 0; remaining--)
                if (reader.read() == -1) throw new IOException("Incomplete HTTP request body");
        }
        URI getRequestURI() { return uri; }
        String getRequestMethod() { return method; }
        RequestHeaders getRequestHeaders() { return headers; }
        OutputStream getResponseBody() throws IOException { return socket.getOutputStream(); }
        void sendResponseHeaders(int status, long length) throws IOException {
            String head = "HTTP/1.1 " + status + " Fixture\r\nContent-Length: " + length
                    + "\r\n" + responseHeaders + "Connection: close\r\n\r\n";
            socket.getOutputStream().write(head.getBytes(StandardCharsets.US_ASCII));
        }
        void close() throws IOException { socket.getOutputStream().flush(); socket.close(); }
    }

    private static void reply(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.close();
    }

    @Test public void probeDistinguishesModernHtmlAndRootFallbackWithoutCredentials() throws Exception {
        for (String scenario : new String[]{"modern", "html", "fallback", "plain_fallback",
                "json_fallback", "error_fallback", "invalid", "unavailable"}) {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            List<String> paths = java.util.Collections.synchronizedList(new ArrayList<>());
            List<String> credentials = java.util.Collections.synchronizedList(new ArrayList<>());
            server.createContext("/", exchange -> {
                paths.add(exchange.getRequestURI().getPath());
                credentials.add(exchange.getRequestHeaders().getFirst("Authorization"));
                if (exchange.getRequestURI().getPath().equals("/health")) {
                    if (scenario.equals("modern")) reply(exchange, 200, MODERN);
                    else if (scenario.equals("html")) reply(exchange, 200, HTML);
                    else if (scenario.equals("invalid") || scenario.equals("json_fallback"))
                        reply(exchange, 200, "{\"service\":\"other\"}");
                    else if (scenario.equals("plain_fallback")) reply(exchange, 200, "old server ready");
                    else if (scenario.equals("error_fallback")) reply(exchange, 500, "unsupported health");
                    else reply(exchange, 404, "missing");
                } else reply(exchange, (scenario.equals("fallback") || scenario.endsWith("_fallback")) ? 200 : 503, HTML);
            });
            server.start();
            try (ServerConnection connection = new ServerConnection(server.getAddress().getPort(), "private-token")) {
                ServerConnection.Availability expected = scenario.equals("modern") ? ServerConnection.Availability.MODERN
                        : scenario.equals("html") || scenario.equals("fallback") || scenario.endsWith("_fallback")
                        ? ServerConnection.Availability.LEGACY
                        : ServerConnection.Availability.OFFLINE;
                assertEquals(scenario, expected, connection.probe());
                assertEquals(scenario, expected != ServerConnection.Availability.OFFLINE, connection.healthReady());
                assertTrue(scenario, credentials.stream().allMatch(credential -> credential == null));
                assertEquals(scenario, !scenario.equals("modern") && !scenario.equals("html"), paths.contains("/"));
            } finally { server.stop(0); }
        }
    }

    @Test public void absentListenerIsOffline() throws Exception {
        int port;
        try (java.net.ServerSocket socket = new java.net.ServerSocket(0, 1, java.net.InetAddress.getByName("127.0.0.1"))) {
            port = socket.getLocalPort();
        }
        try (ServerConnection connection = new ServerConnection(port, "private-token")) {
            assertEquals(ServerConnection.Availability.OFFLINE, connection.probe());
        }
    }

    @Test public void legacyAndInvalidHealthNeverAuthenticate() throws Exception {
        for (String health : new String[]{HTML, "{\"service\":\"other\"}", "invalid json"}) {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            List<String> paths = java.util.Collections.synchronizedList(new ArrayList<>());
            List<String> credentials = java.util.Collections.synchronizedList(new ArrayList<>());
            server.createContext("/", exchange -> {
                paths.add(exchange.getRequestURI().getPath());
                credentials.add(exchange.getRequestHeaders().getFirst("Authorization"));
                reply(exchange, 200, health);
            });
            server.start();
            try (ServerConnection connection = new ServerConnection(server.getAddress().getPort(), "private-token")) {
                assertFalse(connection.authenticServer());
                try { connection.bootstrapCookie(); fail("Bootstrap must fail on invalid server"); }
                catch (IOException expected) { }
                try { connection.stopModern(); fail("Shutdown must fail on invalid server" ); }
                catch (IOException expected) { }
                assertTrue(credentials.stream().allMatch(credential -> credential == null));
            } finally { server.stop(0); }
        }
    }

    @Test public void legacyShutdownPostsWithoutCredentialsAndRejectsFailure() throws Exception {
        for (int status : new int[]{200, 503}) {
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            List<String> requests = java.util.Collections.synchronizedList(new ArrayList<>());
            List<String> credentials = java.util.Collections.synchronizedList(new ArrayList<>());
            server.createContext("/api/shutdown", exchange -> {
                requests.add(exchange.getRequestMethod());
                credentials.add(exchange.getRequestHeaders().getFirst("Authorization"));
                reply(exchange, status, "shutdown");
            });
            server.start();
            try (ServerConnection connection = new ServerConnection(server.getAddress().getPort(), "private-token")) {
                try { connection.stopLegacy(); assertEquals(200, status); }
                catch (IOException rejected) { assertEquals(503, status); }
                assertEquals(java.util.Collections.singletonList("POST"), requests);
                assertEquals(java.util.Collections.singletonList(null), credentials);
            } finally { server.stop(0); }
        }
    }
    @Test public void modernShutdownUsesProvedSessionRotatedCookieAndNeverReplaysPost() throws Exception {
        for (int shutdownStatus : new int[]{200, 503, 307}) {
            HttpServer target = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            List<String> leaked = java.util.Collections.synchronizedList(new ArrayList<>());
            target.createContext("/", exchange -> { leaked.add(exchange.getRequestURI().toString()); reply(exchange, 200, "{}"); });
            target.start();
            HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
            List<String> failures = java.util.Collections.synchronizedList(new ArrayList<>());
            List<String> shutdowns = java.util.Collections.synchronizedList(new ArrayList<>());
            String origin = "http://127.0.0.1:" + server.getAddress().getPort();
            server.createContext("/", exchange -> {
                String path = exchange.getRequestURI().getPath();
                RequestHeaders headers = exchange.getRequestHeaders();
                if (path.equals("/health")) {
                    reply(exchange, 200, MODERN);
                } else if (path.equals("/api/v1/auth/session")) {
                    if ("session=first".equals(headers.getFirst("Cookie"))) {
                        exchange.responseHeaders = "Set-Cookie: session=rotated; HttpOnly\r\n";
                    } else {
                        exchange.responseHeaders = "Set-Cookie: session=first; HttpOnly\r\n";
                    }
                    reply(exchange, 200, "{\"csrf_token\":\"csrf-secret\"}");
                } else if (path.equals("/api/v1/android/bootstrap")) {
                    exchange.responseHeaders = "Set-Cookie: session=first; HttpOnly\r\n";
                    reply(exchange, 200, "{\"csrf_token\":\"csrf-secret\"}");
                } else if (path.equals("/api/v1/system/shutdown")) {
                    shutdowns.add(exchange.getRequestMethod());
                    if (!"session=rotated".equals(headers.getFirst("Cookie"))) failures.add("Rotated cookie");
                    if (!"csrf-secret".equals(headers.getFirst("X-CSRF-Token"))) failures.add("CSRF");
                    if (!origin.equals(headers.getFirst("Origin"))) failures.add("Shutdown origin");
                    if (headers.getFirst("Authorization") != null) failures.add("Bearer leaked to shutdown");
                    exchange.responseHeaders = "Retry-After: 0\r\nLocation: http://127.0.0.1:" + target.getAddress().getPort() + "/leak\r\n";
                    reply(exchange, shutdownStatus, "{}");
                } else { failures.add(path); reply(exchange, 404, "{}"); }
            });
            server.start();
            try (ServerConnection connection = new ServerConnection(server.getAddress().getPort(), "private-token")) {
                try { connection.stopModern(); assertEquals(200, shutdownStatus); }
                catch (IOException rejected) { assertNotEquals(200, shutdownStatus); }
                assertEquals(java.util.Collections.singletonList("POST"), shutdowns);
                assertTrue(failures.toString(), failures.isEmpty());
                assertTrue("Redirect leaked authenticated request", leaked.isEmpty());
            } finally { server.stop(0); target.stop(0); }
        }
    }
    private static String proof(String nonce) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec("private-token".getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            StringBuilder result = new StringBuilder();
            for (byte octet : mac.doFinal(nonce.getBytes(StandardCharsets.UTF_8)))
                result.append(String.format(java.util.Locale.ROOT, "%02x", octet & 255));
            return result.toString();
        } catch (java.security.GeneralSecurityException impossible) { throw new AssertionError(impossible); }
    }

}
