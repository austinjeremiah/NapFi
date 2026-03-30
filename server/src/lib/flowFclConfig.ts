/**
 * Shared FCL config for Flow testnet.
 * Loads contract aliases from repo-root flow.json (contracts + networks only — no account keys).
 * Required so Cadence `import "AgentScheduler"` etc. resolve when using fcl.mutate().
 */

import * as fcl from "@onflow/fcl"
import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

export function configureFlowFcl(accessNode: string): void {
  const flowPath = join(__dirname, "../../../flow.json")
  const full = JSON.parse(readFileSync(flowPath, "utf8")) as Record<string, unknown>
  const flowJSON = {
    contracts: full.contracts,
    networks: full.networks,
  }

  fcl
    .config({
      "accessNode.api": accessNode,
      "flow.network": "testnet",
    })
    .load({ flowJSON })
}
