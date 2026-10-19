import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const INSECURE_JWT_SECRET = 'porra-ucl-champions-2026-secret-key-change-in-production';
const ALLOWED_ORIGINS = [
  'https://porra-spa.vercel.app',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080'
];

export function authenticate(req) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Token de autenticación requerido' };
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    return { ok: true, username: decoded.username };
  } catch (e) {
    return { ok: false, status: 401, error: 'Token inválido o expirado' };
  }
}

export function clientIp(req) {
  if (process.env.TRUST_PROXY === '1') {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (/^[0-9a-fA-F:.]{3,45}$/.test(xff)) return xff;
  }
  return req.socket?.remoteAddress || 'unknown';
}

export function mergeVary(res, value) {
  const current = String(res.getHeader('Vary') || '');
  const tokens = current.split(',').map(token => token.trim()).filter(Boolean);

  for (const token of String(value).split(',').map(item => item.trim()).filter(Boolean)) {
    if (!tokens.some(existing => existing.toLowerCase() === token.toLowerCase())) {
      tokens.push(token);
    }
  }

  res.setHeader('Vary', tokens.join(', '));
}

export function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin)
    || /^http:\/\/localhost(:\d+)?$/.test(origin || '');
}

export function isInsecureProductionSecret(env, secret) {
  return env === 'production' && (!secret || secret === INSECURE_JWT_SECRET);
}

export function rateLimiter({ windowMs = 15 * 60 * 1000, max = 10, keyFn } = {}) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.resetTime) hits.delete(key);
    }
  }, windowMs);

  return function checkRateLimit(req) {
    const key = keyFn ? keyFn(req) : clientIp(req);
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now > entry.resetTime) {
      hits.set(key, { count: 1, resetTime: now + windowMs });
      return { ok: true };
    }

    entry.count++;
    if (entry.count > max) {
      return { ok: false, status: 429, error: 'Demasiadas peticiones, intenta de nuevo más tarde' };
    }

    return { ok: true };
  };
}

export function checkBodySize(req, maxSizeBytes = 1024 * 1024) {
  const contentLength = parseInt(req.headers['content-length'], 10);
  if (isNaN(contentLength) || contentLength > maxSizeBytes) {
    return { ok: false, status: 413, error: 'Body demasiado grande' };
  }
  return { ok: true };
}

export function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

export function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return { ok: false, error: 'Usuario requerido' };
  }
  const trimmed = username.trim().toLowerCase();
  if (trimmed.length < 3 || trimmed.length > 20) {
    return { ok: false, error: 'El usuario debe tener entre 3 y 20 caracteres' };
  }
  if (!/^[a-z0-9_]+$/.test(trimmed)) {
    return { ok: false, error: 'El usuario solo puede contener letras, números y guiones bajos' };
  }
  return { ok: true, username: trimmed };
}

export function authRateLimiter({ windowMs = 60 * 1000, max = 30 } = {}) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (now > entry.resetTime) hits.delete(key);
    }
  }, windowMs);

  return function checkAuthRateLimit(req) {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { ok: true };
    }

    const token = authHeader.slice(7);
    let username;
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      username = decoded.username;
    } catch {
      return { ok: true };
    }

    const now = Date.now();
    const entry = hits.get(username);

    if (!entry || now > entry.resetTime) {
      hits.set(username, { count: 1, resetTime: now + windowMs });
      return { ok: true };
    }

    entry.count++;
    if (entry.count > max) {
      return { ok: false, status: 429, error: 'Demasiadas peticiones, intenta de nuevo más tarde' };
    }

    return { ok: true };
  };
}
