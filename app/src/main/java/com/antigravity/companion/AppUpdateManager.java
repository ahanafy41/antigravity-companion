package com.antigravity.companion;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * AppUpdateManager: Native OTA In-App Update Engine for Antigravity Companion.
 * Handles GitHub Releases querying, SemVer comparison, OkHttp streaming APK download,
 * atomic replacement in cache, unknown app installation permission verification,
 * and secure system package installer invocation via FileProvider.
 */
public class AppUpdateManager {

    private static final Logger LOGGER = Logger.getLogger(AppUpdateManager.class.getName());

    public static final String GITHUB_RELEASES_LATEST_URL =
            "https://api.github.com/repos/ahanafy41/antigravity-companion/releases/latest";

    private static final String UPDATE_DIR_NAME = "apk_updates";
    private static final String TEMP_APK_NAME = "update_download.tmp";
    public static final String TARGET_APK_NAME = "app-release.apk";

    private static volatile AppUpdateManager sInstance;

    private final Context mContext;
    private final Handler mMainHandler;
    private final ExecutorService mExecutor;
    private final OkHttpClient mHttpClient;

    public static class UpdateInfo {
        public final boolean hasUpdate;
        public final String latestVersion;
        public final String currentVersion;
        public final String downloadUrl;
        public final String releaseName;
        public final String releaseNotes;
        public final long apkSize;

        public UpdateInfo(boolean hasUpdate, String latestVersion, String currentVersion,
                          String downloadUrl, String releaseName, String releaseNotes, long apkSize) {
            this.hasUpdate = hasUpdate;
            this.latestVersion = latestVersion;
            this.currentVersion = currentVersion;
            this.downloadUrl = downloadUrl;
            this.releaseName = releaseName != null ? releaseName : "";
            this.releaseNotes = releaseNotes != null ? releaseNotes : "";
            this.apkSize = apkSize;
        }

        public JsonObject toJsonObject() {
            JsonObject json = new JsonObject();
            json.addProperty("hasUpdate", hasUpdate);
            json.addProperty("latestVersion", latestVersion);
            json.addProperty("currentVersion", currentVersion);
            json.addProperty("downloadUrl", downloadUrl);
            json.addProperty("releaseName", releaseName);
            json.addProperty("releaseNotes", releaseNotes);
            json.addProperty("apkSize", apkSize);
            return json;
        }
    }

    public interface CheckUpdateCallback {
        void onSuccess(UpdateInfo info);
        void onError(String error);
    }

    public interface DownloadProgressListener {
        void onProgress(int percent, long bytesDownloaded, long totalBytes);
        void onComplete(File apkFile);
        void onError(String error);
    }

    private AppUpdateManager(Context context) {
        this.mContext = context.getApplicationContext();
        this.mMainHandler = new Handler(Looper.getMainLooper());
        this.mExecutor = Executors.newSingleThreadExecutor();
        this.mHttpClient = new OkHttpClient.Builder()
                .connectTimeout(20, TimeUnit.SECONDS)
                .readTimeout(60, TimeUnit.SECONDS)
                .followRedirects(true)
                .followSslRedirects(true)
                .build();
    }

    public static AppUpdateManager getInstance(Context context) {
        if (sInstance == null) {
            synchronized (AppUpdateManager.class) {
                if (sInstance == null) {
                    sInstance = new AppUpdateManager(context);
                }
            }
        }
        return sInstance;
    }

    /**
     * Retrieves the installed application version name.
     */
    public String getCurrentVersionName() {
        try {
            PackageInfo pInfo = mContext.getPackageManager().getPackageInfo(mContext.getPackageName(), 0);
            if (pInfo.versionName != null && !pInfo.versionName.trim().isEmpty()) {
                return pInfo.versionName.trim();
            }
        } catch (PackageManager.NameNotFoundException e) {
            LOGGER.log(Level.WARNING, "Unable to resolve current package version name", e);
        }
        return "1.1.0";
    }

    /**
     * Compares two semantic version strings (SemVer).
     * Returns true if latestVersion is strictly greater than currentVersion.
     */
    public static boolean isNewerVersion(String latestVersion, String currentVersion) {
        if (latestVersion == null || currentVersion == null) {
            return false;
        }

        int[] vLatest = parseSemVer(latestVersion);
        int[] vCurrent = parseSemVer(currentVersion);

        int maxLen = Math.max(vLatest.length, vCurrent.length);
        for (int i = 0; i < maxLen; i++) {
            int partLatest = i < vLatest.length ? vLatest[i] : 0;
            int partCurrent = i < vCurrent.length ? vCurrent[i] : 0;
            if (partLatest > partCurrent) {
                return true;
            } else if (partLatest < partCurrent) {
                return false;
            }
        }
        return false;
    }

    private static int[] parseSemVer(String versionStr) {
        if (versionStr == null) {
            return new int[]{0};
        }
        String cleaned = versionStr.trim();
        if (cleaned.startsWith("v") || cleaned.startsWith("V")) {
            cleaned = cleaned.substring(1).trim();
        }
        int dashIdx = cleaned.indexOf('-');
        if (dashIdx > 0) {
            cleaned = cleaned.substring(0, dashIdx);
        }
        int plusIdx = cleaned.indexOf('+');
        if (plusIdx > 0) {
            cleaned = cleaned.substring(0, plusIdx);
        }

        String[] tokens = cleaned.split("\\.");
        int[] result = new int[tokens.length];
        for (int i = 0; i < tokens.length; i++) {
            Matcher matcher = Pattern.compile("^(\\d+)").matcher(tokens[i].trim());
            if (matcher.find()) {
                try {
                    result[i] = Integer.parseInt(matcher.group(1));
                } catch (NumberFormatException e) {
                    result[i] = 0;
                }
            } else {
                result[i] = 0;
            }
        }
        return result;
    }

    /**
     * Asynchronously queries GitHub Releases for the latest update.
     */
    public void checkForUpdatesAsync(final CheckUpdateCallback callback) {
        mExecutor.execute(new Runnable() {
            @Override
            public void run() {
                try {
                    Request request = new Request.Builder()
                            .url(GITHUB_RELEASES_LATEST_URL)
                            .header("User-Agent", "Antigravity-Companion-App")
                            .header("Accept", "application/vnd.github.v3+json")
                            .build();

                    try (Response response = mHttpClient.newCall(request).execute()) {
                        if (!response.isSuccessful() || response.body() == null) {
                            final String err = "GitHub API response error: " + response.code();
                            postError(callback, err);
                            return;
                        }

                        String responseBodyStr = response.body().string();
                        JsonObject releaseJson = JsonParser.parseString(responseBodyStr).getAsJsonObject();

                        String rawTag = releaseJson.has("tag_name") && !releaseJson.get("tag_name").isJsonNull()
                                ? releaseJson.get("tag_name").getAsString() : "";
                        String releaseName = releaseJson.has("name") && !releaseJson.get("name").isJsonNull()
                                ? releaseJson.get("name").getAsString() : rawTag;
                        String releaseBody = releaseJson.has("body") && !releaseJson.get("body").isJsonNull()
                                ? releaseJson.get("body").getAsString() : "";

                        String normalizedTag = rawTag.startsWith("v") || rawTag.startsWith("V")
                                ? rawTag.substring(1) : rawTag;

                        String downloadUrl = "";
                        long apkSize = 0;

                        if (releaseJson.has("assets") && releaseJson.get("assets").isJsonArray()) {
                            JsonArray assets = releaseJson.getAsJsonArray("assets");
                            for (JsonElement elem : assets) {
                                if (elem.isJsonObject()) {
                                    JsonObject asset = elem.getAsJsonObject();
                                    String assetName = asset.has("name") ? asset.get("name").getAsString() : "";
                                    if (assetName.endsWith(".apk")) {
                                        downloadUrl = asset.has("browser_download_url")
                                                ? asset.get("browser_download_url").getAsString() : "";
                                        apkSize = asset.has("size") ? asset.get("size").getAsLong() : 0;
                                        break;
                                    }
                                }
                            }
                        }

                        String currentVersion = getCurrentVersionName();
                        boolean hasUpdate = isNewerVersion(normalizedTag, currentVersion);

                        final UpdateInfo updateInfo = new UpdateInfo(
                                hasUpdate,
                                normalizedTag,
                                currentVersion,
                                downloadUrl,
                                releaseName,
                                releaseBody,
                                apkSize
                        );

                        mMainHandler.post(new Runnable() {
                            @Override
                            public void run() {
                                if (callback != null) {
                                    callback.onSuccess(updateInfo);
                                }
                            }
                        });
                    }
                } catch (final Exception e) {
                    LOGGER.log(Level.SEVERE, "Failed to query GitHub Releases", e);
                    postError(callback, "فشل الاستعلام عن التحديثات: " + e.getMessage());
                }
            }
        });
    }

    private void postError(final CheckUpdateCallback callback, final String errorMsg) {
        mMainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (callback != null) {
                    callback.onError(errorMsg);
                }
            }
        });
    }

    /**
     * Downloads APK from URL with streaming progress reporting and atomic cache replacement.
     */
    public void startDownloadAsync(final String downloadUrl, final DownloadProgressListener listener) {
        if (downloadUrl == null || downloadUrl.trim().isEmpty()) {
            if (listener != null) {
                listener.onError("رابط التنزيل غير صالح");
            }
            return;
        }

        mExecutor.execute(new Runnable() {
            @Override
            public void run() {
                File cacheDir = new File(mContext.getCacheDir(), UPDATE_DIR_NAME);
                if (!cacheDir.exists() && !cacheDir.mkdirs()) {
                    postDownloadError(listener, "تعذر إنشاء مجلد التحديثات");
                    return;
                }

                File tempFile = new File(cacheDir, TEMP_APK_NAME);
                final File targetFile = new File(cacheDir, TARGET_APK_NAME);

                if (tempFile.exists() && !tempFile.delete()) {
                    LOGGER.warning("Could not delete existing temp APK file");
                }

                Request request = new Request.Builder()
                        .url(downloadUrl)
                        .header("User-Agent", "Antigravity-Companion-App")
                        .header("Accept", "application/octet-stream")
                        .build();

                try (Response response = mHttpClient.newCall(request).execute()) {
                    if (!response.isSuccessful()) {
                        postDownloadError(listener, "فشل تنزيل ملف التحديث: كود " + response.code());
                        return;
                    }

                    ResponseBody body = response.body();
                    if (body == null) {
                        postDownloadError(listener, "محتوى التحديث فارغ");
                        return;
                    }

                    final long totalBytes = body.contentLength();
                    long bytesDownloaded = 0;
                    byte[] buffer = new byte[8192];
                    int read;

                    int lastReportedPercent = -1;

                    try (InputStream is = body.byteStream();
                         FileOutputStream fos = new FileOutputStream(tempFile)) {

                        while ((read = is.read(buffer)) != -1) {
                            fos.write(buffer, 0, read);
                            bytesDownloaded += read;

                            int currentPercent = totalBytes > 0
                                    ? (int) ((bytesDownloaded * 100) / totalBytes)
                                    : -1;

                            if (currentPercent != lastReportedPercent && currentPercent >= 0) {
                                lastReportedPercent = currentPercent;
                                postProgress(listener, currentPercent, bytesDownloaded, totalBytes);
                            }
                        }
                        fos.flush();
                    }

                    // Atomic replacement of target file
                    if (targetFile.exists() && !targetFile.delete()) {
                        LOGGER.warning("Could not delete old target APK file before rename");
                    }

                    if (!tempFile.renameTo(targetFile)) {
                        postDownloadError(listener, "تعذر حفظ حزمة التحديث النهائية");
                        return;
                    }

                    // Final 100% progress and completion
                    postProgress(listener, 100, targetFile.length(), targetFile.length());
                    mMainHandler.post(new Runnable() {
                        @Override
                        public void run() {
                            if (listener != null) {
                                listener.onComplete(targetFile);
                            }
                        }
                    });

                } catch (final Exception e) {
                    LOGGER.log(Level.SEVERE, "Error while downloading update APK", e);
                    postDownloadError(listener, "خطأ أثناء تنزيل التحديث: " + e.getMessage());
                }
            }
        });
    }

    private void postProgress(final DownloadProgressListener listener, final int percent,
                              final long bytesDownloaded, final long totalBytes) {
        mMainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (listener != null) {
                    listener.onProgress(percent, bytesDownloaded, totalBytes);
                }
            }
        });
    }

    private void postDownloadError(final DownloadProgressListener listener, final String error) {
        mMainHandler.post(new Runnable() {
            @Override
            public void run() {
                if (listener != null) {
                    listener.onError(error);
                }
            }
        });
    }

    /**
     * Checks whether the application has permission to install unknown packages.
     */
    public boolean canInstallUnknownApps() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return mContext.getPackageManager().canRequestPackageInstalls();
        }
        return true;
    }

    /**
     * Directs user to Unknown Apps Install Settings.
     */
    public void openInstallPermissionSettings(Activity activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + mContext.getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                if (activity != null) {
                    activity.startActivity(intent);
                } else {
                    mContext.startActivity(intent);
                }
            } catch (Exception e) {
                LOGGER.log(Level.WARNING, "Failed to launch unknown sources settings", e);
            }
        }
    }

    /**
     * Triggers the Android system package installer for the downloaded APK via FileProvider.
     */
    public boolean installApk(File apkFile) {
        if (apkFile == null || !apkFile.exists()) {
            LOGGER.warning("Install failed: target APK file does not exist");
            return false;
        }

        try {
            Uri apkUri = FileProvider.getUriForFile(
                    mContext,
                    mContext.getPackageName() + ".fileprovider",
                    apkFile
            );

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            mContext.startActivity(installIntent);
            return true;
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to launch package installer for APK", e);
            return false;
        }
    }

    /**
     * Helper to install the default downloaded APK in cache if it exists.
     */
    public boolean installDownloadedUpdate() {
        File cacheDir = new File(mContext.getCacheDir(), UPDATE_DIR_NAME);
        File targetFile = new File(cacheDir, TARGET_APK_NAME);
        return installApk(targetFile);
    }
}
