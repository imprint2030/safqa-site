const { page, header, footer, esc, icons, qamariyaMark } = require('./layout');

const REPORT_REASONS_CLIENT = {
  fraud: 'احتيال أو نصب',
  fake: 'إعلان مزيّف أو منتهي',
  prohibited: 'سلعة أو خدمة مخالفة للقانون',
  duplicate: 'إعلان مكرر أو سبام',
  other: 'سبب آخر',
};

function emptyState(iconKey, text, actionHtml) {
  return `
  <div class="empty-state">
    <div class="empty-ico">${icons[iconKey] || icons.emptyBox}</div>
    <p>${text}</p>
    ${actionHtml || ''}
  </div>`;
}

function moneyOrText(v) {
  return esc(v);
}

function daysLeft(expiresAt) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt.replace(' ', 'T') + 'Z').getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function listingStatusPill(listing) {
  if (listing.status === 'sold') return `<span class="status-pill" style="background:#E6F1EC;color:#1E7A46;">مباع</span>`;
  if (listing.status === 'hidden') return `<span class="status-pill" style="background:#FBE7E3;color:#B23A2E;">مخفي (بلاغات)</span>`;
  if (listing.status === 'expired') return `<span class="status-pill" style="background:#F1E7D8;color:#8a6d1f;">منتهي</span>`;
  const left = daysLeft(listing.expires_at);
  if (left !== null && left <= 5) return `<span class="status-pill" style="background:#FBF0D8;color:#8a6d1f;">نشط — ينتهي بعد ${left <= 0 ? 'يوم' : left + ' يوم'}</span>`;
  return `<span class="status-pill status-active">نشط</span>`;
}

function ratingStars(avg) {
  const full = avg ? Math.round(avg) : 0;
  let out = '';
  for (let i = 1; i <= 5; i++) {
    out += `<span style="color:${i <= full ? '#D9A62B' : '#D8CFC2'};">${icons.star}</span>`;
  }
  return out;
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

function homePage({ user, categories, featured, recent, baseUrl }) {
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
  return page({ title: 'الرئيسية', user, body, og: { url: baseUrl } });
}

function categoryPage({ user, category, listings, cities, selectedCity, savedAlready, priceMin = '', priceMax = '', page: pageNum = 1, totalPages = 1, total = 0, baseUrl }) {
  const cityRows = ['الكل', ...cities].map((c) => {
    const active = c === (selectedCity || 'الكل');
    const href = c === 'الكل' ? `/category/${category.slug}` : `/category/${category.slug}?city=${encodeURIComponent(c)}`;
    return `<a href="${href}" class="city-row${active ? ' active' : ''}"><span class="dot" style="background:${active ? 'var(--primary)' : 'transparent'}"></span><span>${esc(c)}</span></a>`;
  }).join('');

  const priceForm = `
      <form method="get" action="/category/${category.slug}" style="display:flex;gap:8px;">
        ${selectedCity && selectedCity !== 'الكل' ? `<input type="hidden" name="city" value="${esc(selectedCity)}">` : ''}
        <input type="text" inputmode="numeric" name="price_min" value="${esc(priceMin)}" placeholder="من">
        <input type="text" inputmode="numeric" name="price_max" value="${esc(priceMax)}" placeholder="إلى">
        <button type="submit" class="btn-mini" style="flex-shrink:0;">تطبيق</button>
      </form>`;

  function pageHref(p) {
    const params = new URLSearchParams();
    if (selectedCity && selectedCity !== 'الكل') params.set('city', selectedCity);
    if (priceMin) params.set('price_min', priceMin);
    if (priceMax) params.set('price_max', priceMax);
    if (p > 1) params.set('page', p);
    const qs = params.toString();
    return `/category/${category.slug}${qs ? '?' + qs : ''}`;
  }

  const pagination = totalPages > 1 ? `
    <div style="display:flex;justify-content:center;align-items:center;gap:10px;margin-top:8px;">
      ${pageNum > 1 ? `<a href="${pageHref(pageNum - 1)}" class="btn-mini">${icons.chevRight} السابق</a>` : ''}
      <span style="font-size:12.5px;color:var(--text-2);">صفحة ${pageNum} من ${totalPages}</span>
      ${pageNum < totalPages ? `<a href="${pageHref(pageNum + 1)}" class="btn-mini">التالي ${icons.chevLeft}</a>` : ''}
    </div>` : '';

  const saveSearchBox = user ? `
      <div class="divider"></div>
      <form method="post" action="/saved-searches">
        <input type="hidden" name="category_id" value="${category.id}">
        <input type="hidden" name="category_slug" value="${esc(category.slug)}">
        <input type="hidden" name="city" value="${selectedCity && selectedCity !== 'الكل' ? esc(selectedCity) : ''}">
        <button type="submit" class="btn-outline" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;font-size:12.5px;height:40px;" ${savedAlready ? 'disabled' : ''}>
          ${icons.bookmark} ${savedAlready ? 'تم حفظ هذا البحث' : 'حفظ هذا البحث وتنبيهي بالجديد'}
        </button>
      </form>` : '';

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
        ${priceForm}
      </div>
      ${saveSearchBox}
    </div>
    <div class="results">
      <div class="results-head">
        <span>عرض ${listings.length} من ${total} إعلان في «${esc(category.name)}${selectedCity && selectedCity !== 'الكل' ? ' - ' + esc(selectedCity) : ''}»</span>
      </div>
      <div class="listing-grid cols-3">
        ${listings.length ? listings.map((l) => listingCard(l)).join('') : ''}
      </div>
      ${listings.length ? '' : emptyState('emptyBox', 'لا توجد إعلانات مطابقة حاليًا في هذه الفئة/المدينة.', user ? '' : `<a href="/post-ad" class="btn-primary" style="margin-top:4px;">كن أول من ينشر إعلانًا هنا</a>`)}
      ${pagination}
    </div>
  </div>
  ${footer()}
  `;
  return page({ title: category.name, user, body, og: { title: `${category.name} — صفقة`, url: baseUrl ? baseUrl + '/category/' + category.slug : undefined } });
}

function searchPage({ user, q, listings, total, page: pageNum = 1, totalPages = 1 }) {
  function pageHref(p) {
    const params = new URLSearchParams({ q });
    if (p > 1) params.set('page', p);
    return `/search?${params.toString()}`;
  }
  const pagination = totalPages > 1 ? `
    <div style="display:flex;justify-content:center;align-items:center;gap:10px;margin-top:8px;">
      ${pageNum > 1 ? `<a href="${pageHref(pageNum - 1)}" class="btn-mini">${icons.chevRight} السابق</a>` : ''}
      <span style="font-size:12.5px;color:var(--text-2);">صفحة ${pageNum} من ${totalPages}</span>
      ${pageNum < totalPages ? `<a href="${pageHref(pageNum + 1)}" class="btn-mini">التالي ${icons.chevLeft}</a>` : ''}
    </div>` : '';

  const body = `
  ${header(user)}
  <div class="breadcrumb"><a href="/">الرئيسية</a><span>/</span><span class="current">نتائج البحث</span></div>
  <div class="section container">
    ${q ? `<h2 style="margin:0;">نتائج البحث عن «${esc(q)}» (${total})</h2>` : `<h2 style="margin:0;">ابحث في صفقة</h2>`}
    <div class="listing-grid cols-3">
      ${listings.length ? listings.map((l) => listingCard(l)).join('') : ''}
    </div>
    ${listings.length ? '' : emptyState('emptyBox', q ? `لا توجد نتائج مطابقة لـ «${esc(q)}».` : 'اكتب كلمة في مربع البحث أعلاه للبدء.')}
    ${pagination}
  </div>
  ${footer()}
  `;
  return page({ title: q ? `بحث: ${q}` : 'بحث', user, body });
}

function forgotPasswordPage({ user, submitted }) {
  const body = `
  <div class="auth-wrap">
    <div class="auth-card">
      <a href="/" class="auth-logo">
        ${qamariyaMark(46)}
        <span class="logo-text" style="font-size:22px;">صفقة</span>
      </a>
      <div class="auth-title"><h1>نسيت كلمة المرور</h1><p>أدخل رقم جوالك أو بريدك الإلكتروني المسجّل</p></div>
      ${submitted ? `
      <div class="warn-box" style="background:#E6F1EC;border-color:#1A73E8;color:#124C8A;">
        ${icons.info}
        <p style="margin:0;">إذا كان هذا الحساب مسجّلاً لدينا، فريق الدعم سيتواصل معك قريبًا لإعادة تعيين كلمة المرور. تواصل معنا الآن مباشرة عبر <a href="/contact" style="color:var(--accent);font-weight:700;">صفحة اتصل بنا</a> لتسريع الأمر.</p>
      </div>
      <div class="muted-center"><a href="/login">العودة لتسجيل الدخول</a></div>` : `
      <form method="post" action="/forgot-password">
        <div class="field">
          <label>رقم الجوال أو البريد الإلكتروني</label>
          <input type="text" name="identifier" placeholder="7XXXXXXXX أو example@email.com" required>
        </div>
        <button type="submit" class="btn-primary" style="width:100%;margin-top:16px;">إرسال طلب الاستعادة</button>
      </form>
      <p class="muted-center" style="margin:2px 0;">ملاحظة: الموقع لا يرسل رسائل تلقائية حاليًا؛ سيتم التواصل معك يدويًا من إدارة الموقع للتحقق من هويتك وإعادة تعيين كلمة المرور.</p>
      <div class="muted-center"><a href="/login">العودة لتسجيل الدخول</a></div>`}
    </div>
  </div>
  `;
  return page({ title: 'نسيت كلمة المرور', user, body });
}

function listingPage({ user, listing, images, owner, highestBid, myBid, isFavorited, bidError, fieldSchema = [], baseUrl, ratingSummary = { count: 0, avg: null }, ratings = [], myRating = null, canRate = false, similar = [], reportSent = null }) {
  const mainImg = images[0] ? `<img src="${esc(images[0])}" alt="" data-idx="0" class="lightbox-trigger">` : 'الصورة الرئيسية للإعلان';
  const thumbs = images.slice(1, 5).map((f, i) => `<div class="thumb-sm"><img src="${esc(f)}" alt="" data-idx="${i + 1}" class="lightbox-trigger"></div>`).join('');

  const specEntries = fieldSchema
    .map((f) => ({ label: f.label, value: listing.extra && listing.extra[f.key] }))
    .filter((e) => e.value);
  const specsGrid = specEntries.length ? `
      <div class="card">
        <span style="font-size:15px;font-weight:800;">المواصفات</span>
        <div class="specs-grid">
          ${specEntries.map((e) => `<div><div class="k">${esc(e.label)}</div><div class="v">${esc(e.value)}</div></div>`).join('')}
        </div>
      </div>` : '';
  const canBid = user && !owner && (user.role === 'buyer' || user.role === 'both' || !user.role);
  const bidSection = user
    ? (owner
        ? ''
        : canBid
          ? `
      <div class="card" style="gap:12px;">
        <span style="font-size:15px;font-weight:800;">قدّم سومة (مزايدة)</span>
        ${highestBid ? `<span style="font-size:12.5px;color:var(--text-2);">أعلى سومة حاليًا: ${Number(highestBid).toLocaleString('ar')} ر.ي</span>` : `<span style="font-size:12.5px;color:var(--text-2);">لا توجد سومات بعد — كن أول من يسوم</span>`}
        ${myBid ? `<span style="font-size:12.5px;color:var(--accent);font-weight:700;">سومتك الحالية: ${Number(myBid.amount).toLocaleString('ar')} ر.ي (${myBid.status === 'pending' ? 'قيد الانتظار' : myBid.status === 'accepted' ? 'مقبولة' : 'مرفوضة'})</span>` : ''}
        ${bidError ? `<div class="error-box">${esc(bidError)}</div>` : ''}
        <form method="post" action="/listing/${listing.id}/bid" style="display:flex;gap:8px;">
          <input type="number" name="amount" min="1" step="1" placeholder="قيمة السومة (ر.ي)" required style="flex-grow:1;border:1px solid var(--border);border-radius:10px;padding:0 14px;height:44px;background:var(--bg);">
          <button type="submit" class="btn-primary">قدّم السومة</button>
        </form>
      </div>`
          : '')
    : `<div class="card" style="gap:8px;"><span style="font-size:13px;color:var(--text-2);">سجّل الدخول لتقديم سومة على هذا الإعلان.</span><a href="/login" class="btn-outline" style="align-self:flex-start;">تسجيل الدخول</a></div>`;

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
          ${user ? `
          <form method="post" action="/favorites/${listing.id}/toggle" style="margin:0;">
            <button type="submit" aria-label="حفظ في المفضلة" style="background:${isFavorited ? 'var(--price)' : 'var(--chip)'};border:none;border-radius:10px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${isFavorited ? '#fff' : 'var(--primary)'};flex-shrink:0;">${icons.heart}</button>
          </form>` : `
          <a href="/login" aria-label="حفظ في المفضلة" style="background:var(--chip);border:none;border-radius:10px;width:42px;height:42px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--primary);flex-shrink:0;">${icons.heart}</a>`}
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
      ${specsGrid}
      <div class="card" id="reviews">
        <span style="font-size:15px;font-weight:800;">التقييمات (${ratingSummary.count})</span>
        ${ratingSummary.count ? `<div style="display:flex;align-items:center;gap:8px;">${ratingStars(ratingSummary.avg)} <span style="font-weight:800;font-size:16px;">${ratingSummary.avg}</span> <span style="color:var(--text-2);font-size:12.5px;">من ${ratingSummary.count} تقييم</span></div>` : ''}
        ${ratings.length ? `<div style="display:flex;flex-direction:column;gap:12px;margin-top:4px;">
          ${ratings.map((r) => `
            <div style="border-top:1px solid var(--border);padding-top:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:13.5px;">${esc(r.rater_name)}</span>
                <span>${ratingStars(r.rating)}</span>
              </div>
              ${r.comment ? `<p style="margin:4px 0 0;font-size:13px;color:var(--text-2);">${esc(r.comment)}</p>` : ''}
            </div>`).join('')}
        </div>` : `<p style="font-size:13px;color:var(--text-2);margin:8px 0 0;">لا توجد تقييمات لهذا البائع بعد.</p>`}
        ${canRate ? `
        <form method="post" action="/listing/${listing.id}/rate" style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;gap:8px;">
          <label style="font-size:13px;font-weight:700;">قيّم تعاملك مع هذا البائع</label>
          <select name="rating" style="height:40px;border:1px solid var(--border);border-radius:10px;padding:0 10px;background:var(--bg);">
            <option value="5">★★★★★ ممتاز</option>
            <option value="4">★★★★ جيد جدًا</option>
            <option value="3">★★★ جيد</option>
            <option value="2">★★ مقبول</option>
            <option value="1">★ ضعيف</option>
          </select>
          <textarea name="comment" rows="2" placeholder="تعليق (اختياري)" style="border:1px solid var(--border);border-radius:10px;padding:8px 10px;background:var(--bg);resize:vertical;"></textarea>
          <button type="submit" class="btn-primary">إرسال التقييم</button>
        </form>` : myRating ? `<p style="font-size:12.5px;color:var(--text-2);margin-top:8px;">لقد قيّمت هذا البائع بالفعل (${myRating.rating} نجوم) بخصوص هذا الإعلان.</p>` : !user ? `<p style="font-size:12.5px;color:var(--text-2);margin-top:8px;"><a href="/login" style="color:var(--accent);font-weight:700;">سجّل الدخول</a> لتقييم هذا البائع.</p>` : ''}
      </div>
    </div>
    <div class="listing-sidebar">
      <div class="card">
        <div class="seller-row">
          <div class="avatar">${esc((listing.seller_name || '؟').slice(0, 2))}</div>
          <div>
            <a href="/seller/${listing.user_id}" class="seller-name" style="text-decoration:none;">${esc(listing.seller_name)}</a>
            <div class="seller-sub">${esc(listing.seller_city || '')} · عضو منذ ${esc((listing.seller_since || '').slice(0, 4))}</div>
            ${ratingSummary.count ? `<div class="seller-sub" style="margin-top:4px;">${ratingStars(ratingSummary.avg)} <span style="font-weight:700;">${ratingSummary.avg}</span> (${ratingSummary.count} تقييم)</div>` : `<div class="seller-sub" style="margin-top:4px;color:var(--text-2);">لا توجد تقييمات بعد</div>`}
          </div>
        </div>
        <button id="revealBtn" class="btn-reveal" style="background:var(--primary);">${icons.callPhone}<span id="revealLabel">إظهار رقم الجوال</span></button>
        <a href="https://wa.me/967${esc(listing.phone.replace(/^0+/, '').replace(/\s+/g, ''))}?text=${encodeURIComponent('السلام عليكم، أنا مهتم بإعلانك "' + listing.title + '" في صفقة')}" target="_blank" class="btn-msg" style="background:#25D366;color:#fff;border-color:#25D366;">${icons.whatsapp} تواصل عبر واتساب</a>
        ${!owner ? (user ? `
        <form method="post" action="/listing/${listing.id}/message" style="display:flex;gap:8px;">
          <input type="text" name="body" placeholder="اكتب رسالة للبائع داخل صفقة..." maxlength="2000" required style="flex-grow:1;border:1px solid var(--border);border-radius:10px;padding:0 12px;height:42px;background:var(--bg);font-size:13px;">
          <button type="submit" class="btn-outline" style="flex-shrink:0;">${icons.message} إرسال</button>
        </form>` : `<a href="/login" class="btn-outline" style="text-align:center;">${icons.message} سجّل الدخول لمراسلة البائع</a>`) : ''}
        <div class="share-row">
          <span class="share-label">مشاركة الإعلان:</span>
          <button type="button" id="copyLinkBtn" class="share-btn" title="نسخ الرابط">${icons.link}</button>
          <a class="share-btn" target="_blank" title="مشاركة عبر X" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(listing.title)}&url=__PAGE_URL__">${icons.shareIco}</a>
        </div>
      </div>
      ${bidSection}
      <div class="warn-box">${icons.info}<p style="margin:0;">لا تدفع أي مبلغ مقدمًا قبل معاينة السلعة، وتجنّب التحويل البنكي لأشخاص غير موثوقين. تعامل داخل موقع صفقة فقط.</p></div>
      ${!owner ? `
      <div class="card" style="gap:10px;">
        <button type="button" id="reportToggleBtn" class="btn-outline" style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;color:#B23A2E;border-color:#F0C9C2;">${icons.flag} بلاغ عن هذا الإعلان</button>
        <div id="reportFormBox" style="display:none;">
          ${reportSent ? `<div class="warn-box" style="background:#E6F1EC;border-color:#1A73E8;color:#124C8A;">${icons.info}<p style="margin:0;">تم استلام بلاغك، شكرًا لمساعدتك في الحفاظ على جودة الموقع.</p></div>` : `
          <form method="post" action="/listing/${listing.id}/report" style="gap:10px;display:flex;flex-direction:column;">
            <select name="reason" required style="height:40px;border:1px solid var(--border);border-radius:10px;padding:0 10px;background:var(--bg);">
              ${Object.entries(REPORT_REASONS_CLIENT).map(([k, label]) => `<option value="${esc(k)}">${esc(label)}</option>`).join('')}
            </select>
            <textarea name="details" rows="2" placeholder="تفاصيل إضافية (اختياري)" style="border:1px solid var(--border);border-radius:10px;padding:8px 10px;background:var(--bg);resize:vertical;"></textarea>
            <button type="submit" class="btn-outline" style="width:100%;color:#B23A2E;">إرسال البلاغ</button>
          </form>`}
        </div>
      </div>` : ''}
      ${owner && listing.status === 'active' ? `
      <form method="post" action="/listing/${listing.id}/mark-sold" onsubmit="var p = prompt('أدخل السعر الفعلي الذي تم البيع به (ر.ي) — سيُحسب منه 1% كعمولة للموقع:'); if (!p || isNaN(parseFloat(p.replace(/,/g,'')))) { return false; } this.sold_price.value = p.replace(/,/g,''); return true;">
        <input type="hidden" name="sold_price">
        <button type="submit" class="btn-primary" style="width:100%;background:#1E7A46;border-color:#1E7A46;">تحديد الإعلان كمباع</button>
      </form>` : ''}
      ${owner ? `
      <div style="display:flex;gap:10px;">
        <a href="/listing/${listing.id}/edit" class="btn-outline" style="flex-grow:1;text-align:center;">تعديل الإعلان</a>
        <form method="post" action="/listing/${listing.id}/delete" onsubmit="return confirm('هل تريد حذف هذا الإعلان؟');" style="flex-grow:1;"><button class="btn-outline" style="width:100%;color:#B23A2E;">حذف الإعلان</button></form>
      </div>` : ''}
    </div>
  </div>

  ${similar.length ? `
  <div class="section container">
    <h2>إعلانات مشابهة</h2>
    <div class="listing-grid cols-3">${similar.map((l) => listingCard(l)).join('')}</div>
  </div>` : ''}

  <div class="lightbox-overlay" id="lightboxOverlay">
    <button type="button" id="lightboxClose" class="lightbox-btn lightbox-close">${icons.close}</button>
    <button type="button" id="lightboxPrev" class="lightbox-btn lightbox-prev">${icons.chevRight}</button>
    <img id="lightboxImg" src="" alt="">
    <button type="button" id="lightboxNext" class="lightbox-btn lightbox-next">${icons.chevLeft}</button>
  </div>

  <script>
    document.getElementById('revealBtn').addEventListener('click', function () {
      document.getElementById('revealLabel').textContent = '${esc(listing.phone)}';
      this.style.background = 'var(--accent)';
    });

    (function () {
      var btn = document.getElementById('reportToggleBtn');
      var box = document.getElementById('reportFormBox');
      if (!btn || !box) return;
      if (${reportSent ? 'true' : 'false'}) box.style.display = 'block';
      btn.addEventListener('click', function () {
        box.style.display = box.style.display === 'none' ? 'block' : 'none';
      });
    })();

    (function () {
      var copyBtn = document.getElementById('copyLinkBtn');
      var twitterLink = document.querySelector('.share-row a.share-btn');
      var pageUrl = window.location.href;
      if (twitterLink) twitterLink.href = twitterLink.href.replace('__PAGE_URL__', encodeURIComponent(pageUrl));
      if (copyBtn) {
        copyBtn.addEventListener('click', function () {
          navigator.clipboard.writeText(pageUrl).then(function () {
            var original = copyBtn.innerHTML;
            copyBtn.innerHTML = '✓';
            setTimeout(function () { copyBtn.innerHTML = original; }, 1500);
          }).catch(function () {});
        });
      }
    })();

    (function () {
      var images = ${JSON.stringify(images)};
      if (!images.length) return;
      var overlay = document.getElementById('lightboxOverlay');
      var imgEl = document.getElementById('lightboxImg');
      var idx = 0;
      function show(i) {
        idx = (i + images.length) % images.length;
        imgEl.src = images[idx];
      }
      document.querySelectorAll('.lightbox-trigger').forEach(function (el) {
        el.style.cursor = 'zoom-in';
        el.addEventListener('click', function () {
          show(parseInt(el.getAttribute('data-idx'), 10) || 0);
          overlay.classList.add('open');
        });
      });
      document.getElementById('lightboxClose').addEventListener('click', function () { overlay.classList.remove('open'); });
      document.getElementById('lightboxPrev').addEventListener('click', function () { show(idx - 1); });
      document.getElementById('lightboxNext').addEventListener('click', function () { show(idx + 1); });
      overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.classList.remove('open'); });
      document.addEventListener('keydown', function (e) {
        if (!overlay.classList.contains('open')) return;
        if (e.key === 'Escape') overlay.classList.remove('open');
        if (e.key === 'ArrowLeft') show(idx + 1);
        if (e.key === 'ArrowRight') show(idx - 1);
      });
    })();
  </script>
  ${footer()}
  `;
  const ogImage = baseUrl && images[0] ? baseUrl + images[0] : undefined;
  const ogDescription = (listing.description || '').slice(0, 150) || `${listing.price} · ${listing.city} — على صفقة`;
  return page({
    title: listing.title, user, body,
    og: { title: `${listing.title} — ${listing.price}`, description: ogDescription, image: ogImage, url: baseUrl ? baseUrl + '/listing/' + listing.id : undefined, type: 'product' },
  });
}

function sellerPage({ user, seller, listings, ratingSummary = { count: 0, avg: null }, ratings = [] }) {
  const body = `
  ${header(user)}
  <div class="breadcrumb"><a href="/">الرئيسية</a><span>/</span><span class="current">${esc(seller.name)}</span></div>
  <div class="container" style="padding-top:28px;padding-bottom:40px;display:flex;flex-direction:column;gap:20px;">
    <div class="card" style="flex-direction:row;align-items:center;gap:16px;">
      <div class="avatar" style="width:64px;height:64px;font-size:22px;flex-shrink:0;">${esc((seller.name || '؟').slice(0, 2))}</div>
      <div>
        <div style="font-size:18px;font-weight:800;">${esc(seller.name)}</div>
        <div style="font-size:13px;color:var(--text-2);">${esc(seller.city || '')} · عضو منذ ${esc((seller.created_at || '').slice(0, 4))}</div>
        <div style="margin-top:6px;">
          ${ratingSummary.count ? `${ratingStars(ratingSummary.avg)} <span style="font-weight:800;">${ratingSummary.avg}</span> <span style="color:var(--text-2);font-size:12.5px;">(${ratingSummary.count} تقييم)</span>` : `<span style="color:var(--text-2);font-size:12.5px;">لا توجد تقييمات بعد</span>`}
        </div>
      </div>
    </div>
    <div>
      <h2 style="margin:0 0 12px;">إعلانات ${esc(seller.name)} (${listings.length})</h2>
      <div class="listing-grid cols-3">
        ${listings.length ? listings.map((l) => listingCard(l)).join('') : ''}
      </div>
      ${listings.length ? '' : emptyState('emptyBox', 'لا توجد إعلانات نشطة لهذا البائع حاليًا.')}
    </div>
    ${ratings.length ? `
    <div class="card">
      <span style="font-size:15px;font-weight:800;">آخر التقييمات</span>
      <div style="display:flex;flex-direction:column;gap:12px;margin-top:8px;">
        ${ratings.map((r) => `
          <div style="border-top:1px solid var(--border);padding-top:10px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:700;font-size:13.5px;">${esc(r.rater_name)}</span>
              <span>${ratingStars(r.rating)}</span>
            </div>
            <div style="font-size:11.5px;color:var(--text-2);">عن إعلان: ${esc(r.listing_title)}</div>
            ${r.comment ? `<p style="margin:4px 0 0;font-size:13px;color:var(--text-2);">${esc(r.comment)}</p>` : ''}
          </div>`).join('')}
      </div>
    </div>` : ''}
  </div>
  ${footer()}
  `;
  return page({ title: seller.name, user, body });
}

function messagesPage({ user, conversations }) {
  const rows = conversations.length ? conversations.map((c) => `
    <a href="/messages/${c.id}" class="ad-row" style="text-decoration:none;color:inherit;">
      <div class="avatar" style="flex-shrink:0;">${esc((c.other_name || '؟').slice(0, 2))}</div>
      <div class="info" style="flex-grow:1;">
        <span style="font-weight:700;">${esc(c.other_name)}${c.unread ? ` <span style="background:#B23A2E;color:#fff;font-size:10px;padding:1px 7px;border-radius:20px;font-weight:700;">${c.unread}</span>` : ''}</span>
        <span class="sub">${esc(c.listing_title)}${c.last_body ? ' — ' + esc(c.last_body.slice(0, 60)) : ''}</span>
      </div>
      <span class="views">${esc((c.last_at || '').slice(0, 16))}</span>
    </a>`).join('') : emptyState('emptyBox', 'لا توجد محادثات بعد. راسل بائعًا من صفحة أي إعلان يعجبك.');

  const body = `
  ${header(user)}
  <div class="zigzag" style="height:8px;"></div>
  <div class="dash-layout container">
    <div class="dash-side">
      ${profileCard(user)}
      ${dashNav('messages', user.unreadMessages)}
    </div>
    <div style="flex-grow:1;display:flex;flex-direction:column;gap:20px;">
      <h1 style="margin:0;font-size:20px;font-weight:800;">الرسائل</h1>
      <div class="my-ads">${rows}</div>
    </div>
  </div>
  ${footer()}
  `;
  return page({ title: 'الرسائل', user, body });
}

function conversationPage({ user, convo, messages, otherName }) {
  const bubbles = messages.map((m) => {
    const mine = m.sender_id === user.id;
    return `<div style="display:flex;justify-content:${mine ? 'flex-start' : 'flex-end'};">
      <div style="max-width:70%;background:${mine ? 'var(--primary)' : 'var(--chip)'};color:${mine ? '#fff' : 'var(--text)'};padding:10px 14px;border-radius:14px;${mine ? 'border-bottom-left-radius:4px;' : 'border-bottom-right-radius:4px;'}">
        <p style="margin:0;font-size:13.5px;white-space:pre-wrap;">${esc(m.body)}</p>
        <span style="display:block;margin-top:4px;font-size:10.5px;opacity:0.7;">${esc((m.created_at || '').slice(0, 16))}</span>
      </div>
    </div>`;
  }).join('');

  const body = `
  ${header(user)}
  <div class="breadcrumb"><a href="/messages">الرسائل</a><span>/</span><span class="current">${esc(otherName)}</span></div>
  <div class="container" style="max-width:720px;padding-top:20px;padding-bottom:40px;display:flex;flex-direction:column;gap:16px;">
    <div class="card" style="flex-direction:row;align-items:center;justify-content:space-between;">
      <div>
        <div style="font-weight:800;font-size:15px;">${esc(otherName)}</div>
        <a href="/listing/${convo.listing_id}" style="font-size:12.5px;color:var(--text-2);">بخصوص: ${esc(convo.listing_title)}</a>
      </div>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">${bubbles || `<p style="text-align:center;color:var(--text-2);font-size:13px;">لا توجد رسائل بعد.</p>`}</div>
    <form method="post" action="/messages/${convo.id}" style="display:flex;gap:8px;">
      <input type="text" name="body" placeholder="اكتب ردك..." maxlength="2000" required style="flex-grow:1;border:1px solid var(--border);border-radius:10px;padding:0 14px;height:46px;background:var(--bg);">
      <button type="submit" class="btn-primary">إرسال</button>
    </form>
  </div>
  ${footer()}
  `;
  return page({ title: otherName, user, body });
}

function loginPage({ user, error }) {
  const body = `
  <div class="auth-wrap">
    <div class="auth-card">
      <a href="/" class="auth-logo">
        ${qamariyaMark(46)}
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
      <div class="muted-center" style="margin-top:-6px;"><a href="/forgot-password">نسيت كلمة المرور؟</a></div>
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
        ${qamariyaMark(40)}
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
          <input type="text" name="name" placeholder="مثال: نصر محمد" required>
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
          <input type="checkbox" name="terms_agree" required style="margin-top:2px;">
          <span>أوافق على <a href="/terms" target="_blank" style="color:var(--accent);font-weight:700;">شروط الاستخدام</a> و<a href="/privacy" target="_blank" style="color:var(--accent);font-weight:700;">سياسة الخصوصية</a> الخاصة بصفقة</span>
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

function postAdPage({ user, categories, cities, categoryFields = {}, error, editing = null, images = [] }) {
  const catOptions = categories.map((c) => `<option value="${c.id}" data-slug="${esc(c.slug)}"${editing && editing.category_id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('');
  const cityOptions = cities.map((c) => `<option${editing && editing.city === c ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const extra = editing ? (editing.extra || {}) : {};

  const extraBlocks = categories.map((c) => {
    const schema = categoryFields[c.slug] || [];
    if (!schema.length) return '';
    const fields = schema.map((f) => {
      if (f.type === 'select') {
        const opts = f.options.map((o) => `<option value="${esc(o)}"${extra[f.key] === o ? ' selected' : ''}>${esc(o)}</option>`).join('');
        return `<div class="field"><label>${esc(f.label)}</label><select name="f_${f.key}"><option value="">—</option>${opts}</select></div>`;
      }
      return `<div class="field"><label>${esc(f.label)}</label><input type="${f.type === 'number' ? 'number' : 'text'}" name="f_${f.key}" placeholder="${esc(f.placeholder || '')}" value="${esc(extra[f.key] || '')}"></div>`;
    }).join('');
    return `<div class="extra-fields-block" data-cat-slug="${esc(c.slug)}" style="display:none;">
      <div class="divider" style="margin:4px 0 14px;"></div>
      <span style="font-size:13px;font-weight:800;display:block;margin-bottom:4px;">تفاصيل إضافية خاصة بـ ${esc(c.name)}</span>
      <div class="extra-grid">${fields}</div>
    </div>`;
  }).join('');

  const existingImages = images.length ? `
      <div class="field">
        <label>الصور الحالية</label>
        <div class="img-previews">${images.map((src) => `<div class="prev"><img src="${esc(src)}"></div>`).join('')}</div>
        <span class="hint">أي صور جديدة تختارها أدناه تُضاف لهذه الصور ولا تحذفها.</span>
      </div>` : '';

  const body = `
  ${header(user)}
  <div class="zigzag" style="height:8px;"></div>
  <div class="postad-wrap">
    <div>
      <h1 style="margin:0 0 4px;font-size:22px;font-weight:800;">${editing ? 'تعديل الإعلان' : 'إضافة إعلان جديد'}</h1>
      <p style="margin:0;font-size:13px;color:var(--text-2);">${editing ? 'حدّث بيانات إعلانك وحفظ التعديلات' : 'أدخل بيانات إعلانك بدقة ليصل لأكبر عدد من المهتمين'}</p>
    </div>
    ${error ? `<div class="error-box">${esc(error)}</div>` : ''}
    <form class="card" id="postAdForm" method="post" action="${editing ? `/listing/${editing.id}/edit` : '/post-ad'}" style="gap:18px;">
      <div class="field">
        <label>الفئة</label>
        <select name="category_id" id="categorySelect" required${editing ? ' disabled' : ''}>${catOptions}</select>
        ${editing ? `<span class="hint">لا يمكن تغيير فئة الإعلان بعد النشر — لإعلان من فئة مختلفة أضف إعلانًا جديدًا.</span>` : ''}
      </div>
      <div class="field">
        <label>عنوان الإعلان</label>
        <input type="text" name="title" placeholder="مثال: تويوتا كامري 2018 فل كامل" value="${esc(editing ? editing.title : '')}" required>
      </div>
      ${extraBlocks}
      <div class="field">
        <label>الوصف</label>
        <textarea name="description" placeholder="اكتب وصفًا واضحًا يشمل الحالة والمواصفات...">${esc(editing ? editing.description : '')}</textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div class="field"><label>السعر (ر.ي)</label><input type="text" name="price" id="priceInput" placeholder="0" value="${esc(editing ? editing.price : '')}"></div>
        <div class="field"><label>المحافظة</label><select name="city">${cityOptions}</select></div>
      </div>
      <div class="field">
        <label>رقم التواصل</label>
        <div class="phone-input"><span class="prefix">967+</span><input type="text" name="phone" placeholder="7XX XXX XXX" value="${esc(editing ? editing.phone : '')}" required></div>
      </div>
      ${existingImages}
      <div class="field">
        <label>${editing ? 'إضافة صور جديدة' : 'صور الإعلان'}</label>
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
      ${!editing ? `
      <div class="card" style="background:#FBF6EE;border:1.5px solid #D9A62B;gap:12px;">
        <span style="font-size:14px;font-weight:800;display:flex;align-items:center;gap:8px;">${icons.info} القسم والتعهد بعمولة الموقع</span>
        <p style="margin:0;font-size:13.5px;line-height:2;color:var(--text);">أقسم بالله العلي العظيم، وأتعهد أمام الله ثم إدارة الموقع، أن ألتزم بدفع عمولة الموقع البالغة (1%) من قيمة السعر الفعلي لبيع السلعة في حال تم بيعها عن طريق هذا الإعلان، وأن لا أتهرب أو أتحايل على دفعها، والله على ما أقول شهيد.</p>
        <div style="background:#fff;border:1px solid #EADFC8;border-radius:10px;padding:10px 14px;font-size:12.5px;color:var(--text-2);">
          مثال: إذا بعت السلعة بـ <strong id="commExamplePrice">1,000</strong> ريال، فعمولة الموقع هي <strong id="commExampleFee" style="color:var(--price);">10</strong> ريال فقط (1%).
        </div>
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13.5px;font-weight:700;">
          <input type="checkbox" name="commission_agree" id="commissionAgree" style="margin-top:3px;width:18px;height:18px;flex-shrink:0;">
          <span>أقسم بالله وأوافق على الشروط أعلاه، وأتعهد بدفع العمولة عند بيع السلعة عبر هذا الإعلان.</span>
        </label>
        <a href="/commission-payment" target="_blank" style="font-size:12px;color:var(--accent);font-weight:700;">كيف تُدفع العمولة؟ اطّلع على حسابات التحويل ←</a>
      </div>` : ''}
      <div style="display:flex;gap:12px;">
        <button type="submit" id="submitAdBtn" class="btn-primary" style="flex-grow:1;"${!editing ? ' disabled' : ''}>${editing ? 'حفظ التعديلات' : 'تأكيد القسم ونشر الإعلان'}</button>
        <a href="${editing ? `/listing/${editing.id}` : '/'}" class="btn-outline">إلغاء</a>
      </div>
    </form>
  </div>
  <script>
    (function () {
      var select = document.getElementById('categorySelect');
      var blocks = document.querySelectorAll('.extra-fields-block');
      function sync() {
        var slug = select.options[select.selectedIndex].getAttribute('data-slug');
        blocks.forEach(function (b) { b.style.display = b.getAttribute('data-cat-slug') === slug ? 'block' : 'none'; });
      }
      select.addEventListener('change', sync);
      sync();
    })();

    (function () {
      var checkbox = document.getElementById('commissionAgree');
      var submitBtn = document.getElementById('submitAdBtn');
      if (checkbox && submitBtn) {
        checkbox.addEventListener('change', function () {
          submitBtn.disabled = !checkbox.checked;
        });
      }
      var priceInput = document.getElementById('priceInput');
      var exPrice = document.getElementById('commExamplePrice');
      var exFee = document.getElementById('commExampleFee');
      if (priceInput && exPrice && exFee) {
        priceInput.addEventListener('input', function () {
          var digits = priceInput.value.replace(/[^\\d.]/g, '');
          var n = parseFloat(digits);
          if (!n || n <= 0) { exPrice.textContent = '1,000'; exFee.textContent = '10'; return; }
          exPrice.textContent = n.toLocaleString('ar');
          exFee.textContent = Math.round(n * 0.01 * 100) / 100;
        });
      }
    })();

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
  return page({ title: editing ? 'تعديل الإعلان' : 'إضافة إعلان', user, body });
}

function profileCard(user) {
  return `
  <div class="profile-card">
    <div class="avatar" style="width:60px;height:60px;font-size:20px;">${esc((user.name || '؟').slice(0, 2))}</div>
    <span style="font-size:15px;font-weight:800;">${esc(user.name)}</span>
    <span style="font-size:11.5px;color:var(--text-2);">${esc(user.city || '')} · عضو منذ ${esc((user.created_at || '').slice(0, 4))}</span>
  </div>`;
}

function dashNav(active, unreadMessages = 0) {
  const item = (href, icon, label, key) =>
    `<a href="${href}"${key === active ? ' class="active"' : ''}>${icon} ${label}</a>`;
  return `
  <div class="dash-nav">
    ${item('/dashboard', icons.grid, 'إعلاناتي', 'ads')}
    <a href="/messages"${active === 'messages' ? ' class="active"' : ''} style="display:flex;align-items:center;gap:10px;">${icons.message} الرسائل ${unreadMessages ? `<span style="margin-right:auto;font-size:10px;background:#B23A2E;color:#fff;padding:2px 8px;border-radius:20px;font-weight:700;">${unreadMessages}</span>` : ''}</a>
    ${item('/settings', icons.settings, 'الإعدادات', 'settings')}
    <form method="post" action="/logout" style="margin:0;"><button class="danger">${icons.logout} تسجيل الخروج</button></form>
  </div>`;
}

function bidStatusPill(status) {
  const map = {
    pending: { label: 'قيد الانتظار', cls: 'status-active', style: '' },
    accepted: { label: 'مقبولة', cls: '', style: 'background:#E6F1EC;color:#1E7A46;' },
    rejected: { label: 'مرفوضة', cls: '', style: 'background:#FBE7E3;color:#B23A2E;' },
  };
  const s = map[status] || map.pending;
  return `<span class="status-pill ${s.cls}" style="${s.style}">${s.label}</span>`;
}

function settingsPage({ user, error, success, cities, sellerListings = [], receivedBids = [], favorites = [], myBids = [], savedSearches = [] }) {
  const cityOptions = cities.map((c) => `<option${c === user.city ? ' selected' : ''}>${esc(c)}</option>`).join('');
  const role = user.role || 'both';
  const showSeller = role === 'seller' || role === 'both';
  const showBuyer = role === 'buyer' || role === 'both';

  const verifyBadge = user.id_verified
    ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:#1E7A46;background:#E6F1EC;padding:4px 10px;border-radius:20px;">${icons.info} حساب موثّق</span>`
    : user.id_document
      ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:#8a6d1f;background:#FBF1DA;padding:4px 10px;border-radius:20px;">${icons.info} التوثيق قيد المراجعة</span>`
      : `<span style="display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-2);background:var(--chip);padding:4px 10px;border-radius:20px;">${icons.info} غير موثّق</span>`;

  const generalPanel = `
  <div data-panel="general" style="display:flex;flex-direction:column;gap:20px;">
    <form method="post" action="/settings" class="card" style="gap:16px;">
      <span style="font-size:15px;font-weight:800;">تعديل البيانات الشخصية</span>
      <div class="field"><label>الاسم الكامل</label><input type="text" name="name" value="${esc(user.name)}" required></div>
      <div class="field"><label>رقم الجوال</label>
        <div class="phone-input"><span class="prefix">967+</span><input type="text" name="phone" value="${esc(user.phone || '')}" placeholder="7XX XXX XXX"></div>
      </div>
      <div class="field"><label>البريد الإلكتروني</label><input type="text" name="email" value="${esc(user.email || '')}" placeholder="example@email.com"></div>
      <div class="field"><label>المحافظة (الموقع الافتراضي)</label><select name="city">${cityOptions}</select></div>
      <label style="display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:700;">
        <input type="checkbox" name="prioritize_city" value="1" ${user.prioritize_city ? 'checked' : ''}>
        إظهار السلع القريبة من محافظتي أولاً في الرئيسية
      </label>
      <div class="field">
        <label>نوع الحساب</label>
        <select name="role">
          <option value="both" ${role === 'both' ? 'selected' : ''}>بائع ومشتري (كلاهما)</option>
          <option value="seller" ${role === 'seller' ? 'selected' : ''}>بائع فقط</option>
          <option value="buyer" ${role === 'buyer' ? 'selected' : ''}>مشتري فقط</option>
        </select>
      </div>
      <button type="submit" class="btn-primary" style="align-self:flex-start;">حفظ التغييرات</button>
    </form>

    <div class="card" style="gap:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="font-size:15px;font-weight:800;">توثيق الهوية</span>
        ${verifyBadge}
      </div>
      <p style="margin:0;font-size:12.5px;color:var(--text-2);">ارفع صورة واضحة لبطاقتك الشخصية أو جواز السفر لزيادة الثقة ومنع الحسابات الوهمية. تتم مراجعة الصورة يدويًا من إدارة الموقع.</p>
      <form method="post" action="/settings/verify" id="verifyForm">
        <div class="drop-zone" id="verifyDropZone">
          ${icons.upload}
          <span style="font-size:13.5px;font-weight:700;">اضغط لاختيار صورة الهوية</span>
          <span class="hint">JPG أو PNG — أقل من 3 ميجابايت</span>
        </div>
        <input type="file" id="verifyInput" accept="image/*" style="display:none;">
        <div class="img-previews" id="verifyPreview" style="margin-top:10px;"></div>
        <input type="hidden" name="id_document_b64" id="verifyField">
        <button type="submit" class="btn-outline" style="margin-top:12px;">رفع الصورة</button>
      </form>
    </div>

    <form method="post" action="/settings/password" class="card" style="gap:16px;">
      <span style="font-size:15px;font-weight:800;">تغيير كلمة المرور</span>
      <div class="field"><label>كلمة المرور الحالية</label><input type="password" name="current_password" required></div>
      <div class="field"><label>كلمة المرور الجديدة</label><input type="password" name="new_password" minlength="6" required></div>
      <button type="submit" class="btn-outline" style="align-self:flex-start;">تحديث كلمة المرور</button>
    </form>
  </div>
  <script>
    (function () {
      var dropZone = document.getElementById('verifyDropZone');
      var input = document.getElementById('verifyInput');
      var preview = document.getElementById('verifyPreview');
      var field = document.getElementById('verifyField');
      dropZone.addEventListener('click', function () { input.click(); });
      input.addEventListener('change', function () {
        var file = input.files[0];
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) { alert('حجم الصورة كبير جدًا'); return; }
        var reader = new FileReader();
        reader.onload = function () {
          field.value = reader.result;
          preview.innerHTML = '<div class="prev"><img src="' + reader.result + '"></div>';
        };
        reader.readAsDataURL(file);
      });
    })();
  </script>`;

  const sellerRows = sellerListings.length ? sellerListings.map((l) => `
    <div class="ad-row">
      <div class="thumb">${l.thumb ? `<img src="${esc(l.thumb)}">` : ''}</div>
      <div class="info">
        <a href="/listing/${l.id}">${esc(l.title)}</a>
        <span class="sub">${esc(l.price)} · ${esc(l.city)}</span>
      </div>
      <span class="status-pill status-active">${l.status === 'active' ? 'نشط' : esc(l.status)}</span>
      <span class="views">${l.views} مشاهدة</span>
      <form method="post" action="/listing/${l.id}/delete" onsubmit="return confirm('هل تريد حذف هذا الإعلان؟');">
        <button class="btn-mini danger">حذف</button>
      </form>
    </div>`).join('') : emptyState('emptyBox', 'لا توجد إعلانات بعد.', `<a href="/post-ad" class="btn-primary">أضف إعلانك الأول</a>`);

  const bidRows = receivedBids.length ? receivedBids.map((b) => `
    <div class="ad-row">
      <div class="info">
        <a href="/listing/${b.listing_id}">${esc(b.listing_title)}</a>
        <span class="sub">سومة من ${esc(b.buyer_name)} (${esc(b.buyer_phone || '')}) — ${Number(b.amount).toLocaleString('ar')} ر.ي</span>
      </div>
      ${bidStatusPill(b.status)}
      ${b.status === 'pending' ? `
      <form method="post" action="/bid/${b.id}/accept"><button class="btn-mini" style="background:#1E7A46;color:#fff;">قبول</button></form>
      <form method="post" action="/bid/${b.id}/reject"><button class="btn-mini danger">رفض</button></form>` : ''}
    </div>`).join('') : emptyState('star', 'لا توجد سومات مستلمة بعد.');

  const sellerPanel = `
  <div data-panel="seller" style="display:none;flex-direction:column;gap:20px;">
    <div class="my-ads">
      <div class="head"><span>إدارة إعلاناتي (${sellerListings.length})</span><a href="/post-ad" style="font-size:12.5px;font-weight:700;color:var(--primary);">+ إضافة إعلان جديد</a></div>
      ${sellerRows}
    </div>
    <div class="my-ads">
      <div class="head"><span>السومات المستلمة (${receivedBids.length})</span></div>
      ${bidRows}
    </div>
  </div>`;

  const favRows = favorites.length ? favorites.map((l) => `
    <div class="ad-row">
      <div class="thumb">${l.thumb ? `<img src="${esc(l.thumb)}">` : ''}</div>
      <div class="info">
        <a href="/listing/${l.id}">${esc(l.title)}</a>
        <span class="sub">${esc(l.price)} · ${esc(l.city)}</span>
      </div>
      <form method="post" action="/favorites/${l.id}/toggle"><button class="btn-mini danger">إزالة</button></form>
    </div>`).join('') : emptyState('heart', 'لا توجد سلع محفوظة في المفضلة بعد.', `<a href="/" class="btn-outline">تصفح الإعلانات</a>`);

  const myBidRows = myBids.length ? myBids.map((b) => {
    const outbid = b.status === 'pending' && Number(b.max_amount) > Number(b.amount);
    return `
    <div class="ad-row">
      <div class="info">
        <a href="/listing/${b.listing_id}">${esc(b.listing_title)}</a>
        <span class="sub">سومتي: ${Number(b.amount).toLocaleString('ar')} ر.ي${outbid ? ' · <span style="color:var(--price);font-weight:700;">تم تجاوز سومتك من مزايد آخر</span>' : ''}</span>
      </div>
      ${bidStatusPill(b.status)}
    </div>`;
  }).join('') : emptyState('star', 'لم تقدّم أي سومة بعد.');

  const savedSearchRows = (savedSearches && savedSearches.length) ? savedSearches.map((s) => `
    <div class="ad-row">
      <div class="info">
        <span class="t">${esc(s.category_name)}${s.city ? ' · ' + esc(s.city) : ' · جميع المحافظات'}</span>
        <span class="sub">${s.newCount > 0 ? `<span style="color:var(--price);font-weight:700;">${s.newCount} إعلان جديد منذ الحفظ</span>` : 'لا جديد منذ الحفظ'}</span>
      </div>
      <a href="/category/${esc(s.category_slug)}${s.city ? '?city=' + encodeURIComponent(s.city) : ''}" class="btn-mini">عرض</a>
      <form method="post" action="/saved-searches/${s.id}/delete"><button class="btn-mini danger">حذف</button></form>
    </div>`).join('') : emptyState('bookmark', 'لا توجد عمليات بحث محفوظة. احفظ بحثًا من أي صفحة فئة لتصلك إشارة عند وجود إعلانات جديدة.');

  const buyerPanel = `
  <div data-panel="buyer" style="display:none;flex-direction:column;gap:20px;">
    <div class="my-ads">
      <div class="head"><span>المفضلة (${favorites.length})</span></div>
      ${favRows}
    </div>
    <div class="my-ads">
      <div class="head"><span>سوماتي النشطة (${myBids.length})</span></div>
      ${myBidRows}
    </div>
    <div class="my-ads">
      <div class="head"><span>عمليات البحث المحفوظة (${(savedSearches || []).length})</span></div>
      ${savedSearchRows}
    </div>
  </div>`;

  const tabButtons = [`<button type="button" class="tab-btn active" data-tab="general">عام</button>`];
  if (showSeller) tabButtons.push(`<button type="button" class="tab-btn" data-tab="seller">لوحة البائع</button>`);
  if (showBuyer) tabButtons.push(`<button type="button" class="tab-btn" data-tab="buyer">لوحة المشتري</button>`);

  const body = `
  ${header(user)}
  <div class="zigzag" style="height:8px;"></div>
  <div class="dash-layout container">
    <div class="dash-side">
      ${profileCard(user)}
      ${dashNav('settings')}
    </div>
    <div style="flex-grow:1;display:flex;flex-direction:column;gap:20px;max-width:640px;">
      <h1 style="margin:0;font-size:20px;font-weight:800;">الإعدادات</h1>
      ${error ? `<div class="error-box">${esc(error)}</div>` : ''}
      ${success ? `<div class="warn-box" style="background:#E6F1EC;border-color:#1A73E8;color:#124C8A;">${icons.info} <p style="margin:0;">تم حفظ التغييرات بنجاح.</p></div>` : ''}
      <div class="tabs">${tabButtons.join('')}</div>
      ${generalPanel}
      ${sellerPanel}
      ${buyerPanel}
    </div>
  </div>
  <script>
    (function () {
      var tabs = document.querySelectorAll('.tabs .tab-btn');
      tabs.forEach(function (btn) {
        btn.addEventListener('click', function () {
          tabs.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var target = btn.getAttribute('data-tab');
          document.querySelectorAll('[data-panel]').forEach(function (p) {
            p.style.display = p.getAttribute('data-panel') === target ? 'flex' : 'none';
          });
        });
      });
    })();
  </script>
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
        <span class="sub">${l.status === 'sold' ? `بيع بـ ${Number(l.sold_price).toLocaleString('ar')} ر.ي — عمولة ${l.commission_paid ? 'مدفوعة' : 'مستحقة'}: ${l.commission_amount} ر.ي${!l.commission_paid ? ` — <a href="/commission-payment" target="_blank" style="color:var(--accent);font-weight:700;">ادفعها الآن ←</a>` : ''}` : `${moneyOrText(l.price)} · ${esc(l.city)}`}</span>
      </div>
      ${listingStatusPill(l)}
      <span class="views">${l.views} مشاهدة</span>
      ${l.status === 'expired' || (daysLeft(l.expires_at) !== null && daysLeft(l.expires_at) <= 5)
        ? `<form method="post" action="/listing/${l.id}/renew"><button class="btn-mini" style="background:#1A73E8;color:#fff;">تجديد الإعلان</button></form>`
        : ''}
      ${l.status === 'active' ? `
      <form method="post" action="/listing/${l.id}/mark-sold" onsubmit="var p = prompt('أدخل السعر الفعلي الذي تم البيع به (ر.ي) — سيُحسب منه 1% كعمولة للموقع:'); if (!p || isNaN(parseFloat(p.replace(/,/g,'')))) { return false; } this.sold_price.value = p.replace(/,/g,''); return true;">
        <input type="hidden" name="sold_price">
        <button type="submit" class="btn-mini" style="background:#1E7A46;color:#fff;">تحديد كمباع</button>
      </form>` : ''}
      <a href="/listing/${l.id}/edit" class="btn-mini" style="text-decoration:none;display:inline-flex;align-items:center;">تعديل</a>
      <form method="post" action="/listing/${l.id}/delete" onsubmit="return confirm('هل تريد حذف هذا الإعلان؟');">
        <button class="btn-mini danger">حذف</button>
      </form>
    </div>`).join('') : emptyState('emptyBox', 'لا توجد إعلانات بعد.', `<a href="/post-ad" class="btn-primary">أضف إعلانك الأول</a>`);

  const body = `
  ${header(user)}
  <div class="zigzag" style="height:8px;"></div>
  <div class="dash-layout container">
    <div class="dash-side">
      ${profileCard(user)}
      ${dashNav('ads', user.unreadMessages)}
    </div>
    <div style="flex-grow:1;display:flex;flex-direction:column;gap:20px;">
      <div class="stat-grid">
        <div class="stat-card"><span class="label">الإعلانات النشطة</span><span class="val">${stats.active}</span></div>
        <div class="stat-card"><span class="label">مجموع المشاهدات</span><span class="val">${stats.views}</span></div>
        <div class="stat-card"><span class="label">الرسائل الجديدة</span><span class="val">0</span></div>
        <div class="stat-card"><span class="label">إعلانات منتهية</span><span class="val">${stats.expired}</span></div>
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

function adminPage({ user, stats, listings, users, resetInfo, reports = [], reportReasons = {}, commissions = [], commissionStats = { dueCount: 0, dueTotal: 0 } }) {
  const listingRows = listings.length ? listings.map((l) => `
    <div class="ad-row">
      <div class="thumb">${l.thumb ? `<img src="${esc(l.thumb)}">` : ''}</div>
      <div class="info">
        <a href="/listing/${l.id}">${esc(l.title)}${l.featured ? ` <span style="color:var(--price);">${icons.star}</span>` : ''}</a>
        <span class="sub">${esc(l.owner_name)} · ${esc(l.category_name)} · ${esc(l.city)}</span>
      </div>
      ${listingStatusPill(l)}
      <span class="views">${l.views} مشاهدة</span>
      ${l.status === 'hidden' ? `<form method="post" action="/admin/listing/${l.id}/unhide"><button class="btn-mini" style="background:#1E7A46;color:#fff;">إظهار مجددًا</button></form>` : ''}
      ${l.featured
        ? `<form method="post" action="/admin/listing/${l.id}/unfeature"><button class="btn-mini">إلغاء التثبيت</button></form>`
        : `<form method="post" action="/admin/listing/${l.id}/feature"><button class="btn-mini" style="background:#D9A62B;color:#fff;">${icons.star} تثبيت كمميز</button></form>`}
      <form method="post" action="/admin/listing/${l.id}/delete" onsubmit="return confirm('حذف هذا الإعلان نهائيًا؟');">
        <button class="btn-mini danger">حذف</button>
      </form>
    </div>`).join('') : emptyState('emptyBox', 'لا توجد إعلانات بعد.');

  const reportRows = reports.length ? reports.map((r) => `
    <div class="ad-row">
      <div class="info" style="flex-grow:1;">
        <a href="/listing/${r.listing_id}">${esc(r.listing_title)}</a>
        <span class="sub">السبب: ${esc(reportReasons[r.reason] || r.reason)}${r.details ? ' — ' + esc(r.details) : ''} · بلّغ: ${esc(r.reporter_name || 'زائر')} · ${esc((r.created_at || '').slice(0, 16))}</span>
      </div>
      <form method="post" action="/admin/report/${r.id}/dismiss"><button class="btn-mini">تجاهل البلاغ</button></form>
      <form method="post" action="/admin/listing/${r.listing_id}/delete" onsubmit="return confirm('حذف هذا الإعلان نهائيًا؟');">
        <button class="btn-mini danger">حذف الإعلان</button>
      </form>
    </div>`).join('') : emptyState('emptyBox', 'لا توجد بلاغات مفتوحة حاليًا.');

  const userRows = users.length ? users.map((u) => `
    <div class="ad-row">
      <div class="info" style="flex-grow:1;">
        <span style="font-weight:700;">${esc(u.name)}${u.is_admin ? ' <span style="color:var(--price);font-size:11.5px;">(مدير)</span>' : ''}
          ${u.id_verified ? ' <span style="color:#1E7A46;font-size:11.5px;">(موثّق)</span>' : u.id_document ? ' <span style="color:#8a6d1f;font-size:11.5px;">(توثيق بانتظار المراجعة)</span>' : ''}
        </span>
        <span class="sub">${esc(u.phone || '')} ${u.phone && u.email ? '·' : ''} ${esc(u.email || '')} · ${esc(u.city || '')}</span>
      </div>
      ${u.id_document ? `<a href="/public/uploads/${esc(u.id_document)}" target="_blank" class="btn-mini" style="text-decoration:none;">عرض الهوية</a>` : ''}
      ${u.id_document && !u.id_verified ? `<form method="post" action="/admin/user/${u.id}/verify"><button class="btn-mini" style="background:#1E7A46;color:#fff;">توثيق</button></form>` : ''}
      ${u.id_verified ? `<form method="post" action="/admin/user/${u.id}/unverify"><button class="btn-mini">إلغاء التوثيق</button></form>` : ''}
      <form method="post" action="/admin/user/${u.id}/reset-password" onsubmit="return confirm('سيتم إنشاء كلمة مرور مؤقتة جديدة لهذا المستخدم. متابعة؟');">
        <button class="btn-mini">إعادة تعيين كلمة المرور</button>
      </form>
      ${u.is_admin ? '' : `
      <form method="post" action="/admin/user/${u.id}/delete" onsubmit="return confirm('حذف هذا المستخدم وكل إعلاناته نهائيًا؟');">
        <button class="btn-mini danger">حذف</button>
      </form>`}
    </div>`).join('') : '';

  const commissionRows = commissions.length ? commissions.map((c) => `
    <div class="ad-row">
      <div class="info" style="flex-grow:1;">
        <a href="/listing/${c.id}">${esc(c.title)}</a>
        <span class="sub">${esc(c.owner_name)} · ${esc(c.owner_phone || '')} · بيع بـ ${Number(c.sold_price).toLocaleString('ar')} ر.ي · بتاريخ ${esc((c.sold_at || '').slice(0, 10))}</span>
      </div>
      <span class="status-pill" style="background:${c.commission_paid ? '#E6F1EC' : '#FBF0D8'};color:${c.commission_paid ? '#1E7A46' : '#8a6d1f'};">عمولة: ${c.commission_amount} ر.ي ${c.commission_paid ? '(مدفوعة)' : '(مستحقة)'}</span>
      ${!c.commission_paid ? `<form method="post" action="/admin/listing/${c.id}/commission-paid"><button class="btn-mini" style="background:#1E7A46;color:#fff;">تحديد كمدفوعة</button></form>` : ''}
    </div>`).join('') : emptyState('emptyBox', 'لا توجد إعلانات مباعة بعد.');

  const resetBanner = resetInfo ? `
  <div class="warn-box" style="background:#E6F1EC;border-color:#1A73E8;color:#124C8A;">
    ${icons.info}
    <p style="margin:0;">تم إنشاء كلمة مرور مؤقتة لـ <strong>${esc(resetInfo.name)}</strong>: <code style="background:#fff;padding:2px 8px;border-radius:6px;font-weight:800;">${esc(resetInfo.password)}</code> — انسخها وأرسلها للمستخدم مباشرة (واتساب/اتصال)، ويُفضّل أن يغيّرها من الإعدادات بعد الدخول. هذه الرسالة تظهر مرة واحدة فقط ولن تُحفظ.</p>
  </div>` : '';

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
      ${resetBanner}
      <div class="stat-grid">
        <div class="stat-card"><span class="label">إجمالي المستخدمين</span><span class="val">${stats.users}</span></div>
        <div class="stat-card"><span class="label">إجمالي الإعلانات</span><span class="val">${stats.listings}</span></div>
        <div class="stat-card"><span class="label">إعلانات نشطة</span><span class="val">${stats.activeListings}</span></div>
        <div class="stat-card"><span class="label">مجموع المشاهدات</span><span class="val">${stats.views}</span></div>
        <div class="stat-card"><span class="label">عمولات مستحقة</span><span class="val">${commissionStats.dueTotal} ر.ي</span></div>
      </div>
      <div class="my-ads">
        <div class="head"><span>بلاغات مفتوحة (${reports.length})${reports.length ? ` <span style="color:#B23A2E;">${icons.flag}</span>` : ''}</span></div>
        ${reportRows}
      </div>
      <div class="my-ads">
        <div class="head"><span>عمولات المبيعات (${commissions.length})${commissionStats.dueCount ? ` — ${commissionStats.dueCount} مستحقة` : ''}</span></div>
        ${commissionRows}
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

function staticPage({ user, title, bodyHtml }) {
  const body = `
  ${header(user)}
  <div class="zigzag" style="height:8px;"></div>
  <div class="container" style="max-width:820px;padding-top:36px;padding-bottom:56px;">
    <div class="card" style="gap:18px;line-height:2;font-size:14px;color:var(--text);">
      <h1 style="margin:0;font-size:24px;font-weight:800;">${esc(title)}</h1>
      ${bodyHtml}
    </div>
  </div>
  ${footer()}
  `;
  return page({ title, user, body });
}

function aboutPage({ user }) {
  return staticPage({
    user,
    title: 'من نحن',
    bodyHtml: `
      <p>صفقة منصة يمنية للإعلانات المبوبة، تهدف لتسهيل عملية البيع والشراء بين الناس في جميع المحافظات اليمنية — سيارات، عقارات، إلكترونيات، وظائف، وغيرها — بطريقة آمنة وبسيطة.</p>
      <p>نحن سوق مفتوح يربط البائع بالمشتري مباشرة؛ صفقة لا تبيع ولا تشتري ولا تضمن أي سلعة أو خدمة معروضة، والمسؤولية عن دقة الإعلان والتعامل تقع على طرفي الصفقة.</p>
      <p>هدفنا بناء مجتمع تسوّق موثوق لليمنيين، ونعمل باستمرار على تطوير المنصة وإضافة ميزات جديدة بناءً على احتياجات المستخدمين.</p>
    `,
  });
}

function contactPage({ user }) {
  return staticPage({
    user,
    title: 'اتصل بنا',
    bodyHtml: `
      <p>يسعدنا تواصلك معنا لأي استفسار، اقتراح، أو بلاغ عن مشكلة في الموقع.</p>
      <div style="display:flex;flex-direction:column;gap:6px;">
        <span style="font-weight:700;">البريد الإلكتروني للدعم</span>
        <a href="mailto:nassrataa4@gmail.com" style="color:var(--accent);font-weight:700;">nassrataa4@gmail.com</a>
      </div>
      <p style="color:var(--text-2);font-size:13px;">نحاول الرد خلال أقرب وقت ممكن. لبلاغ عن إعلان مخالف، يرجى ذكر رقم الإعلان الظاهر في صفحة التفاصيل.</p>
    `,
  });
}

function commissionPaymentPage({ user, methods = [], rate = 0.01 }) {
  const bankCards = methods.map((m) => `
    <div class="card" style="gap:12px;">
      <span style="font-size:15px;font-weight:800;">${esc(m.name)}</span>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${m.accounts.map((a, i) => `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;background:var(--chip);border-radius:10px;padding:10px 14px;">
          <div>
            <div style="font-size:12px;color:var(--text-2);">${esc(a.label)}</div>
            <div style="font-size:16px;font-weight:800;letter-spacing:0.5px;" dir="ltr" id="acc-${esc(m.name)}-${i}">${esc(a.number)}</div>
          </div>
          <button type="button" class="btn-mini copy-acc-btn" data-target="acc-${esc(m.name)}-${i}">${icons.link} نسخ</button>
        </div>`).join('')}
      </div>
    </div>`).join('');

  const body = `
  ${header(user)}
  <div class="zigzag" style="height:8px;"></div>
  <div class="container" style="max-width:720px;padding-top:32px;padding-bottom:56px;display:flex;flex-direction:column;gap:20px;">
    <div>
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;">طريقة دفع عمولة الموقع</h1>
      <p style="margin:0;font-size:13.5px;color:var(--text-2);line-height:1.9;">بعد بيع سلعتك عبر صفقة وتحديد الإعلان كـ"مباع"، تُحسب عمولة الموقع تلقائيًا (${Math.round(rate * 100)}% من سعر البيع الفعلي). حوّل مبلغ العمولة إلى أحد الحسابات التالية، ثم تواصل معنا من <a href="/contact" style="color:var(--accent);font-weight:700;">صفحة اتصل بنا</a> لتأكيد الدفع.</p>
    </div>
    ${bankCards}
    <div class="warn-box">${icons.info}<p style="margin:0;">سيتم إضافة بنوك ومحافظ إلكترونية رسمية أخرى قريبًا إن شاء الله (بنك اليمن الدولي، بنك سبأ الإسلامي، بنك اليمن والكويت، بنك القاسمي، محفظة ون كاش، وغيرها). تابع هذه الصفحة للتحديثات.</p></div>
  </div>
  <script>
    document.querySelectorAll('.copy-acc-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var el = document.getElementById(btn.getAttribute('data-target'));
        if (!el) return;
        navigator.clipboard.writeText(el.textContent.trim()).then(function () {
          var original = btn.innerHTML;
          btn.textContent = 'تم النسخ ✓';
          setTimeout(function () { btn.innerHTML = original; }, 1500);
        }).catch(function () {});
      });
    });
  </script>
  ${footer()}
  `;
  return page({ title: 'طريقة دفع العمولة', user, body });
}

function termsPage({ user }) {
  return staticPage({
    user,
    title: 'الشروط والأحكام',
    bodyHtml: `
      <p>باستخدامك موقع صفقة فإنك توافق على الشروط التالية:</p>
      <p><strong>1. طبيعة الخدمة</strong> — صفقة منصة وسيطة تتيح للمستخدمين نشر وتصفح إعلانات بيع وشراء. المنصة ليست طرفًا في أي عملية بيع أو شراء تتم بين المستخدمين، ولا تتحمل مسؤولية جودة السلعة أو صحة بياناتها أو إتمام عملية الدفع.</p>
      <p><strong>2. مسؤولية المستخدم</strong> — أنت مسؤول عن دقة المعلومات التي تنشرها، وعن التأكد من هوية الطرف الآخر قبل إتمام أي تعامل مالي. يُمنع نشر إعلانات لسلع أو خدمات مخالفة للقانون.</p>
      <p><strong>3. الحسابات</strong> — يجب تقديم بيانات صحيحة عند التسجيل. أنت مسؤول عن الحفاظ على سرية كلمة المرور الخاصة بك وعن أي نشاط يتم من خلال حسابك.</p>
      <p><strong>4. إزالة المحتوى</strong> — تحتفظ إدارة صفقة بالحق في حذف أي إعلان أو حساب يخالف هذه الشروط أو يُشتبه بأنه احتيالي، دون إشعار مسبق.</p>
      <p><strong>5. التواصل والدفع</strong> — ننصح دائمًا بمعاينة السلعة قبل الدفع، وعدم تحويل أي مبلغ مقدمًا لأشخاص غير موثوقين.</p>
      <p><strong>6. التعديلات</strong> — قد تُحدّث هذه الشروط من وقت لآخر، ويُعتبر استمرارك باستخدام الموقع موافقة على أي تحديث.</p>
      <p style="color:var(--text-2);font-size:13px;">آخر تحديث: ${new Date().toISOString().slice(0, 10)}</p>
    `,
  });
}

function privacyPage({ user }) {
  return staticPage({
    user,
    title: 'سياسة الخصوصية',
    bodyHtml: `
      <p><strong>البيانات التي نجمعها</strong> — الاسم، رقم الجوال و/أو البريد الإلكتروني، المحافظة، وبيانات أي إعلان تنشره (العنوان، الوصف، السعر، الصور، رقم التواصل).</p>
      <p><strong>كيف نستخدم بياناتك</strong> — لإنشاء حسابك وتشغيله، عرض إعلاناتك للمستخدمين الآخرين، وتمكين التواصل بين البائع والمشتري. لا نبيع بياناتك لأي طرف ثالث.</p>
      <p><strong>ظهور رقم جوالك</strong> — رقم جوالك يظهر لأي زائر يضغط "إظهار رقم الجوال" في صفحة إعلانك، وهذا مقصود لتسهيل التواصل المباشر؛ لا تنشر إعلانًا برقم لا ترغب بظهوره للعامة.</p>
      <p><strong>كلمة المرور</strong> — تُحفظ مشفّرة في قاعدة البيانات ولا يطّلع عليها أي شخص، بما في ذلك فريق صفقة.</p>
      <p><strong>حذف بياناتك</strong> — يمكنك تعديل بياناتك في أي وقت من "الإعدادات"، أو التواصل معنا عبر صفحة "اتصل بنا" لطلب حذف حسابك بالكامل.</p>
      <p style="color:var(--text-2);font-size:13px;">آخر تحديث: ${new Date().toISOString().slice(0, 10)}</p>
    `,
  });
}

module.exports = { homePage, categoryPage, listingPage, loginPage, signupPage, postAdPage, dashboardPage, settingsPage, adminPage, aboutPage, contactPage, termsPage, privacyPage, searchPage, forgotPasswordPage, sellerPage, messagesPage, conversationPage, commissionPaymentPage };
