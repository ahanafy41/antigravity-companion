package com.antigravity.companion;

import org.junit.Test;
import static org.junit.Assert.*;

public class UpdatePolicyTest {
    @Test public void releaseAssetTrustRejectsLookalikeRepositoriesAndHosts() {
        assertTrue(UpdatePolicy.trustedAsset("https://github.com/ahanafy41/antigravity-companion/releases/download/v2/app-release.apk"));
        for (String url : new String[]{"http://github.com/ahanafy41/antigravity-companion/releases/download/v2/x.apk",
                "https://github.com.evil/ahanafy41/antigravity-companion/releases/download/v2/x.apk",
                "https://github.com/another/repo/releases/download/v2/x.apk",
                "https://user@github.com/ahanafy41/antigravity-companion/releases/download/v2/x.apk"}) {
            assertFalse(url, UpdatePolicy.trustedAsset(url));
        }
    }
    @Test public void upgradeRequiresSamePackageHigherCodeAndMatchingSigner() {
        assertTrue(UpdatePolicy.validUpgrade(new UpdatePolicy.Release("our.app", 5, new String[]{"a"}), new UpdatePolicy.Release("our.app", 6, new String[]{"a"})));
        assertFalse(UpdatePolicy.validUpgrade(new UpdatePolicy.Release("our.app", 5, new String[]{"a"}), new UpdatePolicy.Release("other.app", 6, new String[]{"a"})));
        assertFalse(UpdatePolicy.validUpgrade(new UpdatePolicy.Release("our.app", 5, new String[]{"a"}), new UpdatePolicy.Release("our.app", 5, new String[]{"a"})));
        assertFalse(UpdatePolicy.validUpgrade(new UpdatePolicy.Release("our.app", 5, new String[]{"a"}), new UpdatePolicy.Release("our.app", 6, new String[]{"b"})));
    }
}
