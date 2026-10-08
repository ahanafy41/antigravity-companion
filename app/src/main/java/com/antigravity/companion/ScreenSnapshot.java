package com.antigravity.companion;

import android.view.accessibility.AccessibilityNodeInfo;
import android.graphics.Rect;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.Locale;

final class ScreenSnapshot implements AutoCloseable {
    private final Map<String, AccessibilityNodeInfo> nodes = new LinkedHashMap<>();
    private String snapshotId = "";
    JsonObject capture(AccessibilityNodeInfo root) {
        close(); snapshotId = UUID.randomUUID().toString();
        JsonObject screen = new JsonObject(); screen.addProperty("snapshot_id", snapshotId);
        try { screen.add("root", serialize(root, 0)); return screen; }
        catch (IllegalArgumentException failure) { close(); throw failure; }
    }
    AccessibilityNodeInfo target(JsonObject args) {
        if (!snapshotId.equals(required(args, "snapshot_id"))) throw new IllegalArgumentException("Stale screen snapshot");
        AccessibilityNodeInfo node = nodes.get(required(args, "element_id"));
        if (node == null) throw new IllegalArgumentException("Stale element_id");
        String captured = identity(node);
        if (!node.refresh() || !captured.equals(identity(node))) throw new IllegalArgumentException("Stale element_id");
        return node;
    }
    JsonObject select(String query) {
        String normalized = normalize(query);
        if (normalized.isEmpty()) throw new IllegalArgumentException("query must not be empty");
        if (snapshotId.isEmpty()) throw new IllegalArgumentException("Capture tree before selecting");
        JsonArray matches = new JsonArray();
        for (Map.Entry<String, AccessibilityNodeInfo> entry : nodes.entrySet()) {
            AccessibilityNodeInfo node = entry.getValue();
            if (node.isPassword()) continue;
            if (contains(node.getText(), normalized) || contains(node.getContentDescription(), normalized)
                    || contains(node.getViewIdResourceName(), normalized)) matches.add(entry.getKey());
        }
        JsonObject selection = new JsonObject(); selection.addProperty("snapshot_id", snapshotId);
        selection.add("element_ids", matches); return selection;
    }
    private JsonObject serialize(AccessibilityNodeInfo node, int depth) {
        if (nodes.size() >= 1024 || depth > 32) throw new IllegalArgumentException("Screen tree exceeds safe limit");
        String id = snapshotId + ":" + nodes.size(); nodes.put(id, AccessibilityNodeInfo.obtain(node));
        JsonObject description = new JsonObject(); description.addProperty("element_id", id);
        description.addProperty("text", node.isPassword() ? "" : text(node.getText()));
        description.addProperty("content_description", node.isPassword() ? "" : text(node.getContentDescription()));
        description.addProperty("view_id", text(node.getViewIdResourceName()));
        description.addProperty("clickable", node.isClickable()); description.addProperty("editable", node.isEditable());
        description.addProperty("scrollable", node.isScrollable());
        Rect bounds = new Rect(); node.getBoundsInScreen(bounds);
        JsonObject rectangle = new JsonObject(); rectangle.addProperty("left", bounds.left);
        rectangle.addProperty("top", bounds.top); rectangle.addProperty("right", bounds.right);
        rectangle.addProperty("bottom", bounds.bottom); description.add("bounds", rectangle);
        JsonArray children = new JsonArray();
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo child = node.getChild(index);
            if (child == null) continue;
            try { children.add(serialize(child, depth + 1)); } finally { child.recycle(); }
        }
        description.add("children", children); return description;
    }
    private static String identity(AccessibilityNodeInfo node) {
        Rect bounds = new Rect(); node.getBoundsInScreen(bounds);
        return node.getWindowId() + "|" + text(node.getViewIdResourceName()) + "|" + text(node.getClassName())
                + "|" + text(node.getPackageName()) + "|" + text(node.getText()) + "|"
                + text(node.getContentDescription()) + "|" + bounds.toShortString();
    }
    static String required(JsonObject args, String key) {
        if (!args.has(key) || !args.get(key).isJsonPrimitive() || !args.get(key).getAsJsonPrimitive().isString())
            throw new IllegalArgumentException("Missing string: " + key);
        String text = args.get(key).getAsString();
        if (text.trim().isEmpty()) throw new IllegalArgumentException("Empty string: " + key);
        return text;
    }
    private static String text(CharSequence characters) { return characters == null ? "" : characters.toString(); }
    private static boolean contains(CharSequence characters, String query) {
        return characters != null && !characters.toString().trim().isEmpty() && normalize(characters.toString()).contains(query);
    }
    private static String normalize(String query) {
        return query.trim().toLowerCase(Locale.ROOT).replace('أ', 'ا').replace('إ', 'ا').replace('آ', 'ا').replace('ى', 'ي');
    }
    @Override public void close() {
        for (AccessibilityNodeInfo node : nodes.values()) node.recycle();
        nodes.clear(); snapshotId = "";
    }
}
