import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getQualityBadges, dbnameFor, entitiesUrl } from '../src/core/wikidata.js';

test('dbnameFor derives the dbname from the site host', () => {
  assert.equal(dbnameFor('en.wikipedia.org'), 'enwiki');
  assert.equal(dbnameFor('als.wikipedia.org'), 'alswiki');
  assert.equal(dbnameFor('bat-smg.wikipedia.org'), 'bat_smgwiki');
});

test('getQualityBadges maps featured and good badges by dbname', async () => {
  const fetchJson = async url => {
    if (url.includes('pageprops')) return { query: { pages: { 1: { pageprops: { wikibase_item: 'Q513' } } } } };
    return {
      entities: {
        Q513: {
          sitelinks: {
            enwiki: { title: 'Mount Everest', badges: ['Q17437796'] },
            dewiki: { title: 'Mount Everest', badges: ['Q17437798'] },
            frwiki: { title: 'Everest', badges: [] }
          }
        }
      }
    };
  };
  const b = await getQualityBadges('en', 'Mount Everest', { fetchJson });
  assert.equal(b.enwiki, 'featured');
  assert.equal(b.dewiki, 'good');
  assert.equal(b.frwiki, undefined);
});

test('getQualityBadges returns empty when no wikidata item', async () => {
  const b = await getQualityBadges('en', 'X', { fetchJson: async () => ({ query: { pages: { 1: {} } } }) });
  assert.deepEqual(b, {});
});

test('a failed entities lookup yields no badges rather than throwing', async () => {
  const fetchJson = async url => (url.includes('wbgetentities')
    ? null
    : { query: { pages: { 1: { pageprops: { wikibase_item: 'Q513' } } } } });
  assert.deepEqual(await getQualityBadges('en', 'Mount Everest', { fetchJson }), {});
});

test('badges are read from the sitelinks of a healthy reply', async () => {
  const fetchJson = async url => (url.includes('wbgetentities')
    ? { entities: { Q513: { sitelinks: {
        dewiki: { site: 'dewiki', badges: ['Q17437796'] },
        frwiki: { site: 'frwiki', badges: ['Q17437798'] },
        eswiki: { site: 'eswiki', badges: [] } } } } }
    : { query: { pages: { 1: { pageprops: { wikibase_item: 'Q513' } } } } });
  assert.deepEqual(await getQualityBadges('en', 'Mount Everest', { fetchJson }),
    { dewiki: 'featured', frwiki: 'good' });
});

test('the wikidata entities url does not send maxlag', () => {
  assert.doesNotMatch(entitiesUrl('Q513'), /maxlag/,
    'wikidata counts query-service lag against maxlag, which silently kills badge lookups');
  assert.match(entitiesUrl('Q513'), /origin=\*/);
});
