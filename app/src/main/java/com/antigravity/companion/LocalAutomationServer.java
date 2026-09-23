package com.antigravity.companion;

import com.google.gson.Gson;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;

import java.net.InetSocketAddress;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * LocalAutomationServer: RFC 6455 Duplex WebSocket Server bound to 127.0.0.1:8765.
 * Acts as the bridge between Termux AI Agents / Accessible Web UI and the native AccessibilityService.
 */
public class LocalAutomationServer extends WebSocketServer {

    private static final Logger LOGGER = Logger.getLogger(LocalAutomationServer.class.getName());
    public static final int PORT = 8765;
    public static final String HOST = "127.0.0.1";

    private static volatile LocalAutomationServer sServerInstance;
    private final Gson mGson = new Gson();

    public LocalAutomationServer(InetSocketAddress address) {
        super(address);
        setReuseAddr(true);
        setTcpNoDelay(true);
    }

    public static synchronized void startServer() {
        if (sServerInstance == null) {
            try {
                sServerInstance = new LocalAutomationServer(new InetSocketAddress(HOST, PORT));
                sServerInstance.start();
                LOGGER.info("LocalAutomationServer started on ws://" + HOST + ":" + PORT);
            } catch (Exception e) {
                LOGGER.log(Level.SEVERE, "Failed to start LocalAutomationServer", e);
            }
        }
    }

    public static synchronized void stopServer() {
        if (sServerInstance != null) {
            try {
                sServerInstance.stop(1000);
                sServerInstance = null;
                LOGGER.info("LocalAutomationServer stopped cleanly.");
            } catch (Exception e) {
                LOGGER.log(Level.SEVERE, "Error stopping LocalAutomationServer", e);
            }
        }
    }

    @Override
    public void onOpen(WebSocket conn, ClientHandshake handshake) {
        LOGGER.info("Client connected: " + conn.getRemoteSocketAddress());
        JsonObject welcome = new JsonObject();
        welcome.addProperty("event", "connected");
        welcome.addProperty("service_active", AntigravityAccessibilityService.isServiceRunning());
        conn.send(welcome.toString());
    }

    @Override
    public void onClose(WebSocket conn, int code, String reason, boolean remote) {
        LOGGER.info("Client disconnected: " + conn.getRemoteSocketAddress());
    }

    @Override
    public void onMessage(final WebSocket conn, String message) {
        try {
            JsonObject request = JsonParser.parseString(message).getAsJsonObject();
            String action = request.has("action") ? request.get("action").getAsString() : "";
            String id = request.has("id") ? request.get("id").getAsString() : "0";

            handleAction(conn, id, action, request);
        } catch (Exception e) {
            LOGGER.log(Level.WARNING, "Error processing incoming message", e);
            sendError(conn, "0", "Invalid JSON payload: " + e.getMessage());
        }
    }

    private void handleAction(final WebSocket conn, final String id, String action, JsonObject request) {
        final AntigravityAccessibilityService service = AntigravityAccessibilityService.getInstance();

        switch (action) {
            case "ping": {
                JsonObject res = new JsonObject();
                res.addProperty("id", id);
                res.addProperty("status", "pong");
                res.addProperty("service_connected", service != null);
                conn.send(res.toString());
                break;
            }

            case "get_window_tree": {
                if (service == null) {
                    sendError(conn, id, "AccessibilityService is not enabled or connected.");
                    return;
                }
                JsonObject tree = service.dumpWindowHierarchyJson();
                tree.addProperty("id", id);
                conn.send(tree.toString());
                break;
            }

            case "click_node": {
                if (service == null) {
                    sendError(conn, id, "AccessibilityService is not enabled.");
                    return;
                }
                String target = request.has("target") ? request.get("target").getAsString() : "";
                boolean success = service.clickNode(target);
                JsonObject res = new JsonObject();
                res.addProperty("id", id);
                res.addProperty("status", success ? "success" : "failed");
                conn.send(res.toString());
                break;
            }

            case "launch_app": {
                if (service == null) {
                    sendError(conn, id, "AccessibilityService is not enabled.");
                    return;
                }
                String target = request.has("target") ? request.get("target").getAsString() : "";
                boolean success = service.launchApp(target);
                JsonObject res = new JsonObject();
                res.addProperty("id", id);
                res.addProperty("status", success ? "success" : "failed");
                conn.send(res.toString());
                break;
            }

            case "click_coords": {
                if (service == null) {
                    sendError(conn, id, "AccessibilityService is not enabled.");
                    return;
                }
                float x = request.has("x") ? request.get("x").getAsFloat() : 0f;
                float y = request.has("y") ? request.get("y").getAsFloat() : 0f;
                boolean success = service.clickAtCoordinates(x, y);
                JsonObject res = new JsonObject();
                res.addProperty("id", id);
                res.addProperty("status", success ? "success" : "failed");
                conn.send(res.toString());
                break;
            }

            case "scroll": {
                if (service == null) {
                    sendError(conn, id, "AccessibilityService is not enabled.");
                    return;
                }
                boolean forward = !request.has("direction") || !"up".equalsIgnoreCase(request.get("direction").getAsString());
                boolean success = service.scroll(forward);
                JsonObject res = new JsonObject();
                res.addProperty("id", id);
                res.addProperty("status", success ? "success" : "failed");
                conn.send(res.toString());
                break;
            }

            case "set_text": {
                if (service == null) {
                    sendError(conn, id, "AccessibilityService is not enabled.");
                    return;
                }
                String text = request.has("text") ? request.get("text").getAsString() : "";
                boolean success = service.setTextOnFocused(text);
                JsonObject res = new JsonObject();
                res.addProperty("id", id);
                res.addProperty("status", success ? "success" : "failed");
                conn.send(res.toString());
                break;
            }

            case "global_action": {
                if (service == null) {
                    sendError(conn, id, "AccessibilityService is not enabled.");
                    return;
                }
                int actionCode = request.has("code") ? request.get("code").getAsInt() : 1; // 1 = GLOBAL_ACTION_BACK
                boolean success = service.performGlobal(actionCode);
                JsonObject res = new JsonObject();
                res.addProperty("id", id);
                res.addProperty("status", success ? "success" : "failed");
                conn.send(res.toString());
                break;
            }

            case "screenshot": {
                if (service == null) {
                    sendError(conn, id, "AccessibilityService is not enabled.");
                    return;
                }
                service.takeScreenshotAsync(new AntigravityAccessibilityService.ScreenshotCallback() {
                    @Override
                    public void onSuccess(String base64Image) {
                        JsonObject res = new JsonObject();
                        res.addProperty("id", id);
                        res.addProperty("status", "success");
                        res.addProperty("image_base64", base64Image);
                        conn.send(res.toString());
                    }

                    @Override
                    public void onError(String errorMessage) {
                        sendError(conn, id, errorMessage);
                    }
                });
                break;
            }

            default:
                sendError(conn, id, "Unknown action: " + action);
                break;
        }
    }

    private void sendError(WebSocket conn, String id, String message) {
        JsonObject err = new JsonObject();
        err.addProperty("id", id);
        err.addProperty("status", "error");
        err.addProperty("message", message);
        conn.send(err.toString());
    }

    @Override
    public void onError(WebSocket conn, Exception ex) {
        LOGGER.log(Level.SEVERE, "LocalAutomationServer error", ex);
    }

    @Override
    public void onStart() {
        LOGGER.info("LocalAutomationServer ready to accept connections.");
    }
}
