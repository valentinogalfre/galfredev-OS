package ar.vale.projectorlauncher.carrera

import ar.vale.projectorlauncher.R

/**
 * Gravedad en la pared (estilo G-Switch): la misma sala y el mismo puente que la carrera, con un
 * solo botón gigante en cada celular para invertir la gravedad.
 */
class GravedadActivity : CarreraActivity() {
    override val wallPage = "gravedad.html"
    override val phonePage = "gravedad-celu.html"
    override val offText = R.string.gravedad_off
    override val failedText = R.string.carrera_failed
    override val noWebViewText = R.string.gravedad_no_webview
}
