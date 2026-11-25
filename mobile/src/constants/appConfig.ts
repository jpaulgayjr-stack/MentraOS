import Constants from "expo-constants"

const VARIANTS = {
  default: {
    packageName: "com.mentra.mentra",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.mentra.mentra",
    playStoreBetaUrl: "https://play.google.com/apps/testing/com.mentra.mentra",
    appStoreUrl: "https://apps.apple.com/app/id6747363193",
    appStoreReviewUrl: "https://apps.apple.com/app/id6747363193?action=write-review",
    cdnBaseUrl: "https://mentra-videos-cdn.mentraglass.com",
  },
  china: {
    packageName: "com.mentra.mentra.cn",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.mentra.mentra.cn",
    playStoreBetaUrl: "https://play.google.com/apps/testing/com.mentra.mentra.cn",
    appStoreUrl: "https://apps.apple.com/app/id6747363193",
    appStoreReviewUrl: "https://apps.apple.com/app/id6747363193?action=write-review",
    cdnBaseUrl: "https://asset.mentraglass.cn",
  },
}

const variant = process.env.EXPO_PUBLIC_DEPLOYMENT_REGION === "china" ? VARIANTS.china : VARIANTS.default

export const PACKAGE_NAME = variant.packageName
export const PLAY_STORE_URL = variant.playStoreUrl
export const PLAY_STORE_BETA_URL = variant.playStoreBetaUrl
export const APP_STORE_URL = variant.appStoreUrl
export const APP_STORE_REVIEW_URL = variant.appStoreReviewUrl
export const CDN_BASE_URL = variant.cdnBaseUrl

const scheme = Constants.expoConfig?.scheme
/** This build's own URL scheme, read from the packaged Expo config: `sightline` in a Sightline build
 * (scripts/sightline.cjs sets it); upstream's are `com.mentra`, or `com.mentra.dev` for the dev app. The literal
 * below is only the fallback where no Expo config exists (unit tests). */
export const APP_SCHEME: string = (Array.isArray(scheme) ? scheme[0] : scheme) || "com.mentra"
