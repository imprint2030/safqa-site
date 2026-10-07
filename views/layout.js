const icons = require('./icons');

function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const NAV_CATEGORIES = [
  { name: 'سيارات', slug: 'cars' },
  { name: 'عقارات', slug: 'realestate' },
  { name: 'إلكترونيات وجوالات', slug: 'electronics' },
  { name: 'أثاث ومستلزمات منزلية', slug: 'furniture' },
  { name: 'خدمات', slug: 'services' },
  { name: 'وظائف', slug: 'jobs' },
  { name: 'مشاريع واستثمارات', slug: 'investments' },
  { name: 'مفقودات', slug: 'lost' },
];

// علامة "صفقة" — نافذة قمرية صنعانية مصغّرة (زجاج ملوّن + جص أبيض + إطار بُني)
function qamariyaMark(size = 36) {
  const h = Math.round(size * 0.82);
  return `
  <svg viewBox="0 0 40 32" width="${size}" height="${h}" aria-hidden="true">
    <rect x="2" y="20" width="36" height="10" rx="1.5" fill="#6B3527"/>
    <path d="M2 20 L5.44 9.42 L14.44 2.88 L25.56 2.88 L34.56 9.42 L38 20 Z" fill="#FBF6EE"/>
    <path d="M20 20 L2 20 L5.44 9.42 Z" fill="#1F8A6F"/>
    <path d="M20 20 L5.44 9.42 L14.44 2.88 Z" fill="#D9A62B"/>
    <path d="M20 20 L14.44 2.88 L25.56 2.88 Z" fill="#1A73E8"/>
    <path d="M20 20 L25.56 2.88 L34.56 9.42 Z" fill="#D9A62B"/>
    <path d="M20 20 L34.56 9.42 L38 20 Z" fill="#1F8A6F"/>
    <circle cx="20" cy="20" r="2.3" fill="#D9381E"/>
    <path d="M2 20 L5.44 9.42 L14.44 2.88 L25.56 2.88 L34.56 9.42 L38 20 Z" fill="none" stroke="#5A2C20" stroke-width="1.6"/>
    <rect x="2" y="20" width="36" height="10" rx="1.5" fill="none" stroke="#5A2C20" stroke-width="1.6"/>
  </svg>`;
}

function header(user) {
  const catLinks = NAV_CATEGORIES.map((c) => `<a href="/category/${c.slug}">${esc(c.name)}</a>`).join('');
  return `
  <header class="site-header">
    <a href="/" class="logo">
      ${qamariyaMark(38)}
      <span class="logo-text">صفقة</span>
    </a>
    <form class="search-bar" action="/category/cars" method="get">
      ${icons.search}
      <input type="text" name="q" placeholder="ابحث عن سيارات، عقارات، جوالات...">
      <button type="submit">بحث</button>
    </form>
    <a href="/post-ad" class="btn-accent">${icons.plus}<span class="label">أضف إعلان</span></a>
    ${user && user.is_admin ? `<a href="/admin" class="nav-link" style="color:var(--price);">لوحة الإدارة</a>` : ''}
    ${user
      ? `<a href="/dashboard" class="nav-link">لوحة التحكم</a>`
      : `<a href="/login" class="nav-link">تسجيل الدخول</a>`
    }
  </header>
  <nav class="cat-nav">${catLinks}</nav>
  <div class="zigzag jewel"></div>`;
}

function footer() {
  return `
  <div class="merlon-strip"></div>
  <footer class="site-footer">
    <div class="container footer-cols">
      <div class="footer-col" style="max-width:260px;">
        <div class="footer-brand">
          ${qamariyaMark(26)}
          <span>صفقة</span>
        </div>
        <span>منصة إعلانات مبوبة يمنية لبيع وشراء كل شيء بسهولة وأمان.</span>
      </div>
      <div class="footer-col">
        <h5>الفئات</h5>
        <a href="/category/cars">سيارات</a>
        <a href="/category/realestate">عقارات</a>
        <a href="/category/jobs">وظائف</a>
      </div>
      <div class="footer-col">
        <h5>الشركة</h5>
        <a href="/about">من نحن</a>
        <a href="/contact">اتصل بنا</a>
        <a href="/terms">الشروط والأحكام</a>
        <a href="/privacy">سياسة الخصوصية</a>
      </div>
      <div class="footer-col">
        <h5>حسابي</h5>
        <a href="/login">تسجيل الدخول</a>
        <a href="/signup">حساب جديد</a>
        <a href="/dashboard">لوحة التحكم</a>
      </div>
    </div>
    <div class="footer-bottom">© 2026 صفقة — جميع الحقوق محفوظة</div>
  </footer>`;
}

function page({ title, user, body, bodyClass = '', extraHead = '' }) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} — صفقة</title>
<link rel="stylesheet" href="/public/css/style.css">
${extraHead}
</head>
<body class="${bodyClass}" style="display:flex;flex-direction:column;min-height:100vh;">
${body}
</body>
</html>`;
}

module.exports = { page, header, footer, esc, icons, qamariyaMark };
