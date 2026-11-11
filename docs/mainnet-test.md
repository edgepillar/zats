# Mainnet acceptance test: 0.1 ZNN

**Status: NOT RUN.** A passing build, simulated browser test or Pages deployment does not prove a
real mainnet claim. This guide authorizes no transaction. An assistant must obtain explicit
approval before funding, claiming, receiving into a wallet, recovering or taking funds back.

The test amount is **0.1 native ZNN = 10,000,000 zats**. Do not increase it to troubleshoot.
Sender, photo account and recipient are publicly linked on the ledger. The PNG and its 24 words
control the photo account; neither is encrypted. Keep them out of chats, issue reports, CI,
screenshots, repositories and shared folders. Use a non-personal sample photo.

## 1. Prepare without moving money

1. Confirm the exact `main` commit has passing unit tests, both builds and simulated browser
   tests. Confirm its Pages deployment succeeded and note the deployed revision privately.
2. Rehearse the complete flow at `/zats/demo/` using the pretend-wallet button. Never send real
   ZNN to a demo address. Close that tab before the real test.
3. Use two separate browser profiles or devices: profile A makes the photo; profile B opens it.
   Both must use the deployed **mainnet** URL ending `/zats/`, with no demo banner. Enable local
   storage in profile A and keep it available until the test and recovery checks are complete.
4. Prepare an existing synced sender wallet and a distinct recipient address you control. Check
   the recipient address in its wallet, not just the clipboard. Use native Zenon mainnet, not a
   wrapped token or another chain. Record the recipient's starting ZNN balance privately.
5. Check the public nodes from the final site origin with the read-only snippet below. Require
   at least one response with `chainIdentifier: 1` and a current, advancing momentum. If none
   respond, stop. This checks connectivity, not the honesty or independence of a node.

```js
// DevTools on the deployed mainnet page. Read-only: no keys and no publication RPC.
const nodes = [
  'wss://node.atsocy.com:35998',
  'wss://node.zenonhub.io:35998',
  'wss://my.hc1node.com:35998',
]
for (const endpoint of nodes) {
  await new Promise((resolve) => {
    const socket = new WebSocket(endpoint)
    const finish = () => { clearTimeout(timer); socket.close(); resolve() }
    const timer = setTimeout(() => { console.log(endpoint, 'TIMEOUT'); finish() }, 10000)
    socket.onopen = () => socket.send(JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'ledger.getFrontierMomentum', params: [],
    }))
    socket.onmessage = ({ data }) => {
      const reply = JSON.parse(data)
      console.log(endpoint, { chainIdentifier: reply.result?.chainIdentifier, height: reply.result?.height, error: reply.error })
      finish()
    }
    socket.onerror = () => { console.log(endpoint, 'ERROR'); finish() }
  })
}
```

Run the snippet again after a short interval to check that heights advance. Do not paste recovery
words, account secrets or funded PNG data into DevTools.

## 2. Make an unfunded deposit request

1. In profile A, choose the sample photo and set **10,000,000 zats**. The app defaults to 1 ZNN,
   so explicitly select the 0.1 ZNN preset or enter the amount and verify `= 0.1 ZNN`.
2. Select **Get an address for 10,000,000 zats**. Verify the next screen says **Send 0.1 ZNN to
   this address** and shows a fresh `z1…` deposit address.
3. Confirm a matching row exists in **History**. If the app reports a storage failure, stop this
   pilot before funding. Do not clear storage, delete the History row or abandon this profile.
4. Compare the complete deposit address with the address prepared in the sender wallet. Do not
   confirm the wallet transaction yet.

## 3. Approval A: fund exactly 0.1 ZNN

**Stop for explicit approval:** one sender-wallet transfer of exactly 0.1 native ZNN to the
displayed photo account. Approval to create the website does not cover this transfer.

After approval, the owner confirms that transfer in the sender wallet. Record its transaction
hash privately. Keep profile A open while the app detects the deposit and embeds the secret.
The app embeds whatever arrives; verify the finished photo shows **10,000,000 zats / 0.1 ZNN**.
If it differs, stop and investigate without sending more.

Download the PNG. Keep the original file unchanged; do not crop it, take a screenshot, convert it
or send it through image compression. Transfer it privately to profile B as a file. Keep both
the original PNG and profile A's History until settlement is verified.

## 4. Inspect in the second browser without claiming

Open the PNG on the mainnet site's **Open** screen in profile B. Require an intact or repaired
payload and **Unclaimed**, showing **10,000,000 zats / 0.1 ZNN**. Stop on a damaged payload, an
unknown state or an unexpected amount. The format check is not encryption.

If a recovery backup is wanted, **Copy 24 words** and store them offline and privately. These are
the photo account's words, never the sender's or recipient's wallet seed. Do not import or use
them in another wallet while the browser is claiming.

Select **Claim to my Zenon address**, enter the previously checked recipient address, and compare
the full address with the receiving wallet again. Do not select the final **Claim** yet.

## 5. Approval B: claim and receive

**Stop for separate explicit approval:** the photo account's receive and send blocks to the
verified recipient, and the recipient wallet's receive/automatic receive of that transfer.
All supported ZNN and QSR in the photo account are swept, so inspect any unexpected QSR first.

After approval, select **Claim**. For one fresh ZNN deposit, expect a photo-account receive,
confirmation wait, then a send. Each may need browser proof of work. Previous desktop timings
are estimates, not a timeout guarantee. Keep the device awake and the tab open; do not claim
the same photo concurrently in profile A or another wallet.

Record the photo receive/send hashes from the account's explorer history privately. A **Sent to**
message alone is insufficient. In the recipient wallet, perform or allow only the approved
receive, and require a confirmed **0.1 ZNN** increase relative to the recorded starting balance.
Record the recipient receive hash privately as well.

## 6. Acceptance and private record

Require all of the following before marking this pilot PASS:

- Sender funding: exactly 0.1 ZNN to the photo account, confirmed.
- Photo account: expected receive and send confirmed; no remaining ZNN or pending ZNN transfer.
- Recipient wallet: approved receive confirmed, net ZNN increase exactly 0.1.
- Reopen the original PNG: **Already claimed**. Profile A's refreshed History: **Claimed**.
- No unknown publish outcome, unexpected destination, zero-value success or unexplained balance.

Keep a private record with: deployed commit, browser versions, test time in UTC, amount, the four
block hashes, observed confirmation states, proof-of-work times and PASS/FAIL/UNKNOWN. Leave
addresses and hashes out of public reports; they reveal the transaction graph. Never include a
secret, mnemonic, local path or funded photo. Redacted public notes should contain only the
revision, amount, platform category and test outcome.

This one test does not qualify other browsers, phones, messaging apps, node failures or larger
amounts. Test PNG survival separately with the unfunded `#test` page.

## 7. Failure or interruption

Do not re-fund, delete records or immediately repeat a claim. A timeout can follow an accepted
publication. Preserve the original PNG and History, inspect both accounts read-only, and classify
the result UNKNOWN until the ledger state is reconciled. The current code has bounded polling;
an incomplete or zero-amount result must not be accepted as success.

If funds remain, propose the exact recovery destination and amount and obtain fresh approval
before **Take back**, another claim, or any wallet import that might auto-receive. Never run the
browser claim and a recovery wallet concurrently. Do not disclose recovery material to request
help. There is no need to transfer additional ZNN as a diagnostic step.

## References

- [Zats money layer](../src/zenon.ts), [deposit flow](../src/components/MakeFlow.tsx), and
  [claim form](../src/components/SweepForm.tsx) define the current app behavior.
- [Zenon SDK](https://github.com/digitalSloth/znn-typescript-sdk) documents the account-block and
  proof-of-work API. Its documentation is not evidence of a Zats mainnet execution.
