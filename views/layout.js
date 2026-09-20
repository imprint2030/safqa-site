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

function header(user) {
  return `
  <header class="site-header">
    <a href="/" class="logo">
      <div class="logo-mark"><span>ص</span></div>
      <span class="logo-text">صفقة</span>
    </a>
    <form class="search-bar" action="/category/cars" method="get">
      ${icons.search}
      <input type="text" name="q" placeholder="ابحث عن سيارات، عقارات، جوالات...">
      <button type="submit">بحث</button>
    </form>
    <a href="/post-ad" class="btn-accent">${icons.plus} أضف إعلان</a>
    ${user
      ? `<a href="/dashboard" class="nav-link">لوحة التحكم</a>`
      : `<a href="/login" class="nav-link">تسجيل الدخول</a>`
    }
  </header>
  <div class="zigzag"></div>`;
}

function footer() {
  return `
  <footer class="site-footer">
    <div class="container footer-cols">
      <div class="footer-col" style="max-width:260px;">
        <div class="footer-brand">
          <div class="logo-mark" style="width:28px;height:25px;border-radius:14px 14px 3px 3px;"><span style="font-size:12px;">ص</span></div>
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
        <span>من نحن</span>
        <span>اتصل بنا</span>
        <span>الشروط والأحكام</span>
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

module.exports = { page, header, footer, esc, icons };
