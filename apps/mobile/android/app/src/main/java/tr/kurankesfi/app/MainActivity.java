package tr.kurankesfi.app;

import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import java.util.Collections;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "KuranSpike";

    // Spike: document-start enjeksiyonu CSP'ye takilir mi, window.Capacitor 0-JS
    // sayfalarda var mi? Sonuc `inj object /bakara-suresi/153` olmali.
    private static final String SPIKE_SCRIPT =
        "console.log('inj', typeof window.Capacitor, location.pathname);"
            + "console.log('inj-sw', 'serviceWorker' in navigator, "
            + "typeof navigator.serviceWorker);"
            + "document.addEventListener('DOMContentLoaded', function () {"
            + "console.log('inj-dcl', typeof window.Capacitor, location.pathname);"
            + "});";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = getBridge().getWebView();
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(
                webView,
                SPIKE_SCRIPT,
                Collections.singleton("https://kurankesfi.tr")
            );
            Log.i(TAG, "document-start script registered");
        } else {
            Log.w(TAG, "DOCUMENT_START_SCRIPT not supported by this WebView");
        }
    }
}
