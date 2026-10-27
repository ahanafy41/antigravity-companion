package com.antigravity.companion;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;
import static org.junit.Assert.*;

public class UpdateTransferTest {
    @Test public void cancellationDuringVerificationPreventsPublication() {
        UpdateTransfer transfer = new UpdateTransfer();
        AtomicBoolean published = new AtomicBoolean();
        assertThrows(IOException.class, () -> transfer.verifyThenPublish(
                transfer::cancel, () -> published.set(true)));
        assertFalse(published.get());
    }
    @Test public void cancellationAfterPublicationPreventsQueuedDelivery() throws IOException {
        UpdateTransfer transfer = new UpdateTransfer();
        AtomicBoolean delivered = new AtomicBoolean();
        transfer.verifyThenPublish(() -> {}, () -> {});
        transfer.cancel();
        assertThrows(IOException.class, () -> transfer.deliver(() -> delivered.set(true)));
        assertFalse(delivered.get());
    }
    @Test public void newTransferDoesNotResetOldCancellation() throws IOException {
        UpdateTransfer old = new UpdateTransfer(); old.cancel();
        UpdateTransfer next = new UpdateTransfer(); next.requireActive();
        assertThrows(IOException.class, old::requireActive);
    }
    @Test public void activeTransferVerifiesPublishesAndDeliversInOrder() throws IOException {
        UpdateTransfer transfer = new UpdateTransfer();
        StringBuilder stages = new StringBuilder();
        transfer.verifyThenPublish(() -> stages.append("verify,"), () -> stages.append("publish,"));
        transfer.deliver(() -> stages.append("deliver"));
        assertEquals("verify,publish,deliver", stages.toString());
    }
}
