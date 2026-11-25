export const AD_GLASS: Readonly<{
  appName: string
  bundleId: string
  scheme: string
  icon: string
  adaptiveIcon: string
  splashLight: string
  splashDark: string
}>
export function isAdGlass(env?: NodeJS.ProcessEnv): boolean
export function applyAdGlass<T extends Record<string, any>>(config: T, env?: NodeJS.ProcessEnv): T
export function rebrandText<T>(value: T): T
export function rebrandPrompts<T extends Record<string, any>>(infoPlist: T): T
export function adGlassInfoPlist(infoPlist: Record<string, any>, upstreamSchemes?: string[]): Record<string, any>
export function withAdGlassInfoPlist<T>(config: T): T
