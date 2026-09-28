// android/app/src/main/java/jp/brainbox/app/MainActivity.java をこの内容に差し替える
// (registerPlugin()の行を追加しないとLocalNotifyPluginがAndroidに認識されない。
// iOS版のBridgeViewController.capacitorDidLoad()でのプラグイン登録と同じ役割)
package jp.brainbox.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(LocalNotifyPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
