package com.antigravity.companion;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Maps the old endpoint's literal phone calls; never evaluates returned code. */
final class LegacyVoiceActions {
    private static final String QUOTED = "(?:\"(?:[^\"\\\\]|\\\\.)*\"|'(?:[^'\\\\]|\\\\['\\\\])*')";
    private static final Pattern CALL = Pattern.compile("(?:service\\.)?([A-Za-z]+)\\((.*)\\);?");
    static final class Action {
        final String name;
        final JsonObject args;
        Action(String name, JsonObject args) { this.name = name; this.args = args; }
    }
    private LegacyVoiceActions() { }

    static List<Action> parse(String code) {
        List<Action> actions = new ArrayList<>();
        if (code.length() > 65536) throw new IllegalArgumentException("Legacy code exceeds limit");
        for (String raw : code.split("\\R")) {
            String line = raw.trim();
            if (line.isEmpty() || line.startsWith("--") || line.startsWith("//") || line.startsWith("#")) continue;
            Matcher call = CALL.matcher(line);
            if (!call.matches() || actions.size() >= 32) throw new IllegalArgumentException("Unsupported legacy phone code");
            actions.add(action(call.group(1), call.group(2).trim()));
        }
        return actions;
    }
    private static Action action(String name, String arguments) {
        JsonObject args = new JsonObject();
        switch (name) {
            case "toHome": case "toBack": case "toRecents":
                if (!arguments.isEmpty()) throw new IllegalArgumentException("Unexpected navigation arguments");
                return new Action(name.substring(2).toLowerCase(java.util.Locale.ROOT), args);
            case "smartStartApp": case "launchApp": args.addProperty("target", string(arguments)); return new Action("launch_app", args);
            case "forceClick": case "clickNode": args.addProperty("query", string(arguments)); return new Action("click", args);
            case "setText": case "paste": args.addProperty("text", string(arguments)); return new Action("text", args);
            case "openUrl": args.addProperty("url", string(arguments)); return new Action("open_url", args);
            case "smartClick": case "clickAtCoordinates": return coordinates(arguments);
            case "advancedClick": args.add("targets", targets(arguments)); return new Action("click", args);
            case "swipe":
                if (!arguments.matches("[0-9]+(?:\\.[0-9]+)?(?:\\s*,\\s*[0-9]+(?:\\.[0-9]+)?){4}"))
                    throw new IllegalArgumentException("Literal swipe arguments required");
                args.addProperty("direction", "forward"); return new Action("scroll", args);
            case "scroll":
                String direction = string(arguments);
                if (!java.util.Arrays.asList("up", "down", "forward", "backward").contains(direction))
                    throw new IllegalArgumentException("Unsupported legacy scroll direction");
                args.addProperty("direction", direction.equals("up") || direction.equals("backward") ? "backward" : "forward");
                return new Action("scroll", args);
            default: throw new IllegalArgumentException("Unsupported legacy phone call: " + name);
        }
    }
    private static String string(String argument) {
        if (!argument.matches(QUOTED)) throw new IllegalArgumentException("Literal string required");
        if (argument.startsWith("'")) return argument.substring(1, argument.length() - 1).replace("\\'", "'").replace("\\\\", "\\");
        try { return JsonParser.parseString(argument).getAsString(); }
        catch (com.google.gson.JsonParseException invalid) { throw new IllegalArgumentException("Invalid literal string", invalid); }
    }
    private static JsonArray targets(String arguments) {
        if (!arguments.matches("\\{\\s*" + QUOTED + "(?:\\s*,\\s*" + QUOTED + ")*\\s*\\}"))
            throw new IllegalArgumentException("Literal target list required");
        JsonArray targets = new JsonArray();
        Matcher quoted = Pattern.compile(QUOTED).matcher(arguments);
        while (quoted.find()) targets.add(string(quoted.group()));
        return targets;
    }
    private static Action coordinates(String arguments) {
        if (!arguments.matches("[0-9]+(?:\\.[0-9]+)?\\s*,\\s*[0-9]+(?:\\.[0-9]+)?"))
            throw new IllegalArgumentException("Literal coordinates required");
        String[] pair = arguments.split(",");
        JsonObject args = new JsonObject();
        float x = Float.parseFloat(pair[0].trim()), y = Float.parseFloat(pair[1].trim());
        if (!Float.isFinite(x) || !Float.isFinite(y)) throw new IllegalArgumentException("Invalid legacy coordinates");
        args.addProperty("x", x); args.addProperty("y", y); return new Action("click", args);
    }
    static JsonObject elementArguments(JsonObject screen, String attribute) {
        List<String> candidates = new ArrayList<>();
        collect(screen.getAsJsonObject("root"), attribute, candidates);
        if (candidates.size() != 1) throw new IllegalArgumentException("Legacy " + attribute + " target is ambiguous or absent");
        JsonObject args = new JsonObject(); args.add("snapshot_id", screen.get("snapshot_id"));
        args.addProperty("element_id", candidates.get(0)); return args;
    }
    private static void collect(JsonObject node, String attribute, List<String> candidates) {
        if (node.has(attribute) && node.get(attribute).getAsBoolean()) candidates.add(node.get("element_id").getAsString());
        if (node.has("children")) for (com.google.gson.JsonElement child : node.getAsJsonArray("children"))
            collect(child.getAsJsonObject(), attribute, candidates);
    }
}
