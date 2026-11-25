export const SIGHTLINE: Readonly<{
  appName: string
  bundleId: string
  scheme: string
  icon: string
  adaptiveIcon: string
  splashLight: string
  splashDark: string
}>
export function isSightline(env?: NodeJS.ProcessEnv): boolean
export function applySightline<T extends Record<string, any>>(config: T, env?: NodeJS.ProcessEnv): T
export function rebrandText<T>(value: T): T
export function rebrandPrompts<T extends Record<string, any>>(infoPlist: T): T
export function sightlineInfoPlist(infoPlist: Record<string, any>, upstreamSchemes?: string[]): Record<string, any>
export function withSightlineInfoPlist<T>(config: T): T
