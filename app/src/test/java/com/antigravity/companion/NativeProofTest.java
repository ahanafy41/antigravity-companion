package com.antigravity.companion;

import org.junit.Test;
import static org.junit.Assert.*;

public class NativeProofTest {
    @Test public void hmacChallengeAcceptsKnownVectorAndRejectsReplayOrTamper() {
        String proof = "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8";
        assertTrue(NativeProof.verify("key", "The quick brown fox jumps over the lazy dog", proof));
        assertFalse(NativeProof.verify("key", "another challenge", proof));
        assertFalse(NativeProof.verify("other key", "The quick brown fox jumps over the lazy dog", proof));
        assertFalse(NativeProof.verify("key", "The quick brown fox jumps over the lazy dog", "abc"));
    }
}
