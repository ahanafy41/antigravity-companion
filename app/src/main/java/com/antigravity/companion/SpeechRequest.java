package com.antigravity.companion;

import com.google.gson.JsonObject;
import java.util.Locale;

final class SpeechRequest {
    final String text;
    final Locale language;
    final float rate;

    private SpeechRequest(String text, Locale language, float rate) {
        this.text = text; this.language = language; this.rate = rate;
    }
    static SpeechRequest parse(JsonObject args) {
        for (String key : args.keySet()) {
            if (!key.equals("text") && !key.equals("language") && !key.equals("rate"))
                throw new IllegalArgumentException("Unknown speech argument");
        }
        String raw = string(args, "text");
        String text = raw.trim();
        if (text.isEmpty() || text.length() > 2000)
            throw new IllegalArgumentException("Speech text must contain 1..2000 characters");
        for (int index = 0; index < raw.length(); index++) {
            if (Character.isISOControl(raw.charAt(index)) && !Character.isWhitespace(raw.charAt(index)))
                throw new IllegalArgumentException("Speech text contains control characters");
        }
        String tag = args.has("language") ? string(args, "language") : "ar-EG";
        if (!tag.matches("[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}"))
            throw new IllegalArgumentException("Invalid speech language tag");
        float rate = 1f;
        if (args.has("rate")) {
            if (!args.get("rate").isJsonPrimitive() || !args.getAsJsonPrimitive("rate").isNumber())
                throw new IllegalArgumentException("Speech rate must be numeric");
            rate = args.get("rate").getAsFloat();
            if (!Float.isFinite(rate) || rate < 0.5f || rate > 2f)
                throw new IllegalArgumentException("Speech rate outside 0.5..2");
        }
        return new SpeechRequest(text, Locale.forLanguageTag(tag), rate);
    }
    static String cancellationScope(JsonObject args) {
        if (args.entrySet().isEmpty()) return "";
        if (args.size() != 1 || !args.has("utterance_id"))
            throw new IllegalArgumentException("Speech cancellation accepts only utterance_id");
        String scope = string(args, "utterance_id");
        if (!scope.matches("[A-Za-z0-9._:-]{1,128}"))
            throw new IllegalArgumentException("Invalid speech utterance identifier");
        return scope;
    }
    private static String string(JsonObject args, String name) {
        if (!args.has(name) || !args.get(name).isJsonPrimitive()
                || !args.getAsJsonPrimitive(name).isString())
            throw new IllegalArgumentException("Missing speech string: " + name);
        return args.get(name).getAsString();
    }
}
