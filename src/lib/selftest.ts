/** Run with: npm test - exercises the maths and the validator without a browser. */
import assert from 'node:assert/strict';
import { overlap, parseCidr } from './netmath';
import { addPort, parsePorts, removePort, formatPorts } from './ports';
import { demoProject, newProject } from './schema';
import { validateProject } from './validate';
import { buildReport, toPunchListText } from './export';

const info = (s: string) => {
  const r = parseCidr(s);
  assert.ok(r.ok, `${s} should parse`);
  return r.ok ? r.info : (null as never);
};

// subnet maths
const a = info('192.168.10.77/24');
assert.equal(a.network, '192.168.10.0');
assert.equal(a.broadcast, '192.168.10.255');
assert.equal(a.firstUsable, '192.168.10.1');
assert.equal(a.lastUsable, '192.168.10.254');
assert.equal(a.usableHosts, 254);
assert.equal(a.mask, '255.255.255.0');
assert.equal(a.wildcard, '0.0.0.255');
assert.equal(a.hostBitsSet, true);
assert.equal(info('10.0.0.0/8').usableHosts, 16777214);
assert.equal(info('10.0.0.0/0').totalAddresses, 4294967296);
assert.equal(info('10.0.0.4/30').lastUsable, '10.0.0.6');
assert.equal(info('10.0.0.0/31').usableHosts, 2);
assert.equal(info('10.0.0.9/32').usableHosts, 1);
assert.equal(info('172.16.5.1 255.255.240.0').cidr, '172.16.0.0/20');
assert.equal(info('255.255.255.255/32').broadcast, '255.255.255.255');
assert.equal(info('8.8.8.8/24').range, 'public');
assert.equal(info('172.31.255.1/16').range, 'RFC1918');
assert.equal(info('172.32.0.1/16').range, 'public');
for (const bad of ['', '300.1.1.1/24', '10.0.0.0/33', '10.0.0/24', '10.0.0.0 255.0.255.0', '010.0.0.1/24', 'abc']) {
  assert.equal(parseCidr(bad).ok, false, `${bad} should fail`);
}

// overlaps
assert.equal(overlap(info('10.0.0.0/8'), info('10.20.0.0/16')).kind, 'a-contains-b');
assert.equal(overlap(info('10.20.0.0/16'), info('10.0.0.0/8')).kind, 'b-contains-a');
assert.equal(overlap(info('10.0.0.0/24'), info('10.0.0.0/24')).kind, 'identical');
assert.equal(overlap(info('10.0.0.0/24'), info('10.0.1.0/24')).kind, 'none');
assert.equal(overlap(info('192.168.0.0/23'), info('192.168.1.128/25')).sharedCount, 128);

// ports
const { ranges, invalid } = parsePorts('502, 5026, 1000-1010, banana, 70000');
assert.equal(formatPorts(ranges), '502, 1000-1010, 5026');
assert.deepEqual(invalid, ['banana', '70000']);
assert.equal(formatPorts(removePort(parsePorts('1000-1010').ranges, 1005)), '1000-1004, 1006-1010');
assert.equal(formatPorts(addPort(parsePorts('502').ranges, 503)), '502-503');

// validator on the seeded demo
const v = validateProject(demoProject());
const titles = v.findings.map((f) => f.title).join('\n');
assert.match(titles, /IT \/ OT subnet overlap/);
assert.match(titles, /no DMZ/);
assert.match(titles, /Blocked: OPC UA 48031/);
assert.match(titles, /Blocked: ASB auth 808/);
assert.match(titles, /Duplicate IP 10\.20\.1\.11/);
assert.match(titles, /outside Line 3 PLCs/);
assert.match(titles, /Risky port 3389/);
assert.equal(v.approved, false);

// a clean design passes
const clean = newProject('clean');
clean.zones = [
  { id: 'z1', name: 'HMI', level: 2, slTarget: 3, subnets: ['10.0.2.0/24'] },
  { id: 'z2', name: 'PLC', level: 1, slTarget: 3, subnets: ['10.0.1.0/24'] },
];
clean.nodes = [
  { id: 'n1', zoneId: 'z1', name: 'FW', type: 'firewall', ip: '10.0.2.1', hosts: [] },
  { id: 'n2', zoneId: 'z2', name: 'PLC1', type: 'plc', ip: '10.0.1.10', hosts: ['modbus'] },
];
clean.conduits = [
  { id: 'c1', name: 'HMI to PLC', fromZoneId: 'z1', toZoneId: 'z2', firewallId: 'n1', requiredServices: ['modbus'], allowed: [{ from: 502, to: 502 }] },
];
const vc = validateProject(clean);
assert.equal(vc.counts.error, 0, JSON.stringify(vc.findings, null, 1));
assert.equal(vc.approved, true);
clean.conduits[0].allowed = [];
assert.equal(validateProject(clean).counts.error, 1);

// export
const rep = buildReport(demoProject());
assert.equal(rep.status, 'NOT APPROVED');
assert.ok(rep.portPunchList.some((p) => p.port === 48031 && p.status === 'BLOCKED'));
assert.match(toPunchListText(rep), /BLOCKED/);
JSON.parse(JSON.stringify(rep));

console.log('selftest ok -', v.counts.error, 'errors,', v.counts.warning, 'warnings,', v.counts.info, 'notes on demo');
