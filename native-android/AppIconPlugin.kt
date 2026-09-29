// Android Studioで android/app/src/main/java/jp/brainbox/app/ に追加するファイル
// iOS版AppIconPlugin.swiftのAndroid移植。プラグイン名をAppIconPluginで揃えているため、
// src/app/components/AppIcon.tsは無改修で動く。
//
// 【iOSとの構造的な違い】iOSはUIApplication.setAlternateIconName()で1つのAPI呼び出しだけで
// 切り替えられるが、Androidには相当するAPIが無い。代わりに<activity-alias>（AndroidManifest.xmlに
// 事前宣言する、MainActivityを指す「別名」コンポーネント。それぞれ別のandroid:iconを持てる）を
// アイコンの色数ぶん用意しておき、PackageManager.setComponentEnabledSetting()で「どのエイリアスを
// 有効にするか」を切り替える方式を取る（ホーム画面には有効化されているエイリアス/MainActivity本体
// のうち、LAUNCHERのintent-filterを持つ有効なコンポーネントのアイコンが表示される）。
// エイリアスの宣言はAppIconManifest.snippet.xmlを参照。ALIAS_SUFFIXESのキー・クラス名の対応は
// マニフェスト側の<activity-alias android:name=".MainActivityAlias${suffix}">と完全に一致させること
package jp.brainbox.app

import android.content.ComponentName
import android.content.pm.PackageManager
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "AppIconPlugin")
class AppIconPlugin : Plugin() {
    companion object {
        // "mint"はMainActivity自身（プライマリアイコン、エイリアス無し）。他8色はエイリアス経由
        val ALIAS_SUFFIXES = mapOf(
            "sage" to "Sage", "lilac" to "Lilac", "rose" to "Rose", "dusty" to "Dusty",
            "apricot" to "Apricot", "greige" to "Greige", "charcoal" to "Charcoal", "mocha" to "Mocha"
        )
    }

    @PluginMethod
    fun setAppIcon(call: PluginCall) {
        val name = call.getString("name")
        if (name == null) { call.reject("name is required"); return }
        if (name != "mint" && !ALIAS_SUFFIXES.containsKey(name)) { call.reject("unknown icon name"); return }

        val pm = context.packageManager
        val pkg = context.packageName
        try {
            // MainActivity本体はmint選択時のみ有効化（コンポーネントの無効化でアプリのプロセスが
            // 再起動されないよう、DONT_KILL_APPを必ず指定する）
            pm.setComponentEnabledSetting(
                ComponentName(pkg, "$pkg.MainActivity"),
                if (name == "mint") PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP
            )
            ALIAS_SUFFIXES.forEach { (key, suffix) ->
                pm.setComponentEnabledSetting(
                    ComponentName(pkg, "$pkg.MainActivityAlias$suffix"),
                    if (key == name) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                    PackageManager.DONT_KILL_APP
                )
            }
            call.resolve()
        } catch (e: Exception) {
            // AndroidManifest.xmlにエイリアスが未宣言の場合（Android Studioでの手動セットアップ未実施時）
            // はここで例外になるが、アプリ全体をクラッシュさせずWeb側の選択状態のみ残す
            call.reject(e.message ?: "failed to set app icon")
        }
    }
}
