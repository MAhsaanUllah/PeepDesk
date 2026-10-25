// Quick unit sanity for IP classification + numeric-literal canonicalization
// (runs against the compiled dist/main/url-guard.js; no network, no Electron).
import { isBlockedIp, canonicalIpv4Literal } from '../dist/main/url-guard.js';

const ipCases = [
  ['127.0.0.1', true], ['::1', true], ['10.0.0.1', true], ['172.16.0.1', true],
  ['172.32.0.1', false], ['192.168.1.1', true], ['169.254.169.254', true],
  ['100.64.0.1', true], ['100.128.0.1', false], ['224.0.0.1', true],
  ['240.0.0.1', true], ['8.8.8.8', false], ['93.184.216.34', false],
  ['::ffff:127.0.0.1', true], ['::ffff:8.8.8.8', false],
  ['2002:7f00:1::', true], ['2002:5db8:d822::', false],
  ['64:ff9b::7f00:1', true], ['::127.0.0.1', true],
  ['fe80::1', true], ['fc00::1', true], ['fd00::1', true], ['ff02::1', true],
  ['2001:db8::1', true],
  ['2001:0:1:1:1:1:2:3', true], // teredo embed xor -> 255.253.255.252 (reserved)
  ['2001:0:969d:8d94:157b:bc5d:f30a:7e85', false], // teredo, public client v4
  ['2600::1', false], ['garbage', true], ['::', true], ['::ffff:0.0.0.0', true],
  ['::1.2.3.4', false], // IPv4-compatible form of PUBLIC 1.2.3.4 ['::ffff:169.254.10.9', true],
  ['0.0.0.0', true], ['255.255.255.255', true], ['198.18.0.1', true], ['198.51.100.7', true],
  ['203.0.113.9', true], ['192.0.2.9', true], ['192.88.99.1', true], ['192.0.0.9', true]
];

const litCases = [
  ['2130706433', '127.0.0.1'], ['0x7f000001', '127.0.0.1'], ['0177.0.0.1', '127.0.0.1'],
  ['127.1', '127.0.0.1'], ['169.254.169.254', '169.254.169.254'], ['example.com', null],
  ['1.2.3.4.5', null], ['8.8.8.8', '8.8.8.8'], ['0.0.0.0', '0.0.0.0'],
  ['0xA9FEA9FE', '169.254.169.254'], // 169.254.169.254 as hex literal
];

let fail = 0;
for (const [input, expected] of ipCases) {
  const got = isBlockedIp(input);
  if (got !== expected) {
    fail++;
    console.log(`MISMATCH isBlockedIp(${input}) = ${got} expected ${expected}`);
  }
}
for (const [input, expected] of litCases) {
  const got = canonicalIpv4Literal(input);
  if (got !== expected) {
    fail++;
    console.log(`MISMATCH canonicalIpv4Literal(${input}) = ${JSON.stringify(got)} expected ${JSON.stringify(expected)}`);
  }
}
console.log(fail === 0
  ? `=== ALL GUARD UNIT CHECKS PASS (${ipCases.length} IP + ${litCases.length} literal) ===`
  : `FAILURES: ${fail}`);
process.exit(fail === 0 ? 0 : 1);
