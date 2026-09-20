const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const { db, CITIES, hashPassword, verifyPassword } = require('./db');
const { createSession, destroySession, getUserFromSession, parseCookies } = require('./auth');
const { timeAgo, parseUrlEncoded } = require('./utils');
const pages = require('./views/pages');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    ...headers,
  });
  res.end(body);
}

function redirect(res, location, cookie) {
  const headers = { Location: location };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(302, headers);
  res.end();
}

function readBody(req, maxBytes = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error('الطلب كبير جدًا'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  return getUserFromSession(cookies.sid);
}

function sessionCookie(sid) {
  return `sid=${sid}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax`;
}

function clearCookie() {
  return 'sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax';
}

// ---------- data helpers ----------

function categoryList() {
  return db.prepare('SELECT * FROM categories ORDER BY id').all();
}

function listingThumb(listingId) {
  const row = db.prepare('SELECT file FROM listing_images WHERE listing_id = ? ORDER BY position LIMIT 1').get(listingId);
  return row ? `/public/uploads/${row.file}` : null;
}

function listingImages(listingId) {
  return db.prepare('SELECT file FROM listing_images WHERE listing_id = ? ORDER BY position').all(listingId).map((r) => `/public/uploads/${r.file}`);
}

function decorate(listing) {
  return {
    ...listing,
    thumb: listingThumb(listing.id),
    time_ago: timeAgo(listing.created_at),
  };
}

function saveBase64Images(listingId, imagesB64) {
  if (!imagesB64) return;
  let arr;
  try {
    arr = JSON.parse(imagesB64);
  } catch (e) {
    return;
  }
  if (!Array.isArray(arr)) return;
  arr.slice(0, 3).forEach((dataUrl, i) => {
    const match = /^data:image\/(png|jpeg|jpg|webp|gif);base64,(.+)$/.exec(dataUrl);
    if (!match) return;
    const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
    const buf = Buffer.from(match[2], 'base64');
    if (buf.length > 1.5 * 1024 * 1024) return; // safety cap
    const filename = `${listingId}-${Date.now()}-${i}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
    db.prepare('INSERT INTO listing_images (listing_id, file, position) VALUES (?, ?, ?)').run(listingId, filename, i);
  });
}

// ---------- static file serving ----------

function serveStatic(req, res, urlPath) {
  const rel = urlPath.replace(/^\/public\//, '');
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) { send(res, 403, 'ممنوع'); return true; }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return false;
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=3600' });
  fs.createReadStream(filePath).pipe(res);
  return true;
}

// ---------- route handlers ----------

async function handleHome(req, res, user) {
  const categories = categoryList();
  const cityRank = user && user.prioritize_city && user.city ? `(CASE WHEN city = '${user.city.replace(/'/g, "''")}' THEN 0 ELSE 1 END), ` : '';
  const featured = db.prepare(`SELECT * FROM listings WHERE status = ? ORDER BY featured DESC, ${cityRank}created_at DESC LIMIT 8`).all('active').map(decorate);
  const recent = db.prepare(`SELECT * FROM listings WHERE status = ? ORDER BY ${cityRank}created_at DESC LIMIT 4`).all('active').map(decorate);
  send(res, 200, pages.homePage({ user, categories, featured, recent }));
}

async function handleCategory(req, res, user, slug, query) {
  const category = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  if (!category) { send(res, 404, 'الفئة غير موجودة'); return; }
  const city = query.get('city');
  let rows;
  if (city && city !== 'الكل') {
    rows = db.prepare('SELECT * FROM listings WHERE category_id = ? AND city = ? AND status = ? ORDER BY featured DESC, created_at DESC')
      .all(category.id, city, 'active');
  } else {
    rows = db.prepare('SELECT * FROM listings WHERE category_id = ? AND status = ? ORDER BY featured DESC, created_at DESC')
      .all(category.id, 'active');
  }
  const listings = rows.map(decorate);
  send(res, 200, pages.categoryPage({ user, category, listings, cities: CITIES, selectedCity: city || 'الكل' }));
}

async function handleListing(req, res, user, id, bidError) {
  const listing = db.prepare(`
    SELECT l.*, c.name AS category_name, c.slug AS category_slug,
           u.name AS seller_name, u.city AS seller_city, u.created_at AS seller_since
    FROM listings l
    JOIN categories c ON c.id = l.category_id
    JOIN users u ON u.id = l.user_id
    WHERE l.id = ?
  `).get(id);
  if (!listing) { send(res, 404, 'الإعلان غير موجود'); return; }
  db.prepare('UPDATE listings SET views = views + 1 WHERE id = ?').run(id);
  listing.views += 1;
  listing.time_ago = timeAgo(listing.created_at);
  const images = listingImages(id);
  const owner = user && user.id === listing.user_id;
  const highestBid = db.prepare('SELECT MAX(amount) AS m FROM bids WHERE listing_id = ?').get(id).m;
  const myBid = user ? db.prepare('SELECT * FROM bids WHERE listing_id = ? AND buyer_id = ? ORDER BY created_at DESC LIMIT 1').get(id, user.id) : null;
  const isFavorited = user ? !!db.prepare('SELECT id FROM favorites WHERE user_id = ? AND listing_id = ?').get(user.id, id) : false;
  send(res, 200, pages.listingPage({ user, listing, images, owner, highestBid, myBid, isFavorited, bidError }));
}

async function handleLoginGet(req, res, user, error) {
  if (user) { redirect(res, '/dashboard'); return; }
  send(res, 200, pages.loginPage({ user: null, error }));
}

async function handleLoginPost(req, res) {
  const body = parseUrlEncoded(await readBody(req));
  const method = body.method === 'email' ? 'email' : 'phone';
  const identifier = method === 'email' ? (body.identifier_email || '').trim() : (body.identifier_phone || '').trim();
  const password = body.password || '';

  let row = null;
  if (identifier) {
    row = method === 'email'
      ? db.prepare('SELECT * FROM users WHERE email = ?').get(identifier)
      : db.prepare('SELECT * FROM users WHERE phone = ?').get(identifier);
  }

  if (!row || !verifyPassword(password, row.password_hash)) {
    send(res, 401, pages.loginPage({ user: null, error: 'بيانات الدخول غير صحيحة. تحقق من الرقم/البريد وكلمة المرور.' }));
    return;
  }

  const sid = createSession(row.id);
  redirect(res, '/dashboard', sessionCookie(sid));
}

async function handleSignupGet(req, res, user) {
  if (user) { redirect(res, '/dashboard'); return; }
  send(res, 200, pages.signupPage({ user: null, error: null, cities: CITIES }));
}

async function handleSignupPost(req, res) {
  const body = parseUrlEncoded(await readBody(req));
  const name = (body.name || '').trim();
  const method = body.method === 'email' ? 'email' : 'phone';
  const phone = method === 'phone' ? (body.phone || '').trim() : '';
  const email = method === 'email' ? (body.email || '').trim() : '';
  const password = body.password || '';
  const city = body.city || CITIES[0];

  if (!name || password.length < 6 || (!phone && !email)) {
    send(res, 400, pages.signupPage({ user: null, error: 'تحقق من تعبئة جميع الحقول، وأن تكون كلمة المرور 6 أحرف على الأقل.', cities: CITIES }));
    return;
  }

  const exists = phone
    ? db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)
    : db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    send(res, 409, pages.signupPage({ user: null, error: 'يوجد حساب مسجّل بهذا الرقم أو البريد مسبقًا.', cities: CITIES }));
    return;
  }

  const info = db.prepare('INSERT INTO users (name, phone, email, password_hash, city) VALUES (?, ?, ?, ?, ?)')
    .run(name, phone || null, email || null, hashPassword(password), city);
  const sid = createSession(info.lastInsertRowid);
  redirect(res, '/dashboard', sessionCookie(sid));
}

async function handleLogoutPost(req, res) {
  const cookies = parseCookies(req);
  destroySession(cookies.sid);
  redirect(res, '/', clearCookie());
}

async function handlePostAdGet(req, res, user) {
  if (!user) { redirect(res, '/login'); return; }
  send(res, 200, pages.postAdPage({ user, categories: categoryList(), cities: CITIES, error: null }));
}

async function handlePostAdPost(req, res, user) {
  if (!user) { redirect(res, '/login'); return; }
  const body = parseUrlEncoded(await readBody(req));
  const title = (body.title || '').trim();
  const categoryId = parseInt(body.category_id, 10);
  const description = body.description || '';
  const price = (body.price || '').trim() || 'حسب الاتفاق';
  const city = body.city || CITIES[0];
  const phone = (body.phone || '').trim();

  if (!title || !categoryId || !phone) {
    send(res, 400, pages.postAdPage({ user, categories: categoryList(), cities: CITIES, error: 'الرجاء تعبئة الفئة والعنوان ورقم التواصل على الأقل.' }));
    return;
  }

  const info = db.prepare(`
    INSERT INTO listings (user_id, category_id, title, description, price, city, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(user.id, categoryId, title, description, price, city, phone);

  saveBase64Images(info.lastInsertRowid, body.images_b64);

  redirect(res, `/listing/${info.lastInsertRowid}`);
}

const USER_FIELDS = 'id, name, phone, email, city, is_admin, role, id_document, id_verified, prioritize_city, created_at';

function buildSettingsData(user, error, success) {
  const sellerListings = db.prepare('SELECT * FROM listings WHERE user_id = ? ORDER BY created_at DESC').all(user.id).map(decorate);

  const receivedBids = db.prepare(`
    SELECT b.*, l.title AS listing_title, l.id AS listing_id, u.name AS buyer_name, u.phone AS buyer_phone
    FROM bids b
    JOIN listings l ON l.id = b.listing_id
    JOIN users u ON u.id = b.buyer_id
    WHERE l.user_id = ?
    ORDER BY b.created_at DESC
  `).all(user.id);

  const favorites = db.prepare(`
    SELECT l.* FROM favorites f JOIN listings l ON l.id = f.listing_id
    WHERE f.user_id = ? ORDER BY f.created_at DESC
  `).all(user.id).map(decorate);

  const myBids = db.prepare(`
    SELECT b.*, l.title AS listing_title, l.id AS listing_id, l.price AS listing_price, l.status AS listing_status,
      (SELECT MAX(amount) FROM bids b2 WHERE b2.listing_id = b.listing_id) AS max_amount
    FROM bids b
    JOIN listings l ON l.id = b.listing_id
    WHERE b.buyer_id = ?
    ORDER BY b.created_at DESC
  `).all(user.id);

  return { user, error, success, cities: CITIES, sellerListings, receivedBids, favorites, myBids };
}

async function handleSettingsGet(req, res, user, error, success) {
  if (!user) { redirect(res, '/login'); return; }
  send(res, 200, pages.settingsPage(buildSettingsData(user, error, success)));
}

async function handleSettingsPost(req, res, user) {
  if (!user) { redirect(res, '/login'); return; }
  const body = parseUrlEncoded(await readBody(req));
  const name = (body.name || '').trim();
  const phone = (body.phone || '').trim();
  const email = (body.email || '').trim();
  const city = body.city || CITIES[0];
  const role = ['seller', 'buyer', 'both'].includes(body.role) ? body.role : 'both';
  const prioritizeCity = body.prioritize_city ? 1 : 0;

  if (!name) {
    send(res, 400, pages.settingsPage(buildSettingsData(user, 'الاسم مطلوب.', false)));
    return;
  }

  if (phone) {
    const clash = db.prepare('SELECT id FROM users WHERE phone = ? AND id != ?').get(phone, user.id);
    if (clash) { send(res, 409, pages.settingsPage(buildSettingsData(user, 'رقم الجوال مستخدم من حساب آخر.', false))); return; }
  }
  if (email) {
    const clash = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, user.id);
    if (clash) { send(res, 409, pages.settingsPage(buildSettingsData(user, 'البريد الإلكتروني مستخدم من حساب آخر.', false))); return; }
  }

  db.prepare('UPDATE users SET name = ?, phone = ?, email = ?, city = ?, role = ?, prioritize_city = ? WHERE id = ?')
    .run(name, phone || null, email || null, city, role, prioritizeCity, user.id);

  const refreshed = db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(user.id);
  send(res, 200, pages.settingsPage(buildSettingsData(refreshed, null, true)));
}

async function handleVerifyPost(req, res, user) {
  if (!user) { redirect(res, '/login'); return; }
  const body = parseUrlEncoded(await readBody(req));
  const dataUrl = body.id_document_b64 || '';
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/.exec(dataUrl);
  if (!match) {
    send(res, 400, pages.settingsPage(buildSettingsData(user, 'الرجاء اختيار صورة صالحة للهوية (PNG أو JPG).', false)));
    return;
  }
  const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > 3 * 1024 * 1024) {
    send(res, 400, pages.settingsPage(buildSettingsData(user, 'حجم صورة الهوية كبير جدًا (الحد الأقصى 3 ميجابايت).', false)));
    return;
  }
  const filename = `id-${user.id}-${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
  db.prepare('UPDATE users SET id_document = ?, id_verified = 0 WHERE id = ?').run(filename, user.id);
  const refreshed = db.prepare(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`).get(user.id);
  send(res, 200, pages.settingsPage(buildSettingsData(refreshed, null, true)));
}

async function handlePasswordPost(req, res, user) {
  if (!user) { redirect(res, '/login'); return; }
  const body = parseUrlEncoded(await readBody(req));
  const current = body.current_password || '';
  const next = body.new_password || '';
  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);

  if (!row || !verifyPassword(current, row.password_hash)) {
    send(res, 401, pages.settingsPage(buildSettingsData(user, 'كلمة المرور الحالية غير صحيحة.', false)));
    return;
  }
  if (next.length < 6) {
    send(res, 400, pages.settingsPage(buildSettingsData(user, 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.', false)));
    return;
  }
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id);
  send(res, 200, pages.settingsPage(buildSettingsData(user, null, true)));
}

async function handleBidPost(req, res, user, listingId) {
  if (!user) { redirect(res, '/login'); return; }
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing) { send(res, 404, 'الإعلان غير موجود'); return; }
  if (listing.user_id === user.id) { send(res, 400, 'لا يمكنك تقديم سومة على إعلانك الخاص'); return; }

  const body = parseUrlEncoded(await readBody(req));
  const amount = parseFloat((body.amount || '').toString().replace(/,/g, ''));
  if (!amount || amount <= 0) {
    return handleListing(req, res, user, listingId, 'الرجاء إدخال قيمة سومة صحيحة.');
  }
  db.prepare('INSERT INTO bids (listing_id, buyer_id, amount) VALUES (?, ?, ?)').run(listingId, user.id, amount);
  redirect(res, `/listing/${listingId}`);
}

async function handleBidAccept(req, res, user, bidId) {
  if (!user) { redirect(res, '/login'); return; }
  const bid = db.prepare(`
    SELECT b.*, l.user_id AS seller_id FROM bids b JOIN listings l ON l.id = b.listing_id WHERE b.id = ?
  `).get(bidId);
  if (!bid || bid.seller_id !== user.id) { send(res, 403, 'غير مصرح'); return; }
  db.prepare("UPDATE bids SET status = 'accepted' WHERE id = ?").run(bidId);
  db.prepare("UPDATE bids SET status = 'rejected' WHERE listing_id = ? AND id != ? AND status = 'pending'").run(bid.listing_id, bidId);
  redirect(res, '/settings');
}

async function handleBidReject(req, res, user, bidId) {
  if (!user) { redirect(res, '/login'); return; }
  const bid = db.prepare(`
    SELECT b.*, l.user_id AS seller_id FROM bids b JOIN listings l ON l.id = b.listing_id WHERE b.id = ?
  `).get(bidId);
  if (!bid || bid.seller_id !== user.id) { send(res, 403, 'غير مصرح'); return; }
  db.prepare("UPDATE bids SET status = 'rejected' WHERE id = ?").run(bidId);
  redirect(res, '/settings');
}

async function handleFavoriteToggle(req, res, user, listingId) {
  if (!user) { redirect(res, '/login'); return; }
  const existing = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND listing_id = ?').get(user.id, listingId);
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE id = ?').run(existing.id);
  } else {
    db.prepare('INSERT INTO favorites (user_id, listing_id) VALUES (?, ?)').run(user.id, listingId);
  }
  redirect(res, `/listing/${listingId}`);
}

async function handleDashboard(req, res, user) {
  if (!user) { redirect(res, '/login'); return; }
  const rows = db.prepare('SELECT * FROM listings WHERE user_id = ? ORDER BY created_at DESC').all(user.id).map(decorate);
  const stats = {
    active: rows.filter((r) => r.status === 'active').length,
    views: rows.reduce((sum, r) => sum + r.views, 0),
  };
  send(res, 200, pages.dashboardPage({ user, listings: rows, stats }));
}

async function handleDeleteListing(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!listing || listing.user_id !== user.id) { send(res, 403, 'غير مصرح'); return; }
  const images = db.prepare('SELECT file FROM listing_images WHERE listing_id = ?').all(id);
  images.forEach((img) => {
    const p = path.join(UPLOADS_DIR, img.file);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  db.prepare('DELETE FROM listing_images WHERE listing_id = ?').run(id);
  db.prepare('DELETE FROM listings WHERE id = ?').run(id);
  redirect(res, '/dashboard');
}

async function handleAdminGet(req, res, user) {
  if (!user) { redirect(res, '/login'); return; }
  if (!user.is_admin) { send(res, 403, 'غير مصرح لك بالدخول لهذه الصفحة'); return; }

  const stats = {
    users: db.prepare('SELECT COUNT(*) AS c FROM users').get().c,
    listings: db.prepare('SELECT COUNT(*) AS c FROM listings').get().c,
    activeListings: db.prepare("SELECT COUNT(*) AS c FROM listings WHERE status = 'active'").get().c,
    views: db.prepare('SELECT COALESCE(SUM(views), 0) AS s FROM listings').get().s,
  };

  const listings = db.prepare(`
    SELECT l.*, u.name AS owner_name, u.phone AS owner_phone, c.name AS category_name
    FROM listings l
    JOIN users u ON u.id = l.user_id
    JOIN categories c ON c.id = l.category_id
    ORDER BY l.created_at DESC
  `).all().map(decorate);

  const users = db.prepare(`SELECT ${USER_FIELDS} FROM users ORDER BY created_at DESC`).all();

  send(res, 200, pages.adminPage({ user, stats, listings, users }));
}

async function handleAdminVerifyUser(req, res, user, id, verified) {
  if (!user) { redirect(res, '/login'); return; }
  if (!user.is_admin) { send(res, 403, 'غير مصرح'); return; }
  db.prepare('UPDATE users SET id_verified = ? WHERE id = ?').run(verified ? 1 : 0, id);
  redirect(res, '/admin');
}

async function handleAdminDeleteListing(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  if (!user.is_admin) { send(res, 403, 'غير مصرح'); return; }
  const images = db.prepare('SELECT file FROM listing_images WHERE listing_id = ?').all(id);
  images.forEach((img) => {
    const p = path.join(UPLOADS_DIR, img.file);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });
  db.prepare('DELETE FROM listing_images WHERE listing_id = ?').run(id);
  db.prepare('DELETE FROM listings WHERE id = ?').run(id);
  redirect(res, '/admin');
}

async function handleAdminDeleteUser(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  if (!user.is_admin) { send(res, 403, 'غير مصرح'); return; }
  if (Number(id) === user.id) { send(res, 400, 'لا يمكنك حذف حسابك الخاص من هنا'); return; }
  const listingIds = db.prepare('SELECT id FROM listings WHERE user_id = ?').all(id).map((r) => r.id);
  listingIds.forEach((lid) => {
    const images = db.prepare('SELECT file FROM listing_images WHERE listing_id = ?').all(lid);
    images.forEach((img) => {
      const p = path.join(UPLOADS_DIR, img.file);
      if (fs.existsSync(p)) fs.unlinkSync(p);
    });
    db.prepare('DELETE FROM listing_images WHERE listing_id = ?').run(lid);
  });
  db.prepare('DELETE FROM listings WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  redirect(res, '/admin');
}

// ---------- router ----------

const server = http.createServer(async (req, res) => {
  try {
    const fullUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = decodeURIComponent(fullUrl.pathname);

    if (pathname.startsWith('/public/')) {
      if (serveStatic(req, res, pathname)) return;
      send(res, 404, 'غير موجود');
      return;
    }

    const user = getCurrentUser(req);
    const m = req.method;

    if (pathname === '/' && m === 'GET') return handleHome(req, res, user);
    if (pathname.startsWith('/category/') && m === 'GET') return handleCategory(req, res, user, pathname.split('/')[2], fullUrl.searchParams);
    if (pathname.match(/^\/listing\/\d+$/) && m === 'GET') return handleListing(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/listing\/\d+\/delete$/) && m === 'POST') return handleDeleteListing(req, res, user, pathname.split('/')[2]);
    if (pathname === '/login' && m === 'GET') return handleLoginGet(req, res, user, null);
    if (pathname === '/login' && m === 'POST') return handleLoginPost(req, res);
    if (pathname === '/signup' && m === 'GET') return handleSignupGet(req, res, user);
    if (pathname === '/signup' && m === 'POST') return handleSignupPost(req, res);
    if (pathname === '/logout' && m === 'POST') return handleLogoutPost(req, res);
    if (pathname === '/post-ad' && m === 'GET') return handlePostAdGet(req, res, user);
    if (pathname === '/post-ad' && m === 'POST') return handlePostAdPost(req, res, user);
    if (pathname === '/dashboard' && m === 'GET') return handleDashboard(req, res, user);
    if (pathname === '/settings' && m === 'GET') return handleSettingsGet(req, res, user, null, false);
    if (pathname === '/settings' && m === 'POST') return handleSettingsPost(req, res, user);
    if (pathname === '/settings/password' && m === 'POST') return handlePasswordPost(req, res, user);
    if (pathname === '/settings/verify' && m === 'POST') return handleVerifyPost(req, res, user);
    if (pathname.match(/^\/listing\/\d+\/bid$/) && m === 'POST') return handleBidPost(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/bid\/\d+\/accept$/) && m === 'POST') return handleBidAccept(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/bid\/\d+\/reject$/) && m === 'POST') return handleBidReject(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/favorites\/\d+\/toggle$/) && m === 'POST') return handleFavoriteToggle(req, res, user, pathname.split('/')[2]);
    if (pathname === '/admin' && m === 'GET') return handleAdminGet(req, res, user);
    if (pathname.match(/^\/admin\/listing\/\d+\/delete$/) && m === 'POST') return handleAdminDeleteListing(req, res, user, pathname.split('/')[3]);
    if (pathname.match(/^\/admin\/user\/\d+\/delete$/) && m === 'POST') return handleAdminDeleteUser(req, res, user, pathname.split('/')[3]);
    if (pathname.match(/^\/admin\/user\/\d+\/verify$/) && m === 'POST') return handleAdminVerifyUser(req, res, user, pathname.split('/')[3], true);
    if (pathname.match(/^\/admin\/user\/\d+\/unverify$/) && m === 'POST') return handleAdminVerifyUser(req, res, user, pathname.split('/')[3], false);

    send(res, 404, 'الصفحة غير موجودة — 404');
  } catch (err) {
    console.error(err);
    send(res, 500, 'حدث خطأ في الخادم: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`صفقة تعمل الآن على http://localhost:${PORT}`);
});
