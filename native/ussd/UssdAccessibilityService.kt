package com.feeflow.app.ussd

import android.accessibilityservice.AccessibilityService
import android.os.Bundle
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class UssdAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "UssdService"

        @Volatile
        private var instance: UssdAccessibilityService? = null

        @Volatile
        var isSessionEnding: Boolean = false
            private set

        @Volatile
        private var armed: Boolean = false

        @Volatile
        private var lastEmittedText: String = ""

        @Volatile
        private var pendingPin: String? = null

        @Volatile
        private var pinAlreadyInjected: Boolean = false

        @Volatile
        var sessionId: Int = 0
            private set

        /** Called by the module right before dialing. */
        fun arm() {
            sessionId += 1
            armed = true
            isSessionEnding = false
            lastEmittedText = ""
            pinAlreadyInjected = false
            Log.d(TAG, "armed")
        }

        /** Called from JS to set the PIN that should be auto-injected. */
        fun setPendingPin(pin: String) {
            pendingPin = pin
            pinAlreadyInjected = false
            Log.d(TAG, "pending PIN set (${pin.length} chars)")
        }

        /** Called from JS to clear the pending PIN. */
        fun clearPendingPin() {
            pendingPin = null
            pinAlreadyInjected = false
            Log.d(TAG, "pending PIN cleared")
        }

        /**
         * NEW. Called from JS between runner jobs: forget ALL session state so nothing
         * from the previous job can leak into the next one, and optionally close any
         * leftover USSD dialog that is still on screen.
         */
        fun reset(dismiss: Boolean) {
            sessionId += 1
            armed = false
            isSessionEnding = false
            lastEmittedText = ""
            pendingPin = null
            pinAlreadyInjected = false
            Log.d(TAG, "reset (dismiss=$dismiss)")
            if (dismiss) instance?.dismissUssdDialog()
        }

        /** Called from JS when the user submits their PIN / choice. */
        fun submitResponse(text: String): Boolean {
            val svc = instance ?: return false
            return svc.performSubmit(text)
        }

        /** Called from JS to know if the accessibility service is running. */
        fun isConnected(): Boolean = instance != null
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.d(TAG, "service connected")
    }

    override fun onDestroy() {
        instance = null
        super.onDestroy()
    }

    override fun onInterrupt() {
        // No-op — required by the API
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (!armed) return

        // ---- Ignore events from our own app ----
        val sourcePackage = event.packageName?.toString() ?: ""
        if (sourcePackage == applicationContext.packageName) return

        val root = rootInActiveWindow ?: return

        // Double-check root window is not ours either
        val rootPackage = root.packageName?.toString() ?: ""
        if (rootPackage == applicationContext.packageName) return

        val allText = collectText(root).trim()
        if (allText.isEmpty()) return

        // Reject anything that looks like our own UI
        if (
            allText.contains("Choose SIM", ignoreCase = true) ||
            allText.contains("CHECK BALANCE", ignoreCase = true) ||
            allText.contains("SEND MONEY", ignoreCase = true) ||
            allText.contains("Recipient number", ignoreCase = true) ||
            allText.contains("API URL", ignoreCase = true) ||
            allText.contains("Auto-submitted PIN", ignoreCase = true) ||
            allText.contains("Complete the dialog", ignoreCase = true)
        ) {
            return
        }

        val lower = allText.lowercase()
        // Only handle foreground phone UI; never type PIN into an unrelated app.
        val phoneUi = listOf("phone", "dialer", "telecom", "ussd").any {
            rootPackage.contains(it, ignoreCase = true)
        }
        if (!phoneUi) return

        // ---- Auto-PIN injection ----
        val looksLikePinPrompt = listOf(
            "enter pin", "enter your pin", "geli pin", "geli lambarkaaga sirta",
            "pin-kaaga", "enter password"
        ).any { lower.contains(it) }

        val looksLikePinError =
            lower.contains("pin code length") ||
            lower.contains("wrong pin") ||
            lower.contains("invalid pin") ||
            lower.contains("incorrect pin") ||
            lower.contains("pin-kaaga waa khalad")

        if (
            looksLikePinPrompt &&
            !looksLikePinError &&
            !pinAlreadyInjected
        ) {
            val pin = pendingPin
            if (!pin.isNullOrBlank()) {
                val ok = performSubmit(pin)
                Log.d(TAG, "PIN injection attempt: ok=$ok pkg=$rootPackage pinLen=${pin.length}")
                if (ok) {
                    pinAlreadyInjected = true
                    // Emit so JS knows the flow is progressing
                    UssdBridgeModule.instance?.onUssdReply(allText, false)
                }
                return // don't emit the PIN prompt text — we already handled it
            } else {
                Log.d(TAG, "PIN prompt seen but NO pending PIN is set")
            }
        }

        // ---- Session end detection ----
        val ending = lower.contains("session ended") ||
            lower.contains("cancelled") ||
            lower.contains("canceled") ||
            lower.contains("request completed") ||
            lower.contains("ayaad uwareejisay") ||
            lower.contains("waa la diray") ||
            lower.contains("mahadsanid") ||
            lower.contains("cannot transfer") ||
            lower.contains("same account") ||
            lower.contains("pin code length") ||
            lower.contains("wrong pin") ||
            lower.contains("invalid pin") ||
            lower.contains("failed")

        if (ending) isSessionEnding = true

        // Avoid spamming the same text over and over
        if (allText == lastEmittedText && !isSessionEnding) return
        lastEmittedText = allText

        Log.d(TAG, "emit reply (final=$isSessionEnding) pkg=$rootPackage")
        UssdBridgeModule.instance?.onUssdReply(allText, isSessionEnding)

        if (isSessionEnding) {
            armed = false
            pendingPin = null
            pinAlreadyInjected = false
        }
    }

    private fun collectText(node: AccessibilityNodeInfo?): String {
        if (node == null) return ""
        val sb = StringBuilder()
        node.text?.let { if (it.isNotBlank()) sb.append(it).append("\n") }
        node.contentDescription?.let { if (it.isNotBlank()) sb.append(it).append("\n") }
        for (i in 0 until node.childCount) {
            sb.append(collectText(node.getChild(i)))
        }
        return sb.toString()
    }

    /**
     * NEW. Closes a leftover USSD dialog (clicks Cancel/OK, or presses Back).
     * Only acts when the foreground window belongs to the phone/dialer UI, so it can
     * never click buttons inside some other app the person happens to have open.
     */
    private fun dismissUssdDialog(): Boolean {
        val root = rootInActiveWindow
        if (root == null) {
            Log.d(TAG, "dismiss: no active window")
            return false
        }
        val pkg = root.packageName?.toString() ?: ""
        if (pkg == applicationContext.packageName) {
            Log.d(TAG, "dismiss: our own app is in front, nothing to close")
            return false
        }
        val isPhoneUi = pkg.contains("phone", ignoreCase = true) ||
            pkg.contains("dialer", ignoreCase = true) ||
            pkg.contains("telecom", ignoreCase = true)
        if (!isPhoneUi) {
            Log.d(TAG, "dismiss: foreground package '$pkg' is not a phone/dialer UI, leaving it alone")
            return false
        }

        val btn = findButton(root, listOf("cancel", "ok", "close", "dismiss"))
        val clicked = btn?.performAction(AccessibilityNodeInfo.ACTION_CLICK) ?: false
        if (clicked) {
            Log.d(TAG, "dismiss: clicked a button in $pkg")
            return true
        }
        val back = performGlobalAction(GLOBAL_ACTION_BACK)
        Log.d(TAG, "dismiss: no button found in $pkg, pressed BACK -> $back")
        return back
    }

    private fun performSubmit(text: String): Boolean {
        val root = rootInActiveWindow ?: return false

        // 1. Find the input field
        val edit = findNode(root, "android.widget.EditText")
            ?: findEditable(root)
            ?: return false

        // 2. Set its text
        val args = Bundle().apply {
            putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                text
            )
        }
        val setOk = edit.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)

        if (!setOk) return false

        // 3. Find and click the Send / OK / Reply button
        val btn = findButton(
            root,
            listOf("send", "ok", "reply", "submit", "yes", "confirm", "dir")
        )

        // Some dialogs auto-submit; if no button found, still count as success
        return btn?.performAction(AccessibilityNodeInfo.ACTION_CLICK) ?: false
    }

    private fun findNode(node: AccessibilityNodeInfo?, cls: String): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.className == cls) return node
        for (i in 0 until node.childCount) {
            val r = findNode(node.getChild(i), cls)
            if (r != null) return r
        }
        return null
    }

    private fun findEditable(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) return null
        if (node.isEditable) return node
        for (i in 0 until node.childCount) {
            val r = findEditable(node.getChild(i))
            if (r != null) return r
        }
        return null
    }

    private fun findButton(
        node: AccessibilityNodeInfo?,
        labels: List<String>
    ): AccessibilityNodeInfo? {
        if (node == null) return null

        val txt = node.text?.toString()?.lowercase() ?: ""
        val cls = node.className?.toString() ?: ""

        val isButtonClass = cls.contains("Button", ignoreCase = true)
        val matchesLabel = labels.any { txt.contains(it) }

        if (matchesLabel && (isButtonClass || node.isClickable)) {
            return node
        }

        for (i in 0 until node.childCount) {
            val r = findButton(node.getChild(i), labels)
            if (r != null) return r
        }
        return null
    }
}