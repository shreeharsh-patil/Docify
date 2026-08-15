import { readFileSync } from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const buf = readFileSync('C:/Users/shree/AppData/Local/Temp/opencode/r4-encrypted.pdf');
const task = getDocument({ data: new Uint8Array(buf), password: 'testpass' });
const pdf = await task.promise;
const page = await pdf.getPage(1);
const content = await page.getTextContent();
console.log('text:', JSON.stringify(content.items.map((it) => ('str' in it ? it.str : '')).join(' ')));
console.log('VERIFIED: pdfkit R4 file opens in pdf.js with password');