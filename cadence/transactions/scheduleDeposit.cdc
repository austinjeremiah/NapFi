/// scheduleDeposit.cdc
/// Schedule the NapFi deposit handler to fire at (now + delaySeconds).
/// The Node.js backend calls this after agent registration.
///
/// Arguments:
///   delaySeconds     : UFix64  — seconds until first execution
///                                86400.0 = daily, 604800.0 = weekly, 2592000.0 = monthly
///   executionEffort  : UInt64  — compute unit limit (1000 is fine for the event emit)

import "AgentScheduler"
import "FlowTransactionScheduler"
import "FlowTransactionSchedulerUtils"
import "FlowToken"
import "FungibleToken"

transaction(delaySeconds: UFix64, executionEffort: UInt64) {

    prepare(signer: auth(Storage, Capabilities) &Account) {

        // ── 1. Ensure FlowTransactionSchedulerUtils.Manager exists ──────────────
        if !signer.storage.check<@{FlowTransactionSchedulerUtils.Manager}>(
            from: FlowTransactionSchedulerUtils.managerStoragePath
        ) {
            let manager <- FlowTransactionSchedulerUtils.createManager()
            signer.storage.save(
                <-manager,
                to: FlowTransactionSchedulerUtils.managerStoragePath
            )
            let managerCap = signer.capabilities.storage
                .issue<&{FlowTransactionSchedulerUtils.Manager}>(
                    FlowTransactionSchedulerUtils.managerStoragePath
                )
            signer.capabilities.publish(
                managerCap,
                at: FlowTransactionSchedulerUtils.managerPublicPath
            )
            log("Manager created")
        }

        // ── 2. Calculate fee and withdraw FLOW ──────────────────────────────────
        let priority = FlowTransactionScheduler.Priority.Medium
        let future   = getCurrentBlock().timestamp + delaySeconds

        let est = FlowTransactionScheduler.calculateFee(
            executionEffort: executionEffort,
            priority:        priority,
            dataSizeMB:      0.0
        )

        let vaultRef = signer.storage
            .borrow<auth(FungibleToken.Withdraw) &FlowToken.Vault>(
                from: /storage/flowTokenVault
            ) ?? panic("Missing FlowToken vault — fund your Flow account at testnet-faucet.onflow.org")

        // calculateFee returns UFix64 (non-optional); use a small minimum if zero
        let feeAmount: UFix64 = est > 0.0 ? est : 0.001
        let fees <- vaultRef.withdraw(amount: feeAmount) as! @FlowToken.Vault

        // ── 3. Retrieve the entitled handler capability ─────────────────────────
        var handlerCap:
            Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>?
            = nil

        let controllers = signer.capabilities.storage
            .getControllers(forPath: AgentScheduler.HandlerStoragePath)

        var i = 0
        while i < controllers.length {
            if let cap = controllers[i].capability
                as? Capability<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}> {
                handlerCap = cap
                break
            }
            i = i + 1
        }

        if handlerCap == nil {
            panic("Handler capability not found — run initHandler.cdc first")
        }

        // ── 4. Schedule ─────────────────────────────────────────────────────────
        let manager = signer.storage
            .borrow<auth(FlowTransactionSchedulerUtils.Owner) &{FlowTransactionSchedulerUtils.Manager}>(
                from: FlowTransactionSchedulerUtils.managerStoragePath
            ) ?? panic("Could not borrow Manager")

        manager.schedule(
            handlerCap:       handlerCap!,
            data:             nil,
            timestamp:        future,
            priority:         priority,
            executionEffort:  executionEffort,
            fees:             <-fees
        )

        log("NapFi deposit scheduled — fires at block timestamp ".concat(future.toString()))
    }
}
