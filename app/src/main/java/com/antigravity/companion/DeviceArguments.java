package com.antigravity.companion;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;

final class DeviceArguments {
    static float[] coordinates(JsonObject args, int width, int height) {
        if (!args.has("units") || !args.get("units").isJsonPrimitive()
                || !"pixels".equals(args.get("units").getAsString())) throw new IllegalArgumentException("Use explicit pixel units");
        if (integer(args, "width") != width || integer(args, "height") != height)
            throw new IllegalArgumentException("Stale screen dimensions");
        float x = number(args, "x"), y = number(args, "y");
        if (!Float.isFinite(x) || !Float.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height)
            throw new IllegalArgumentException("Coordinates outside screen");
        return new float[]{x, y};
    }
    private static float number(JsonObject args, String name) {
        return numeric(args, name).getAsFloat();
    }
    private static int integer(JsonObject args, String name) {
        try { return numeric(args, name).getAsBigDecimal().intValueExact(); }
        catch (ArithmeticException invalid) { throw new IllegalArgumentException("Integer required: " + name, invalid); }
    }
    private static JsonElement numeric(JsonObject args, String name) {
        if (!args.has(name) || !args.get(name).isJsonPrimitive() || !args.get(name).getAsJsonPrimitive().isNumber())
            throw new IllegalArgumentException("Missing numeric field: " + name);
        return args.get(name);
    }
}
