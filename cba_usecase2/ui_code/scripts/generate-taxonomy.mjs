import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
export const sourceHash = source => createHash('sha256').update(source).digest('hex');

// Deliberately narrow YAML reader: the checked-in taxonomy uses plain strings,
// mappings, value lists and folded (>-) descriptions. Fail on unsupported syntax
// within categories rather than silently generating a changed classification.
export function parseTaxonomy(source) {
  const lines = source.toString('utf8').replace(/\r\n/g, '\n').split('\n');
  const categories = {};
  let active = false, category, value;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (line === 'categories:') { active = true; continue; }
    if (!active) continue;
    if (/^\S/.test(line)) break; // role and rules never enter the output.
    let match;
    if ((match = /^  (category[12]):$/.exec(line))) {
      if (categories[match[1]]) throw new Error('Duplicate category');
      category = categories[match[1]] = { title: '', description: '', values: [] };
      value = undefined;
    } else if ((match = /^    (title|description): (.+)$/.exec(line))) {
      if (!category) throw new Error('Category field without category');
      category[match[1]] = match[2];
    } else if (line === '    values:') {
      if (!category) throw new Error('Values without category');
    } else if ((match = /^      - name: (.+)$/.exec(line))) {
      if (!category) throw new Error('Value without category');
      value = { name: match[1], description: '' };
      category.values.push(value);
    } else if ((match = /^        description: (.+)$/.exec(line))) {
      if (!value) throw new Error('Description without value');
      if (match[1] === '>-') {
        const parts = [];
        while (i + 1 < lines.length && (!lines[i + 1].trim() || /^          /.test(lines[i + 1]))) {
          const next = lines[++i];
          if (next.trim()) parts.push(next.slice(10));
        }
        value.description = parts.join(' ');
      } else value.description = match[1];
    } else throw new Error(`Unsupported taxonomy YAML at line ${i + 1}`);
  }
  assert.deepEqual(Object.keys(categories), ['category1', 'category2']);
  for (const category of Object.values(categories)) {
    assert.ok(category.title && category.description && category.values.length);
    for (const value of category.values) assert.ok(value.name && value.description);
    assert.equal(new Set(category.values.map(value => value.name)).size, category.values.length);
  }
  return { version: sourceHash(source), categories };
}

export function testTaxonomy(source, taxonomy) {
  assert.deepEqual(taxonomy, parseTaxonomy(source));
  assert.equal(taxonomy.version, createHash('sha256').update(source).digest('hex'));
  assert.deepEqual(taxonomy.categories.category1.values.map(value => value.name), [
    'business profile', 'personal profile', 'general profile',
  ]);
  assert.deepEqual(taxonomy.categories.category2.values.map(value => value.name), [
    'transactions', 'onboarding and login', 'non functional requirement', 'customer support',
    'feature enhancement', 'security', 'closed account', 'statements',
  ]);
  assert.deepEqual(Object.keys(taxonomy), ['version', 'categories']);
  assert.equal(taxonomy.categories.category1.title, 'Profile category');
  assert.equal(taxonomy.categories.category2.title, 'Comment / Issue reported');
  assert.equal(taxonomy.categories.category1.description, 'Which type of banking profile the customer is using or talking about.');
  assert.equal(taxonomy.categories.category2.description, 'The main topic of the comment.');
  assert.deepEqual(Object.values(taxonomy.categories).flatMap(category => category.values.map(value => value.description)), [
    'Choose this if the comment contains ANY of these keywords or their obvious variants: Business, Cash flow, Profile, Two factor authentication (also 2FA / 2-factor), 2 way sign in, BTA, Business loan, Corporate, Y4B, BAS, Appointment booking, ABN, ACN, SMSF. If both business and personal cues are present, business profile wins.',
    'Choose this if there are NO business keywords (see business profile) but the comment has personal-banking cues such as: personal, home loan, savings, credit card, "my account", "my card", "my money", family terms (wife, husband, kids, mum, dad), etc.',
    'Anything else: the comment has neither business keywords nor clear personal-banking cues (default).',
    'Payments, transfers, PayID, BPAY, card payments, tap & pay, declined or pending transactions, account balances and transaction history.',
    'Opening an account, registration, identity verification, KYC, logging in, passwords, PINs, biometrics, two-factor / approval prompts, locked or blocked access.',
    'Performance and reliability issues.',
    'Complaint resolution, response quality, etc.',
    'Requests for new features or improvements to existing features.',
    'Fraud concerns, security threats, and everything else related to security.',
    'The customer has closed, is closing or wants to close their account, or the bank closed or froze their account; complaints about account closure, leaving the bank, or being unable to close an account.',
    'Account statements, transaction history exports, tax or interest statements, and documents or reports.',
  ]);
  assert.ok(!Object.hasOwn(taxonomy, 'role') && !Object.hasOwn(taxonomy, 'rules'));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const source = await readFile(resolve(root, 'config/taxonomy-source.yaml'));
  const taxonomy = parseTaxonomy(source);
  testTaxonomy(source, taxonomy);
  const output = resolve(root, 'config/taxonomy.json');
  if (process.argv.includes('--test')) {
    testTaxonomy(source, JSON.parse(await readFile(output, 'utf8')));
    console.log(`Taxonomy verified: 3 profiles, 8 issues, sha256 ${taxonomy.version}`);
  } else {
    await writeFile(output, `${JSON.stringify(taxonomy, null, 2)}\n`);
    console.log(`Generated config/taxonomy.json (${taxonomy.version})`);
  }
}
