package com.antigravity.companion;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.speech.RecognizerIntent;
import android.widget.Toast;

import java.util.ArrayList;
import java.util.Locale;
import java.util.logging.Logger;

/**
 * VoiceCommandActivity: Transparent proxy activity that safely triggers system voice recognition
 * with full modern Android privacy compliance (microphone audio handled via foreground activity).
 */
public class VoiceCommandActivity extends Activity {

    private static final Logger LOGGER = Logger.getLogger(VoiceCommandActivity.class.getName());
    private static final int REQUEST_CODE_SPEECH = 101;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ar-EG");
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "ar-EG");
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "تحدث بأمرك لمساعد Antigravity...");

        try {
            startActivityForResult(intent, REQUEST_CODE_SPEECH);
        } catch (ActivityNotFoundException e) {
            LOGGER.warning("Speech recognition activity not found on this device.");
            Toast.makeText(this, "محرك الإدخال الصوتي غير متوفر على جهازك", Toast.LENGTH_SHORT).show();
            finish();
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == REQUEST_CODE_SPEECH && resultCode == RESULT_OK && data != null) {
            ArrayList<String> results = data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (results != null && !results.isEmpty()) {
                String spokenText = results.get(0);
                LOGGER.info("Voice Input Captured: " + spokenText);

                FloatingVoiceController controller = FloatingVoiceController.getInstance();
                if (controller != null) {
                    controller.processVoiceCommand(spokenText);
                }
            }
        }
        finish();
    }
}
