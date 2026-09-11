package com.example

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.app.ActivityCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

class MainActivity : ComponentActivity() {

  private var webView: WebView? = null
  private val channelId = "aix_flight_alerts"

  private val requestPermissionLauncher =
    registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted: Boolean ->
      if (isGranted) {
        Toast.makeText(this, "Flight alerts notifications enabled", Toast.LENGTH_SHORT).show()
      }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()

    createNotificationChannel()
    requestNotificationPermission()

    // Handle back button inside WebView
    onBackPressedDispatcher.addCallback(
      this,
      object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
          if (webView?.canGoBack() == true) {
            webView?.goBack()
          } else {
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
          }
        }
      }
    )

    setContent {
      Box(
        modifier = Modifier
          .fillMaxSize()
          .background(Color(0xFF070B14))
          .safeDrawingPadding()
      ) {
        AndroidView(
          modifier = Modifier.fillMaxSize(),
          factory = { context ->
            createConfiguredWebView(context).also { webView = it }
          }
        )
      }
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val name = "Flight Ops Alerts"
      val descriptionText = "Flight arrival and turnaround milestone alerts for COK"
      val importance = NotificationManager.IMPORTANCE_HIGH
      val channel = NotificationChannel(channelId, name, importance).apply {
        description = descriptionText
        enableVibration(true)
      }
      val notificationManager =
        getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      notificationManager.createNotificationChannel(channel)
    }
  }

  private fun requestNotificationPermission() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      if (ContextCompat.checkSelfPermission(
          this,
          Manifest.permission.POST_NOTIFICATIONS
        ) != PackageManager.PERMISSION_GRANTED
      ) {
        requestPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
      }
    }
  }

  @SuppressLint("SetJavaScriptEnabled")
  private fun createConfiguredWebView(context: Context): WebView {
    val view = WebView(context)
    val settings = view.settings

    settings.javaScriptEnabled = true
    settings.domStorageEnabled = true
    settings.allowFileAccess = true
    settings.allowContentAccess = true
    @Suppress("DEPRECATION")
    settings.allowFileAccessFromFileURLs = true
    @Suppress("DEPRECATION")
    settings.allowUniversalAccessFromFileURLs = true
    settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
    settings.useWideViewPort = true
    settings.loadWithOverviewMode = true
    settings.cacheMode = WebSettings.LOAD_DEFAULT

    view.setBackgroundColor(android.graphics.Color.parseColor("#070B14"))

    view.webChromeClient = object : WebChromeClient() {
      override fun onPermissionRequest(request: PermissionRequest?) {
        request?.grant(request.resources)
      }

      override fun onConsoleMessage(consoleMessage: android.webkit.ConsoleMessage?): Boolean {
        android.util.Log.d(
          "WebViewConsole",
          "${consoleMessage?.messageLevel()}: ${consoleMessage?.message()} (${consoleMessage?.sourceId()}:${consoleMessage?.lineNumber()})"
        )
        return true
      }
    }

    view.webViewClient = object : WebViewClient() {
      override fun shouldOverrideUrlLoading(
        view: WebView?,
        request: WebResourceRequest?
      ): Boolean {
        return false // Keep navigation inside webView
      }

      override fun onReceivedError(
        view: WebView?,
        request: WebResourceRequest?,
        error: android.webkit.WebResourceError?
      ) {
        android.util.Log.e("WebViewError", "Failed loading ${request?.url}: ${error?.description}")
      }
    }

    // Native Bridge for notifications & toast
    view.addJavascriptInterface(AndroidNativeBridge(this), "AndroidNative")

    // Load PWA entry point from assets
    view.loadUrl("file:///android_asset/public/index.html")

    return view
  }

  inner class AndroidNativeBridge(private val context: Context) {
    @JavascriptInterface
    fun showToast(message: String) {
      runOnUiThread {
        Toast.makeText(context, message, Toast.LENGTH_SHORT).show()
      }
    }

    @JavascriptInterface
    fun nativeFetch(targetUrl: String): String {
      return try {
        val url = java.net.URL(targetUrl)
        val conn = url.openConnection() as java.net.HttpURLConnection
        conn.requestMethod = "GET"
        conn.connectTimeout = 8000
        conn.readTimeout = 8000
        conn.instanceFollowRedirects = true
        conn.setRequestProperty(
          "User-Agent",
          "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
        )
        conn.setRequestProperty("Accept", "application/json, text/plain, */*")
        conn.setRequestProperty("Accept-Language", "en-US,en;q=0.9")
        val responseCode = conn.responseCode
        val stream = if (responseCode in 200..299) conn.inputStream else conn.errorStream
        val responseText = stream?.bufferedReader()?.use { it.readText() } ?: ""
        conn.disconnect()
        if (responseCode in 200..299) {
          responseText
        } else {
          "ERROR:$responseCode:$responseText"
        }
      } catch (e: Exception) {
        "EXCEPTION:${e.message}"
      }
    }

    @JavascriptInterface
    fun showNotification(title: String, message: String) {
      runOnUiThread {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
          ActivityCompat.checkSelfPermission(
            context,
            Manifest.permission.POST_NOTIFICATIONS
          ) == PackageManager.PERMISSION_GRANTED
        ) {
          val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setVibrate(longArrayOf(0, 250, 100, 250))
            .build()

          val notificationId = (System.currentTimeMillis() % 10000).toInt()
          NotificationManagerCompat.from(context).notify(notificationId, notification)
        }
      }
    }
  }

  override fun onDestroy() {
    webView?.destroy()
    webView = null
    super.onDestroy()
  }
}

@androidx.compose.runtime.Composable
fun Greeting(name: String, modifier: Modifier = Modifier) {
  androidx.compose.material3.Text(
    text = "AIX SEC OPS: $name",
    modifier = modifier
  )
}

