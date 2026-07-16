import * as SecureStore from "expo-secure-store"

const ACCESS_KEY = "superapp.accessToken"
const REFRESH_KEY = "superapp.refreshToken"

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_KEY)
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_KEY)
}

export async function setTokens(accessToken: string, refreshToken: string) {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_KEY, accessToken),
    SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
  ])
}

export async function clearTokens() {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_KEY),
    SecureStore.deleteItemAsync(REFRESH_KEY),
  ])
}
