package ar.vale.projectorlauncher

import ar.vale.projectorlauncher.remote.FullControl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class FullControlTest {

    private val component = "ar.vale.projectorlauncher/ar.vale.projectorlauncher.remote.RemoteAccessibility"

    @Test
    fun `contrato - sin pantalla de Accesibilidad se muestran los dos comandos que activan Control total`() {
        val text = FullControl.adbCommands(component)
        assertTrue(text, text.contains("adb shell settings put secure enabled_accessibility_services $component"))
        assertTrue(text, text.contains("adb shell settings put secure accessibility_enabled 1"))
        assertTrue(text, text.contains("adb shell pm grant ar.vale.projectorlauncher android.permission.WRITE_SECURE_SETTINGS"))
    }

    @Test
    fun `volver a prenderlo suma el servicio sin borrar los de otras apps ni repetirlo`() {
        assertEquals(component, FullControl.withService(null, component))
        assertEquals(component, FullControl.withService("", component))
        assertEquals("otra/.S:$component", FullControl.withService("otra/.S", component))
        assertEquals("otra/.S:$component", FullControl.withService("otra/.S:$component", component))
    }

    @Test
    fun `contrato - el manifiesto pide el permiso que deja volver a prender Control total`() {
        val manifest = File("src/main/AndroidManifest.xml").readText()
        assertTrue(manifest.contains("android.permission.WRITE_SECURE_SETTINGS"))
    }

    @Test
    fun `contrato - pedir ADB para Control total avisa que hay que apagar la depuracion antes de reiniciar`() {
        val strings = File("src/main/res/values/strings.xml").readText()
        val text = Regex("""name="remote_full_adb">([^<]+)<""").find(strings)!!.groupValues[1]
        assertTrue(text, text.contains("Wi-Fi"))
        assertTrue(text, text.contains("antes de reiniciar"))
    }
}
