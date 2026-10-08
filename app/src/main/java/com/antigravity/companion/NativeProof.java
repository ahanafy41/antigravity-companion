package com.antigravity.companion;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

final class NativeProof {
    static boolean verify(String token, String nonce, String proof) {
        if (proof == null || !proof.matches("[a-f0-9]{64}")) return false;
        try {
            Mac hmac = Mac.getInstance("HmacSHA256");
            hmac.init(new SecretKeySpec(token.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] expected = hmac.doFinal(nonce.getBytes(StandardCharsets.UTF_8));
            byte[] supplied = new byte[32];
            for (int index = 0; index < supplied.length; index++)
                supplied[index] = (byte) Integer.parseInt(proof.substring(index * 2, index * 2 + 2), 16);
            return MessageDigest.isEqual(expected, supplied);
        } catch (GeneralSecurityException impossible) { throw new IllegalStateException("HMAC unavailable", impossible); }
    }
}
