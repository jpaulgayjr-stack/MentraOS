export const AD_GLASS: Readonly<{
  appName: string
  bundleId: string
  icon: string
  adaptiveIcon: string
  splashLight: string
  splashDark: string
}>
export function isAdGlass(env?: NodeJS.ProcessEnv): boolean
export function applyAdGlass<T extends Record<string, any>>(config: T, env?: NodeJS.ProcessEnv): T
export function rebrandText<T>(value: T): T
