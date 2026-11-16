package com.tradepilot.app

import android.app.Application
import com.tradepilot.app.data.Prefs

class TradePilotApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        Prefs.init(this)
    }
}
