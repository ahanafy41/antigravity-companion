import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.Signature;

/** Signs release bytes without exporting a private key. */
public final class ReleaseSigner {
    public static void main(String[] args) throws Exception {
        if (args.length != 4) {
            throw new IllegalArgumentException("Usage: ReleaseSigner.java keystore manifest signature certificate");
        }
        String storePassword = required("SIGNING_STORE_PASSWORD");
        String keyPassword = required("SIGNING_KEY_PASSWORD");
        String alias = required("SIGNING_KEY_ALIAS");
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (var input = Files.newInputStream(Path.of(args[0]))) {
            store.load(input, storePassword.toCharArray());
        }
        byte[] expectedCertificate = Files.readAllBytes(Path.of(args[3]));
        if (!java.security.MessageDigest.isEqual(expectedCertificate, store.getCertificate(alias).getEncoded())) {
            throw new IllegalArgumentException("Signing alias does not match the release certificate");
        }
        PrivateKey key = (PrivateKey) store.getKey(alias, keyPassword.toCharArray());
        if (key == null || !"RSA".equals(key.getAlgorithm())) {
            throw new IllegalArgumentException("An RSA release signing key is required");
        }
        Signature signer = Signature.getInstance("SHA256withRSA");
        signer.initSign(key);
        signer.update(Files.readAllBytes(Path.of(args[1])));
        Files.write(Path.of(args[2]), signer.sign());
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isEmpty()) {
            throw new IllegalArgumentException("Missing signing environment variable: " + name);
        }
        return value;
    }
}
