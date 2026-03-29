/// AgentScheduler.cdc
///
/// NapFi automation contract — implements the FlowTransactionScheduler
/// TransactionHandler interface.
///
/// When the scheduled time arrives, executeTransaction():
///   Step 1 — (Production) VaultSource withdraws user's USDC from their Flow account
///   Step 2 — (Optional)   Swapper converts USDC via IncrementFi if needed
///   Step 3 — (Production) VaultSink routes funds to the bridge relay, or:
///   Step 4 —              Emits DepositTriggered so the off-chain NapFi agent
///                         can pick it up, encrypt the amount with Zama fhEVM,
///                         and call EncryptedVault.deposit() on Sepolia.
///
/// For the hackathon demo, Steps 1-3 are scaffolded (commented) and the event
/// in Step 4 drives the full off-chain execution.  The agent can be upgraded
/// to do the full Flow Actions pipeline once USDC liquidity is set up on testnet.
///
/// Flow Actions reference:
///   Source  → FungibleTokenConnectors.VaultSource
///   Sink    → FungibleTokenConnectors.VaultSink
///   Swapper → IncrementFiSwapConnectors.Swapper  (optional yield routing)
///
/// FlowTransactionScheduler is deployed on testnet at 0x8c5303eaa26202d6

import "FlowTransactionScheduler"

access(all) contract AgentScheduler {

    // ── Events ─────────────────────────────────────────────────────────────────
    /// Emitted every time the handler fires.
    /// The NapFi Node.js agent subscribes to this event on Flow testnet via FCL
    /// and triggers the encrypted Sepolia deposit.
    access(all) event DepositTriggered(
        userEVMAddress: String,   // Sepolia address e.g. "0xABC123..."
        amount:         UFix64,   // USDC amount to deposit (e.g. 10.0)
        timestamp:      UFix64,   // block timestamp when fired
        executionId:    UInt64    // FlowTransactionScheduler job id
    )

    // ── Storage paths ──────────────────────────────────────────────────────────
    access(all) let HandlerStoragePath: StoragePath
    access(all) let HandlerPublicPath:  PublicPath

    // ── Handler resource ───────────────────────────────────────────────────────
    /// One Handler is saved per user account.
    /// FlowTransactionScheduler calls executeTransaction() at the scheduled time.
    access(all) resource Handler: FlowTransactionScheduler.TransactionHandler {

        /// Sepolia EVM address of the user whose vault receives the deposit.
        access(self) let userEVMAddress: String

        /// Amount in USDC to deposit each execution cycle.
        access(self) let depositAmount: UFix64

        init(userEVMAddress: String, depositAmount: UFix64) {
            self.userEVMAddress = userEVMAddress
            self.depositAmount  = depositAmount
        }

        // ── Core execution ─────────────────────────────────────────────────────
        /// Called automatically by FlowTransactionScheduler when the job fires.
        ///
        /// Full Flow Actions pipeline (production upgrade path):
        ///
        ///   // Step 1 — Source: pull USDC from user's Flow account
        ///   // let source = FungibleTokenConnectors.VaultSource(
        ///   //     min: 0.0, withdrawVault: usdcWithdrawCap, uniqueID: nil
        ///   // )
        ///   // let vault <- source.withdrawAvailable(maxAmount: self.depositAmount)
        ///
        ///   // Step 2 — Swap (optional yield routing via IncrementFi)
        ///   // let swapper = IncrementFiSwapConnectors.Swapper(
        ///   //     path: [flowKey, usdcKey], inVault: usdcType, outVault: usdcType, uniqueID: nil
        ///   // )
        ///   // let swapped <- swapper.swap(quote: nil, inVault: <-vault)
        ///
        ///   // Step 3 — Sink: route to bridge relay account
        ///   // let sink = FungibleTokenConnectors.VaultSink(
        ///   //     max: nil, depositVault: bridgeRelayCap, uniqueID: nil
        ///   // )
        ///   // sink.depositCapacity(from: &swapped as auth(FungibleToken.Withdraw) &{FungibleToken.Vault})
        ///
        /// Step 4 — Emit event (drives off-chain Sepolia execution for the demo).
        access(FlowTransactionScheduler.Execute) fun executeTransaction(
            id:   UInt64,
            data: AnyStruct?
        ) {
            let ts = getCurrentBlock().timestamp

            emit DepositTriggered(
                userEVMAddress: self.userEVMAddress,
                amount:         self.depositAmount,
                timestamp:      ts,
                executionId:    id
            )
        }

        // ── MetadataViews ──────────────────────────────────────────────────────
        access(all) view fun getViews(): [Type] {
            return [Type<StoragePath>(), Type<PublicPath>()]
        }

        access(all) fun resolveView(_ view: Type): AnyStruct? {
            switch view {
                case Type<StoragePath>():
                    return AgentScheduler.HandlerStoragePath
                case Type<PublicPath>():
                    return AgentScheduler.HandlerPublicPath
                default:
                    return nil
            }
        }
    }

    // ── Factory ────────────────────────────────────────────────────────────────
    access(all) fun createHandler(
        userEVMAddress: String,
        depositAmount:  UFix64
    ): @Handler {
        return <- create Handler(
            userEVMAddress: userEVMAddress,
            depositAmount:  depositAmount
        )
    }

    // ── Contract init ──────────────────────────────────────────────────────────
    init() {
        self.HandlerStoragePath = /storage/NapFiAgentSchedulerHandler
        self.HandlerPublicPath  = /public/NapFiAgentSchedulerHandler
    }
}
