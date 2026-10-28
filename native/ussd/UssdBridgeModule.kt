package com.feeflow.app.ussd

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.util.Log
import androidx.annotation.RequiresApi
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.atomic.AtomicBoolean

class UssdBridgeModule(
    private val reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "UssdBridge"
        private const val TAG = "UssdBridge"
        private const val USSD_TIMEOUT_MS = 60_000L

        @Volatile
        var instance: UssdBridgeModule? = null
            private set
    }

    init {
        instance = this
    }

    override fun getName(): String = NAME

    private fun emit(event: String, payload: WritableMap) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(event, payload)
    }

    /** Called by the accessibility service when the USSD dialog text changes. */
    fun onUssdReply(text: String, isFinal: Boolean) {
        val map = Arguments.createMap()
        map.putString("reply", text)
        map.putBoolean("isFinal", isFinal)
        map.putInt("sessionId", UssdAccessibilityService.sessionId)
        emit("ussdReply", map)
    }

    /** Called by the accessibility service on error. */
    fun onUssdError(message: String) {
        val map = Arguments.createMap()
        map.putString("error", message)
        map.putInt("sessionId", UssdAccessibilityService.sessionId)
        emit("ussdError", map)
    }

    // --- Required for NativeEventEmitter in JS ---
    @ReactMethod
    fun isServiceConnected(promise: Promise) {
        promise.resolve(UssdAccessibilityService.isConnected())
    }

    @ReactMethod
    fun addListener(eventName: String) { /* no-op */ }

    @ReactMethod
    fun removeListeners(count: Int) { /* no-op */ }

    private fun slotForSubscription(subscriptionId: Int): Int {
        if (subscriptionId < 0) return -1
        return try {
            val sm = reactContext.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            sm.getActiveSubscriptionInfo(subscriptionId)?.simSlotIndex ?: subscriptionId
        } catch (_: Exception) {
            subscriptionId
        }
    }

    /**
     * NEW. The reliable way to make ACTION_CALL use a specific SIM is a PhoneAccountHandle.
     * The old "slot" extras are only a hint and many ROMs ignore them, which could dial the
     * wrong SIM (wrong wallet). Returns null if no matching account is found.
     */
    private fun phoneAccountFor(subscriptionId: Int): PhoneAccountHandle? {
        if (subscriptionId < 0) return null
        return try {
            val telecom = reactContext.getSystemService(Context.TELECOM_SERVICE) as TelecomManager
            val base = reactContext.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            val sm = reactContext.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            val iccId = try {
                sm.getActiveSubscriptionInfo(subscriptionId)?.iccId
            } catch (_: Exception) {
                null
            }

            telecom.callCapablePhoneAccounts.firstOrNull { h ->
                val byApi = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
                    try { base.getSubscriptionId(h) == subscriptionId } catch (_: Exception) { false }
                byApi ||
                    (!iccId.isNullOrBlank() && h.id == iccId) ||
                    h.id == subscriptionId.toString()
            }
        } catch (_: Exception) {
            null
        }
    }

    // --- Public API ---

    /** Manual flow: dials through the phone app. Never put the code in an error message. */
    @ReactMethod
    fun dialUssd(code: String, subscriptionId: Int, promise: Promise) {
        try {
            if (subscriptionId < 0) {
                promise.reject("SIM_REQUIRED", "A specific SIM must be selected")
                return
            }
            val sm = reactContext.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            val active = sm.getActiveSubscriptionInfo(subscriptionId)
            if (active == null) {
                promise.reject("SIM_NOT_AVAILABLE", "Selected SIM is not active")
                return
            }
            val slot = active.simSlotIndex
            val account = phoneAccountFor(subscriptionId)
            if (account == null) {
                promise.reject("SIM_NOT_AVAILABLE", "Cannot verify the selected phone account")
                return
            }
            Log.d(
                TAG,
                "dialUssd: subscriptionId=$subscriptionId slot=$slot phoneAccount=" +
                    (if (account != null) "FOUND(${account.id})" else "NOT FOUND (phone may use its default SIM)")
            )

            val cleaned = code.replace("#", Uri.encode("#"))
            val intent = Intent(Intent.ACTION_CALL).apply {
                data = Uri.parse("tel:$cleaned")
                if (subscriptionId >= 0) {
                    if (account != null) {
                        putExtra(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, account)
                    }
                    // Fallback hints. Not all ROMs honour these, but no harm in setting them.
                    putExtra("com.android.phone.extra.slot", slot)
                    putExtra("simSlot", slot)
                    putExtra("phone", slot)
                    putExtra("subscription", subscriptionId)
                }
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }

            if (!UssdAccessibilityService.isConnected()) {
                promise.reject("ACCESSIBILITY_DISABLED", "Enable USSD accessibility service")
                return
            }
            UssdAccessibilityService.arm()

            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: SecurityException) {
            UssdAccessibilityService.reset(false)
            promise.reject("PERMISSION_DENIED", "CALL_PHONE permission not granted")
        } catch (e: Exception) {
            UssdAccessibilityService.reset(false)
            promise.reject("DIAL_FAILED", "Dial failed")
        }
    }

    /** Runner flow: single request on an exact SIM, no dialog. Resolves with the reply text. */
    @ReactMethod
    fun runUssd(code: String, subscriptionId: Int, promise: Promise) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            promise.reject("UNSUPPORTED", "Android 8+ required")
            return
        }
        startUssdRequest(code, subscriptionId, promise)
    }

    @RequiresApi(Build.VERSION_CODES.O)
    private fun startUssdRequest(code: String, subscriptionId: Int, promise: Promise) {
        try {
            val base = reactContext.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager
            val tm = if (subscriptionId >= 0) base.createForSubscriptionId(subscriptionId) else base

            val done = AtomicBoolean(false)
            val handler = Handler(Looper.getMainLooper())
            val timeout = Runnable {
                if (done.compareAndSet(false, true)) {
                    promise.reject("USSD_TIMEOUT", "No USSD response")
                }
            }
            handler.postDelayed(timeout, USSD_TIMEOUT_MS)

            tm.sendUssdRequest(code, object : TelephonyManager.UssdResponseCallback() {
                override fun onReceiveUssdResponse(
                    telephonyManager: TelephonyManager,
                    request: String,
                    response: CharSequence
                ) {
                    if (done.compareAndSet(false, true)) {
                        handler.removeCallbacks(timeout)
                        promise.resolve(response.toString())
                    }
                }

                override fun onReceiveUssdResponseFailed(
                    telephonyManager: TelephonyManager,
                    request: String,
                    failureCode: Int
                ) {
                    if (done.compareAndSet(false, true)) {
                        handler.removeCallbacks(timeout)
                        promise.reject("USSD_FAILED", "failureCode=$failureCode")
                    }
                }
            }, handler)
        } catch (e: SecurityException) {
            promise.reject("PERMISSION_DENIED", "CALL_PHONE permission not granted")
        } catch (e: Exception) {
            promise.reject("USSD_FAILED", "USSD request failed")
        }
    }

    @ReactMethod
    fun sendUssdResponse(text: String, promise: Promise) {
        val ok = UssdAccessibilityService.submitResponse(text)
        if (ok) {
            promise.resolve(true)
        } else {
            promise.reject("NO_SESSION", "No active USSD dialog found. The session may have closed.")
        }
    }

    /** Real subscription ids, physical slot index (0-based) and a per-SIM carrier name. */
    @ReactMethod
    fun getSimList(promise: Promise) {
        try {
            val arr = Arguments.createArray()
            val sm = reactContext.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as SubscriptionManager
            val list = try {
                sm.activeSubscriptionInfoList
            } catch (_: SecurityException) {
                null
            } ?: emptyList()

            for (info in list.sortedBy { it.simSlotIndex }) {
                val name = info.carrierName?.toString()?.takeIf { it.isNotBlank() }
                    ?: info.displayName?.toString()?.takeIf { it.isNotBlank() }
                    ?: "SIM ${info.simSlotIndex + 1}"
                val m = Arguments.createMap()
                m.putInt("subscriptionId", info.subscriptionId)
                m.putInt("slotIndex", info.simSlotIndex)
                m.putString("carrierName", name)
                arr.pushMap(m)
            }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("SIM_ERROR", e.message ?: "Could not read SIM list")
        }
    }

    // --- PIN auto-injection ---

    @ReactMethod
    fun setPendingPin(pin: String, promise: Promise) {
        try {
            UssdAccessibilityService.setPendingPin(pin)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PIN_SET_FAILED", "Failed to set PIN")
        }
    }

    @ReactMethod
    fun clearPendingPin(promise: Promise) {
        try {
            UssdAccessibilityService.clearPendingPin()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("PIN_CLEAR_FAILED", "Failed to clear PIN")
        }
    }

    /**
     * NEW. Wipes every bit of session state in the accessibility service (armed flag, held PIN,
     * "already injected" flag, last text) and, if dismiss=true, closes a leftover USSD dialog.
     * JS calls this before and after every runner job.
     */
    @ReactMethod
    fun resetSession(dismiss: Boolean, promise: Promise) {
        try {
            UssdAccessibilityService.reset(dismiss)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("RESET_FAILED", "Failed to reset USSD session")
        }
    }
}