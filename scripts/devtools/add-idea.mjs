#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: npm run idee -- "/idee texte de l\'idee"');
  process.exit(0);
}

const raw = args.join(' ').trim();
const cleaned = raw.replace(/^\/(idee|idée)\s*:?\s*/i, '').trim();

if (!cleaned) {
  console.error('Erreur: idee vide. Exemple: npm run idee -- "/idee améliorer onboarding"');
  process.exit(1);
}

const root = process.cwd();
const backlogPath = path.join(root, 'IDEAS_BACKLOG.md');

if (!fs.existsSync(backlogPath)) {
  const initial = [
    '# Idees En Attente',
    '',
    'Ajoute une idee avec:',
    '- npm run idee -- "/idee ton texte"',
    '',
    '## Inbox',
    ''
  ].join('\n');
  fs.writeFileSync(backlogPath, initial, 'utf8');
}

const now = new Date();
const date = now.toISOString().slice(0, 16).replace('T', ' ');
const line = `- [ ] ${date} - ${cleaned}`;

let content = fs.readFileSync(backlogPath, 'utf8');
if (!content.endsWith('\n')) content += '\n';
content += `${line}\n`;
fs.writeFileSync(backlogPath, content, 'utf8');

console.log(`Idee ajoutee dans IDEAS_BACKLOG.md: ${cleaned}`);
