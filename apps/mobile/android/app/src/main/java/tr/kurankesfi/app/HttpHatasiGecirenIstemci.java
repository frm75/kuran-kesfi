package tr.kurankesfi.app;

import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.KkDinleyiciErisimi;
import com.getcapacitor.WebViewListener;
import java.util.List;

/**
 * Capacitor 8.6.2 BridgeWebViewClient.onReceivedHttpError ana cerceve icin
 * errorPath (offline.html) yukler; bu yuzden 404 ya da 5xx bile "cevrimdisi"
 * gorunurdu. Burada HTTP hatasinda dinleyiciler temel sinif gibi bilgilendirilir
 * ama errorPath YUKLENMEZ: sunucunun kendi hata sayfasi gorunur. Ag hatasi
 * (onReceivedError) temel davranista kalir ve offline.html acilir.
 */
public class HttpHatasiGecirenIstemci extends BridgeWebViewClient {
    private final Bridge bridge;

    public HttpHatasiGecirenIstemci(Bridge bridge) {
        super(bridge);
        this.bridge = bridge;
    }

    @Override
    public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse errorResponse) {
        // super cagrilmaz: BridgeWebViewClient errorPath yuklerdi; WebViewClient'in
        // kendi uygulamasi bostur.
        List<WebViewListener> dinleyiciler = KkDinleyiciErisimi.dinleyiciler(bridge);
        if (dinleyiciler != null) {
            for (WebViewListener d : dinleyiciler) {
                d.onReceivedHttpError(view);
            }
        }
    }
}
