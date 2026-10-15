// Password hashing (Node's built-in scrypt, no native-addon dependency like
// bcrypt) and stateless, signed session tokens (HMAC-SHA256, no session
// store needed on the server) for the admin console and the patient portal.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function getOrCreateSessionSecret(dataDir) {
  const envSecret = (process.env.SESSION_SECRET || '').trim();
  if (envSecret) return envSecret;

  const secretPath = path.join(dataDir, '.session-secret');
  try {
    if (fs.existsSync(secretPath)) {
      const existing = fs.readFileSync(secretPath, 'utf8').trim();
      if (existing) return existing;
    }
  } catch (error) {
    console.error('⚠️  Could not read session secret file:', error.message);
  }

  const generated = crypto.randomBytes(48).toString('hex');
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(secretPath, generated, 'utf8');
    console.log('ℹ️  Generated a new session secret and saved it to', secretPath);
    console.log('   Set SESSION_SECRET in your environment to control this explicitly (recommended for production).');
  } catch (error) {
    console.error('⚠️  Could not persist generated session secret (it will change on every restart):', error.message);
  }
  return generated;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  try {
    const candidate = crypto.scryptSync(String(password), salt, 64);
    const expected = Buffer.from(hashHex, 'hex');
    if (candidate.length !== expected.length) return false;
    return crypto.timingSafeEqual(candidate, expected);
  } catch {
    return false;
  }
}

function base64url(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input) {
  const padLength = (4 - (input.length % 4)) % 4;
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLength);
  return Buffer.from(padded, 'base64');
}

function createTokenFactory(secret) {
  function signToken(payload, expiresInSeconds) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const body = { ...payload, iat: nowSeconds, exp: nowSeconds + expiresInSeconds };
    const payloadPart = base64url(Buffer.from(JSON.stringify(body), 'utf8'));
    const signature = crypto.createHmac('sha256', secret).update(payloadPart).digest();
    const sigPart = base64url(signature);
    return `${payloadPart}.${sigPart}`;
  }

  function verifyToken(token) {
    if (!token || typeof token !== 'string' || !token.includes('.')) return null;
    const [payloadPart, sigPart] = token.split('.');
    if (!payloadPart || !sigPart) return null;

    const expectedSignature = crypto.createHmac('sha256', secret).update(payloadPart).digest();
    const expectedSigPart = base64url(expectedSignature);

    const provided = Buffer.from(sigPart);
    const expected = Buffer.from(expectedSigPart);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      return null;
    }

    let payload;
    try {
      payload = JSON.parse(base64urlDecode(payloadPart).toString('utf8'));
    } catch {
      return null;
    }

    if (!payload || typeof payload.exp !== 'number' || Math.floor(Date.now() / 1000) > payload.exp) {
      return null;
    }

    return payload;
  }

  return { signToken, verifyToken };
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

module.exports = {
  getOrCreateSessionSecret,
  hashPassword,
  verifyPassword,
  createTokenFactory,
  getBearerToken,
};
