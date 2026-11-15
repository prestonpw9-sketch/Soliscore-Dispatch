package com.solidcoreplumb.dispatch;

import android.content.Context;
import android.os.Bundle;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.util.Log;
import android.webkit.WebView;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

/**
 * Capacitor's WebChromeClient leaves window.print() as a no-op in the Android
 * WebView. Install a subclass that opens the system print dialog (Letter)
 * without replacing file-chooser or permission behavior.
 */
public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        installTakeoffPrint();
    }

    private void installTakeoffPrint() {
        if (bridge == null || bridge.getWebView() == null) return;
        try {
            bridge.getWebView().setWebChromeClient(new PrintableChromeClient(bridge));
        } catch (RuntimeException error) {
            Log.w("MainActivity", "Takeoff print handler not installed", error);
        }
    }

    static final class PrintableChromeClient extends BridgeWebChromeClient {
        PrintableChromeClient(Bridge bridge) {
            super(bridge);
        }

        @Override
        public void onPrint(WebView view, PrintDocumentAdapter adapter) {
            PrintManager printManager = (PrintManager) view.getContext().getSystemService(Context.PRINT_SERVICE);
            if (printManager == null) return;
            String jobName = view.getTitle();
            if (jobName == null || jobName.trim().isEmpty()) jobName = "Takeoff materials";
            printManager.print(
                jobName,
                adapter,
                new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.NA_LETTER)
                    .build()
            );
        }
    }
}
