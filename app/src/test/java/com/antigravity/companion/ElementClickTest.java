package com.antigravity.companion;

import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;
import static org.junit.Assert.*;

public class ElementClickTest {
    @Test public void labelUsesClickableAncestorAndReleasesParent() {
        Node parent = new Node(true, null);
        Node label = new Node(false, parent);
        AtomicInteger gestures = new AtomicInteger();
        assertTrue(ElementClick.perform(label, gestures::incrementAndGet));
        assertEquals(1, parent.clicks);
        assertEquals(1, parent.recycles);
        assertEquals(0, label.recycles);
        assertEquals(0, gestures.get());
    }

    @Test public void rejectedNodesReachGestureWithoutClaimingCompletion() {
        Node ancestor = new Node(false, null);
        Node label = new Node(false, ancestor);
        AtomicInteger gestures = new AtomicInteger();
        assertFalse(ElementClick.perform(label, gestures::incrementAndGet));
        assertEquals(1, gestures.get());
        assertEquals(1, ancestor.recycles);
    }

    private static final class Node implements ElementClick.Node {
        final boolean accepted;
        final Node parent;
        int clicks;
        int recycles;
        Node(boolean accepted, Node parent) { this.accepted = accepted; this.parent = parent; }
        public boolean click() { clicks++; return accepted; }
        public ElementClick.Node parent() { return parent; }
        public void recycle() { recycles++; }
    }
}
