const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const { db, CITIES, CATEGORY_FIELDS, hashPassword, verifyPassword, parsePriceValue, expireOldListings, LISTING_LIFETIME_DAYS, COMMISSION_RATE, COMMISSION_PAYMENT_METHODS } = require('./db');
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

function sessionCookie(sid, secure) {
  return `sid=${sid}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function clearCookie() {
  return 'sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax';
}

function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

// حماية بسيطة من محاولات تخمين كلمة المرور (brute-force) — تُحفظ في الذاكرة فقط
const LOGIN_ATTEMPT_LIMIT = 8;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map(); // ip -> [timestamps]

function tooManyLoginAttempts(ip) {
  const now = Date.now();
  const arr = (loginAttempts.get(ip) || []).filter((t) => now - t < LOGIN_ATTEMPT_WINDOW_MS);
  loginAttempts.set(ip, arr);
  return arr.length >= LOGIN_ATTEMPT_LIMIT;
}

function recordFailedLogin(ip) {
  const arr = loginAttempts.get(ip) || [];
  arr.push(Date.now());
  loginAttempts.set(ip, arr);
}

function clearLoginAttempts(ip) {
  loginAttempts.delete(ip);
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

function parseExtraFields(raw) {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) {
    return {};
  }
}

function decorate(listing) {
  return {
    ...listing,
    thumb: listingThumb(listing.id),
    time_ago: timeAgo(listing.created_at),
    extra: parseExtraFields(listing.extra_fields),
  };
}

function sellerRatingSummary(sellerId) {
  const row = db.prepare('SELECT COUNT(*) AS c, AVG(rating) AS avg FROM ratings WHERE seller_id = ?').get(sellerId);
  return { count: row.c || 0, avg: row.avg ? Math.round(row.avg * 10) / 10 : null };
}

function listingRatings(sellerId, limit = 10) {
  return db.prepare(`
    SELECT r.*, u.name AS rater_name, l.title AS listing_title
    FROM ratings r
    JOIN users u ON u.id = r.rater_id
    JOIN listings l ON l.id = r.listing_id
    WHERE r.seller_id = ?
    ORDER BY r.created_at DESC LIMIT ?
  `).all(sellerId, limit);
}

function similarListings(listing, limit = 6) {
  return db.prepare(`
    SELECT * FROM listings WHERE category_id = ? AND id != ? AND status = 'active'
    ORDER BY featured DESC, created_at DESC LIMIT ?
  `).all(listing.category_id, listing.id, limit).map(decorate);
}

const REPORT_HIDE_THRESHOLD = 3;

function openReportCount(listingId) {
  return db.prepare("SELECT COUNT(*) AS c FROM reports WHERE listing_id = ? AND status = 'open'").get(listingId).c;
}

function unreadMessageCount(userId) {
  return db.prepare(`
    SELECT COUNT(*) AS c FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE (c.buyer_id = ? OR c.seller_id = ?) AND m.sender_id != ? AND m.read_at IS NULL
  `).get(userId, userId, userId).c;
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

async function handleHome(req, res, user, baseUrl) {
  const categories = categoryList();
  const cityRank = user && user.prioritize_city && user.city ? `(CASE WHEN city = '${user.city.replace(/'/g, "''")}' THEN 0 ELSE 1 END), ` : '';
  const featured = db.prepare(`SELECT * FROM listings WHERE status = ? ORDER BY featured DESC, ${cityRank}created_at DESC LIMIT 8`).all('active').map(decorate);
  const recent = db.prepare(`SELECT * FROM listings WHERE status = ? ORDER BY ${cityRank}created_at DESC LIMIT 4`).all('active').map(decorate);
  send(res, 200, pages.homePage({ user, categories, featured, recent, baseUrl }));
}

const PAGE_SIZE = 24;

async function handleCategory(req, res, user, slug, query, baseUrl) {
  const category = db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
  if (!category) { send(res, 404, 'الفئة غير موجودة'); return; }
  const city = query.get('city');
  const priceMin = parseFloat(query.get('price_min'));
  const priceMax = parseFloat(query.get('price_max'));
  const page = Math.max(1, parseInt(query.get('page'), 10) || 1);

  const conditions = ['category_id = ?', "status = 'active'"];
  const params = [category.id];
  if (city && city !== 'الكل') { conditions.push('city = ?'); params.push(city); }
  if (Number.isFinite(priceMin)) { conditions.push('price_value >= ?'); params.push(priceMin); }
  if (Number.isFinite(priceMax)) { conditions.push('price_value <= ?'); params.push(priceMax); }
  const where = conditions.join(' AND ');

  const total = db.prepare(`SELECT COUNT(*) AS c FROM listings WHERE ${where}`).get(...params).c;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const offset = (Math.min(page, totalPages) - 1) * PAGE_SIZE;

  const rows = db.prepare(`SELECT * FROM listings WHERE ${where} ORDER BY featured DESC, created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, PAGE_SIZE, offset);

  const listings = rows.map(decorate);
  const savedAlready = user ? !!db.prepare('SELECT id FROM saved_searches WHERE user_id = ? AND category_id = ? AND (city = ? OR (city IS NULL AND ? IS NULL))').get(user.id, category.id, city || null, city || null) : false;
  send(res, 200, pages.categoryPage({
    user, category, listings, cities: CITIES, selectedCity: city || 'الكل', savedAlready,
    priceMin: query.get('price_min') || '', priceMax: query.get('price_max') || '',
    page: Math.min(page, totalPages), totalPages, total, baseUrl,
  }));
}

async function handleSearch(req, res, user, query) {
  const q = (query.get('q') || '').trim();
  const page = Math.max(1, parseInt(query.get('page'), 10) || 1);
  let listings = [];
  let total = 0;
  const totalPages = 1;
  if (q) {
    const like = `%${q}%`;
    total = db.prepare("SELECT COUNT(*) AS c FROM listings WHERE status = 'active' AND (title LIKE ? OR description LIKE ?)").get(like, like).c;
    const rows = db.prepare("SELECT * FROM listings WHERE status = 'active' AND (title LIKE ? OR description LIKE ?) ORDER BY featured DESC, created_at DESC LIMIT ? OFFSET ?")
      .all(like, like, PAGE_SIZE, (page - 1) * PAGE_SIZE);
    listings = rows.map(decorate);
  }
  send(res, 200, pages.searchPage({ user, q, listings, total, page, totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)) }));
}

async function handleListing(req, res, user, id, bidError, baseUrl, reportSent) {
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
  listing.extra = parseExtraFields(listing.extra_fields);
  const images = listingImages(id);
  const owner = user && user.id === listing.user_id;
  const highestBid = db.prepare('SELECT MAX(amount) AS m FROM bids WHERE listing_id = ?').get(id).m;
  const myBid = user ? db.prepare('SELECT * FROM bids WHERE listing_id = ? AND buyer_id = ? ORDER BY created_at DESC LIMIT 1').get(id, user.id) : null;
  const isFavorited = user ? !!db.prepare('SELECT id FROM favorites WHERE user_id = ? AND listing_id = ?').get(user.id, id) : false;
  const fieldSchema = CATEGORY_FIELDS[listing.category_slug] || [];
  const ratingSummary = sellerRatingSummary(listing.user_id);
  const ratings = listingRatings(listing.user_id, 6);
  const myRating = user ? db.prepare('SELECT * FROM ratings WHERE listing_id = ? AND rater_id = ?').get(id, user.id) : null;
  const canRate = !!(user && !owner && !myRating);
  const similar = similarListings(listing, 6);
  send(res, 200, pages.listingPage({
    user, listing, images, owner, highestBid, myBid, isFavorited, bidError, fieldSchema, baseUrl,
    ratingSummary, ratings, myRating, canRate, similar, reportSent,
  }));
}

async function handleLoginGet(req, res, user, error) {
  if (user) { redirect(res, '/dashboard'); return; }
  send(res, 200, pages.loginPage({ user: null, error }));
}

async function handleLoginPost(req, res) {
  const ip = getClientIp(req);
  if (tooManyLoginAttempts(ip)) {
    send(res, 429, pages.loginPage({ user: null, error: 'عدد محاولات تسجيل الدخول كبير جدًا. الرجاء الانتظار بضع دقائق قبل المحاولة مجددًا.' }));
    return;
  }

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
    recordFailedLogin(ip);
    send(res, 401, pages.loginPage({ user: null, error: 'بيانات الدخول غير صحيحة. تحقق من الرقم/البريد وكلمة المرور.' }));
    return;
  }

  clearLoginAttempts(ip);
  const secure = (req.headers['x-forwarded-proto'] || 'http') === 'https';
  const sid = createSession(row.id);
  redirect(res, '/dashboard', sessionCookie(sid, secure));
}

async function handleForgotPasswordGet(req, res, user) {
  if (user) { redirect(res, '/dashboard'); return; }
  send(res, 200, pages.forgotPasswordPage({ user: null, submitted: false }));
}

async function handleForgotPasswordPost(req, res) {
  await readBody(req); // استهلاك الجسم فقط — لا حاجة لقراءة القيم، الرسالة ثابتة لمنع استكشاف الحسابات
  send(res, 200, pages.forgotPasswordPage({ user: null, submitted: true }));
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
  const termsAgreed = body.terms_agree === 'on';

  if (!name || password.length < 6 || (!phone && !email)) {
    send(res, 400, pages.signupPage({ user: null, error: 'تحقق من تعبئة جميع الحقول، وأن تكون كلمة المرور 6 أحرف على الأقل.', cities: CITIES }));
    return;
  }
  if (!termsAgreed) {
    send(res, 400, pages.signupPage({ user: null, error: 'يجب الموافقة على الشروط والأحكام لإنشاء حساب.', cities: CITIES }));
    return;
  }

  const exists = phone
    ? db.prepare('SELECT id FROM users WHERE phone = ?').get(phone)
    : db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) {
    send(res, 409, pages.signupPage({ user: null, error: 'يوجد حساب مسجّل بهذا الرقم أو البريد مسبقًا.', cities: CITIES }));
    return;
  }

  const info = db.prepare("INSERT INTO users (name, phone, email, password_hash, city, terms_agreed_at) VALUES (?, ?, ?, ?, ?, datetime('now'))")
    .run(name, phone || null, email || null, hashPassword(password), city);
  const secure = (req.headers['x-forwarded-proto'] || 'http') === 'https';
  const sid = createSession(info.lastInsertRowid);
  redirect(res, '/dashboard', sessionCookie(sid, secure));
}

async function handleLogoutPost(req, res) {
  const cookies = parseCookies(req);
  destroySession(cookies.sid);
  redirect(res, '/', clearCookie());
}

async function handlePostAdGet(req, res, user) {
  if (!user) { redirect(res, '/login'); return; }
  send(res, 200, pages.postAdPage({ user, categories: categoryList(), cities: CITIES, categoryFields: CATEGORY_FIELDS, error: null }));
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

  const commissionAgreed = body.commission_agree === 'on';

  if (!title || !categoryId || !phone) {
    send(res, 400, pages.postAdPage({ user, categories: categoryList(), cities: CITIES, categoryFields: CATEGORY_FIELDS, error: 'الرجاء تعبئة الفئة والعنوان ورقم التواصل على الأقل.' }));
    return;
  }
  if (!commissionAgreed) {
    send(res, 400, pages.postAdPage({ user, categories: categoryList(), cities: CITIES, categoryFields: CATEGORY_FIELDS, error: 'يجب تأكيد القسم والموافقة على شروط العمولة قبل نشر الإعلان.' }));
    return;
  }

  const recentCount = db.prepare("SELECT COUNT(*) AS c FROM listings WHERE user_id = ? AND created_at > datetime('now', '-1 hour')").get(user.id).c;
  if (recentCount >= 5) {
    send(res, 429, pages.postAdPage({ user, categories: categoryList(), cities: CITIES, categoryFields: CATEGORY_FIELDS, error: 'لقد نشرت عدة إعلانات خلال ساعة واحدة. الرجاء الانتظار قليلًا قبل نشر إعلان جديد (الحد: 5 إعلانات/ساعة) للحفاظ على جودة الموقع.' }));
    return;
  }

  const catRow = db.prepare('SELECT slug FROM categories WHERE id = ?').get(categoryId);
  const schema = (catRow && CATEGORY_FIELDS[catRow.slug]) || [];
  const extra = {};
  schema.forEach((f) => {
    const v = (body['f_' + f.key] || '').toString().trim();
    if (v) extra[f.key] = v;
  });
  const extraJson = Object.keys(extra).length ? JSON.stringify(extra) : null;
  const priceValue = parsePriceValue(price);

  const info = db.prepare(`
    INSERT INTO listings (user_id, category_id, title, description, price, city, phone, extra_fields, price_value, expires_at, commission_agreed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '+${LISTING_LIFETIME_DAYS} days'), 1)
  `).run(user.id, categoryId, title, description, price, city, phone, extraJson, priceValue);

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

  const savedSearchRows = db.prepare(`
    SELECT ss.*, c.slug AS category_slug FROM saved_searches ss
    JOIN categories c ON c.id = ss.category_id
    WHERE ss.user_id = ? ORDER BY ss.created_at DESC
  `).all(user.id);
  const savedSearches = savedSearchRows.map((s) => {
    const newCount = s.city
      ? db.prepare("SELECT COUNT(*) AS c FROM listings WHERE category_id = ? AND city = ? AND status = 'active' AND created_at > ?").get(s.category_id, s.city, s.created_at).c
      : db.prepare("SELECT COUNT(*) AS c FROM listings WHERE category_id = ? AND status = 'active' AND created_at > ?").get(s.category_id, s.created_at).c;
    return { ...s, newCount };
  });

  return { user, error, success, cities: CITIES, sellerListings, receivedBids, favorites, myBids, savedSearches };
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

async function handleSavedSearchPost(req, res, user) {
  if (!user) { redirect(res, '/login'); return; }
  const body = parseUrlEncoded(await readBody(req));
  const categoryId = parseInt(body.category_id, 10);
  const city = (body.city || '').trim();
  const slug = body.category_slug || '';
  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(categoryId);
  if (category) {
    const existing = db.prepare('SELECT id FROM saved_searches WHERE user_id = ? AND category_id = ? AND (city = ? OR (city IS NULL AND ? = \'\'))').get(user.id, categoryId, city || null, city);
    if (!existing) {
      db.prepare('INSERT INTO saved_searches (user_id, category_id, category_name, city) VALUES (?, ?, ?, ?)')
        .run(user.id, categoryId, category.name, city || null);
    }
  }
  redirect(res, slug ? `/category/${slug}${city ? '?city=' + encodeURIComponent(city) : ''}` : '/');
}

async function handleSavedSearchDelete(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  db.prepare('DELETE FROM saved_searches WHERE id = ? AND user_id = ?').run(id, user.id);
  redirect(res, '/settings');
}

async function handleRatingPost(req, res, user, listingId) {
  if (!user) { redirect(res, '/login'); return; }
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing) { send(res, 404, 'الإعلان غير موجود'); return; }
  if (listing.user_id === user.id) { redirect(res, `/listing/${listingId}`); return; }
  const existing = db.prepare('SELECT id FROM ratings WHERE listing_id = ? AND rater_id = ?').get(listingId, user.id);
  if (existing) { redirect(res, `/listing/${listingId}`); return; }

  const body = parseUrlEncoded(await readBody(req));
  const rating = Math.min(5, Math.max(1, parseInt(body.rating, 10) || 5));
  const comment = (body.comment || '').trim().slice(0, 500);

  db.prepare('INSERT INTO ratings (listing_id, seller_id, rater_id, rating, comment) VALUES (?, ?, ?, ?, ?)')
    .run(listingId, listing.user_id, user.id, rating, comment || null);
  redirect(res, `/listing/${listingId}#reviews`);
}

const REPORT_REASONS = {
  fraud: 'احتيال أو نصب',
  fake: 'إعلان مزيّف أو منتهي',
  prohibited: 'سلعة أو خدمة مخالفة للقانون',
  duplicate: 'إعلان مكرر أو سبام',
  other: 'سبب آخر',
};

async function handleReportPost(req, res, user, listingId) {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing) { send(res, 404, 'الإعلان غير موجود'); return; }
  const body = parseUrlEncoded(await readBody(req));
  const reason = REPORT_REASONS[body.reason] ? body.reason : 'other';
  const details = (body.details || '').trim().slice(0, 500);

  db.prepare('INSERT INTO reports (listing_id, reporter_id, reason, details) VALUES (?, ?, ?, ?)')
    .run(listingId, user ? user.id : null, reason, details || null);

  if (openReportCount(listingId) >= REPORT_HIDE_THRESHOLD && listing.status === 'active') {
    db.prepare("UPDATE listings SET status = 'hidden' WHERE id = ?").run(listingId);
  }
  redirect(res, `/listing/${listingId}?reported=1`);
}

async function handleRenewListing(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!listing || listing.user_id !== user.id) { send(res, 403, 'غير مصرح'); return; }
  db.prepare(`UPDATE listings SET expires_at = datetime('now', '+${LISTING_LIFETIME_DAYS} days'), status = 'active' WHERE id = ?`).run(id);
  redirect(res, '/dashboard');
}

async function handleMarkSold(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!listing || listing.user_id !== user.id) { send(res, 403, 'غير مصرح'); return; }
  const body = parseUrlEncoded(await readBody(req));
  const soldPrice = parseFloat((body.sold_price || '').toString().replace(/,/g, ''));
  if (!soldPrice || soldPrice <= 0) { redirect(res, '/dashboard'); return; }
  const commission = Math.round(soldPrice * COMMISSION_RATE * 100) / 100;
  db.prepare("UPDATE listings SET status = 'sold', sold_price = ?, commission_amount = ?, sold_at = datetime('now') WHERE id = ?")
    .run(soldPrice, commission, id);
  redirect(res, '/dashboard');
}

async function handleSellerPage(req, res, viewer, sellerId) {
  const seller = db.prepare(`SELECT id, name, city, created_at FROM users WHERE id = ?`).get(sellerId);
  if (!seller) { send(res, 404, 'هذا البائع غير موجود'); return; }
  const listings = db.prepare("SELECT * FROM listings WHERE user_id = ? AND status = 'active' ORDER BY featured DESC, created_at DESC").all(sellerId).map(decorate);
  const ratingSummary = sellerRatingSummary(sellerId);
  const ratings = listingRatings(sellerId, 10);
  send(res, 200, pages.sellerPage({ user: viewer, seller, listings, ratingSummary, ratings }));
}

async function handleStartConversation(req, res, user, listingId) {
  if (!user) { redirect(res, '/login'); return; }
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing) { send(res, 404, 'الإعلان غير موجود'); return; }
  if (listing.user_id === user.id) { redirect(res, `/listing/${listingId}`); return; }

  const body = parseUrlEncoded(await readBody(req));
  const text = (body.body || '').trim().slice(0, 2000);
  if (!text) { redirect(res, `/listing/${listingId}`); return; }

  let convo = db.prepare('SELECT * FROM conversations WHERE listing_id = ? AND buyer_id = ?').get(listingId, user.id);
  if (!convo) {
    const info = db.prepare('INSERT INTO conversations (listing_id, buyer_id, seller_id) VALUES (?, ?, ?)')
      .run(listingId, user.id, listing.user_id);
    convo = { id: info.lastInsertRowid };
  }
  db.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)').run(convo.id, user.id, text);
  redirect(res, `/messages/${convo.id}`);
}

async function handleMessagesInbox(req, res, user) {
  if (!user) { redirect(res, '/login'); return; }
  const rows = db.prepare(`
    SELECT c.*, l.title AS listing_title, l.id AS listing_id,
           bu.name AS buyer_name, se.name AS seller_name,
           (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_body,
           (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_at,
           (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read_at IS NULL) AS unread
    FROM conversations c
    JOIN listings l ON l.id = c.listing_id
    JOIN users bu ON bu.id = c.buyer_id
    JOIN users se ON se.id = c.seller_id
    WHERE c.buyer_id = ? OR c.seller_id = ?
    ORDER BY last_at DESC
  `).all(user.id, user.id, user.id);
  const conversations = rows.map((r) => ({
    ...r,
    other_name: r.buyer_id === user.id ? r.seller_name : r.buyer_name,
    role: r.buyer_id === user.id ? 'buyer' : 'seller',
  }));
  send(res, 200, pages.messagesPage({ user, conversations }));
}

async function handleConversationGet(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  const convo = db.prepare(`
    SELECT c.*, l.title AS listing_title, l.id AS listing_id,
           bu.name AS buyer_name, se.name AS seller_name
    FROM conversations c
    JOIN listings l ON l.id = c.listing_id
    JOIN users bu ON bu.id = c.buyer_id
    JOIN users se ON se.id = c.seller_id
    WHERE c.id = ?
  `).get(id);
  if (!convo || (convo.buyer_id !== user.id && convo.seller_id !== user.id)) { send(res, 403, 'غير مصرح'); return; }

  db.prepare('UPDATE messages SET read_at = datetime(\'now\') WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL').run(id, user.id);

  const messages = db.prepare('SELECT m.*, u.name AS sender_name FROM messages m JOIN users u ON u.id = m.sender_id WHERE m.conversation_id = ? ORDER BY m.created_at ASC').all(id);
  const otherName = convo.buyer_id === user.id ? convo.seller_name : convo.buyer_name;
  send(res, 200, pages.conversationPage({ user, convo, messages, otherName }));
}

async function handleMessageReplyPost(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  const convo = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
  if (!convo || (convo.buyer_id !== user.id && convo.seller_id !== user.id)) { send(res, 403, 'غير مصرح'); return; }
  const body = parseUrlEncoded(await readBody(req));
  const text = (body.body || '').trim().slice(0, 2000);
  if (text) {
    db.prepare('INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)').run(id, user.id, text);
  }
  redirect(res, `/messages/${id}`);
}

async function handleListingEditGet(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!listing || listing.user_id !== user.id) { send(res, 403, 'غير مصرح'); return; }
  listing.extra = parseExtraFields(listing.extra_fields);
  send(res, 200, pages.postAdPage({ user, categories: categoryList(), cities: CITIES, categoryFields: CATEGORY_FIELDS, error: null, editing: listing, images: listingImages(id) }));
}

async function handleListingEditPost(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
  if (!listing || listing.user_id !== user.id) { send(res, 403, 'غير مصرح'); return; }

  const body = parseUrlEncoded(await readBody(req));
  const title = (body.title || '').trim();
  const description = body.description || '';
  const price = (body.price || '').trim() || 'حسب الاتفاق';
  const city = body.city || CITIES[0];
  const phone = (body.phone || '').trim();

  if (!title || !phone) {
    listing.extra = parseExtraFields(listing.extra_fields);
    send(res, 400, pages.postAdPage({ user, categories: categoryList(), cities: CITIES, categoryFields: CATEGORY_FIELDS, error: 'الرجاء تعبئة العنوان ورقم التواصل على الأقل.', editing: listing, images: listingImages(id) }));
    return;
  }

  const catRow = db.prepare('SELECT slug FROM categories WHERE id = ?').get(listing.category_id);
  const schema = (catRow && CATEGORY_FIELDS[catRow.slug]) || [];
  const extra = {};
  schema.forEach((f) => {
    const v = (body['f_' + f.key] || '').toString().trim();
    if (v) extra[f.key] = v;
  });
  const extraJson = Object.keys(extra).length ? JSON.stringify(extra) : null;
  const priceValue = parsePriceValue(price);

  db.prepare('UPDATE listings SET title = ?, description = ?, price = ?, city = ?, phone = ?, extra_fields = ?, price_value = ? WHERE id = ?')
    .run(title, description, price, city, phone, extraJson, priceValue, id);

  saveBase64Images(id, body.images_b64);

  redirect(res, `/listing/${id}`);
}

async function handleAdminFeature(req, res, user, id, featured) {
  if (!user) { redirect(res, '/login'); return; }
  if (!user.is_admin) { send(res, 403, 'غير مصرح'); return; }
  db.prepare('UPDATE listings SET featured = ? WHERE id = ?').run(featured ? 1 : 0, id);
  redirect(res, '/admin');
}

async function handleDashboard(req, res, user) {
  if (!user) { redirect(res, '/login'); return; }
  const rows = db.prepare('SELECT * FROM listings WHERE user_id = ? ORDER BY created_at DESC').all(user.id).map(decorate);
  const stats = {
    active: rows.filter((r) => r.status === 'active').length,
    views: rows.reduce((sum, r) => sum + r.views, 0),
    expired: rows.filter((r) => r.status === 'expired').length,
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

function renderAdminPage(res, user, resetInfo) {
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

  const reports = db.prepare(`
    SELECT r.*, l.title AS listing_title, l.status AS listing_status, u.name AS reporter_name
    FROM reports r
    JOIN listings l ON l.id = r.listing_id
    LEFT JOIN users u ON u.id = r.reporter_id
    WHERE r.status = 'open'
    ORDER BY r.created_at DESC
  `).all();

  const commissions = db.prepare(`
    SELECT l.id, l.title, l.sold_price, l.commission_amount, l.commission_paid, l.sold_at, u.name AS owner_name, u.phone AS owner_phone
    FROM listings l
    JOIN users u ON u.id = l.user_id
    WHERE l.status = 'sold'
    ORDER BY l.commission_paid ASC, l.sold_at DESC
  `).all();
  const commissionStats = {
    dueCount: commissions.filter((c) => !c.commission_paid).length,
    dueTotal: commissions.filter((c) => !c.commission_paid).reduce((s, c) => s + (c.commission_amount || 0), 0),
  };

  send(res, 200, pages.adminPage({ user, stats, listings, users, resetInfo, reports, reportReasons: REPORT_REASONS, commissions, commissionStats }));
}

async function handleAdminGet(req, res, user) {
  if (!user) { redirect(res, '/login'); return; }
  if (!user.is_admin) { send(res, 403, 'غير مصرح لك بالدخول لهذه الصفحة'); return; }
  renderAdminPage(res, user);
}

async function handleAdminResetPassword(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  if (!user.is_admin) { send(res, 403, 'غير مصرح'); return; }
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!target) { send(res, 404, 'المستخدم غير موجود'); return; }
  const tempPassword = crypto.randomBytes(4).toString('hex');
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(tempPassword), id);
  renderAdminPage(res, user, { name: target.name, password: tempPassword });
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

async function handleAdminMarkCommissionPaid(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  if (!user.is_admin) { send(res, 403, 'غير مصرح'); return; }
  db.prepare('UPDATE listings SET commission_paid = 1 WHERE id = ?').run(id);
  redirect(res, '/admin');
}

async function handleAdminReportDismiss(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  if (!user.is_admin) { send(res, 403, 'غير مصرح'); return; }
  db.prepare("UPDATE reports SET status = 'dismissed' WHERE id = ?").run(id);
  redirect(res, '/admin');
}

async function handleAdminUnhideListing(req, res, user, id) {
  if (!user) { redirect(res, '/login'); return; }
  if (!user.is_admin) { send(res, 403, 'غير مصرح'); return; }
  db.prepare("UPDATE listings SET status = 'active' WHERE id = ?").run(id);
  db.prepare("UPDATE reports SET status = 'dismissed' WHERE listing_id = ? AND status = 'open'").run(id);
  redirect(res, '/admin');
}

// ---------- router ----------

let lastExpiryCheck = 0;
function maybeExpireListings() {
  const now = Date.now();
  if (now - lastExpiryCheck > 5 * 60 * 1000) { // كل 5 دقائق كحد أقصى لتفادي استعلام على كل طلب
    expireOldListings();
    lastExpiryCheck = now;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    maybeExpireListings();
    const fullUrl = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = decodeURIComponent(fullUrl.pathname);

    if (pathname.startsWith('/public/')) {
      if (serveStatic(req, res, pathname)) return;
      send(res, 404, 'غير موجود');
      return;
    }

    const user = getCurrentUser(req);
    if (user) user.unreadMessages = unreadMessageCount(user.id);
    const m = req.method;
    const baseUrl = (req.headers['x-forwarded-proto'] || 'http') + '://' + req.headers.host;

    if (pathname === '/' && m === 'GET') return handleHome(req, res, user, baseUrl);
    if (pathname === '/robots.txt' && m === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`User-agent: *\nAllow: /\nSitemap: ${baseUrl}/sitemap.xml\n`);
      return;
    }
    if (pathname === '/sitemap.xml' && m === 'GET') {
      const staticUrls = ['/', '/about', '/contact', '/commission-payment', '/terms', '/privacy', '/search']
        .map((p) => `<url><loc>${baseUrl}${p}</loc></url>`).join('');
      const catUrls = categoryList().map((c) => `<url><loc>${baseUrl}/category/${c.slug}</loc></url>`).join('');
      const listingRows = db.prepare("SELECT id FROM listings WHERE status = 'active' ORDER BY created_at DESC LIMIT 2000").all();
      const listingUrls = listingRows.map((r) => `<url><loc>${baseUrl}/listing/${r.id}</loc></url>`).join('');
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
      res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${staticUrls}${catUrls}${listingUrls}</urlset>`);
      return;
    }
    if (pathname === '/about' && m === 'GET') return send(res, 200, pages.aboutPage({ user }));
    if (pathname === '/contact' && m === 'GET') return send(res, 200, pages.contactPage({ user }));
    if (pathname === '/commission-payment' && m === 'GET') return send(res, 200, pages.commissionPaymentPage({ user, methods: COMMISSION_PAYMENT_METHODS, rate: COMMISSION_RATE }));
    if (pathname === '/terms' && m === 'GET') return send(res, 200, pages.termsPage({ user }));
    if (pathname === '/privacy' && m === 'GET') return send(res, 200, pages.privacyPage({ user }));
    if (pathname === '/search' && m === 'GET') return handleSearch(req, res, user, fullUrl.searchParams);
    if (pathname === '/forgot-password' && m === 'GET') return handleForgotPasswordGet(req, res, user);
    if (pathname === '/forgot-password' && m === 'POST') return handleForgotPasswordPost(req, res);
    if (pathname.startsWith('/category/') && m === 'GET') return handleCategory(req, res, user, pathname.split('/')[2], fullUrl.searchParams, baseUrl);
    if (pathname.match(/^\/listing\/\d+$/) && m === 'GET') return handleListing(req, res, user, pathname.split('/')[2], null, baseUrl, fullUrl.searchParams.get('reported'));
    if (pathname.match(/^\/listing\/\d+\/delete$/) && m === 'POST') return handleDeleteListing(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/listing\/\d+\/rate$/) && m === 'POST') return handleRatingPost(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/listing\/\d+\/report$/) && m === 'POST') return handleReportPost(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/listing\/\d+\/renew$/) && m === 'POST') return handleRenewListing(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/listing\/\d+\/mark-sold$/) && m === 'POST') return handleMarkSold(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/listing\/\d+\/edit$/) && m === 'GET') return handleListingEditGet(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/listing\/\d+\/edit$/) && m === 'POST') return handleListingEditPost(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/listing\/\d+\/message$/) && m === 'POST') return handleStartConversation(req, res, user, pathname.split('/')[2]);
    if (pathname === '/messages' && m === 'GET') return handleMessagesInbox(req, res, user);
    if (pathname.match(/^\/messages\/\d+$/) && m === 'GET') return handleConversationGet(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/messages\/\d+$/) && m === 'POST') return handleMessageReplyPost(req, res, user, pathname.split('/')[2]);
    if (pathname.match(/^\/seller\/\d+$/) && m === 'GET') return handleSellerPage(req, res, user, pathname.split('/')[2]);
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
    if (pathname === '/saved-searches' && m === 'POST') return handleSavedSearchPost(req, res, user);
    if (pathname.match(/^\/saved-searches\/\d+\/delete$/) && m === 'POST') return handleSavedSearchDelete(req, res, user, pathname.split('/')[2]);
    if (pathname === '/admin' && m === 'GET') return handleAdminGet(req, res, user);
    if (pathname.match(/^\/admin\/listing\/\d+\/feature$/) && m === 'POST') return handleAdminFeature(req, res, user, pathname.split('/')[3], true);
    if (pathname.match(/^\/admin\/listing\/\d+\/unfeature$/) && m === 'POST') return handleAdminFeature(req, res, user, pathname.split('/')[3], false);
    if (pathname.match(/^\/admin\/listing\/\d+\/delete$/) && m === 'POST') return handleAdminDeleteListing(req, res, user, pathname.split('/')[3]);
    if (pathname.match(/^\/admin\/user\/\d+\/delete$/) && m === 'POST') return handleAdminDeleteUser(req, res, user, pathname.split('/')[3]);
    if (pathname.match(/^\/admin\/user\/\d+\/verify$/) && m === 'POST') return handleAdminVerifyUser(req, res, user, pathname.split('/')[3], true);
    if (pathname.match(/^\/admin\/user\/\d+\/unverify$/) && m === 'POST') return handleAdminVerifyUser(req, res, user, pathname.split('/')[3], false);
    if (pathname.match(/^\/admin\/user\/\d+\/reset-password$/) && m === 'POST') return handleAdminResetPassword(req, res, user, pathname.split('/')[3]);
    if (pathname.match(/^\/admin\/report\/\d+\/dismiss$/) && m === 'POST') return handleAdminReportDismiss(req, res, user, pathname.split('/')[3]);
    if (pathname.match(/^\/admin\/listing\/\d+\/commission-paid$/) && m === 'POST') return handleAdminMarkCommissionPaid(req, res, user, pathname.split('/')[3]);
    if (pathname.match(/^\/admin\/listing\/\d+\/unhide$/) && m === 'POST') return handleAdminUnhideListing(req, res, user, pathname.split('/')[3]);

    send(res, 404, 'الصفحة غير موجودة — 404');
  } catch (err) {
    console.error(err);
    send(res, 500, 'حدث خطأ في الخادم: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(`صفقة تعمل الآن على http://localhost:${PORT}`);
});
