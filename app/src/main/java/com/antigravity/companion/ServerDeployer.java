package com.antigravity.companion;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

public final class ServerDeployer {
    public static final String BUNDLE_ZIP_NAME = "companion-server-update.zip";

    private ServerDeployer() {}

    public static boolean exportServerBundle(Context context) {
        File downloadDir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
        if (downloadDir == null) return false;
        if (!downloadDir.exists() && !downloadDir.mkdirs()) {
            // If cannot create directory, fallback to media store
        }

        File targetFile = new File(downloadDir, BUNDLE_ZIP_NAME);
        File tempFile = new File(downloadDir, BUNDLE_ZIP_NAME + ".tmp");

        try {
            OutputStream out = null;
            try {
                out = new FileOutputStream(tempFile);
            } catch (Exception directFail) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, BUNDLE_ZIP_NAME);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, "application/zip");
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    Uri uri = context.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri != null) {
                        out = context.getContentResolver().openOutputStream(uri);
                    }
                }
            }

            if (out == null) return false;

            try (ZipOutputStream zos = new ZipOutputStream(out)) {
                zipAssetFolder(context, "server", "", zos);
                zos.finish();
                zos.flush();
            }

            if (tempFile.exists()) {
                if (targetFile.exists()) targetFile.delete();
                if (!tempFile.renameTo(targetFile)) {
                    // Try copying if rename fails
                    try (InputStream in = new java.io.FileInputStream(tempFile);
                         OutputStream targetOut = new FileOutputStream(targetFile)) {
                        byte[] buf = new byte[8192];
                        int r;
                        while ((r = in.read(buf)) > 0) targetOut.write(buf, 0, r);
                    }
                    tempFile.delete();
                }
            }
            return targetFile.exists() && targetFile.length() > 0;
        } catch (Exception e) {
            if (tempFile.exists()) tempFile.delete();
            return false;
        }
    }

    private static void zipAssetFolder(Context context, String assetPath, String zipPath, ZipOutputStream zos) throws Exception {
        String[] list = context.getAssets().list(assetPath);
        if (list == null || list.length == 0) {
            // It's a single file
            try (InputStream in = context.getAssets().open(assetPath)) {
                ZipEntry entry = new ZipEntry(zipPath.isEmpty() ? assetPath : zipPath);
                zos.putNextEntry(entry);
                byte[] buffer = new byte[8192];
                int len;
                while ((len = in.read(buffer)) > 0) {
                    zos.write(buffer, 0, len);
                }
                zos.closeEntry();
            }
        } else {
            // It's a directory
            for (String file : list) {
                String subAsset = assetPath.isEmpty() ? file : assetPath + "/" + file;
                String subZip = zipPath.isEmpty() ? file : zipPath + "/" + file;
                zipAssetFolder(context, subAsset, subZip, zos);
            }
        }
    }
}
