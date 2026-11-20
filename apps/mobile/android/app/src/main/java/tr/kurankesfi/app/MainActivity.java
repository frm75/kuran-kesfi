package tr.kurankesfi.app;

import android.net.Uri;
import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;
import com.google.android.material.bottomnavigation.BottomNavigationView;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "KuranKesfi";
    private static final String ORIGIN = "https://kurankesfi.tr";
    private static final String HOST = "kurankesfi.tr";

    private BottomNavigationView altSerit;
    private String zamanlaJs = "";
    private boolean documentStartKayitli = false;
    /** Programatik secimin loadUrl tetiklememesi icin. */
    private boolean secimiBastir = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        final WebView webView = getBridge().getWebView();

        zamanlaJs = assetOku("public/zamanla.js");
        if (WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            WebViewCompat.addDocumentStartJavaScript(webView, zamanlaJs, Collections.singleton(ORIGIN));
            documentStartKayitli = true;
        } else {
            Log.w(TAG, "DOCUMENT_START_SCRIPT desteklenmiyor; onPageFinished yedegi kullanilacak");
        }

        altSerit = findViewById(R.id.alt_serit);
        // Alt sistem cubugu payini sekme seridi ustlenir; WebView'a alt pay gecmez.
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.kok), (v, insets) -> {
            Insets bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            altSerit.setPadding(bars.left, 0, bars.right, bars.bottom);
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(),
                    Insets.of(bars.left, bars.top, bars.right, 0))
                .build();
        });
        altSerit.setOnItemSelectedListener(item -> {
            if (!secimiBastir) {
                webView.loadUrl(ORIGIN + yolu(item.getItemId()));
            }
            return true;
        });

        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageLoaded(WebView view) {
                String url = view.getUrl();
                if (!documentStartKayitli && !zamanlaJs.isEmpty() && siteMi(url)) {
                    // Yedek: bayrak ayni sayfada ikinci calismayi engeller.
                    view.evaluateJavascript(zamanlaJs, null);
                }
                sekmeyiSec(url);
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView w = getBridge().getWebView();
                if (w.canGoBack()) {
                    w.goBack();
                } else {
                    finish();
                }
            }
        });
    }

    private static String yolu(int menuId) {
        if (menuId == R.id.sekme_ara) return "/ara";
        if (menuId == R.id.sekme_gunluk) return "/gunluk";
        if (menuId == R.id.sekme_ibadet) return "/ibadet";
        return "/";
    }

    private static boolean siteMi(String url) {
        if (url == null) return false;
        return HOST.equals(Uri.parse(url).getHost());
    }

    private static boolean yolAltinda(String yol, String kok) {
        return yol.equals(kok) || yol.startsWith(kok + "/");
    }

    private void sekmeyiSec(String url) {
        if (!siteMi(url)) return; // offline.html vb.: secimi degistirme
        String yol = Uri.parse(url).getPath();
        if (yol == null) yol = "/";
        int id = R.id.sekme_oku;
        if (yolAltinda(yol, "/ara")) id = R.id.sekme_ara;
        else if (yolAltinda(yol, "/gunluk")) id = R.id.sekme_gunluk;
        else if (yolAltinda(yol, "/ibadet")) id = R.id.sekme_ibadet;
        if (altSerit.getSelectedItemId() != id) {
            secimiBastir = true;
            altSerit.setSelectedItemId(id);
            secimiBastir = false;
        }
    }

    private String assetOku(String yol) {
        try (InputStream in = getAssets().open(yol)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] tampon = new byte[8192];
            int n;
            while ((n = in.read(tampon)) > 0) out.write(tampon, 0, n);
            return out.toString(StandardCharsets.UTF_8.name());
        } catch (IOException e) {
            Log.e(TAG, "zamanla.js okunamadi", e);
            return "";
        }
    }
}
