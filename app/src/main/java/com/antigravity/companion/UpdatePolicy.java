package com.antigravity.companion;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Arrays;

final class UpdatePolicy {
    static boolean trustedAsset(String url) {
        try {
            URI asset = new URI(url);
            return "https".equals(asset.getScheme()) && "github.com".equals(asset.getHost())
                    && asset.getUserInfo() == null && (asset.getPort() == -1 || asset.getPort() == 443)
                    && asset.getRawPath().startsWith("/ahanafy41/antigravity-companion/releases/download/")
                    && asset.getRawPath().endsWith(".apk") && asset.getQuery() == null
                    && asset.getFragment() == null && !asset.getRawPath().contains("%")
                    && !asset.getRawPath().contains("/../");
        } catch (URISyntaxException | NullPointerException invalid) { return false; }
    }
    static final class Release {
        final String packageName;
        final long versionCode;
        final String[] signers;
        Release(String packageName, long versionCode, String[] signers) {
            this.packageName = packageName; this.versionCode = versionCode; this.signers = signers.clone();
        }
    }
    static boolean validUpgrade(Release installed, Release archive) {
        String[] installedSigners = installed.signers.clone();
        String[] archiveSigners = archive.signers.clone();
        Arrays.sort(installedSigners); Arrays.sort(archiveSigners);
        return installed.packageName.equals(archive.packageName) && archive.versionCode > installed.versionCode
                && installedSigners.length > 0 && Arrays.equals(installedSigners, archiveSigners);
    }
}
