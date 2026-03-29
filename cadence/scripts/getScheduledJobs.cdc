/// getScheduledJobs.cdc
/// Returns a list of scheduled transaction IDs for the given account.
/// Usage: flow scripts execute cadence/scripts/getScheduledJobs.cdc <address> --network testnet

import "FlowTransactionSchedulerUtils"

access(all) fun main(account: Address): [UInt64] {
    let acct = getAccount(account)
    let managerRef = acct.capabilities
        .borrow<&{FlowTransactionSchedulerUtils.Manager}>(
            FlowTransactionSchedulerUtils.managerPublicPath
        )

    if let manager = managerRef {
        return manager.getScheduledTransactionIDs()
    }

    return []
}
