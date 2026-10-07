// قاعدة البيانات — باستخدام وحدة node:sqlite المدمجة في Node.js (لا تحتاج تثبيت أي حزمة)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'safqa.db'));

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT UNIQUE,
    email TEXT UNIQUE,
    password_hash TEXT NOT NULL,
    city TEXT,
    is_admin INTEGER NOT NULL DEFAULT 0,
    role TEXT NOT NULL DEFAULT 'both',
    id_document TEXT,
    id_verified INTEGER NOT NULL DEFAULT 0,
    prioritize_city INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    icon TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    price TEXT NOT NULL DEFAULT '',
    city TEXT NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    views INTEGER NOT NULL DEFAULT 0,
    featured INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS listing_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    file TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS bids (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    buyer_id INTEGER NOT NULL REFERENCES users(id),
    amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    listing_id INTEGER NOT NULL REFERENCES listings(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, listing_id)
  );

  CREATE TABLE IF NOT EXISTS saved_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    category_id INTEGER NOT NULL REFERENCES categories(id),
    category_name TEXT NOT NULL,
    city TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// ترقية آمنة لقواعد بيانات قديمة كانت موجودة قبل إضافة الأعمدة/الجداول الجديدة
try {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  const names = cols.map((c) => c.name);
  const addCol = (name, def) => {
    if (!names.includes(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${def}`);
  };
  addCol('is_admin', "INTEGER NOT NULL DEFAULT 0");
  addCol('role', "TEXT NOT NULL DEFAULT 'both'");
  addCol('id_document', "TEXT");
  addCol('id_verified', "INTEGER NOT NULL DEFAULT 0");
  addCol('prioritize_city', "INTEGER NOT NULL DEFAULT 1");
} catch (e) {
  // تجاهل — الأعمدة موجودة مسبقًا أو الجدول جديد بالفعل
}

try {
  const lcols = db.prepare("PRAGMA table_info(listings)").all();
  const lnames = lcols.map((c) => c.name);
  if (!lnames.includes('extra_fields')) db.exec("ALTER TABLE listings ADD COLUMN extra_fields TEXT");
  if (!lnames.includes('price_value')) db.exec("ALTER TABLE listings ADD COLUMN price_value REAL");
} catch (e) {
  // تجاهل
}

const CITIES = ['صنعاء', 'عدن', 'تعز', 'الحديدة', 'إب', 'مأرب', 'حضرموت', 'ذمار'];

const CATEGORIES = [
  { name: 'سيارات', slug: 'cars', icon: 'car' },
  { name: 'عقارات', slug: 'realestate', icon: 'building' },
  { name: 'إلكترونيات وجوالات', slug: 'electronics', icon: 'phone' },
  { name: 'أثاث ومستلزمات منزلية', slug: 'furniture', icon: 'sofa' },
  { name: 'خدمات', slug: 'services', icon: 'wrench' },
  { name: 'وظائف', slug: 'jobs', icon: 'briefcase' },
  { name: 'مشاريع واستثمارات', slug: 'investments', icon: 'chart' },
  { name: 'مفقودات', slug: 'lost', icon: 'search' },
  { name: 'تجارة حيوانات', slug: 'livestock', icon: 'livestock' }
];

// حقول تخصصية حسب نوع الفئة — تُعرض ديناميكيًا في نموذج إضافة الإعلان وصفحة التفاصيل
const CATEGORY_FIELDS = {
  cars: [
    { key: 'make', label: 'الشركة المصنعة', type: 'text', placeholder: 'تويوتا، هيونداي...' },
    { key: 'model', label: 'الموديل', type: 'text', placeholder: 'كامري، النترا...' },
    { key: 'year', label: 'سنة الصنع', type: 'number', placeholder: '2019' },
    { key: 'km', label: 'المسافة المقطوعة (كم)', type: 'number', placeholder: '50000' },
    { key: 'transmission', label: 'ناقل الحركة', type: 'select', options: ['أوتوماتيك', 'مانيوال'] },
    { key: 'fuel', label: 'نوع الوقود', type: 'select', options: ['بنزين', 'ديزل', 'هايبرد', 'كهربائي'] },
  ],
  realestate: [
    { key: 'listing_type', label: 'نوع العرض', type: 'select', options: ['بيع', 'إيجار'] },
    { key: 'property_type', label: 'نوع العقار', type: 'select', options: ['شقة', 'فيلا', 'أرض', 'محل تجاري', 'مكتب'] },
    { key: 'rooms', label: 'عدد الغرف', type: 'number', placeholder: '3' },
    { key: 'area', label: 'المساحة (م²)', type: 'number', placeholder: '150' },
    { key: 'floor', label: 'الطابق', type: 'text', placeholder: 'الثاني' },
  ],
  electronics: [
    { key: 'brand', label: 'الماركة', type: 'text', placeholder: 'آبل، سامسونج...' },
    { key: 'condition', label: 'الحالة', type: 'select', options: ['جديد', 'مستعمل - كحالة الجديد', 'مستعمل'] },
    { key: 'warranty', label: 'الضمان', type: 'select', options: ['يوجد ضمان', 'لا يوجد ضمان'] },
  ],
  furniture: [
    { key: 'material', label: 'الخامة', type: 'text', placeholder: 'خشب، معدن...' },
    { key: 'condition', label: 'الحالة', type: 'select', options: ['جديد', 'مستعمل'] },
  ],
  services: [
    { key: 'service_type', label: 'نوع الخدمة', type: 'text', placeholder: 'صيانة، نقل عفش...' },
    { key: 'availability', label: 'التوفر', type: 'text', placeholder: 'على مدار الأسبوع' },
  ],
  jobs: [
    { key: 'job_type', label: 'نوع الوظيفة', type: 'select', options: ['دوام كامل', 'دوام جزئي', 'عقد مؤقت', 'عن بعد'] },
    { key: 'salary', label: 'الراتب المتوقع', type: 'text', placeholder: 'حسب الاتفاق' },
    { key: 'experience', label: 'الخبرة المطلوبة', type: 'text', placeholder: '3 سنوات' },
  ],
  investments: [
    { key: 'sector', label: 'القطاع', type: 'text', placeholder: 'عقاري، تجاري...' },
    { key: 'capital', label: 'رأس المال المطلوب', type: 'text', placeholder: '10,000,000 ر.ي' },
  ],
  lost: [
    { key: 'item_type', label: 'نوع الشيء/الحيوان', type: 'text', placeholder: 'قطة، محفظة...' },
    { key: 'lost_date', label: 'تاريخ الفقدان', type: 'text', placeholder: '2026-10-01' },
    { key: 'lost_location', label: 'آخر مكان شوهد فيه', type: 'text', placeholder: 'حي السبعين' },
  ],
  livestock: [
    { key: 'animal_type', label: 'نوع الحيوان', type: 'select', options: ['أغنام', 'ماعز', 'أبقار', 'إبل', 'دواجن', 'خيول', 'أخرى'] },
    { key: 'count', label: 'العدد', type: 'number', placeholder: '5' },
    { key: 'age', label: 'العمر التقريبي', type: 'text', placeholder: 'سنة ونصف' },
    { key: 'vaccinated', label: 'التحصين', type: 'select', options: ['محصّن', 'غير محصّن'] },
  ],
};

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

const ADMIN_EMAIL = 'nassrataa4@gmail.com';
const ADMIN_PHONE = '0537514314';
const ADMIN_NAME = 'مالك الموقع';
const ADMIN_DEFAULT_PASSWORD = 'Owner1234';

function ensureAdminAccount() {
  let row = db.prepare('SELECT id FROM users WHERE email = ?').get(ADMIN_EMAIL);
  if (!row) {
    db.prepare('INSERT INTO users (name, phone, email, password_hash, city, is_admin) VALUES (?, ?, ?, ?, ?, 1)')
      .run(ADMIN_NAME, ADMIN_PHONE, ADMIN_EMAIL, hashPassword(ADMIN_DEFAULT_PASSWORD), 'صنعاء');
  } else {
    db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(row.id);
  }
}

function parsePriceValue(priceText) {
  if (!priceText) return null;
  const match = String(priceText).match(/[\d,]{2,}/);
  if (!match) return null;
  const n = parseFloat(match[0].replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function seed() {
  const catCount = db.prepare('SELECT COUNT(*) AS c FROM categories').get().c;
  if (catCount === 0) {
    const insertCat = db.prepare('INSERT INTO categories (name, slug, icon) VALUES (?, ?, ?)');
    for (const c of CATEGORIES) insertCat.run(c.name, c.slug, c.icon);
  } else {
    // ترقية: إضافة أي فئة جديدة غير موجودة بعد (مثل "تجارة حيوانات") لقاعدة بيانات موجودة مسبقًا
    const insertCat = db.prepare('INSERT INTO categories (name, slug, icon) VALUES (?, ?, ?)');
    for (const c of CATEGORIES) {
      const exists = db.prepare('SELECT id FROM categories WHERE slug = ?').get(c.slug);
      if (!exists) insertCat.run(c.name, c.slug, c.icon);
    }
  }

  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const insertUser = db.prepare(
      'INSERT INTO users (name, phone, email, password_hash, city) VALUES (?, ?, ?, ?, ?)'
    );
    insertUser.run('عبدالله المخلافي', '777123456', 'demo@safqa.ye', hashPassword('demo1234'), 'صنعاء');

    const demoUserId = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@safqa.ye').id;
    const catBySlug = (slug) => db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug).id;

    const sample = [
      { cat: 'cars', title: 'تويوتا لاندكروزر 2019 نظيفة جدًا وكالة', price: '45,000,000 ر.ي', city: 'صنعاء', featured: 1,
        desc: 'سيارة تويوتا لاندكروزر VXR موديل 2019، وكالة، فحص كامل، بدون حوادث، جميع الصيانات موثقة لدى الوكيل المعتمد.' },
      { cat: 'realestate', title: 'شقة مفروشة للإيجار 3 غرف - حي حدة', price: '150,000 ر.ي / شهريًا', city: 'صنعاء', featured: 1,
        desc: 'شقة مفروشة بالكامل، 3 غرف نوم وصالة ومطبخ، في موقع مميز بحي حدة، قريبة من الخدمات.' },
      { cat: 'electronics', title: 'آيفون 13 برو ماكس 256 جيجا', price: '380,000 ر.ي', city: 'عدن', featured: 0,
        desc: 'آيفون 13 برو ماكس، 256 جيجا، حالة ممتازة، البطارية 91%، مع جميع الملحقات الأصلية.' },
      { cat: 'furniture', title: 'طقم كنب 7 مقاعد خشب زان', price: '220,000 ر.ي', city: 'تعز', featured: 0,
        desc: 'طقم كنب فاخر 7 مقاعد، خشب زان أصلي، قماش عالي الجودة، استخدام خفيف.' },
      { cat: 'jobs', title: 'مطلوب مهندس مدني - عقد سنوي', price: 'حسب الاتفاق', city: 'الحديدة', featured: 0,
        desc: 'مطلوب مهندس مدني بخبرة لا تقل عن 3 سنوات للعمل في مشروع إنشائي، عقد سنوي قابل للتجديد.' },
      { cat: 'investments', title: 'محل تجاري للبيع - شارع الزبيري', price: '80,000,000 ر.ي', city: 'صنعاء', featured: 0,
        desc: 'محل تجاري بموقع استراتيجي على شارع الزبيري، مساحة 60 م، واجهة زجاجية، جاهز للاستلام.' },
      { cat: 'realestate', title: 'أرض سكنية للبيع 300 م - حي الروضة', price: '60,000,000 ر.ي', city: 'صنعاء', featured: 0,
        desc: 'أرض سكنية بمساحة 300 متر، صك شرعي، في حي الروضة، مطلة على شارعين.' },
      { cat: 'cars', title: 'دراجة نارية هوندا 2020', price: '1,200,000 ر.ي', city: 'إب', featured: 0,
        desc: 'دراجة نارية هوندا موديل 2020، حالة ممتازة، استخدام شخصي فقط.' },
      { cat: 'electronics', title: 'لابتوب ديل Core i7', price: '210,000 ر.ي', city: 'صنعاء', featured: 0,
        desc: 'لابتوب ديل، معالج Core i7 الجيل العاشر، رام 16 جيجا، هارد SSD 512 جيجا.' },
      { cat: 'lost', title: 'مكافأة لمن يجد قطة سيامي مفقودة', price: 'مكافأة', city: 'صنعاء', featured: 0,
        desc: 'قطة سيامي مفقودة من حي السبعين منذ يومين، تحمل طوق أحمر، مكافأة مجزية لمن يجدها.' },
      { cat: 'services', title: 'خدمات صيانة مكيفات - فني معتمد', price: 'حسب الطلب', city: 'صنعاء', featured: 0,
        desc: 'فني صيانة مكيفات معتمد، تركيب وصيانة وتعبئة فريون، خدمة متوفرة في جميع أنحاء المحافظة.' },
      { cat: 'livestock', title: 'أغنام نعيمي للبيع - دفعة 10 رؤوس', price: '85,000 ر.ي / للرأس', city: 'ذمار', featured: 0,
        desc: 'أغنام نعيمي سليمة ومحصّنة، جاهزة للبيع بالجملة أو المفرق، يمكن المعاينة في الموقع.' }
    ];

    const insertListing = db.prepare(`
      INSERT INTO listings (user_id, category_id, title, description, price, city, phone, featured, views)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const s of sample) {
      insertListing.run(demoUserId, catBySlug(s.cat), s.title, s.desc, s.price, s.city, '777123456', s.featured, Math.floor(Math.random() * 800) + 30);
    }
  }

  ensureAdminAccount();

  // ترحيل: حساب القيمة الرقمية للسعر لأي إعلان لم تُحسب له بعد (لتفعيل فلتر السعر)
  const unparsed = db.prepare('SELECT id, price FROM listings WHERE price_value IS NULL').all();
  if (unparsed.length) {
    const updatePrice = db.prepare('UPDATE listings SET price_value = ? WHERE id = ?');
    for (const row of unparsed) updatePrice.run(parsePriceValue(row.price), row.id);
  }
}

seed();

module.exports = { db, CITIES, CATEGORIES, CATEGORY_FIELDS, hashPassword, verifyPassword, parsePriceValue };
