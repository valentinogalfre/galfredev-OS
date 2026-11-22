package ar.vale.projectorlauncher.remote

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.provider.Settings

/** Control total en los equipos que no traen la pantalla de Accesibilidad. */
internal object FullControl {

    /** Android lo saca de la lista cada vez que la app se detiene a la fuerza; se vuelve a poner al rato por si llega tarde. */
    private const val RETRY_MS = 10_000L

    /** El permiso se da una vez por ADB y sobrevive a las actualizaciones; con él, Control total no se pierde más. */
    fun adbCommands(component: String): String =
        "adb shell pm grant ${component.substringBefore('/')} ${Manifest.permission.WRITE_SECURE_SETTINGS}\n" +
            "adb shell settings put secure enabled_accessibility_services $component\n" +
            "adb shell settings put secure accessibility_enabled 1"

    fun component(context: Context): String = "${context.packageName}/${RemoteAccessibility::class.java.name}"

    /** Lo vuelve a prender si se apagó y la app tiene el permiso. Devuelve si quedó prendido. */
    fun ensure(context: Context): Boolean {
        if (context.checkSelfPermission(Manifest.permission.WRITE_SECURE_SETTINGS) != PackageManager.PERMISSION_GRANTED) return false
        val resolver = context.contentResolver
        val current = Settings.Secure.getString(resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
        val wanted = withService(current, component(context))
        return runCatching {
            if (wanted != current) Settings.Secure.putString(resolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES, wanted)
            if (Settings.Secure.getInt(resolver, Settings.Secure.ACCESSIBILITY_ENABLED, 0) != 1) {
                Settings.Secure.putInt(resolver, Settings.Secure.ACCESSIBILITY_ENABLED, 1)
            }
        }.isSuccess
    }

    fun install(context: Context) {
        val app = context.applicationContext
        ensure(app)
        Handler(Looper.getMainLooper()).postDelayed({ ensure(app) }, RETRY_MS)
    }

    /** La lista con el servicio sumado, sin tocar los de otras apps. */
    fun withService(current: String?, component: String): String {
        val services = current.orEmpty().split(':').map(String::trim).filter(String::isNotEmpty)
        if (services.any { it.equals(component, ignoreCase = true) }) return current.orEmpty()
        return (services + component).joinToString(":")
    }
}
