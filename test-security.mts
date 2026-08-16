import fs from 'node:fs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - test-only import path
import {
  protectPdf,
  unlockPdf,
  encryptPdfBuffer,
  decryptPdfBuffer,
  isDocifyXorEncrypted,
} from './lib/pdf-security';

const plain = fs.readFileSync('C:/Users/shree/AppData/Local/Temp/opencode/plain.pdf');

async function main() {
  const encrypted = await protectPdf(plain, 'secret123');
  fs.writeFileSync('C:/Users/shree/AppData/Local/Temp/opencode/my-encrypted.pdf', encrypted);
  const encStr = Buffer.from(encrypted).toString('latin1');
  console.log('1. Protect size:', encrypted.length);
  console.log('   R=5:', /\/R\s+5/.test(encStr), 'V=5:', /\/V\s+5/.test(encStr), 'AESV3:', encStr.includes('/AESV3'));

  const decrypted = await unlockPdf(encrypted, 'secret123');
  const decStr = Buffer.from(decrypted).toString('latin1');
  console.log('2. Unlock own file: contains text?', decStr.includes('Hello Docify'));

  const cryptpdfEnc = fs.readFileSync('C:/Users/shree/AppData/Local/Temp/opencode/encrypted.pdf');
  const decrypted2 = await unlockPdf(new Uint8Array(cryptpdfEnc), 'secret123');
  const decStr2 = Buffer.from(decrypted2).toString('latin1');
  console.log('3. Unlock cryptpdf file: contains text?', decStr2.includes('Hello Docify'));

  const r4 = fs.readFileSync('C:/Users/shree/AppData/Local/Temp/opencode/r4-encrypted.pdf');
  const decrypted3 = await unlockPdf(new Uint8Array(r4), 'testpass');
  const decStr3 = Buffer.from(decrypted3).toString('latin1');
  console.log('4. Unlock R4 pdfkit file: contains text?', decStr3.includes('PDFKit encryption'));

  const r3 = fs.readFileSync('C:/Users/shree/AppData/Local/Temp/opencode/r3-encrypted.pdf');
  const decrypted4 = await unlockPdf(new Uint8Array(r3), 'testpass');
  const decStr4 = Buffer.from(decrypted4).toString('latin1');
  console.log('5. Unlock R3 pdfkit file: contains text?', decStr4.includes('PDFKit encryption'));

  try {
    await unlockPdf(encrypted, 'wrongpass');
    console.log('6. Wrong password: NO ERROR (BAD)');
  } catch (e) {
    console.log('6. Wrong password correctly rejected:', (e as Error).message);
  }

  const out = await encryptPdfBuffer(plain.buffer.slice(0) as ArrayBuffer, 'pw123');
  const back = await decryptPdfBuffer(out.buffer.slice(0) as ArrayBuffer, 'pw123');
  console.log('7. Backward wrapper round-trip ok:', Buffer.from(back).toString('latin1').includes('Hello Docify'));

  const legacyBytes = new Uint8Array(plain.length + 9);
  legacyBytes.set(Buffer.from('DOCIFYPT'), 0);
  const passBytes = Buffer.from('oldpass');
  let chk = 0;
  for (const b of passBytes) chk = (chk + b) % 256;
  for (let i = 0; i < plain.length; i++) legacyBytes[8 + i] = plain[i] ^ passBytes[i % passBytes.length];
  legacyBytes[legacyBytes.length - 1] = chk;
  console.log('8. Legacy XOR detected:', isDocifyXorEncrypted(legacyBytes));
  const legacyOut = await decryptPdfBuffer(legacyBytes.buffer.slice(0), 'oldpass');
  console.log('   Legacy XOR decrypted ok:', Buffer.from(legacyOut).toString('latin1').includes('Hello Docify'));
}

main().catch((e) => {
  console.error('FAILED:', e);
  process.exit(1);
});