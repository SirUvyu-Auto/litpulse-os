const crypto = require('crypto');
const https = require('https');
const express = require('express');

const TENANT_ID = process.env.MICROSOFT_TENANT_ID || '9bef8f44-0379-4246-9b04-bd8e4b7f0356';
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || '9ceff23d-a6f4-4321-9b86-9f77269e7c4e';
const CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET;
const REDIRECT_URI = process.env.AUTH_REDIRECT_URI || 'https://litpulse-os.onrender.com/auth/callback';
const SESSION_SECRET = process.env.SESSION_SECRET || 'litpulse-tris-session-secret-2026-cp-lm';
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false';

// 30 Days session duration (in milliseconds)
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function signToken(payload) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function getCookie(header, name) {
  if (!header) return null;
  const match = header.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

// In-memory state tracking to prevent CSRF in OAuth flow
const oauthStates = new Map();

// Helper to make HTTPS requests
function postHttps(urlStr, dataObj) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams(dataObj).toString();
    const url = new URL(urlStr);
    const req = https.request(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData)
        }
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          try {
            resolve({ statusCode: res.statusCode, data: JSON.parse(body) });
          } catch (e) {
            resolve({ statusCode: res.statusCode, raw: body });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

const router = express.Router();

// 1. Initiate Microsoft 365 Login
router.get('/auth/login', (req, res) => {
  if (!AUTH_ENABLED) {
    return res.redirect('/');
  }
  const state = crypto.randomBytes(16).toString('hex');
  oauthStates.set(state, Date.now() + 10 * 60 * 1000); // 10 min expiry

  const authUrl =
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize` +
    `?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&response_mode=query` +
    `&scope=${encodeURIComponent('openid profile email')}` +
    `&state=${encodeURIComponent(state)}` +
    `&prompt=select_account`;

  res.redirect(authUrl);
});

// 2. OAuth Callback
router.get('/auth/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html><head><title>Sign-in Error</title>
      <style>body{font-family:system-ui,sans-serif;padding:40px;background:#0f172a;color:#f8fafc;}</style>
      </head><body>
      <h2>Microsoft Authentication Error</h2>
      <p style="color:#f87171;">${error_description || error}</p>
      <a href="/login" style="color:#38bdf8;">Return to Sign In</a>
      </body></html>
    `);
  }

  if (!code || !state || !oauthStates.has(state)) {
    return res.status(400).send('Invalid or expired authentication state. Please try logging in again.');
  }
  oauthStates.delete(state);

  try {
    const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
    const tokenResp = await postHttps(tokenUrl, {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code'
    });

    if (tokenResp.statusCode !== 200 || !tokenResp.data || !tokenResp.data.id_token) {
      console.error('Failed to exchange code for token:', tokenResp);
      return res.status(500).send('Failed to exchange authentication token with Microsoft.');
    }

    // Decode id_token JWT (header.payload.signature)
    const parts = tokenResp.data.id_token.split('.');
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

    // Verify Tenant match
    if (claims.tid && claims.tid !== TENANT_ID) {
      return res.status(403).send('Access Denied: Your account does not belong to the authorized organization.');
    }

    const email = claims.preferred_username || claims.email || 'unknown@collegeproduce.com';
    const name = claims.name || email;

    // Issue 30-day session
    const sessionPayload = {
      email,
      name,
      tid: claims.tid,
      iat: Date.now(),
      exp: Date.now() + SESSION_TTL_MS
    };

    const sessionToken = signToken(sessionPayload);
    const maxAgeSec = Math.floor(SESSION_TTL_MS / 1000);
    const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';

    res.setHeader(
      'Set-Cookie',
      `tris_session=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${isHttps ? '; Secure' : ''}`
    );

    res.redirect('/');
  } catch (err) {
    console.error('OAuth callback processing error:', err);
    res.status(500).send('Authentication failed due to internal error.');
  }
});

// 3. Logout
router.get('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'tris_session=; Path=/; HttpOnly; Max-Age=0');
  res.redirect('/login');
});

// 4. Current User Session Check
router.get('/api/auth/me', (req, res) => {
  const cookie = getCookie(req.headers.cookie, 'tris_session');
  const user = verifyToken(cookie);
  if (!user) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({ authenticated: true, user: { email: user.email, name: user.name } });
});

// 5. Branded Login Page
router.get('/login', (req, res) => {
  const cookie = getCookie(req.headers.cookie, 'tris_session');
  if (verifyToken(cookie)) {
    return res.redirect('/');
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Sign In - TRIS (LitPulse OS)</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          background: #090d16;
          color: #f1f5f9;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .login-card {
          width: 100%;
          max-width: 440px;
          background: #111827;
          border: 1px solid #1e293b;
          border-radius: 12px;
          padding: 36px 32px;
          box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
          text-align: center;
        }
        .badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.05em;
          text-transform: uppercase;
          background: rgba(56, 189, 248, 0.1);
          color: #38bdf8;
          border: 1px solid rgba(56, 189, 248, 0.2);
          margin-bottom: 18px;
        }
        h1 {
          font-size: 22px;
          font-weight: 700;
          color: #f8fafc;
          margin-bottom: 8px;
        }
        p.subtitle {
          font-size: 13px;
          color: #94a3b8;
          line-height: 1.5;
          margin-bottom: 28px;
        }
        .btn-ms {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          padding: 13px 20px;
          background: #ffffff;
          color: #0f172a;
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
          border-radius: 8px;
          transition: background 0.15s ease, transform 0.05s ease;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
        }
        .btn-ms:hover {
          background: #f1f5f9;
        }
        .btn-ms:active {
          transform: scale(0.99);
        }
        .btn-ms svg {
          width: 20px;
          height: 20px;
        }
        .divider {
          height: 1px;
          background: #1e293b;
          margin: 28px 0 20px;
        }
        .footer-note {
          font-size: 11px;
          color: #64748b;
          line-height: 1.5;
        }
        .footer-note span {
          color: #10b981;
          font-weight: 500;
        }
      </style>
    </head>
    <body>
      <div class="login-card">
        <span class="badge">Internal Access Gate</span>
        <h1>LitPulse OS / TRIS</h1>
        <p class="subtitle">Trial Revenue Intelligence System for College Produce & Lit&More. Restricted to authorized company personnel.</p>
        
        <a href="/auth/login" class="btn-ms">
          <svg viewBox="0 0 23 23" fill="none">
            <rect width="10.5" height="10.5" fill="#F25022"/>
            <rect x="12.5" width="10.5" height="10.5" fill="#7FBA00"/>
            <rect y="12.5" width="10.5" height="10.5" fill="#00A4EF"/>
            <rect x="12.5" y="12.5" width="10.5" height="10.5" fill="#FFB900"/>
          </svg>
          Sign in with Microsoft 365
        </a>
        
        <div class="divider"></div>
        <p class="footer-note">
          Secured with Single-Tenant Microsoft Entra ID.<br>
          Session persists for <span>30 days</span> upon sign-in.
        </p>
      </div>
    </body>
    </html>
  `);
});

// 6. Protection Middleware
function protect(req, res, next) {
  if (!AUTH_ENABLED) {
    return next();
  }

  // Exempt routes
  const exemptPrefixes = ['/login', '/auth/', '/health', '/api/health', '/favicon.ico'];
  if (exemptPrefixes.some((p) => req.path.startsWith(p))) {
    return next();
  }

  const cookie = getCookie(req.headers.cookie, 'tris_session');
  const user = verifyToken(cookie);

  if (user) {
    req.user = user;
    return next();
  }

  // If unauthenticated API call -> return 401 JSON
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({
      error: 'Unauthorized: Authentication required',
      loginUrl: '/login'
    });
  }

  // If browser page request -> redirect to login
  res.redirect('/login');
}

module.exports = {
  router,
  protect,
  signToken,
  verifyToken,
  getCookie
};
