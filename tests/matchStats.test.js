import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTeamStats } from '../scripts/matchStats.js';

test('incluye tandaPenaltis cuando hay tanda', () => {
    assert.deepEqual(buildTeamStats(2, 4), { goles: 2, tandaPenaltis: 4 });
});

test('omite tandaPenaltis cuando no hubo tanda', () => {
    assert.deepEqual(buildTeamStats(2, undefined), { goles: 2 });
});

test('conserva tandaPenaltis 0 cuando Sofascore lo expone', () => {
    assert.deepEqual(buildTeamStats(2, 0), { goles: 2, tandaPenaltis: 0 });
});
