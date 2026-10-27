package com.antigravity.companion;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativeRequestLedgerTest {
    @Test public void longLivedPageAcceptsMoreThan1024CompletedRequests() {
        NativeRequestLedger requests = new NativeRequestLedger();
        for (int index = 0; index < 2048; index++) {
            String id = "request-" + index;
            requests.reserve(id);
            assertTrue(requests.complete(id));
        }
    }

    @Test public void duplicateCannotFinishOriginalOrRunAgainAfterCompletion() {
        NativeRequestLedger requests = new NativeRequestLedger();
        requests.reserve("same-request");
        try { requests.reserve("same-request"); fail("Pending duplicate accepted"); }
        catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("Duplicate")); }
        assertTrue(requests.complete("same-request"));
        try { requests.reserve("same-request"); fail("Completed duplicate accepted"); }
        catch (IllegalArgumentException expected) { assertTrue(expected.getMessage().contains("Duplicate")); }
        assertFalse(requests.complete("same-request"));
    }
}
