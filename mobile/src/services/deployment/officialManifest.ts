import {createSightlineManifest} from "./sightlineManifest"
import type {ConsumerDeployment, DeploymentManifest} from "./types"

/**
 * Sightline: the embedded deployment is the local one. Upstream builds Mentra's
 * manifest here from `EXPO_PUBLIC_CLOUD_*`; this build reads none of them, so
 * no build environment can name a server. On an upstream merge conflict in
 * this file, keep this version (docs/sightline/spec-phase2.md).
 */
export function createOfficialManifest(): DeploymentManifest {
  return createSightlineManifest()
}

export function createConsumerDeployment(): ConsumerDeployment {
  return {kind: "consumer", source: "embedded", manifest: createOfficialManifest()}
}
