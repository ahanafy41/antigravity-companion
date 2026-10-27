package com.antigravity.companion;

import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;

final class NativeRequestLedger {
    private static final int MAX_PENDING = 128;
    private static final int RECENT_COMPLETIONS = 1024;
    private final Set<String> pending = new HashSet<>();
    private final LinkedHashSet<String> completed = new LinkedHashSet<>();

    synchronized void reserve(String id) {
        if (pending.contains(id) || completed.contains(id))
            throw new IllegalArgumentException("Duplicate native request ID");
        if (pending.size() >= MAX_PENDING)
            throw new IllegalArgumentException("Too many pending native requests");
        pending.add(id);
    }

    synchronized boolean complete(String id) {
        if (!pending.remove(id)) return false;
        completed.add(id);
        if (completed.size() > RECENT_COMPLETIONS)
            completed.remove(completed.iterator().next());
        return true;
    }

    synchronized void clear() { pending.clear(); completed.clear(); }
}
