package ar.vale.projectorlauncher

import android.app.Application
import ar.vale.projectorlauncher.remote.FullControl

class GdApp : Application() {
    override fun onCreate() {
        super.onCreate()
        Zone.install(this)
        FullControl.install(this)
    }
}
