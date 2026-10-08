package com.antigravity.companion;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Map;
import java.util.TreeMap;
import java.util.UUID;

final class ActionLedger {
    private static final int MAX_ENTRIES = 4096;
    private static final int MAX_RECORD_BYTES = 32 * 1024 * 1024;
    // Keep the legacy record budget intact; the schema envelope needs separate bounded room.
    private static final int SCHEMA_ALLOWANCE = 256;
    private final File journal;
    private JsonObject records;
    private String epoch;
    ActionLedger(File journal) throws IOException {
        this.journal = journal;
        File previous = new File(journal.getPath() + ".previous");
        if (!journal.exists() && previous.exists() && !previous.renameTo(journal))
            throw new IOException("Cannot recover action journal");
        JsonObject document = readJournal();
        boolean versioned = document.has("schema_version") && document.get("schema_version").isJsonPrimitive();
        if (versioned) {
            if (!document.get("schema_version").getAsJsonPrimitive().isNumber()
                    || !"2".equals(document.get("schema_version").getAsString())
                    || !stringField(document, "epoch") || !document.get("epoch").getAsString().matches("[a-f0-9]{32}")
                    || !document.has("records") || !document.get("records").isJsonObject())
                throw new IOException("Invalid action journal schema");
            epoch = document.get("epoch").getAsString(); records = document.getAsJsonObject("records");
        } else {
            epoch = newEpoch(); records = document;
        }
        validateJournal();
        if (!versioned) {
            if (records.size() >= MAX_ENTRIES || encodedJournal().length >= 30 * 1024 * 1024)
                records = unresolvedRecords();
            saveJournal();
        }
    }
    synchronized String currentEpoch() throws IOException {
        if (records.size() < MAX_ENTRIES && encodedJournal().length < 30 * 1024 * 1024) return epoch;
        JsonObject retained = unresolvedRecords();
        if (retained.size() == records.size()) return epoch;
        JsonObject previousRecords = records; String previousEpoch = epoch;
        records = retained; epoch = newEpoch();
        try { saveJournal(); }
        catch (IOException failure) { records = previousRecords; epoch = previousEpoch; throw failure; }
        return epoch;
    }
    private JsonObject unresolvedRecords() {
        JsonObject retained = new JsonObject();
        for (Map.Entry<String, JsonElement> entry : records.entrySet()) {
            JsonObject record = entry.getValue().getAsJsonObject();
            if (!record.has("response") || "outcome_unknown".equals(record.getAsJsonObject("response").get("status").getAsString()))
                retained.add(entry.getKey(), record);
        }
        return retained;
    }
    static final class RetiredEpochException extends IllegalArgumentException {
        RetiredEpochException() { super("Retired action epoch; the action will not be replayed"); }
    }
    synchronized JsonObject reserve(String actionId, String action, JsonObject args) throws IOException {
        if (!actionId.matches("[A-Za-z0-9._:-]{1,128}")) throw new IllegalArgumentException("Invalid action_id");
        String fingerprint = fingerprint(action, args);
        if (records.has(actionId)) {
            JsonObject prior = records.getAsJsonObject(actionId);
            if (!fingerprint.equals(prior.get("fingerprint").getAsString()))
                throw new IllegalArgumentException("action_id conflict");
            return prior.has("response") ? prior.getAsJsonObject("response").deepCopy() : unknown(actionId);
        }
        if (!actionId.startsWith(epoch + ":") || actionId.length() == epoch.length() + 1)
            throw new RetiredEpochException();
        if (records.size() >= MAX_ENTRIES) throw new IOException("Unresolved action journal full; new effects refused, reads remain available");
        JsonObject pending = new JsonObject(); pending.addProperty("fingerprint", fingerprint);
        records.add(actionId, pending);
        try { saveJournal(); } catch (IOException failure) { records.remove(actionId); throw failure; }
        return null;
    }
    synchronized void complete(String actionId, JsonObject response) throws IOException {
        JsonObject reserved = records.getAsJsonObject(actionId);
        reserved.add("response", response.deepCopy());
        try { saveJournal(); } catch (IOException failure) { reserved.remove("response"); throw failure; }
    }
    private void validateJournal() throws IOException {
        if (records.size() > MAX_ENTRIES) throw new IOException("Action journal exceeds entry limit");
        if (records.toString().getBytes(StandardCharsets.UTF_8).length > MAX_RECORD_BYTES)
            throw new IOException("Action journal records exceed size limit");
        for (Map.Entry<String, JsonElement> entry : records.entrySet()) {
            if (!entry.getKey().matches("[A-Za-z0-9._:-]{1,128}") || !entry.getValue().isJsonObject())
                throw new IOException("Invalid action journal entry");
            JsonObject record = entry.getValue().getAsJsonObject();
            if (!stringField(record, "fingerprint") || !record.get("fingerprint").getAsString().matches("[a-f0-9]{64}"))
                throw new IOException("Invalid action journal fingerprint");
            if (record.has("response")) validateResponse(record.get("response"));
        }
    }
    private static void validateResponse(JsonElement response) throws IOException {
        if (!response.isJsonObject() || !stringField(response.getAsJsonObject(), "status"))
            throw new IOException("Invalid action journal response");
        String status = response.getAsJsonObject().get("status").getAsString();
        if (!status.equals("completed") && !status.equals("failed") && !status.equals("outcome_unknown"))
            throw new IOException("Invalid action journal response status");
    }
    private static boolean stringField(JsonObject object, String field) {
        return object.has(field) && object.get(field).isJsonPrimitive() && object.get(field).getAsJsonPrimitive().isString();
    }
    private JsonObject readJournal() throws IOException {
        if (!journal.exists()) return new JsonObject();
        if (journal.length() > (long) MAX_RECORD_BYTES + SCHEMA_ALLOWANCE) throw new IOException("Action journal exceeds limit");
        try (Reader reader = new InputStreamReader(new FileInputStream(journal), StandardCharsets.UTF_8)) {
            return JsonParser.parseReader(reader).getAsJsonObject();
        } catch (com.google.gson.JsonParseException | IllegalStateException invalid) {
            throw new IOException("Invalid action journal; actions refused", invalid);
        }
    }
    private void saveJournal() throws IOException {
        File staging = new File(journal.getPath() + ".new");
        File previous = new File(journal.getPath() + ".previous");
        if (records.toString().getBytes(StandardCharsets.UTF_8).length > MAX_RECORD_BYTES)
            throw new IOException("Action journal records full; effects refused");
        byte[] encoded = encodedJournal();
        if (encoded.length > MAX_RECORD_BYTES + SCHEMA_ALLOWANCE)
            throw new IOException("Action journal schema exceeds allowance");
        try (FileOutputStream output = new FileOutputStream(staging)) {
            output.write(encoded); output.getFD().sync();
        }
        if (previous.exists() && !previous.delete()) throw new IOException("Cannot remove old journal backup");
        if (journal.exists() && !journal.renameTo(previous)) throw new IOException("Cannot back up journal");
        if (!staging.renameTo(journal)) throw new IOException("Cannot publish journal");
    }
    private byte[] encodedJournal() {
        JsonObject document = new JsonObject(); document.addProperty("schema_version", 2);
        document.addProperty("epoch", epoch); document.add("records", records);
        return document.toString().getBytes(StandardCharsets.UTF_8);
    }
    private static String newEpoch() { return UUID.randomUUID().toString().replace("-", ""); }
    private static JsonObject unknown(String actionId) {
        JsonObject response = new JsonObject(); response.addProperty("action_id", actionId);
        response.addProperty("status", "outcome_unknown");
        response.addProperty("error", "Action already reserved; it will not be replayed"); return response;
    }
    private static String fingerprint(String action, JsonObject args) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(
                    (action + "\n" + canonical(args)).getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte octet : digest) hex.append(String.format(java.util.Locale.ROOT, "%02x", octet & 255));
            return hex.toString();
        } catch (NoSuchAlgorithmException impossible) { throw new AssertionError(impossible); }
    }
    private static JsonElement canonical(JsonElement element) {
        if (element.isJsonObject()) {
            JsonObject ordered = new JsonObject();
            TreeMap<String, JsonElement> entries = new TreeMap<>();
            for (Map.Entry<String, JsonElement> entry : element.getAsJsonObject().entrySet())
                entries.put(entry.getKey(), entry.getValue());
            for (Map.Entry<String, JsonElement> entry : entries.entrySet())
                ordered.add(entry.getKey(), canonical(entry.getValue()));
            return ordered;
        }
        if (element.isJsonArray()) {
            com.google.gson.JsonArray ordered = new com.google.gson.JsonArray();
            for (JsonElement child : element.getAsJsonArray()) ordered.add(canonical(child));
            return ordered;
        }
        return element;
    }
}
