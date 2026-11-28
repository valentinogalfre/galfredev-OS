package ar.vale.projectorlauncher.carrera

import ar.vale.projectorlauncher.R

/**
 * Boxhead: Horda en la pared para hasta 6 jugadores: la misma sala y el mismo puente que la
 * carrera, con palanca y botón de disparo en cada celular.
 */
class BoxheadActivity : CarreraActivity() {
    override val wallPage = "boxhead.html"
    override val phonePage = "boxhead-celu.html"
    override val offText = R.string.boxhead_off
    override val failedText = R.string.carrera_failed
    override val noWebViewText = R.string.boxhead_no_webview
}
