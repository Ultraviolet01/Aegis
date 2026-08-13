import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ethersPath = resolve(ROOT, 'agent/node_modules/ethers/lib.esm/index.js');
const { JsonRpcProvider, Contract, formatUnits } = await import(pathToFileURL(ethersPath).href);

const dotenv = await import('dotenv');
dotenv.config({ path: resolve(ROOT, '.env') });

const provider = new JsonRpcProvider('https://rpc.xlayer.tech');
const deployerAddr = '0x3A29893814c82A6047E4Aa56dec640A5e65985c1';

const erc20Abi = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)'
];

const tokens = {
  USDC: '0x74b7F16337b8972027F6196A17a631aC6dE26d22',
  GLDX: '0x2380F2673C640fB67E2d6B55B44C62F0E0e69DA9',
  SPYX: '0x90A2a4c76b5D8c0bc892A69EA28Aa775a8f2dD48'
};

console.log('=== Checking Mainnet Deployer Account Balances ===');
console.log('Deployer Address:', deployerAddr);

const okbBalance = await provider.getBalance(deployerAddr);
console.log(`OKB Gas Balance:   ${formatUnits(okbBalance, 18)} OKB`);

for (const [name, addr] of Object.entries(tokens)) {
  try {
    const c = new Contract(addr, erc20Abi, provider);
    const [bal, dec, sym] = await Promise.all([
      c.balanceOf(deployerAddr),
      c.decimals().catch(() => (name === 'USDC' ? 6 : 18)),
      c.symbol().catch(() => name)
    ]);
    console.log(`${name} (${sym}) Balance: ${formatUnits(bal, dec)}`);
  } catch (err) {
    console.log(`${name} Balance check error: ${err.message}`);
  }
}
