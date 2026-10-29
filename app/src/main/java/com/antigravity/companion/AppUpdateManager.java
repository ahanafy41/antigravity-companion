package com.antigravity.companion;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.google.gson.JsonObject;
import com.google.gson.JsonElement;
import com.google.gson.JsonParser;
import com.google.gson.JsonParseException;
import java.io.File;
import java.io.InputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import okhttp3.Call;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

public final class AppUpdateManager implements AutoCloseable {
    private static final String RELEASE_URL = "https://api.github.com/repos/ahanafy41/antigravity-companion/releases/latest";
    private static final long MAX_APK_BYTES = 128L * 1024 * 1024;
    private final Context context;
    private final Handler mainThread = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean downloading = new AtomicBoolean();
    private volatile UpdateTransfer activeTransfer = new UpdateTransfer();
    private final OkHttpClient client;
    private volatile String checkedAsset = "";
    private volatile Call activeDownload;
    private volatile boolean closed;
    interface DownloadListener {
        void progress(int percent, long bytes, long total);
        void downloaded(File apk);
        void failed(String error);
    }
    AppUpdateManager(Context context) {
        this.context = context.getApplicationContext();
        client = new OkHttpClient.Builder().connectTimeout(20, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).callTimeout(280, TimeUnit.SECONDS)
                .addNetworkInterceptor(chain -> {
                    okhttp3.HttpUrl url = chain.request().url();
                    String host = url.host();
                    if (!url.isHttps() || url.port() != 443 || (!host.equals("api.github.com")
                            && !host.equals("github.com") && !host.equals("release-assets.githubusercontent.com")))
                        throw new IOException("Untrusted update redirect");
                    return chain.proceed(chain.request());
                }).build();
    }
    public String getCurrentVersionName() {
        try { return context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName; }
        catch (PackageManager.NameNotFoundException impossible) { throw new IllegalStateException(impossible); }
    }
    long currentVersionCode() {
        try { return versionCode(context.getPackageManager().getPackageInfo(context.getPackageName(), 0)); }
        catch (PackageManager.NameNotFoundException impossible) { throw new IllegalStateException(impossible); }
    }
    void checkForUpdates(Consumer<JsonObject> callback) {
        executor.execute(() -> {
            checkedAsset = "";
            try (Response response = client.newCall(new Request.Builder().url(RELEASE_URL)
                    .header("Accept", "application/vnd.github+json").build()).execute()) {
                if (!response.isSuccessful() || response.body() == null) throw new IOException("GitHub release check failed: " + response.code());
                JsonElement root = JsonParser.parseString(response.body().string());
                if (!root.isJsonObject()) throw new IOException("Malformed GitHub release");
                JsonObject release = root.getAsJsonObject();
                JsonObject update = releaseDescription(release);
                mainThread.post(() -> { if (!closed) callback.accept(update); });
            } catch (IOException | JsonParseException | IllegalArgumentException | IllegalStateException failure) {
                JsonObject error = new JsonObject(); error.addProperty("error", failure.getMessage());
                mainThread.post(() -> { if (!closed) callback.accept(error); });
            }
        });
    }
    private JsonObject releaseDescription(JsonObject release) throws IOException {
        if (!release.has("draft") || !release.has("prerelease") || !release.has("assets")
                || !release.get("assets").isJsonArray() || !release.get("draft").isJsonPrimitive()
                || !release.get("draft").getAsJsonPrimitive().isBoolean() || !release.get("prerelease").isJsonPrimitive()
                || !release.get("prerelease").getAsJsonPrimitive().isBoolean()) throw new IOException("Malformed GitHub release");
        if (release.get("draft").getAsBoolean() || release.get("prerelease").getAsBoolean())
            throw new IOException("Release is not stable");
        String tag = NativeActionArguments.required(release, "tag_name");
        JsonObject description = new JsonObject(); description.addProperty("latestVersion", tag);
        description.addProperty("currentVersion", getCurrentVersionName());
        description.addProperty("releaseName", release.has("name") && !release.get("name").isJsonNull() ? release.get("name").getAsString() : tag);
        description.addProperty("releaseNotes", release.has("body") && !release.get("body").isJsonNull() ? release.get("body").getAsString() : "");
        long size = 0;
        for (JsonElement entry : release.getAsJsonArray("assets")) {
            if (!entry.isJsonObject()) throw new IOException("Malformed release asset");
            JsonObject asset = entry.getAsJsonObject();
            if (!"app-release.apk".equals(NativeActionArguments.required(asset, "name"))) continue;
            String url = NativeActionArguments.required(asset, "browser_download_url");
            if (!UpdatePolicy.trustedAsset(url)) throw new IOException("Untrusted release APK URL");
            if (!asset.has("size") || !asset.get("size").isJsonPrimitive()
                    || !asset.get("size").getAsJsonPrimitive().isNumber()) throw new IOException("Missing APK size");
            size = asset.get("size").getAsLong();
            if (size < 1 || size > MAX_APK_BYTES) throw new IOException("Invalid release APK size");
            checkedAsset = url; break;
        }
        description.addProperty("apkSize", size);
        description.addProperty("hasUpdate", !checkedAsset.isEmpty() && isNewerVersion(tag, getCurrentVersionName()));
        return description;
    }
    static boolean isNewerVersion(String latest, String current) {
        if (latest == null || current == null) return false;
        String[] newer = latest.replaceFirst("^[vV]", "").split("[.+-]");
        String[] installed = current.replaceFirst("^[vV]", "").split("[.+-]");
        try {
            for (int index = 0; index < 3; index++) {
                int candidate = index < newer.length ? Integer.parseInt(newer[index]) : 0;
                int present = index < installed.length ? Integer.parseInt(installed[index]) : 0;
                if (candidate != present) return candidate > present;
            }
            return false;
        } catch (NumberFormatException invalid) { return false; }
    }
    void download(DownloadListener listener) {
        String url = checkedAsset;
        if (!UpdatePolicy.trustedAsset(url)) { listener.failed("Check the trusted release before downloading"); return; }
        if (!downloading.compareAndSet(false, true)) { listener.failed("An update download is already active"); return; }
        activeTransfer.cancel();
        UpdateTransfer transfer = new UpdateTransfer(); activeTransfer = transfer;
        executor.execute(() -> downloadCheckedAsset(url, listener, transfer));
    }
    private void downloadCheckedAsset(String url, DownloadListener listener, UpdateTransfer transfer) {
        File folder = new File(context.getCacheDir(), "apk_updates");
        File staging = new File(folder, "download.tmp");
        try {
            if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException("Cannot create update cache");
            if (closed) throw new IOException("Download cancelled");
            transfer.requireActive();
            activeDownload = client.newCall(new Request.Builder().url(url).build());
            try (Response response = activeDownload.execute()) {
                if (!response.isSuccessful() || response.body() == null) throw new IOException("APK download failed: " + response.code());
                streamApk(response.body(), staging, listener, transfer);
            }
            if (closed) throw new IOException("Download cancelled");
            transfer.requireActive();
            File apk = new File(folder, "app-release.apk");
            transfer.verifyThenPublish(() -> verifyApk(staging), () -> {
                if (apk.exists() && !apk.delete()) throw new IOException("Cannot replace cached APK");
                if (!staging.renameTo(apk)) throw new IOException("Cannot publish verified APK");
            });
            mainThread.post(() -> {
                if (closed) return;
                try { transfer.deliver(() -> listener.downloaded(apk)); }
                catch (IOException cancelled) { listener.failed(cancelled.getMessage()); }
            });
        } catch (IOException | IllegalArgumentException | IllegalStateException failure) {
            mainThread.post(() -> { if (!closed) listener.failed(failure.getMessage()); });
        } finally {
            if (staging.exists() && !staging.delete()) android.util.Log.w("CompanionUpdate", "Unable to remove staging APK");
            activeDownload = null; downloading.set(false);
        }
    }
    private void streamApk(ResponseBody body, File destination, DownloadListener listener, UpdateTransfer transfer) throws IOException {
        long total = body.contentLength(), count = 0, lastNotice = 0;
        if (total > MAX_APK_BYTES) throw new IOException("APK exceeds maximum size");
        try (InputStream input = body.byteStream(); FileOutputStream output = new FileOutputStream(destination)) {
            byte[] buffer = new byte[8192]; int read;
            while ((read = input.read(buffer)) != -1) {
                if (closed) throw new IOException("Download cancelled");
                transfer.requireActive();
                count += read; if (count > MAX_APK_BYTES) throw new IOException("APK exceeds maximum size");
                output.write(buffer, 0, read);
                if (count - lastNotice >= 65536 || count == total) {
                    postProgress(listener, count, total); lastNotice = count;
                }
            }
            output.getFD().sync();
        }
        if (count == 0 || (total >= 0 && count != total)) throw new IOException("Incomplete APK download");
        postProgress(listener, count, total);
    }
    private void postProgress(DownloadListener listener, long count, long total) {
        int percent = total > 0 ? (int) Math.min(100, count * 100 / total) : -1;
        mainThread.post(() -> { if (!closed) listener.progress(percent, count, total); });
    }
    private void verifyApk(File apk) throws IOException {
        PackageManager packages = context.getPackageManager();
        int flags = PackageManager.GET_SIGNATURES;
        if (Build.VERSION.SDK_INT >= 28) {
            flags |= PackageManager.GET_SIGNING_CERTIFICATES;
        }
        PackageInfo archive = packages.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (archive == null) throw new IOException("Downloaded APK cannot be verified");
        try {
            PackageInfo installed = packages.getPackageInfo(context.getPackageName(), flags);
            String rejection = UpdatePolicy.upgradeRejectionReason(
                    new UpdatePolicy.Release(installed.packageName, versionCode(installed), fingerprints(installed)),
                    new UpdatePolicy.Release(archive.packageName, versionCode(archive), fingerprints(archive)));
            if (rejection != null) {
                throw new IOException("APK package, versionCode or signing certificate does not match upgrade policy: " + rejection);
            }
        } catch (PackageManager.NameNotFoundException impossible) { throw new IOException("Installed package not found", impossible); }
    }
    private static String[] fingerprints(PackageInfo apk) throws IOException {
        Signature[] signatures = null;
        if (Build.VERSION.SDK_INT >= 28 && apk.signingInfo != null) {
            signatures = apk.signingInfo.hasMultipleSigners()
                    ? apk.signingInfo.getApkContentsSigners()
                    : apk.signingInfo.getSigningCertificateHistory();
        }
        if (signatures == null || signatures.length == 0) {
            signatures = apk.signatures;
        }
        if (signatures == null || signatures.length == 0) throw new IOException("APK has no signing certificate");
        try {
            String[] digests = new String[signatures.length];
            for (int index = 0; index < signatures.length; index++) {
                byte[] digest = MessageDigest.getInstance("SHA-256").digest(signatures[index].toByteArray());
                StringBuilder hex = new StringBuilder();
                for (byte octet : digest) hex.append(String.format(java.util.Locale.ROOT, "%02x", octet & 255));
                digests[index] = hex.toString();
            }
            return digests;
        } catch (NoSuchAlgorithmException impossible) { throw new AssertionError(impossible); }
    }
    private static long versionCode(PackageInfo apk) { return Build.VERSION.SDK_INT >= 28 ? apk.getLongVersionCode() : apk.versionCode; }
    boolean canInstallUnknownApps() { return Build.VERSION.SDK_INT < 26 || context.getPackageManager().canRequestPackageInstalls(); }
    void openInstallPermissionSettings(Activity activity) {
        if (Build.VERSION.SDK_INT >= 26) activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                .setData(Uri.parse("package:" + context.getPackageName())));
    }
    void installVerifiedApk(Activity activity, File apk, ServerConnection server, Consumer<JsonObject> completion) {
        UpdateTransfer transfer = activeTransfer;
        executor.execute(() -> {
            try {
                transfer.requireActive();
                verifyApk(apk);
                transfer.requireActive();
                try {
                    server.requireUpdateCompatibility(embeddedServerVersion(apk));
                } catch (IOException serverWarning) {
                    // Stale or standalone local server should not block installation of a verified APK
                }
                transfer.requireActive();
                mainThread.post(() -> {
                    if (closed || activity.isFinishing() || activity.isDestroyed()) return;
                    JsonObject outcome = new JsonObject();
                    try { transfer.deliver(() -> openVerifiedInstaller(activity, apk, transfer)); outcome.addProperty("installer_opened", true); }
                    catch (IOException failure) { outcome.addProperty("error", failure.getMessage()); }
                    completion.accept(outcome);
                });
            } catch (IOException | JsonParseException | IllegalArgumentException | IllegalStateException failure) {
                JsonObject outcome = new JsonObject(); outcome.addProperty("error", failure.getMessage());
                mainThread.post(() -> { if (!closed) completion.accept(outcome); });
            }
        });
    }
    private String embeddedServerVersion(File apk) throws IOException {
        PackageInfo archive = context.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
        if (archive == null) throw new IOException("Downloaded APK cannot be verified");
        try (ZipFile zip = new ZipFile(apk)) {
            ZipEntry entry = zip.getEntry("assets/server/version.json");
            if (entry == null) throw new IOException("APK has no embedded server version");
            try (InputStream input = zip.getInputStream(entry)) {
                byte[] bytes = new byte[4097];
                int count = 0, read;
                while (count < bytes.length && (read = input.read(bytes, count, bytes.length - count)) != -1) count += read;
                if (count > 4096) throw new IOException("Embedded server version exceeds limit");
                JsonObject version = JsonParser.parseString(new String(bytes, 0, count, StandardCharsets.UTF_8)).getAsJsonObject();
                String name = NativeActionArguments.required(version, "version_name");
                if (!UpdateCompatibility.embeddedVersionMatches(version, archive.versionName, versionCode(archive)))
                    throw new IOException("APK and embedded server versions differ");
                return name;
            }
        }
    }
    private void openVerifiedInstaller(Activity activity, File apk, UpdateTransfer transfer) throws IOException {
        if (!canInstallUnknownApps()) throw new IOException("Install permission is required");
        File expected = new File(context.getCacheDir(), "apk_updates/app-release.apk");
        if (!expected.getCanonicalFile().equals(apk.getCanonicalFile())) throw new IOException("Unexpected APK path");
        verifyApk(apk);
        transfer.requireActive();
        Uri uri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apk);
        try { activity.startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)); }
        catch (ActivityNotFoundException | SecurityException failure) { throw new IOException("Package installer unavailable", failure); }
    }
    void cancelDownload() { activeTransfer.cancel(); Call download = activeDownload; if (download != null) download.cancel(); }
    @Override public void close() {
        closed = true; cancelDownload(); executor.shutdownNow(); mainThread.removeCallbacksAndMessages(null);
        client.dispatcher().cancelAll(); client.dispatcher().executorService().shutdown(); client.connectionPool().evictAll();
    }
}
