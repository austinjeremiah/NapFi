/// initHandler.cdc
/// Saves an AgentScheduler.Handler resource to the signer's account storage
/// and publishes a public capability so FlowTransactionScheduler can call it.
///
/// Run this ONCE per user before calling scheduleDeposit.cdc.
///
/// Arguments:
///   userEVMAddress : String   — the user's Sepolia/EVM address ("0x…")
///   depositAmount  : UFix64   — USDC amount to deposit each time (e.g. 10.0)

import "AgentScheduler"
import "FlowTransactionScheduler"

transaction(userEVMAddress: String, depositAmount: UFix64) {

    prepare(signer: auth(Storage, Capabilities) &Account) {

        // Only create the handler once
        if signer.storage.borrow<&AnyResource>(
            from: AgentScheduler.HandlerStoragePath
        ) == nil {

            let handler <- AgentScheduler.createHandler(
                userEVMAddress: userEVMAddress,
                depositAmount:  depositAmount
            )
            signer.storage.save(<-handler, to: AgentScheduler.HandlerStoragePath)

            // Issue entitled capability (needed by FlowTransactionScheduler.schedule)
            let _ = signer.capabilities.storage
                .issue<auth(FlowTransactionScheduler.Execute) &{FlowTransactionScheduler.TransactionHandler}>(
                    AgentScheduler.HandlerStoragePath
                )

            // Publish un-entitled public capability (readable by scripts)
            let publicCap = signer.capabilities.storage
                .issue<&{FlowTransactionScheduler.TransactionHandler}>(
                    AgentScheduler.HandlerStoragePath
                )
            signer.capabilities.publish(publicCap, at: AgentScheduler.HandlerPublicPath)

            log("NapFi Handler initialized for ".concat(userEVMAddress))
        } else {
            log("Handler already exists — skipping init")
        }
    }
}
