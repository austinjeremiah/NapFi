import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { FHECounter } from "../types";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("FHECounterSepolia", function () {
  let signers: Signers;
  let fheCounterContract: FHECounter;
  let fheCounterContractAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { alice: ethSigners[0] };

    // Use the persisted Sepolia deployment so explorer shows txs at this address.
    const deployment = await deployments.get("FHECounter");
    fheCounterContractAddress = deployment.address;
    fheCounterContract = await ethers.getContractAt("FHECounter", fheCounterContractAddress);
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("increment the counter by 1", async function () {
    steps = 8;

    this.timeout(4 * 40000);

    const latestBlock = await ethers.provider.getBlock("latest");
    if (!latestBlock) {
      throw new Error("Could not fetch latest block for decryption validity window");
    }

    const decryptValidity = {
      startTimestamp: latestBlock.timestamp - 60,
      durationDays: 30,
    };

    progress(`Call FHECounter.getCount() before increment...`);
    const encryptedCountBeforeInc = await fheCounterContract.getCount();

    let clearCountBeforeInc = 0;
    if (encryptedCountBeforeInc !== ethers.ZeroHash) {
      progress(`Decrypting count before increment=${encryptedCountBeforeInc}...`);
      clearCountBeforeInc = Number(
        await fhevm.userDecryptEuint(
          FhevmType.euint32,
          encryptedCountBeforeInc,
          fheCounterContractAddress,
          signers.alice,
          { validity: decryptValidity },
        ),
      );
      progress(`Clear count before increment=${clearCountBeforeInc}`);
    }

    progress(`Encrypting '1'...`);
    const encryptedOne = await fhevm
      .createEncryptedInput(fheCounterContractAddress, signers.alice.address)
      .add32(1)
      .encrypt();

    progress(
      `Call increment(1) FHECounter=${fheCounterContractAddress} handle=${ethers.hexlify(encryptedOne.handles[0])} signer=${signers.alice.address}...`,
    );
    const tx = await fheCounterContract.connect(signers.alice).increment(encryptedOne.handles[0], encryptedOne.inputProof);
    const receipt = await tx.wait(2);
    progress(`Increment tx mined hash=${tx.hash} block=${receipt?.blockNumber}`);

    progress(`Call FHECounter.getCount() after increment...`);
    const encryptedCountAfterInc = await fheCounterContract.getCount();

    progress(`Decrypting FHECounter.getCount()=${encryptedCountAfterInc}...`);
    const clearCountAfterInc = Number(
      await fhevm.userDecryptEuint(
        FhevmType.euint32,
        encryptedCountAfterInc,
        fheCounterContractAddress,
        signers.alice,
        { validity: decryptValidity },
      ),
    );
    progress(`Clear FHECounter.getCount()=${clearCountAfterInc}`);

    expect(clearCountAfterInc - clearCountBeforeInc).to.eq(1);
  });
});