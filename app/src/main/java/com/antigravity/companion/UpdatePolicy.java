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
    static String upgradeRejectionReason(Release installed, Release archive) {
        if (!installed.packageName.equals(archive.packageName)) {
            return "Package mismatch: installed " + installed.packageName + " vs " + archive.packageName;
        }
        if (archive.versionCode <= installed.versionCode) {
            return "Version code not newer: installed " + installed.versionCode + " vs " + archive.versionCode;
        }
        String[] installedSigners = installed.signers.clone();
        String[] archiveSigners = archive.signers.clone();
        Arrays.sort(installedSigners); Arrays.sort(archiveSigners);
        if (installedSigners.length == 0 || archiveSigners.length == 0) {
            return "Signing certificates missing";
        }
        if (!Arrays.equals(installedSigners, archiveSigners)) {
            return "Signing certificate mismatch";
        }
        return null;
    }

    static boolean validUpgrade(Release installed, Release archive) {
        return upgradeRejectionReason(installed, archive) == null;
    }
}
