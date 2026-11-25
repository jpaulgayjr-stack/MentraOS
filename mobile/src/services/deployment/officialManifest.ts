import {createAdGlassManifest} from "./adGlassManifest"
import type {ConsumerDeployment, DeploymentManifest} from "./types"

/**
 * AD Glass: the embedded deployment is the local one. Upstream builds Mentra's
 * manifest here from `EXPO_PUBLIC_CLOUD_*`; this build reads none of them, so
 * no build environment can name a server. On an upstream merge conflict in
 * this file, keep this version (docs/ad-glass/spec-phase2.md).
 */
export function createOfficialManifest(): DeploymentManifest {
  return createAdGlassManifest()
}

export function createConsumerDeployment(): ConsumerDeployment {
  return {kind: "consumer", source: "embedded", manifest: createOfficialManifest()}
}
