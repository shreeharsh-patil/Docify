import {
  PDFDocument,
  PDFName,
  PDFHexString,
  PDFString,
  PDFDict,
  PDFArray,
  PDFRawStream,
  PDFRef,
  PDFNumber,
  PDFBool,
  PDFContext,
} from 'pdf-lib';
import { encryptPDF } from 'cryptpdf';

// ============================================================================
// Reference implementations ported from open-source projects:
//   - MD5, RC4/ARCFour, PDF17/PDF20 KDFs, prepareKeyData, buildObjectKey,
//     decodeUserPassword : from pdf.js (Mozilla) src/core/crypto.js
//   - object walk / Encrypt dictionary layout : from cryptpdf (R=5/V=5 AES-256)
// This module implements the genuine PDF "Standard Security Handler" for
// revisions 2-6, so Docify Protect/Unlock now produce spec-compliant encrypted
// PDFs that open in any reader (Adobe, Chrome, pdf.js) with the password.
// ============================================================================

const IV_LEN = 16;
const DEFAULT_PASSWORD_BYTES = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
]);

// ---- MD5 (ported from pdf.js `calculateMD5`) ---------------------------------
const MD5_PARAMS = {
  r: new Uint8Array([
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
  ]),
  k: new Int32Array([
    -680876936, -389564586, 606105819, -1044525330, -176418897, 1200080426, -1473231341, -45705983,
    1770035416, -1958414417, -42063, -1990404162, 1804603682, -40341101, -1502002290, 1236535329,
    -165796510, -1069501632, 643717713, -373897302, -701558691, 38016083, -660478335, -405537848,
    568446438, -1019803690, -187363961, 1163531501, -1444681467, -51403784, 1735328473, -1926607734,
    -378558, -2022574463, 1839030562, -35309556, -1530992060, 1272893353, -155497632, -1094730640,
    681279174, -358537222, -722521979, 76029189, -640364487, -421815835, 530742520, -995338651,
    -198630844, 1126891415, -1416354905, -57434055, 1700485571, -1894986606, -1051523, -2054922799,
    1873313359, -30611744, -1560198380, 1309151649, -145523070, -1120210379, 718787259, -343485551,
  ]),
};

const calculateMD5 = (data: Uint8Array, offset: number, length: number): Uint8Array => {
  let h0 = 1732584193,
    h1 = -271733879,
    h2 = -1732584194,
    h3 = 271733878;
  const paddedLength = (length + 72) & ~63;
  const padded = new Uint8Array(paddedLength);
  let i: number, j: number;
  for (i = 0; i < length; ++i) {
    padded[i] = data[offset++];
  }
  padded[i++] = 0x80;
  const n = paddedLength - 8;
  if (i < n) {
    i = n;
  }
  padded[i++] = (length << 3) & 0xff;
  padded[i++] = (length >> 5) & 0xff;
  padded[i++] = (length >> 13) & 0xff;
  padded[i++] = (length >> 21) & 0xff;
  padded[i++] = (length >>> 29) & 0xff;
  i += 3;
  const w = new Int32Array(16);
  const { k, r } = MD5_PARAMS;
  for (i = 0; i < paddedLength; ) {
    for (j = 0; j < 16; ++j, i += 4) {
      w[j] = padded[i] | (padded[i + 1] << 8) | (padded[i + 2] << 16) | (padded[i + 3] << 24);
    }
    let a = h0,
      b = h1,
      c = h2,
      d = h3,
      f: number,
      g: number;
    for (j = 0; j < 64; ++j) {
      if (j < 16) {
        f = (b & c) | (~b & d);
        g = j;
      } else if (j < 32) {
        f = (d & b) | (~d & c);
        g = (5 * j + 1) & 15;
      } else if (j < 48) {
        f = b ^ c ^ d;
        g = (3 * j + 5) & 15;
      } else {
        f = c ^ (b | ~d);
        g = (7 * j) & 15;
      }
      const tmp = d,
        rotateArg = (a + f + k[j] + w[g]) | 0,
        rotate = r[j];
      d = c;
      c = b;
      b = (b + ((rotateArg << rotate) | (rotateArg >>> (32 - rotate)))) | 0;
      a = tmp;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
  }
  return new Uint8Array([
    h0 & 0xff, (h0 >> 8) & 0xff, (h0 >> 16) & 0xff, (h0 >>> 24) & 0xff,
    h1 & 0xff, (h1 >> 8) & 0xff, (h1 >> 16) & 0xff, (h1 >>> 24) & 0xff,
    h2 & 0xff, (h2 >> 8) & 0xff, (h2 >> 16) & 0xff, (h2 >>> 24) & 0xff,
    h3 & 0xff, (h3 >> 8) & 0xff, (h3 >> 16) & 0xff, (h3 >>> 24) & 0xff,
  ]);
};

// ---- RC4 / ARCFour (ported from pdf.js `ARCFourCipher`) ---------------------
class ARCFourCipher {
  a = 0;
  b = 0;
  s: Uint8Array;
  constructor(key: Uint8Array) {
    const s = new Uint8Array(256);
    const keyLength = key.length;
    for (let i = 0; i < 256; ++i) {
      s[i] = i;
    }
    for (let i = 0, j = 0; i < 256; ++i) {
      const tmp = s[i];
      j = (j + tmp + key[i % keyLength]) & 0xff;
      s[i] = s[j];
      s[j] = tmp;
    }
    this.s = s;
  }
  encryptBlock(data: Uint8Array): Uint8Array {
    let a = this.a,
      b = this.b;
    const s = this.s;
    const n = data.length;
    const output = new Uint8Array(n);
    for (let i = 0; i < n; ++i) {
      a = (a + 1) & 0xff;
      const tmp = s[a];
      b = (b + tmp) & 0xff;
      const tmp2 = s[b];
      s[a] = tmp2;
      s[b] = tmp;
      output[i] = data[i] ^ s[(tmp + tmp2) & 0xff];
    }
    this.a = a;
    this.b = b;
    return output;
  }
}

// ---- WebCrypto helpers --------------------------------------------------------
const subtle = globalThis.crypto?.subtle;

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const hexToBytes = (hex: string): Uint8Array => {
  const clean = hex.replace(/[^0-9a-fA-F]/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; ++i) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
};

const utf8ToBytes = (str: string): Uint8Array => new TextEncoder().encode(str);

// Latin-1 password bytes (PDF spec R2-R4 passwords are 8-bit bytes)
const latin1ToBytes = (str: string): Uint8Array => {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; ++i) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
};

const isArrayEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const sha256 = async (data: Uint8Array): Promise<Uint8Array> => {
  const digest = await subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(digest);
};
const sha384 = async (data: Uint8Array): Promise<Uint8Array> => {
  const digest = await subtle.digest('SHA-384', data as BufferSource);
  return new Uint8Array(digest);
};
const sha512 = async (data: Uint8Array): Promise<Uint8Array> => {
  const digest = await subtle.digest('SHA-512', data as BufferSource);
  return new Uint8Array(digest);
};

const aesCbcDecrypt = async (key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
  const cryptoKey = await subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-CBC', length: key.length * 8 },
    false,
    ['decrypt']
  );
  const buf = await subtle.decrypt({ name: 'AES-CBC', iv: iv as BufferSource }, cryptoKey, data as BufferSource);
  return new Uint8Array(buf);
};

const aesCbcEncrypt = async (key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
  const cryptoKey = await subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-CBC', length: key.length * 8 },
    false,
    ['encrypt']
  );
  const buf = await subtle.encrypt({ name: 'AES-CBC', iv: iv as BufferSource }, cryptoKey, data as BufferSource);
  return new Uint8Array(buf);
};

// Single-block AES-ECB encrypt via WebCrypto (cryptpdf `aes256EcbEncrypt` trick)
const aesEcbEncryptBlock = async (key: Uint8Array, block: Uint8Array): Promise<Uint8Array> => {
  const cryptoKey = await subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-CBC', length: key.length * 8 },
    false,
    ['encrypt']
  );
  const buf = await subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, cryptoKey, block as BufferSource);
  return new Uint8Array(buf).slice(0, 16);
};

// Single-block AES-ECB decrypt via WebCrypto (cryptpdf `aes256EcbDecrypt` trick)
const aesEcbDecryptBlock = async (key: Uint8Array, block: Uint8Array): Promise<Uint8Array> => {
  const FULL_PAD = new Uint8Array(16).fill(16);
  const c2Input = new Uint8Array(16);
  for (let i = 0; i < 16; ++i) c2Input[i] = FULL_PAD[i] ^ block[i];
  const c2 = await aesEcbEncryptBlock(key, c2Input);
  const twoBlocks = new Uint8Array(32);
  twoBlocks.set(block, 0);
  twoBlocks.set(c2, 16);
  const cryptoKey = await subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'AES-CBC', length: key.length * 8 },
    false,
    ['decrypt']
  );
  const buf = await subtle.decrypt(
    { name: 'AES-CBC', iv: new Uint8Array(16) },
    cryptoKey,
    twoBlocks as BufferSource
  );
  return new Uint8Array(buf).slice(0, 16);
};

// AES-CBC without padding, processing only full 16-byte blocks (used by the
// R5/R6 key derivation and the PDF20 KDF, exactly as pdf.js AES128Cipher).
const aesCbcEncryptNoPadding = async (key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
  const blocks = Math.floor(data.length / 16);
  const out = new Uint8Array(blocks * 16);
  let prev: Uint8Array = new Uint8Array(iv);
  for (let i = 0; i < blocks; ++i) {
    const xored = new Uint8Array(16);
    for (let j = 0; j < 16; ++j) xored[j] = prev[j] ^ data[i * 16 + j];
    const enc = await aesEcbEncryptBlock(key, xored);
    out.set(enc, i * 16);
    prev = enc;
  }
  return out;
};

const aesCbcDecryptNoPadding = async (key: Uint8Array, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
  const blocks = Math.floor(data.length / 16);
  const out = new Uint8Array(blocks * 16);
  let prev: Uint8Array = new Uint8Array(iv);
  for (let i = 0; i < blocks; ++i) {
    const dec = await aesEcbDecryptBlock(key, data.subarray(i * 16, i * 16 + 16));
    for (let j = 0; j < 16; ++j) out[i * 16 + j] = prev[j] ^ dec[j];
    prev = new Uint8Array(data.subarray(i * 16, i * 16 + 16));
  }
  return out;
};

// ---- Key derivation: Algorithm 2 (R2-R4) ------------------------------------
// From pdf.js `#prepareKeyData`
const prepareKeyData = (
  fileId: Uint8Array,
  password: Uint8Array | null,
  ownerPassword: Uint8Array,
  userPassword: Uint8Array,
  flags: number,
  revision: number,
  keyLength: number,
  encryptMetadata: boolean
): Uint8Array | null => {
  const hashDataSize = 40 + ownerPassword.length + fileId.length;
  const hashData = new Uint8Array(hashDataSize);
  let i = 0,
    j: number,
    n: number;
  if (password) {
    n = Math.min(32, password.length);
    for (; i < n; ++i) {
      hashData[i] = password[i];
    }
  }
  j = 0;
  while (i < 32) {
    hashData[i++] = DEFAULT_PASSWORD_BYTES[j++];
  }
  hashData.set(ownerPassword, i);
  i += ownerPassword.length;
  hashData[i++] = flags & 0xff;
  hashData[i++] = (flags >> 8) & 0xff;
  hashData[i++] = (flags >> 16) & 0xff;
  hashData[i++] = (flags >>> 24) & 0xff;
  hashData.set(fileId, i);
  i += fileId.length;
  if (revision >= 4 && !encryptMetadata) {
    hashData.fill(0xff, i, i + 4);
    i += 4;
  }
  let hash = calculateMD5(hashData, 0, i);
  const keyLengthInBytes = keyLength >> 3;
  if (revision >= 3) {
    for (j = 0; j < 50; ++j) {
      hash = calculateMD5(hash, 0, keyLengthInBytes);
    }
  }
  const encryptionKey = hash.subarray(0, keyLengthInBytes);
  let cipher: ARCFourCipher,
    checkData: Uint8Array;
  if (revision >= 3) {
    i = 0;
    hashData.set(DEFAULT_PASSWORD_BYTES, i);
    i += 32;
    hashData.set(fileId, i);
    i += fileId.length;
    cipher = new ARCFourCipher(encryptionKey);
    checkData = cipher.encryptBlock(calculateMD5(hashData, 0, i));
    n = encryptionKey.length;
    const derivedKey = new Uint8Array(n);
    for (j = 1; j <= 19; ++j) {
      for (let k = 0; k < n; ++k) {
        derivedKey[k] = encryptionKey[k] ^ j;
      }
      cipher = new ARCFourCipher(derivedKey);
      checkData = cipher.encryptBlock(checkData);
    }
  } else {
    cipher = new ARCFourCipher(encryptionKey);
    checkData = cipher.encryptBlock(DEFAULT_PASSWORD_BYTES);
  }
  return checkData.every((data, k) => userPassword[k] === data) ? encryptionKey : null;
};

// ---- Key derivation: Algorithm 2.A / 2.B (R5 / R6) --------------------------
// From pdf.js `PDF17`, `PDF20` and `#createEncryptionKey20`
const pdf17Hash = (input: Uint8Array): Promise<Uint8Array> => sha256(input);

const pdf20Hash = async (password: Uint8Array, input: Uint8Array, userBytes: Uint8Array): Promise<Uint8Array> => {
  let k = (await sha256(input)).subarray(0, 32);
  let e: Uint8Array = new Uint8Array([0]);
  let i = 0;
  while (i < 64 || e[e.length - 1] > i - 32) {
    const combinedLength = password.length + k.length + userBytes.length;
    const combinedArray = new Uint8Array(combinedLength);
    let writeOffset = 0;
    combinedArray.set(password, writeOffset);
    writeOffset += password.length;
    combinedArray.set(k, writeOffset);
    writeOffset += k.length;
    combinedArray.set(userBytes, writeOffset);
    const k1 = new Uint8Array(combinedLength * 64);
    for (let j = 0, pos = 0; j < 64; j++, pos += combinedLength) {
      k1.set(combinedArray, pos);
    }
    const iv = k.subarray(16, 32);
    e = await aesCbcEncryptNoPadding(k.subarray(0, 16), iv, k1);
    const remainder = e.slice(0, 16).reduce((sum, byte) => sum + byte, 0) % 3;
    if (remainder === 0) {
      k = await sha256(e);
    } else if (remainder === 1) {
      k = await sha384(e);
    } else {
      k = await sha512(e);
    }
    i++;
  }
  return k.subarray(0, 32);
};

const createEncryptionKey20 = async (
  revision: number,
  password: Uint8Array | null,
  ownerPassword: Uint8Array,
  ownerValidationSalt: Uint8Array,
  ownerKeySalt: Uint8Array,
  uBytes: Uint8Array,
  userPassword: Uint8Array,
  userValidationSalt: Uint8Array,
  userKeySalt: Uint8Array,
  ownerEncryption: Uint8Array,
  userEncryption: Uint8Array
): Promise<Uint8Array | null> => {
  let pwd: Uint8Array;
  if (password) {
    const passwordLength = Math.min(127, password.length);
    pwd = password.subarray(0, passwordLength);
  } else {
    pwd = new Uint8Array(0);
  }
  const pdfAlgorithm = revision === 6 ? pdf20Hash : pdf17Hash;
  const checkUser = async () => {
    const hashData = new Uint8Array(pwd.length + 8);
    hashData.set(pwd, 0);
    hashData.set(userValidationSalt, pwd.length);
    const result = await pdfAlgorithm(pwd, hashData, new Uint8Array(0));
    return isArrayEqual(result, userPassword);
  };
  const checkOwner = async () => {
    const hashData = new Uint8Array(pwd.length + 56);
    hashData.set(pwd, 0);
    hashData.set(ownerValidationSalt, pwd.length);
    hashData.set(uBytes, pwd.length + ownerValidationSalt.length);
    const result = await pdfAlgorithm(pwd, hashData, uBytes);
    return isArrayEqual(result, ownerPassword);
  };
  if (pwd.length && (await checkUser())) {
    const hashData = new Uint8Array(pwd.length + 8);
    hashData.set(pwd, 0);
    hashData.set(userKeySalt, pwd.length);
    const key = await pdfAlgorithm(pwd, hashData, new Uint8Array(0));
    return await aesCbcDecryptNoPadding(key, new Uint8Array(16), userEncryption);
  } else if (pwd.length && (await checkOwner())) {
    const hashData = new Uint8Array(pwd.length + 56);
    hashData.set(pwd, 0);
    hashData.set(ownerKeySalt, pwd.length);
    hashData.set(uBytes, pwd.length + ownerKeySalt.length);
    const key = await pdfAlgorithm(pwd, hashData, uBytes);
    return await aesCbcDecryptNoPadding(key, new Uint8Array(16), ownerEncryption);
  }
  return null;
};

// ---- Object key: Algorithm 1 -------------------------------------------------
// From pdf.js `#buildObjectKey`
const buildObjectKey = (
  num: number,
  gen: number,
  encryptionKey: Uint8Array,
  isAes: boolean
): Uint8Array => {
  const n = encryptionKey.length;
  const key = new Uint8Array(n + 9);
  key.set(encryptionKey);
  let i = n;
  key[i++] = num & 0xff;
  key[i++] = (num >> 8) & 0xff;
  key[i++] = (num >> 16) & 0xff;
  key[i++] = gen & 0xff;
  key[i++] = (gen >> 8) & 0xff;
  if (isAes) {
    key[i++] = 0x73;
    key[i++] = 0x41;
    key[i++] = 0x6c;
    key[i++] = 0x54;
  }
  const hash = calculateMD5(key, 0, i);
  return hash.subarray(0, Math.min(n + 5, 16));
};

// ---- Algorithm 7: decode owner password (legacy non-empty owner file unlock) --
// From pdf.js `#decodeUserPassword`
const decodeUserPassword = (
  password: Uint8Array | null,
  ownerPassword: Uint8Array,
  revision: number,
  keyLength: number
): Uint8Array => {
  const hashData = new Uint8Array(32);
  let i = 0;
  const n = Math.min(32, password ? password.length : 0);
  for (; i < n; ++i) {
    hashData[i] = password![i];
  }
  let j = 0;
  while (i < 32) {
    hashData[i++] = DEFAULT_PASSWORD_BYTES[j++];
  }
  let hash = calculateMD5(hashData, 0, i);
  const keyLengthInBytes = keyLength >> 3;
  if (revision >= 3) {
    for (j = 0; j < 50; ++j) {
      hash = calculateMD5(hash, 0, hash.length);
    }
  }
  let cipher: ARCFourCipher,
    userPassword: Uint8Array;
  if (revision >= 3) {
    userPassword = ownerPassword;
    const derivedKey = new Uint8Array(keyLengthInBytes);
    for (j = 19; j >= 0; j--) {
      for (let k = 0; k < keyLengthInBytes; ++k) {
        derivedKey[k] = hash[k] ^ j;
      }
      cipher = new ARCFourCipher(derivedKey);
      userPassword = cipher.encryptBlock(userPassword);
    }
  } else {
    cipher = new ARCFourCipher(hash.subarray(0, keyLengthInBytes));
    userPassword = cipher.encryptBlock(ownerPassword);
  }
  return userPassword;
};

// ---- File ID extraction -------------------------------------------------------
const getFileIdBytes = (context: PDFContext): Uint8Array => {
  const trailer = context.trailerInfo as Record<string, unknown>;
  const id = trailer.ID;
  if (id instanceof PDFArray) {
    const first = id.get(0);
    if (first instanceof PDFHexString) return first.asBytes();
    if (first instanceof PDFString) return first.asBytes();
  }
  if (id instanceof PDFHexString) return id.asBytes();
  if (id instanceof PDFString) return id.asBytes();
  return new Uint8Array(0);
};

const getEncryptBytes = (dict: PDFDict, key: string): Uint8Array | null => {
  const v = dict.lookup(PDFName.of(key));
  if (v instanceof PDFHexString) return v.asBytes();
  if (v instanceof PDFString) return v.asBytes();
  return null;
};

const getEncryptNumber = (dict: PDFDict, key: string): number | null => {
  const v = dict.lookup(PDFName.of(key));
  if (v instanceof PDFNumber) return v.asNumber();
  return null;
};

// ---- Stream / string decryption for the standard handler ----------------------
type StreamDecryptor = (data: Uint8Array) => Promise<Uint8Array>;

const decryptStringsInDict = async (dict: PDFDict, dec: StreamDecryptor) => {
  for (const [key, value] of dict.entries()) {
    const n = key.asString();
    if (n === '/Length' || n === '/Filter' || n === '/DecodeParms') continue;
    if (value instanceof PDFString || value instanceof PDFHexString) {
      const bytes = value.asBytes();
      if (bytes.length < IV_LEN + 16) continue;
      try {
        const decrypted = await dec(bytes);
        dict.set(key, PDFHexString.of(bytesToHex(decrypted)));
      } catch {
        // leave untouched if not decryptable
      }
    } else if (value instanceof PDFDict) {
      await decryptStringsInDict(value, dec);
    } else if (value instanceof PDFArray) {
      await decryptStringsInArray(value, dec);
    }
  }
};

const decryptStringsInArray = async (arr: PDFArray, dec: StreamDecryptor) => {
  for (const el of arr.asArray()) {
    if (el instanceof PDFDict) {
      await decryptStringsInDict(el, dec);
    } else if (el instanceof PDFArray) {
      await decryptStringsInArray(el, dec);
    }
  }
};

// ---- Main: unlock a genuine encrypted PDF (R2-R6) -----------------------------
const decryptEncryptedPdfBytes = async (pdfBytes: Uint8Array, password: string): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true, updateMetadata: false });
  const context = pdfDoc.context;
  const trailer = context.trailerInfo as Record<string, unknown>;
  const encryptRef = trailer.Encrypt;
  if (!encryptRef) throw new Error('This PDF is not encrypted.');
  const encryptObj = context.lookup(encryptRef as PDFRef);
  if (!(encryptObj instanceof PDFDict)) throw new Error('Invalid /Encrypt dictionary.');

  const filter = encryptObj.lookup(PDFName.of('Filter'));
  const filterName = filter instanceof PDFName ? filter.asString() : null;
  if (!filterName || filterName !== '/Standard') {
    throw new Error(`Unsupported encryption filter: ${filterName ?? 'none'}`);
  }

  const V = getEncryptNumber(encryptObj, 'V') ?? 0;
  const R = getEncryptNumber(encryptObj, 'R') ?? 0;
  if (![1, 2, 4, 5].includes(V)) throw new Error(`Unsupported encryption algorithm V=${V}.`);

  const fileIdBytes = getFileIdBytes(context);
  let passwordBytes: Uint8Array | null = password ? latin1ToBytes(password) : null;
  if (V === 5) {
    passwordBytes = password ? utf8ToBytes(password) : null;
  }

  // Resolve cipher setup for the whole document.
  let encryptMetadata = true;

  let fileKey: Uint8Array | null = null;
  let streamCipher: 'rc4' | 'aes128' | 'aes256' | 'identity' = 'identity';
  let stringCipher: 'rc4' | 'aes128' | 'aes256' | 'identity' = 'identity';

  const encMetadataVal = encryptObj.lookup(PDFName.of('EncryptMetadata'));
  encryptMetadata = encMetadataVal instanceof PDFBool ? encMetadataVal.asBoolean() : true;

  if (V === 5) {
    // Algorithm 2.A / 2.B (AES-256)
    const ownerBytes = getEncryptBytes(encryptObj, 'O') ?? new Uint8Array(0);
    const userBytes = getEncryptBytes(encryptObj, 'U') ?? new Uint8Array(0);
    const ownerPassword = ownerBytes.subarray(0, 32);
    const userPassword = userBytes.subarray(0, 32);
    const ownerValidationSalt = ownerBytes.subarray(32, 40);
    const ownerKeySalt = ownerBytes.subarray(40, 48);
    const userValidationSalt = userBytes.subarray(32, 40);
    const userKeySalt = userBytes.subarray(40, 48);
    const ownerEncryption = getEncryptBytes(encryptObj, 'OE') ?? new Uint8Array(0);
    const userEncryption = getEncryptBytes(encryptObj, 'UE') ?? new Uint8Array(0);
    fileKey = await createEncryptionKey20(
      R,
      passwordBytes,
      ownerPassword,
      ownerValidationSalt,
      ownerKeySalt,
      userBytes.subarray(0, 48),
      userPassword,
      userValidationSalt,
      userKeySalt,
      ownerEncryption,
      userEncryption
    );
    if (fileKey) streamCipher = 'aes256';
    stringCipher = streamCipher;
  } else {
    // Algorithm 2 (RC4 / AES-128)
    let keyLength = getEncryptNumber(encryptObj, 'Length');
    if (!keyLength) {
      if (V <= 3) {
        keyLength = 40;
      } else {
        const cfDict = encryptObj.lookup(PDFName.of('CF'));
        const streamCryptoName = encryptObj.lookup(PDFName.of('StmF'));
        if (cfDict instanceof PDFDict && streamCryptoName instanceof PDFName) {
          const handlerEntry = cfDict.get(streamCryptoName);
          const handlerDict = handlerEntry instanceof PDFRef ? context.lookup(handlerEntry) : handlerEntry;
          const lengthEntry = handlerDict instanceof PDFDict ? handlerDict.get(PDFName.of('Length')) : null;
          keyLength =
            lengthEntry instanceof PDFNumber ? lengthEntry.asNumber() : 128;
          if (keyLength < 40) keyLength <<= 3;
        }
      }
    }
    if (!keyLength || keyLength < 40 || keyLength % 8 !== 0) {
      throw new Error(`Invalid key length: ${keyLength}`);
    }
    const ownerBytes = getEncryptBytes(encryptObj, 'O') ?? new Uint8Array(0);
    const userBytes = getEncryptBytes(encryptObj, 'U') ?? new Uint8Array(0);
    const ownerPassword = ownerBytes.subarray(0, 32);
    const userPassword = userBytes.subarray(0, 32);
    const flags = getEncryptNumber(encryptObj, 'P') ?? 0;
    const revision = R;

    let encryptionKey = prepareKeyData(
      fileIdBytes,
      passwordBytes,
      ownerPassword,
      userPassword,
      flags,
      revision,
      keyLength,
      encryptMetadata
    );
    if (!encryptionKey && password) {
      const decodedPassword = decodeUserPassword(passwordBytes, ownerPassword, revision, keyLength);
      encryptionKey = prepareKeyData(
        fileIdBytes,
        decodedPassword,
        ownerPassword,
        userPassword,
        flags,
        revision,
        keyLength,
        encryptMetadata
      );
    }
    if (!encryptionKey) throw new Error('Incorrect password. Access denied.');
    if (V === 4 && encryptionKey.length < 16) {
      const padded = new Uint8Array(16);
      padded.set(encryptionKey);
      encryptionKey = padded;
    }
    fileKey = encryptionKey;

    // Determine crypt filter (V4) or legacy RC4 (V1/V2)
    if (V === 4) {
      const cfDict = encryptObj.lookup(PDFName.of('CF'));
      const stmfName = encryptObj.lookup(PDFName.of('StmF'));
      const strfName = encryptObj.lookup(PDFName.of('StrF'));
      const stmf = stmfName instanceof PDFName ? stmfName : PDFName.of('Identity');
      const strf = strfName instanceof PDFName ? strfName : PDFName.of('Identity');
      const resolveCfm = (name: PDFName): 'rc4' | 'aes128' | 'identity' => {
        if (cfDict instanceof PDFDict) {
          const entry = cfDict.get(name);
          const entryDict = entry instanceof PDFRef ? context.lookup(entry) : entry;
          const cfm = entryDict instanceof PDFDict ? entryDict.get(PDFName.of('CFM')) : null;
          const cfmName = cfm instanceof PDFName ? cfm.asString() : null;
          if (cfmName === '/AESV2') return 'aes128';
          if (cfmName === '/V2') return 'rc4';
          return 'identity';
        }
        return 'identity';
      };
      streamCipher = resolveCfm(stmf);
      stringCipher = resolveCfm(strf);
    } else {
      streamCipher = 'rc4';
      stringCipher = 'rc4';
    }
  }

  if (!fileKey) throw new Error('Incorrect password. Access denied.');

  const makeDecryptor = (objNum: number, objGen: number): StreamDecryptor => {
    if (streamCipher === 'rc4') {
      const key = buildObjectKey(objNum, objGen, fileKey, false);
      const cipher = new ARCFourCipher(key);
      return async (data: Uint8Array) => cipher.encryptBlock(data);
    }
    if (streamCipher === 'aes128') {
      const key = buildObjectKey(objNum, objGen, fileKey, true);
      return async (data: Uint8Array) => {
        if (data.length < IV_LEN + 16) return data;
        const iv = data.slice(0, IV_LEN);
        const ciphertext = data.slice(IV_LEN);
        return await aesCbcDecrypt(key, iv, ciphertext);
      };
    }
    if (streamCipher === 'aes256') {
      return async (data: Uint8Array) => {
        if (data.length < IV_LEN + 16) return data;
        const iv = data.slice(0, IV_LEN);
        const ciphertext = data.slice(IV_LEN);
        return await aesCbcDecrypt(fileKey!, iv, ciphertext);
      };
    }
    return async (data: Uint8Array) => data;
  };

  const makeStringDecryptor = (objNum: number, objGen: number): StreamDecryptor => {
    if (stringCipher === 'rc4') {
      const key = buildObjectKey(objNum, objGen, fileKey, false);
      const cipher = new ARCFourCipher(key);
      return async (data: Uint8Array) => cipher.encryptBlock(data);
    }
    if (stringCipher === 'aes128') {
      const key = buildObjectKey(objNum, objGen, fileKey, true);
      return async (data: Uint8Array) => {
        if (data.length < IV_LEN + 16) return data;
        const iv = data.slice(0, IV_LEN);
        const ciphertext = data.slice(IV_LEN);
        return await aesCbcDecrypt(key, iv, ciphertext);
      };
    }
    if (stringCipher === 'aes256') {
      return async (data: Uint8Array) => {
        if (data.length < IV_LEN + 16) return data;
        const iv = data.slice(0, IV_LEN);
        const ciphertext = data.slice(IV_LEN);
        return await aesCbcDecrypt(fileKey!, iv, ciphertext);
      };
    }
    return async (data: Uint8Array) => data;
  };

  const indirectObjects = context.enumerateIndirectObjects();
  for (const [ref, obj] of indirectObjects) {
    if (!(ref instanceof PDFRef)) continue;
    if (obj instanceof PDFDict) {
      const filter = obj.get(PDFName.of('Filter'));
      const filterName = filter instanceof PDFName ? filter.asString() : null;
      if (filterName === '/Standard') continue;
    }
    if (obj instanceof PDFRawStream) {
      const streamData = obj.contents;
      const dec = makeDecryptor(ref.objectNumber, ref.generationNumber);
      (obj as unknown as { contents: Uint8Array }).contents = await dec(streamData);
    }
    if (obj instanceof PDFDict) {
      const dec = makeStringDecryptor(ref.objectNumber, ref.generationNumber);
      await decryptStringsInDict(obj, dec);
    } else if (obj instanceof PDFArray) {
      const dec = makeStringDecryptor(ref.objectNumber, ref.generationNumber);
      await decryptStringsInArray(obj, dec);
    }
  }

  delete (context.trailerInfo as Record<string, unknown>).Encrypt;
  return await pdfDoc.save({ useObjectStreams: false });
};

// ============================================================================
// Public API
// ============================================================================

// PROTECT: genuine AES-256 (R=5, V=5) encryption, per ISO 32000-2. The output
// is a spec-compliant encrypted PDF readable by any conforming viewer.
export const protectPdf = async (pdfBytes: Uint8Array, password: string): Promise<Uint8Array> => {
  if (!password) throw new Error('Please enter a password.');
  return encryptPDF(pdfBytes, password, undefined, { permissions: -4, encryptMetadata: true });
};

// UNLOCK: removes encryption from a genuine password-protected PDF (R2-R6).
export const unlockPdf = async (pdfBytes: Uint8Array, password: string): Promise<Uint8Array> => {
  if (!password) throw new Error('Please enter your decrypt password.');
  return await decryptEncryptedPdfBytes(pdfBytes, password);
};

export const isPdfEncrypted = async (pdfBytes: Uint8Array): Promise<boolean> => {
  try {
    await PDFDocument.load(pdfBytes, { updateMetadata: false });
    return false;
  } catch {
    return true;
  }
};

// Legacy Docify XOR format (kept for backwards compatibility with files that
// were locked by earlier versions of Docify's Protect tool).
export const DOCIFY_HEADER = 'DOCIFYPT';

export const isDocifyXorEncrypted = (buffer: ArrayBuffer | Uint8Array): boolean => {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length < 8) return false;
  return new TextDecoder().decode(bytes.slice(0, 8)) === DOCIFY_HEADER;
};

export const legacyXorDecrypt = (buffer: ArrayBuffer | Uint8Array, pass: string): Uint8Array => {
  const inputBytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const headerStr = new TextDecoder().decode(inputBytes.slice(0, 8));
  if (headerStr !== DOCIFY_HEADER) {
    throw new Error('This PDF is either not encrypted by Docify or is already unlocked.');
  }
  const passBytes = new TextEncoder().encode(pass);
  let checkSum = 0;
  for (const byte of passBytes) {
    checkSum = (checkSum + byte) % 256;
  }
  const fileChecksum = inputBytes[inputBytes.length - 1];
  if (checkSum !== fileChecksum) {
    throw new Error('Incorrect password. Access denied.');
  }
  const decryptedLength = inputBytes.length - 8 - 1;
  const decryptedBytes = new Uint8Array(decryptedLength);
  for (let i = 0; i < decryptedLength; i++) {
    const passKey = passBytes[i % passBytes.length];
    decryptedBytes[i] = inputBytes[8 + i] ^ passKey;
  }
  return decryptedBytes;
};

// Backwards-compatible unified entry points used by PdfWorkspace.
export const encryptPdfBuffer = async (buffer: ArrayBuffer, pass: string): Promise<Uint8Array> => {
  return protectPdf(new Uint8Array(buffer), pass);
};

export const decryptPdfBuffer = async (buffer: ArrayBuffer, pass: string): Promise<Uint8Array> => {
  const inputBytes = new Uint8Array(buffer);
  if (isDocifyXorEncrypted(inputBytes)) {
    return legacyXorDecrypt(inputBytes, pass);
  }
  return unlockPdf(inputBytes, pass);
};