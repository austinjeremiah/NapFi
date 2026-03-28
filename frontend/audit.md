Full audit complete. Here's the status:

Person 1 (Zama + 2 Contracts) — Full Audit
✅ lib/contracts.ts
Real ABIs for both contracts
Real Sepolia addresses:
EncryptedVault: 0x939F26...5227e
AgentRegistry: 0x7ca038...062F
✅ lib/sepolia-client.ts
Real viem createPublicClient on Sepolia — no mock
✅ lib/zama.ts
getZamaInstance → real createInstance with SepoliaConfig from SDK
decryptBalance(handle, provider) → real fhevm.publicDecrypt()
encryptWithdrawAmount(amount, vault, user, provider) → real fhevm.createEncryptedInput().encrypt()
✅ hooks/useAgentData.ts
Calls AgentRegistry.lookup(user) on-chain via viem ✅
Calls EncryptedVault.hasBalance(user) on-chain via viem ✅
No mocks
✅ dashboard/page.tsx — Balance section
revealBalance calls real hasBalance → getBalanceHandle → decryptBalance (Zama SDK)
No mock balance constant remains
Error state wired properly
✅ settings/page.tsx — Withdraw
handleWithdraw calls real encryptWithdrawAmount (Zama SDK)
Creates ethers BrowserProvider from Web3Auth provider
Calls real vault.withdraw(encryptedAmount, inputProof) and awaits tx.wait()
Amount input added to modal, error surfaces inline
What's still mock — but that's Person 2, NOT Person 1
Location	Mock	Waiting on
dashboard/page.tsx lines 28–33	MOCK_RECEIPTS (recent receipts section)	Person 2's GET /api/receipts/:agentId
receipts/page.tsx	MOCK_RECEIPTS + MOCK_SUMMARY	Person 2's GET /api/receipts/:agentId
Dashboard progress bar	goalAmountUSDC * 3 as fake total	Person 2's actual execution count
Person 1's entire surface area — contracts + Zama — is fully wired. Zero mocks remaining for their work.