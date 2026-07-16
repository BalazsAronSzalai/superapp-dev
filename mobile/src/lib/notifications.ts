import { Platform } from "react-native"
import * as Device from "expo-device"
import * as Notifications from "expo-notifications"
import Constants from "expo-constants"
import { api } from "@/lib/api"

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
})

/**
 * Push notifications wired early per Phase 1 (expo-notifications + Expo Push).
 * Registers the device's Expo push token with the backend.
 */
export async function registerForPushNotifications(): Promise<void> {
  if (!Device.isDevice) return // simulators can't receive push

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.DEFAULT,
    })
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  let status = existing
  if (existing !== "granted") {
    const req = await Notifications.requestPermissionsAsync()
    status = req.status
  }
  if (status !== "granted") return

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  const { data: token } = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  )

  await api("/api/auth/push-token", {
    method: "POST",
    body: { token, platform: Platform.OS === "ios" ? "ios" : "android" },
  }).catch((err) => {
    console.warn("Failed to register push token:", err)
  })
}
