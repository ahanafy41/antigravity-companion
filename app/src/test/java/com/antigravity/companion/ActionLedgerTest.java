package com.antigravity.companion;

import java.io.File;
import java.nio.file.Files;
import com.google.gson.JsonObject;
import org.junit.Test;
import static org.junit.Assert.*;

public class ActionLedgerTest {
    @Test public void completedActionSurvivesRestartWithoutReexecution() throws Exception {
        File journal = Files.createTempFile("actions", ".json").toFile();
        journal.delete();
        try {
            ActionLedger ledger = new ActionLedger(journal);
            String id = ledger.currentEpoch() + ":request-1";
            JsonObject args = new JsonObject(); args.addProperty("query", "save");
            assertNull(ledger.reserve(id, "click", args));
            JsonObject response = new JsonObject(); response.addProperty("status", "completed");
            ledger.complete(id, response);
            ActionLedger restored = new ActionLedger(journal);
            assertEquals(ledger.currentEpoch(), restored.currentEpoch());
            assertEquals("completed", restored.reserve(id, "click", args).get("status").getAsString());
        } finally { cleanJournal(journal); }
    }
    @Test public void unfinishedActionBecomesUnknownAndConflictingIdIsRejected() throws Exception {
        File journal = Files.createTempFile("actions", ".json").toFile(); journal.delete();
        try {
            JsonObject args = new JsonObject(); args.addProperty("text", "hello");
            ActionLedger ledger = new ActionLedger(journal);
            String id = ledger.currentEpoch() + ":request-2";
            ledger.reserve(id, "text", args);
            ActionLedger restored = new ActionLedger(journal);
            assertEquals("outcome_unknown", restored.reserve(id, "text", args).get("status").getAsString());
            args.addProperty("text", "different");
            try { restored.reserve(id, "text", args); fail("ID conflict accepted"); }
            catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("conflict")); }
        } finally { cleanJournal(journal); }
    }
    @Test public void resultPersistenceFailureCannotBecomeConfirmedDuplicate() throws Exception {
        File journal = Files.createTempFile("actions", ".json").toFile(); journal.delete();
        File staging = new File(journal.getPath() + ".new");
        try {
            ActionLedger ledger = new ActionLedger(journal);
            String id = ledger.currentEpoch() + ":request-3";
            JsonObject args = new JsonObject(); ledger.reserve(id, "back", args);
            assertTrue(staging.mkdir());
            JsonObject response = new JsonObject(); response.addProperty("status", "completed");
            try { ledger.complete(id, response); fail("Persistence failure ignored"); }
            catch (java.io.IOException expected) { assertNotNull(expected.getMessage()); }
            assertEquals("outcome_unknown", ledger.reserve(id, "back", args).get("status").getAsString());
        } finally { staging.delete(); cleanJournal(journal); }
    }
    @Test public void malformedJournalShapeRefusesAllActionsWithIoError() throws Exception {
        File journal = Files.createTempFile("actions", ".json").toFile();
        try {
            for (String invalid : new String[]{"[]", "{\"r\":null}", "{\"r\":3}", "{\"r\":{}}",
                    "{\"r\":{\"fingerprint\":1}}", "{\"r\":{\"fingerprint\":\"abc\",\"response\":{\"status\":\"success\"}}}"}) {
                Files.write(journal.toPath(), invalid.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                try { new ActionLedger(journal); fail("Malformed journal accepted: " + invalid); }
                catch (java.io.IOException expected) { assertTrue(expected.getMessage().toLowerCase().contains("journal")); }
            }
        } finally { cleanJournal(journal); }
    }

    @Test public void fullJournalRetiresFinishedActionsButKeepsUnresolvedAcrossRestart() throws Exception {
        File journal = Files.createTempFile("actions", ".json").toFile(); journal.delete();
        try {
            ActionLedger ledger = new ActionLedger(journal);
            String epoch = ledger.currentEpoch();
            JsonObject args = new JsonObject();
            ledger.reserve(epoch + ":seed", "back", args);
            JsonObject document = readDocument(journal);
            JsonObject pending = document.getAsJsonObject("records").getAsJsonObject(epoch + ":seed");
            JsonObject records = new JsonObject();
            for (int index = 0; index < 4096; index++) {
                JsonObject record = pending.deepCopy();
                if (index != 1) {
                    JsonObject response = new JsonObject(); response.addProperty("action_id", epoch + ":" + index);
                    response.addProperty("status", index == 2 ? "outcome_unknown" : "completed");
                    record.add("response", response);
                }
                records.add(epoch + ":" + index, record);
            }
            document.add("records", records); writeDocument(journal, document);
            ActionLedger full = new ActionLedger(journal);
            String nextEpoch = full.currentEpoch(); assertNotEquals(epoch, nextEpoch);
            ActionLedger restored = new ActionLedger(journal);
            assertEquals(nextEpoch, restored.currentEpoch());
            for (int index : new int[]{1, 2})
                assertEquals("outcome_unknown", restored.reserve(epoch + ":" + index, "back", args).get("status").getAsString());
            try { restored.reserve(epoch + ":0", "back", args); fail("Retired completed action replayed"); }
            catch (ActionLedger.RetiredEpochException expected) { assertTrue(expected.getMessage().contains("not be replayed")); }
            assertNull(restored.reserve(nextEpoch + ":new", "back", args));
        } finally { cleanJournal(journal); }
    }

    @Test public void legacyPendingRecordSurvivesMigrationAndUnknownOldIdsAreRejected() throws Exception {
        File journal = Files.createTempFile("actions", ".json").toFile(); journal.delete();
        try {
            ActionLedger ledger = new ActionLedger(journal);
            String id = ledger.currentEpoch() + ":seed";
            JsonObject args = new JsonObject(); ledger.reserve(id, "back", args);
            JsonObject legacy = new JsonObject();
            legacy.add("legacy-request", readDocument(journal).getAsJsonObject("records").get(id));
            writeDocument(journal, legacy);
            ActionLedger migrated = new ActionLedger(journal);
            assertEquals("outcome_unknown", migrated.reserve("legacy-request", "back", args).get("status").getAsString());
            assertFalse(readDocument(journal).getAsJsonObject("records").getAsJsonObject("legacy-request").has("response"));
            try { migrated.reserve("unrecorded-legacy-request", "back", args); fail("Old unrecorded action accepted"); }
            catch (ActionLedger.RetiredEpochException expected) { assertNotNull(expected.getMessage()); }
        } finally { cleanJournal(journal); }
    }

    @Test public void legacyNear32MiBRetiresCompletedBeforeAddingSchemaAndKeepsOriginalBackup() throws Exception {
        File journal = Files.createTempFile("actions", ".json").toFile(); journal.delete();
        try {
            ActionLedger seed = new ActionLedger(journal);
            String id = seed.currentEpoch() + ":seed";
            JsonObject args = new JsonObject(); seed.reserve(id, "back", args);
            String fingerprint = readDocument(journal).getAsJsonObject("records")
                    .getAsJsonObject(id).get("fingerprint").getAsString();
            String prefix = "{\"legacy-completed\":{\"fingerprint\":\"" + fingerprint
                    + "\",\"response\":{\"status\":\"completed\",\"padding\":\"";
            String suffix = "\"}},\"legacy-pending\":{\"fingerprint\":\"" + fingerprint + "\"}}";
            long originalSize = 32L * 1024 * 1024 - 16;
            int padding = (int) (originalSize - prefix.length() - suffix.length());
            try (java.io.Writer writer = Files.newBufferedWriter(journal.toPath(), java.nio.charset.StandardCharsets.UTF_8)) {
                writer.write(prefix);
                char[] chunk = new char[8192]; java.util.Arrays.fill(chunk, 'x');
                while (padding > 0) {
                    int count = Math.min(padding, chunk.length); writer.write(chunk, 0, count); padding -= count;
                }
                writer.write(suffix);
            }
            ActionLedger migrated = new ActionLedger(journal);
            assertEquals(originalSize, Files.size(new File(journal.getPath() + ".previous").toPath()));
            assertEquals("outcome_unknown", migrated.reserve("legacy-pending", "back", args).get("status").getAsString());
            assertTrue(journal.length() < 1024);
            try { migrated.reserve("legacy-completed", "back", args); fail("Retired legacy action replayed"); }
            catch (ActionLedger.RetiredEpochException expected) { assertNotNull(expected.getMessage()); }
        } finally { cleanJournal(journal); }
    }

    @Test public void legacyUnknownNearRecordBudgetKeepsPayloadWithBoundedSchemaAllowance() throws Exception {
        File journal = Files.createTempFile("actions", ".json").toFile(); journal.delete();
        try {
            ActionLedger seed = new ActionLedger(journal);
            String id = seed.currentEpoch() + ":seed";
            JsonObject args = new JsonObject(); seed.reserve(id, "back", args);
            String fingerprint = readDocument(journal).getAsJsonObject("records")
                    .getAsJsonObject(id).get("fingerprint").getAsString();
            String prefix = "{\"legacy-unknown\":{\"fingerprint\":\"" + fingerprint
                    + "\",\"response\":{\"status\":\"outcome_unknown\",\"padding\":\"";
            String suffix = "\"}}}";
            long recordBudget = 32L * 1024 * 1024;
            int paddingSize = (int) (recordBudget - prefix.length() - suffix.length());
            try (java.io.Writer writer = Files.newBufferedWriter(journal.toPath(), java.nio.charset.StandardCharsets.UTF_8)) {
                writer.write(prefix);
                char[] chunk = new char[8192]; java.util.Arrays.fill(chunk, 'x');
                for (int remaining = paddingSize; remaining > 0;) {
                    int count = Math.min(remaining, chunk.length); writer.write(chunk, 0, count); remaining -= count;
                }
                writer.write(suffix);
            }
            assertEquals(recordBudget, journal.length());
            ActionLedger migrated = new ActionLedger(journal);
            long schemaSize = journal.length();
            assertTrue(schemaSize > recordBudget && schemaSize <= recordBudget + 256);
            JsonObject preserved = migrated.reserve("legacy-unknown", "back", args);
            assertEquals("outcome_unknown", preserved.get("status").getAsString());
            assertEquals(paddingSize, preserved.get("padding").getAsString().length());
            ActionLedger restored = new ActionLedger(journal);
            assertEquals(migrated.currentEpoch(), restored.currentEpoch());
            try { restored.reserve(restored.currentEpoch() + ":new", "back", args); fail("Record budget overflow accepted"); }
            catch (java.io.IOException expected) { assertTrue(expected.getMessage().contains("records full")); }
        } finally { cleanJournal(journal); }
    }

    private static JsonObject readDocument(File journal) throws Exception {
        return com.google.gson.JsonParser.parseString(new String(Files.readAllBytes(journal.toPath()),
                java.nio.charset.StandardCharsets.UTF_8)).getAsJsonObject();
    }

    private static void writeDocument(File journal, JsonObject document) throws Exception {
        Files.write(journal.toPath(), document.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    private static void cleanJournal(File journal) throws Exception {
        for (String suffix : new String[]{"", ".new", ".previous"})
            Files.deleteIfExists(new File(journal.getPath() + suffix).toPath());
    }
}
