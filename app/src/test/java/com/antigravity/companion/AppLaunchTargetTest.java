package com.antigravity.companion;

import java.util.List;
import org.junit.Test;
import static org.junit.Assert.*;

public class AppLaunchTargetTest {
    private final List<AppLaunchTarget.App> apps = List.of(
            new AppLaunchTarget.App("com.whatsapp", "WhatsApp"),
            new AppLaunchTarget.App("org.example.notes", "Notes"),
            new AppLaunchTarget.App("org.other.notes", "Notes"));

    @Test public void packageAndFixedShortcutResolveToInstalledLauncher() {
        assertEquals("com.whatsapp", AppLaunchTarget.resolve("com.whatsapp", apps));
        assertEquals("com.whatsapp", AppLaunchTarget.resolve(" واتساب ", apps));
        assertEquals("com.whatsapp", AppLaunchTarget.resolve("WHATSAPP", apps));
    }

    @Test public void ambiguousOrUnknownNameCannotChooseAnApp() {
        for (String target : new String[]{"Notes", "launch whatsapp now", "com.missing.app", "", "../com.whatsapp"}) {
            try { AppLaunchTarget.resolve(target, apps); fail("Unexpected launch selection: " + target); }
            catch (IllegalArgumentException expected) { assertNotNull(expected.getMessage()); }
        }
    }

    @Test public void packageIdentityPrecedesOtherApplicationsLabels() {
        List<AppLaunchTarget.App> namedLikePackage = List.of(
                new AppLaunchTarget.App("org.fake.one", "com.whatsapp"),
                new AppLaunchTarget.App("org.fake.two", "com.whatsapp"),
                new AppLaunchTarget.App("com.whatsapp", "WhatsApp"));
        assertEquals("com.whatsapp", AppLaunchTarget.resolve("com.whatsapp", namedLikePackage));
    }
}
