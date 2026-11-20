package com.getcapacitor;

import java.util.List;

/**
 * Bridge.getWebViewListeners() paket ici; uygulamanin BridgeWebViewClient alt
 * sinifi dinleyicileri temel sinif gibi bilgilendirebilsin diye ayni pakette
 * duran ince erisim.
 */
public final class KkDinleyiciErisimi {
    private KkDinleyiciErisimi() {}

    public static List<WebViewListener> dinleyiciler(Bridge bridge) {
        return bridge.getWebViewListeners();
    }
}
