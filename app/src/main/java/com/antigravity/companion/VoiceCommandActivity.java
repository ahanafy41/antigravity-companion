package com.antigravity.companion;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

public final class VoiceCommandActivity extends Activity {
    private VoiceCapture capture;
    @Override protected void onCreate(Bundle savedState) {
        super.onCreate(savedState);
        LinearLayout panel = new LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL);
        boolean agentMode = getIntent().getBooleanExtra("voice_agent", false);
        TextView label = new TextView(this);
        label.setText(agentMode ? "تحدث بأمر للتحكم بالجهاز. الإلغاء يوقف التقاط الصوت."
                : "تحدث لإملاء رسالتك. لا تُرسل حتى تعتمدها.");
        Button cancel = new Button(this); cancel.setText(agentMode ? "إلغاء الأمر الصوتي" : "إلغاء الإملاء");
        panel.addView(label); panel.addView(cancel); setContentView(panel);
        capture = new VoiceCapture(this); cancel.setOnClickListener(view -> { capture.cancel(); finish(); });
        capture.start(speech -> {
            if (!speech.has("error")) startActivity(new Intent(this, MainActivity.class)
                    .putExtra("voice_text", speech.get("text").getAsString())
                    .putExtra("voice_agent", agentMode)
                    .putExtra("voice_task_id", speech.get("task_id").getAsString())
                    .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP));
            else android.widget.Toast.makeText(this, speech.get("error").getAsString(), android.widget.Toast.LENGTH_LONG).show();
            finish();
        });
    }
    @Override protected void onDestroy() { if (capture != null) capture.close(); super.onDestroy(); }
}
