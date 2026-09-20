const { page, header, footer, esc, icons } = require('./layout');

function moneyOrText(v) {
  return esc(v);
}

function listingCard(l, featured = false) {
  const img = l.thumb
    ? `<img src="${esc(l.thumb)}" alt="">`
    : 'صورة الإعلان';
  return `
  <a href="/listing/${l.id}" class="listing-card">
    ${l.featured ? `<span class="badge-featured">مميز</span>` : ''}
    <div class="thumb">${img}</div>
    <div class="body">
      <div class="title">${esc(l.title)}</div>
      <div class="price">${moneyOrText(l.price)}</div>
      <div class="meta"><span>${esc(l.city)}</span><span>${esc(l.time_ago)}</span></div>
    </div>
  </a>`;
}

function categoryCard(c) {
  return `
  <a href="/category/${c.slug}" class="cat-card">
    <div class="ico">${icons[c.icon] || icons.search}</div>
    <span>${esc(c.name)}</span>
  </a>`;
}

function homePage({ user, categories, featured, recent }) {
  const body = `
  ${header(user)}
  <div class="hero">
    <h1>سوق اليمن الأول للإعلانات المبوبة</h1>
    <p>بيع واشترِ كل شيء بسهولة وأمان — سيارات، عقارات، إلكترونيات، وظائف، وأكثر في جميع المحافظات اليمنية</p>
    <div class="hero-stats">
      <div class="stat"><div class="num">+120,000</div><div class="label">إعلان نشط</div></div>
      <div class="sep"></div>
      <div class="stat"><div class="num">18</div><div class="label">محافظة</div></div>
      <div class="sep"></div>
      <div class="stat"><div class="num">+45,000</div><div class="label">مستخدم</div></div>
    </div>
  </div>

  <div class="section container">
    <h2>تصفح حسب الفئة</h2>
    <div class="cat-grid">${categories.map(categoryCard).join('')}</div>
  </div>

  <div class="section container">
    <div class="section-head"><h2>إعلانات مميزة</h2><a href="/category/cars">عرض الكل ←</a></div>
    <div class="listing-grid">${featured.map((l) => listingCard(l)).join('')}</div>
  </div>

  <div class="section container">
    <h2>أحدث الإعلانات</h2>
    <div class="listing-grid">${recent.map((l) => listingCard(l)).join('')}</div>
  </div>

  ${footer()}
  `;
  return page({ title: 'الرئيسية', user, body });
}

function categoryPage({ user, category, listings, cities, selectedCity, q }) {
  const cityRows = ['الكل', ...cities].map((c) => {
    const active = c === (selectedCity || 'الكل');
    const href = c === 'الكل' ? `/category/${category.slug}` : `/category/${category.slug}?city=${encodeURIComponent(c)}`;
    return `<a href="${href}" class="city-row${active ? ' active' : ''}"><span class="dot" style="background:${active ? 'var(--primary)' : 'transparent'}"></span><span>${esc(c)}</span></a>`;
  }).join('');

  const body = `
  ${header(user)}
  <div class="breadcrumb"><a href="/">الرئيسية</a><span>/</span><span class="current">${esc(category.name)}</span></div>
  <div class="cat-layout">
    <div class="filters">
      <div>
        <h4 style="margin-bottom:10px;">المدينة</h4>
        <div class="city-list">${cityRows}</div>
      </div>
      <div class="divider"></div>
      <div>
        <h4 style="margin-bottom:10px;">السعر (ر.ي)</h4>
        <div style="display:flex;gap:8px;">
          <input type="text" placeholder="من">
          <input type="text" placeholder="إلى">
        </div>
      </div>
    </div>
    <div class="results">
      <div class="results-head">
        <span>عرض ${listings.length} إعلان في «${esc(category.name)}${selectedCity && selectedCity !== 'الكل' ? ' - ' + esc(selectedCity) : ''}»</span>
      </div>
      <div class="listing-grid cols-3">
        ${listings.length ? listings.map((l) => listingCard(l)).join('') : '<p style="color:var(--text-2);font-size:14px;">لا توجد إعلانات مطابقة حاليًا.</p>'}
      </div>
    </div>
  </div>
  ${footer()}
  `;
  return page({ title: category.name, user, body });
}

function listingPage({ user, listing, images, owner }) {
  const mainImg = images[0] ? `<img src="${esc(images[0])}" alt="">` : 'الصورة الرئيسية للإعلان';
  const thumbs = images.slice(1, 5).map((f) => `<div class="thumb-sm"><img src="${esc(f)}" alt=""></div>`).join('');

  const body = `
  ${header(user)}
  <div class="breadcrumb"><a href="/">الرئيسية</a><span>/</span><a href="/category/${listing.category_slug}">${esc(listing.category_name)}</a><span>/</span><span class="current">${esc(listing.title)}</span></div>
  <div class="listing-layout">
    <div class="listing-main">
      <div>
        <div class="gallery-main">${mainImg}</div>
        ${images.length > 1 ? `<div class="gallery-thumbs" style="margin-top:8px;">${thumbs}</div>` : ''}
      </div>
      <div class="card">
        <div class="listing-title-row">
          <h1>${esc(listing.title)}</h1>
          <button aria-label="حفظ في المفضلة" style="background:var(--chip);border:none;border-radius:10px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--primary);flex-shrink:0;">${icons.heart}</button>
        </div>
        <div class="detail-price">${moneyOrText(listing.price)}</div>
        <div class="detail-meta">
          <span>${esc(listing.city)}</span>
          <span>نُشر ${esc(listing.time_ago)}</span>
          <span>رقم الإعلان: ${listing.id}</span>
          <span>${listing.views} مشاهدة</span>
        </div>
      </div>
      <div class="card">
        <span style="font-size:15px;font-weight:800;">الوصف</span>
        <p class="desc-text">${esc(listing.description) || 'لا يوجد وصف إضافي لهذا الإعلان.'}</p>
      </div>
    </div>
    <div class="listing-sidebar">
      <div class="card">
        <div class="seller-row">
          <div class="avatar">${esc((listing.seller_name || '؟').slice(0, 2))}</div>
          <div>
            <div class="seller-name">${esc(listing.seller_name)}</div>
            <div class="seller-sub">${esc(listing.seller_city || '')} · عضو منذ ${esc((listing.seller_since || '').slice(0, 4))}</div>
          </div>
        </div>
        <button id="revealBtn" class="btn-reveal" style="background:var(--primary);">${icons.callPhone}<span id="revealLabel">إظهار رقم الجوال</span></button>
        <button class="btn-msg">${icons.message} مراسلة البائع</button>
      </div>
      <div class="warn-box">${icons.info}<p style="margin:0;">لا تدفع أي مبلغ مقدمًا قبل معاينة السلعة، وتجنّب التحويل البنكي لأشخاص غير موثوقين. تعامل داخل موقع صفقة فقط.</p></div>
      ${owner ? `<form method="post" action="/listing/${listing.id}/delete" onsubmit="return confirm('هل تريد حذف هذا الإعلان؟');"><button class="btn-outline" style="width:100%;color:#B23A2E;">حذف الإعلان</button></form>` : ''}
    </div>
  </div>
  <script>
    document.getElementById('revealBtn').addEventListener('click', function () {
      document.getElementById('revealLabel').textContent = '${esc(listing.phone)}';
      this.style.background = 'var(--accent)';
    });
  </script>
  ${footer()}
  `;
  return page({ title: listing.title, user, body });
}

function loginPage({ user, error }) {
  const body = `
  <div class="auth-wrap">
    <div class="auth-card">
      <a href="/" class="auth-logo">
        <div class="logo-mark" style="width:44px;height:40px;border-radius:22px 22px 4px 4px;"><span style="font-size:19px;">ص</span></div>
        <span class="logo-text" style="font-size:22px;">صفقة</span>
      </a>
      <div class="auth-title"><h1>تسجيل الدخول</h1><p>سجّل دخولك للمتابعة إلى حسابك في صفقة</p></div>
      ${error ? `<div class="error-box">${esc(error)}</div>` : ''}
      <div class="tabs">
        <button type="button" class="tab-btn active" data-tab="phone">رقم الجوال</button>
        <button type="button" class="tab-btn" data-tab="email">البريد الإلكتروني</button>
      </div>
      <form method="post" action="/login" id="loginForm">
        <div class="field" data-panel="phone">
          <label>رقم الجوال</label>
          <div class="phone-input">
            <span class="prefix">967+</span>
            <input type="text" name="identifier_phone" placeholder="7XX XXX XXX">
          </div>
        </div>
        <div class="field" data-panel="email" style="display:none;margin-top:14px;">
          <label>البريد الإلكتروني</label>
          <input type="text" name="identifier_email" placeholder="example@email.com">
        </div>
        <div class="field" style="margin-top:14px;">
          <label>كلمة المرور</label>
          <input type="password" name="password" placeholder="••••••••" required>
        </div>
        <input type="hidden" name="method" id="methodField" value="phone">
        <button type="submit" class="btn-primary" style="width:100%;margin-top:16px;">تسجيل الدخول</button>
      </form>
      <p class="muted-center" style="margin:2px 0;">تجربة سريعة: demo@safqa.ye / 777123456 — كلمة المرور demo1234</p>
      <div class="muted-center">ليس لديك حساب؟ <a href="/signup">إنشاء حساب جديد</a></div>
    </div>
  </div>
  <script>
    var tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var target = btn.getAttribute('data-tab');
        document.querySelectorAll('[data-panel]').forEach(function (p) {
          p.style.display = p.getAttribute('data-panel') === target ? 'flex' : 'none';
        });
        document.getElementById('methodField').value = target;
      });
    });
  </script>
  `;
  return page({ title: 'تسجيل الدخول', user, body });
}

function signupPage({ user, error, cities }) {
  const cityOptions = cities.map((c) => `<option>${esc(c)}</option>`).join('');
  const body = `
  <div class="auth-wrap">
    <div class="auth-card">
      <a href="/" class="auth-logo">
        <div class="logo-mark" style="width:40px;height:36px;border-radius:20px 20px 4px 4px;"><span style="font-size:17px;">ص</span></div>
        <span class="logo-text" style="font-size:20px;">صفقة</span>
      </a>
      <div class="auth-title"><h1>إنشاء حساب جديد</h1><p>انضم إلى صفقة وابدأ البيع والشراء في دقائق</p></div>
      ${error ? `<div class="error-box">${esc(error)}</div>` : ''}
      <div class="tabs">
        <button type="button" class="tab-btn active" data-tab="phone">رقم الجوال</button>
        <button type="button" class="tab-btn" data-tab="email">البريد الإلكتروني</button>
      </div>
      <form method="post" action="/signup">
        <div class="field">
          <label>الاسم الكامل</label>
          <input type="text" name="name" placeholder="مثال: أحمد الحاشدي" required>
        </div>
        <div class="field" data-panel="phone" style="margin-top:14px;">
          <label>رقم الجوال</label>
          <div class="phone-input"><span class="prefix">967+</span><input type="text" name="phone" placeholder="7XX XXX XXX"></div>
        </div>
        <div class="field" data-panel="email" style="display:none;margin-top:14px;">
          <label>البريد الإلكتروني</label>
          <input type="text" name="email" placeholder="example@email.com">
        </div>
        <div class="field" style="margin-top:14px;">
          <label>كلمة المرور</label>
          <input type="password" name="password" placeholder="8 أحرف على الأقل" required minlength="6">
        </div>
        <div class="field" style="margin-top:14px;">
          <label>المحافظة</label>
          <select name="city">${cityOptions}</select>
        </div>
        <input type="hidden" name="method" id="methodField" value="phone">
        <label style="display:flex;align-items:flex-start;gap:8px;font-size:11.5px;color:var(--text-2);line-height:1.6;margin-top:14px;">
          <input type="checkbox" required style="margin-top:2px;">
          <span>أوافق على <span style="color:var(--accent);font-weight:700;">شروط الاستخدام</span> و<span style="color:var(--accent);font-weight:700;">سياسة الخصوصية</span> الخاصة بصفقة</span>
        </label>
        <button type="submit" class="btn-primary" style="width:100%;margin-top:16px;">إنشاء الحساب</button>
      </form>
      <div class="muted-center">لديك حساب بالفعل؟ <a href="/login">تسجيل الدخول</a></div>
    </div>
  </div>
  <script>
    var tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(function (btn) {
      btn.addEventListener('click', function () {
        tabs.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        var target = btn.getAttribute('data-tab');
        document.querySelectorAll('[data-panel]').forEach(function (p) {
          p.style.display = p.getAttribute('data-panel') === target ? 'flex' : 'none';
        });
        document.getElementById('methodField').value = target;
      });
    });
  </script>
  `;
  return page({ title: 'حساب جديد', user, body });
}

function postAdPage({ user, categories, cities, error }) {
  const catOptions = categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  const cityOptions = cities.map((c) => `<option>${esc(c)}</option>`).join('');
  const body = `
  ${header(user)}
  <div class="zigzag" style="height:8px;"></div>
  <div class="postad-wrap">
    <div>
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;">إضافة إعلان جديد</h1>
      <p style="margin:0;font-size:13px;color:var(--text-2);">أدخل بيانات إعلانك بدقة ليصل لأكبر عدد من المهتمين</p>
    </div>
    ${error ? `<div class="error-box">${esc(error)}</div>` : ''}
    <form class="card" id="postAdForm" method="post" action="/post-ad" style="gap:18px;">
      <div class="field">
        <label>الفئة</label>
        <select name="category_id" required>${catOptions}</select>
      </div>
      <div class="field">
        <label>عنوان الإعلان</label>
        <input type="text" name="title" placeholder="مثال: تويوتا كامري 2018 فل كامل" required>
      </div>
      <div class="field">
        <label>الوصف</label>
        <textarea name="description" placeholder="اكتب وصفًا واضحًا يشمل الحالة والمواصفات..."></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="field"><label>السعر (ر.ي)</label><input type="text" name="price" placeholder="0"></div>
        <div class="field"><label>المحافظة</label><select name="city">${cityOptions}</select></div>
      </div>
      <div class="field">
        <label>رقم التواصل</label>
        <div class="phone-input"><span class="prefix">967+</span><input type="text" name="phone" placeholder="7XX XXX XXX" required></div>
      </div>
      <div class="field">
        <label>صور الإعلان</label>
        <div class="drop-zone" id="dropZone">
          ${icons.upload}
          <span style="font-size:13.5px;font-weight:700;">اضغط لاختيار الصور</span>
          <span class="hint">حتى 5 صور — JPG أو PNG</span>
        </div>
        <input type="file" id="imgInput" accept="image/*" multiple style="display:none;">
        <div class="img-previews" id="previews"></div>
        <span class="hint">الصور تُحفظ مباشرة على الخادم عند النشر (بحد أقصى 3 صور، أقل من 1 ميجابايت لكل صورة، للحفاظ على سرعة النموذج التجريبي)</span>
      </div>
      <input type="hidden" name="images_b64" id="imagesField">
      <div style="display:flex;gap:12px;">
        <button type="submit" class="btn-primary" style="flex-grow:1;">نشر الإعلان</button>
        <a href="/" class="btn-outline">إلغاء</a>
      </div>
    </form>
  </div>
  <script>
    var dropZone = document.getElementById('dropZone');
    var input = document.getElementById('imgInput');
    var previews = document.getElementById('previews');
    var imagesField = document.getElementById('imagesField');
    var encoded = [];

    dropZone.addEventListener('click', function () { input.click(); });

    input.addEventListener('change', function () {
      previews.innerHTML = '';
      encoded = [];
      var files = Array.from(input.files).slice(0, 3);
      var remaining = files.length;
      if (!remaining) { imagesField.value = ''; return; }
      files.forEach(function (file) {
        if (file.size > 1024 * 1024) { remaining--; return; }
        var reader = new FileReader();
        reader.onload = function () {
          encoded.push(reader.result);
          var div = document.createElement('div');
          div.className = 'prev';
          div.innerHTML = '<img src="' + reader.result + '">';
          previews.appendChild(div);
          imagesField.value = JSON.stringify(encoded);
        };
        reader.readAsDataURL(file);
      });
    });
  </script>
  ${footer()}
  `;
  return page({ title: 'إضافة إعلان', user, body });
}

function profileCard(user) {
  return `
  <div class="profile-card">
    <div class="avatar" style="width:60px;height:60px;font-size:20px;">${esc((user.name || '؟').slice(0, 2))}</div>
    <span style="font-size:15px;font-weight:800;">${esc(user.name)}</span>
    <span style="font-size:11.5px;color:var(--text-2);">${esc(user.city || '')} · عضو منذ ${esc((user.created_at || '').slice(0, 4))}</span>
  </div>`;
}

function dashNav(active) {
  const item = (href, icon, label, key) =>
    `<a href="${href}"${key === active ? ' class="active"' : ''}>${icon} ${label}</a>`;
  return `
  <div class="dash-nav">
    ${item('/dashboard', icons.grid, 'إعلاناتي', 'ads')}
    ${item('#', icons.message, 'الرسائل', 'messages')}
    ${item('/settings', icons.settings, 'الإعدادات', 'settings')}
    <form method="post" action="/logout" style="margin:0;"><button class="danger">${icons.logout} تسجيل الخروج</button></form>
  </div>`;
}

function settingsPage({ user, error, success, cities }) {
  const cityOptions = cities.map((c) => `<option${c === user.city ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const body = `
  ${header(user)}
  <div class="zigzag" style="height:8px;"></div>
  <div class="dash-layout container">
    <div class="dash-side">
      ${profileCard(user)}
      ${dashNav('settings')}
    </div>
    <div style="flex-grow:1;display:flex;flex-direction:column;gap:20px;max-width:520px;">
      <h1 style="margin:0;font-size:20px;font-weight:800;">الإعدادات</h1>
      ${error ? `<div class="error-box">${esc(error)}</div>` : ''}
      ${success ? `<div class="warn-box" style="background:#E6F1EC;border-color:#1A73E8;color:#124C8A;">${icons.info} <p style="margin:0;">تم حفظ التغييرات بنجاح.</p></div>` : ''}

      <form method="post" action="/settings" class="card" style="gap:16px;">
        <span style="font-size:15px;font-weight:800;">تعديل البيانات الشخصية</span>
        <div class="field"><label>الاسم الكامل</label><input type="text" name="name" value="${esc(user.name)}" required></div>
        <div class="field"><label>رقم الجوال</label>
          <div class="phone-input"><span class="prefix">967+</span><input type="text" name="phone" value="${esc(user.phone || '')}" placeholder="7XX XXX XXX"></div>
        </div>
        <div class="field"><label>البريد الإلكتروني</label><input type="text" name="email" value="${esc(user.email || '')}" placeholder="example@email.com"></div>
        <div class="field"><label>المحافظة</label><select name="city">${cityOptions}</select></div>
        <button type="submit" class="btn-primary" style="align-self:flex-start;">حفظ التغييرات</button>
      </form>

      <form method="post" action="/settings/password" class="card" style="gap:16px;">
        <span style="font-size:15px;font-weight:800;">تغيير كلمة المرور</span>
        <div class="field"><label>كلمة المرور الحالية</label><input type="password" name="current_password" required></div>
        <div class="field"><label>كلمة المرور الجديدة</label><input type="password" name="new_password" minlength="6" required></div>
        <button type="submit" class="btn-outline" style="align-self:flex-start;">تحديث كلمة المرور</button>
      </form>
    </div>
  </div>
  ${footer()}
  `;
  return page({ title: 'الإعدادات', user, body });
}

function dashboardPage({ user, listings, stats }) {
  const rows = listings.length ? listings.map((l) => `
    <div class="ad-row">
      <div class="thumb">${l.thumb ? `<img src="${esc(l.thumb)}">` : ''}</div>
      <div class="info">
        <a href="/listing/${l.id}">${esc(l.title)}</a>
        <span class="sub">${moneyOrText(l.price)} · ${esc(l.city)}</span>
      </div>
      <span class="status-pill status-active">نشط</span>
      <span class="views">${l.views} مشاهدة</span>
      <form method="post" action="/listing/${l.id}/delete" onsubmit="return confirm('هل تريد حذف هذا الإعلان؟');">
        <button class="btn-mini danger">حذف</button>
      </form>
    </div>`).join('') : `<div style="padding:30px;text-align:center;color:var(--text-2);font-size:13.5px;">لا توجد إعلانات بعد. <a href="/post-ad" style="color:var(--accent);font-weight:700;">أضف إعلانك الأول</a></div>`;

  const body = `
  ${header(user)}
  <div class="zigzag" style="height:8px;"></div>
  <div class="dash-layout container">
    <div class="dash-side">
      ${profileCard(user)}
      ${dashNav('ads')}
    </div>
    <div style="flex-grow:1;display:flex;flex-direction:column;gap:20px;">
      <div class="stat-grid">
        <div class="stat-card"><span class="label">الإعلانات النشطة</span><span class="val">${stats.active}</span></div>
        <div class="stat-card"><span class="label">مجموع المشاهدات</span><span class="val">${stats.views}</span></div>
        <div class="stat-card"><span class="label">الرسائل الجديدة</span><span class="val">0</span></div>
        <div class="stat-card"><span class="label">إعلانات منتهية</span><span class="val">0</span></div>
      </div>
      <div class="my-ads">
        <div class="head"><span>إعلاناتي</span><a href="/post-ad" style="font-size:12.5px;font-weight:700;color:var(--primary);">+ إضافة إعلان جديد</a></div>
        ${rows}
      </div>
    </div>
  </div>
  ${footer()}
  `;
  return page({ title: 'لوحة التحكم', user, body });
}

function adminPage({ user, stats, listings, users }) {
  const listingRows = listings.length ? listings.map((l) => `
    <div class="ad-row">
      <div class="thumb">${l.thumb ? `<img src="${esc(l.thumb)}">` : ''}</div>
      <div class="info">
        <a href="/listing/${l.id}">${esc(l.title)}</a>
        <span class="sub">${esc(l.owner_name)} · ${esc(l.category_name)} · ${esc(l.city)}</span>
      </div>
      <span class="status-pill status-active">${l.status === 'active' ? 'نشط' : esc(l.status)}</span>
      <span class="views">${l.views} مشاهدة</span>
      <form method="post" action="/admin/listing/${l.id}/delete" onsubmit="return confirm('حذف هذا الإعلان نهائيًا؟');">
        <button class="btn-mini danger">حذف</button>
      </form>
    </div>`).join('') : `<div style="padding:30px;text-align:center;color:var(--text-2);font-size:13.5px;">لا توجد إعلانات بعد.</div>`;

  const userRows = users.length ? users.map((u) => `
    <div class="ad-row">
      <div class="info" style="flex-grow:1;">
        <span style="font-weight:700;">${esc(u.name)}${u.is_admin ? ' <span style="color:var(--price);font-size:11.5px;">(مدير)</span>' : ''}</span>
        <span class="sub">${esc(u.phone || '')} ${u.phone && u.email ? '·' : ''} ${esc(u.email || '')} · ${esc(u.city || '')}</span>
      </div>
      ${u.is_admin ? '' : `
      <form method="post" action="/admin/user/${u.id}/delete" onsubmit="return confirm('حذف هذا المستخدم وكل إعلاناته نهائيًا؟');">
        <button class="btn-mini danger">حذف</button>
      </form>`}
    </div>`).join('') : '';

  const body = `
  ${header(user)}
  <div class="zigzag" style="height:8px;"></div>
  <div class="dash-layout container">
    <div class="dash-side">
      ${profileCard(user)}
      <div class="dash-nav">
        <a href="/admin" class="active">${icons.grid} نظرة عامة</a>
        <a href="/dashboard">${icons.settings} لوحة حسابي</a>
      </div>
    </div>
    <div style="flex-grow:1;display:flex;flex-direction:column;gap:20px;">
      <h1 style="margin:0;font-size:20px;font-weight:800;">لوحة الإدارة</h1>
      <div class="stat-grid">
        <div class="stat-card"><span class="label">إجمالي المستخدمين</span><span class="val">${stats.users}</span></div>
        <div class="stat-card"><span class="label">إجمالي الإعلانات</span><span class="val">${stats.listings}</span></div>
        <div class="stat-card"><span class="label">إعلانات نشطة</span><span class="val">${stats.activeListings}</span></div>
        <div class="stat-card"><span class="label">مجموع المشاهدات</span><span class="val">${stats.views}</span></div>
      </div>
      <div class="my-ads">
        <div class="head"><span>كل الإعلانات (${listings.length})</span></div>
        ${listingRows}
      </div>
      <div class="my-ads">
        <div class="head"><span>كل المستخدمين (${users.length})</span></div>
        ${userRows}
      </div>
    </div>
  </div>
  ${footer()}
  `;
  return page({ title: 'لوحة الإدارة', user, body });
}

module.exports = { homePage, categoryPage, listingPage, loginPage, signupPage, postAdPage, dashboardPage, settingsPage, adminPage };
