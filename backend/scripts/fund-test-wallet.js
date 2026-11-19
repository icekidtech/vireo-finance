/**
 * SANDBOX TESTING ONLY. Never use this against live accounts.
 *
 * Funds a Vireo account the way a real customer would, so the deposit is recorded by Paga:
 *
 *   node scripts/fund-test-wallet.js <accountNumber> [amountNaira] [--bank=access-bank|paga]
 *
 * It uses Paga's own test-environment "inbound bank deposit" simulator, which credits the
 * (sandbox) persistent payment account as if a bank transfer arrived. Paga then sends the
 * normal payment callback to the callback URL registered for that account, which is your
 * backend's POST /api/v1/webhooks/paga. No real money moves.
 *
 * Offline alternative (nothing is recorded at Paga): add --local to send your LOCAL backend
 * the same signed callback Paga would send, so the inbound path runs against localhost only.
 *
 *   node scripts/fund-test-wallet.js 2996370866 50000 --local
 */
const path = require('path');
const { createHash } = require('crypto');

const SIMULATOR = 'https://qa-developer-portal.paga.com/api/simulate/inbound-bank-deposit';
const MAX_NAIRA = 1_000_000;

const args = process.argv.slice(2);
const flags = args.filter((a) => a.startsWith('--'));
const [accountNumber, amountNaira = '5000'] = args.filter((a) => !a.startsWith('--'));
const local = flags.includes('--local');
const bankFlag = flags.find((f) => f.startsWith('--bank='));
const bankId = bankFlag ? bankFlag.slice('--bank='.length) : 'access-bank';

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!/^\d{10}$/.test(accountNumber || '')) {
  fail('Give the 10-digit account number to credit, e.g. node scripts/fund-test-wallet.js 2996370866 5000');
}
const amount = Number(amountNaira);
if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_NAIRA) {
  fail(`Amount must be a number of naira between 1 and ${MAX_NAIRA}.`);
}

async function viaPagaSimulator() {
  const banks = await fetch(`${SIMULATOR}/banks`, { signal: AbortSignal.timeout(20000) }).then((r) => {
    if (!r.ok) throw new Error(`Could not load the simulator bank list (HTTP ${r.status})`);
    return r.json();
  });
  if (!banks.some((b) => b.id === bankId)) {
    fail(`Unknown sender bank "${bankId}". Choose one of: ${banks.map((b) => b.id).join(', ')}`);
  }

  const res = await fetch(SIMULATOR, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(30000),
    body: JSON.stringify({
      bankId,
      amount,
      currency: 'NGN',
      pagaUserPhoneNumber: accountNumber,
      narrationField: 'Vireo sandbox test deposit',
      isCredit: true,
    }),
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    fail(`Paga simulator refused the deposit (HTTP ${res.status}): ${body.message || body.raw || text.slice(0, 200)}`);
  }
  if (body.responseCode !== 0) {
    fail(`Paga did not credit the account: ${JSON.stringify(body)}`);
  }
  console.log(`Paga sandbox credited ${accountNumber} with NGN ${amount.toFixed(2)} from ${bankId}.`);
  console.log(`Paga reference: ${body.referenceNumber}`);
  console.log('Paga now sends the payment callback to the URL registered for this account.');
  console.log('Watch your backend logs (pm2 logs) and the wallet / activity in the app.');
}

async function viaLocalCallback() {
  const backend = path.join(__dirname, '..');
  require(path.join(backend, 'node_modules', 'dotenv')).config({ path: path.join(backend, '.env') });
  const base = process.env.LOCAL_API || '';
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) {
    fail('--local refuses to run against anything but localhost.');
  }
  const body = {
    statusCode: '0',
    accountNumber,
    amount: amount.toFixed(2),
    clearingFeeAmount: '0',
    transferFeeAmount: '0',
    transactionReference: `local-test-fund-${Date.now()}`,
  };
  const key = (process.env.PAGA_HASH_KEY || '').trim();
  if (!key) fail('PAGA_HASH_KEY is not set in backend/.env');
  body.hash = createHash('sha512')
    .update(
      [body.statusCode, body.accountNumber, body.amount, body.clearingFeeAmount, body.transferFeeAmount].join('') + key,
    )
    .digest('hex');
  const r = await fetch(`${base}/api/v1/webhooks/paga`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  console.log(`local webhook -> HTTP ${r.status}`, await r.text());
}

(local ? viaLocalCallback() : viaPagaSimulator()).catch((e) => fail(`Failed: ${e.message}`));