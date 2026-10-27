package com.antigravity.companion;

import java.io.IOException;
import java.util.concurrent.atomic.AtomicBoolean;

/** Cancellation belongs to one transfer, including its queued delivery. */
final class UpdateTransfer {
    private final AtomicBoolean cancelled = new AtomicBoolean();
    interface CheckedAction { void run() throws IOException; }
    void cancel() { cancelled.set(true); }
    void requireActive() throws IOException {
        if (cancelled.get() || Thread.currentThread().isInterrupted())
            throw new IOException("Download cancelled");
    }
    void verifyThenPublish(CheckedAction verification, CheckedAction publication) throws IOException {
        requireActive(); verification.run(); requireActive(); publication.run();
    }
    void deliver(CheckedAction callback) throws IOException {
        requireActive(); callback.run();
    }
}
