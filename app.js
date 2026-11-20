const $ = (id) => document.getElementById(id);
let answerType = 'شرح وتفصيل';

document.querySelectorAll('.type').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.type').forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
    answerType = button.dataset.type;
  });
});

$('imageInput').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  $('previewImage').src = url;
  $('imagePreview').hidden = false;
  await extractText(file);
});

$('removeImage').addEventListener('click', () => {
  $('imageInput').value = '';
  $('imagePreview').hidden = true;
  $('ocrStatus').textContent = '';
});

$('clearBtn').addEventListener('click', () => {
  $('question').value = '';
  $('answerCard').hidden = true;
  $('removeImage').click();
});

async function extractText(file) {
  if (!window.Tesseract) {
    $('ocrStatus').textContent = 'تعذّر تحميل خدمة قراءة النصوص';
    return;
  }
  $('ocrStatus').textContent = 'جاري قراءة نص الصورة…';
  try {
    const result = await Tesseract.recognize(file, 'ara+eng', {
      logger: ({ progress }) => {
        if (progress < 1) $('ocrStatus').textContent = `قراءة الصورة ${Math.round(progress * 100)}٪`;
      }
    });
    const text = result.data.text.trim();
    if (text) $('question').value = text;
    $('ocrStatus').textContent = text ? 'تم استخراج النص — راجعته قبل الحل' : 'لم يتم العثور على نص واضح؛ اكتب السؤال يدويًا';
  } catch (_error) {
    $('ocrStatus').textContent = 'تعذر قراءة الصورة؛ يمكنك كتابة السؤال يدويًا';
  }
}

$('solveBtn').addEventListener('click', solve);
$('question').addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') solve();
});

async function solve() {
  const question = $('question').value.trim();
  if (!question) {
    $('question').focus();
    $('question').placeholder = 'يرجى كتابة السؤال أو رفع صورة واضحة أولًا…';
    return;
  }

  $('loading').hidden = false;
  $('answerCard').hidden = true;
  $('solveBtn').disabled = true;

  const payload = {
    question,
    subject: $('subject').value,
    stage: $('stage').value,
    answerType,
    verify: $('verifyMode').checked
  };

  let result;
  try {
    const response = await fetch('/api/answer', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(payload)
    });
    if (response.ok) result = await response.json();
  } catch (_error) {}

  if (!result) result = buildDemoAnswer(payload);
  renderAnswer(result);

  $('loading').hidden = true;
  $('solveBtn').disabled = false;
  $('answerCard').hidden = false;
  $('answerCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildDemoAnswer({ question, subject, answerType }) {
  return {
    title: `حل سؤال ${subject}`,
    sections: [
      { heading: 'فهم السؤال', text: 'تعريف معطيات السؤال، ثم تحديد المطلوب بدقة قبل اختيار طريقة الحل.' },
      { heading: 'طريقة الحل', text: 'اكتب المعطيات والتحويلات خطوة بخطوة، مع ذكر القانون أو القاعدة المستخدمة.' },
      { heading: 'النتيجة', text: `أرفق الإجابة النهائية في نهاية الحل للسؤال: ${question}` },
      { heading: 'مراجعة سريعة', text: 'تأكد من الوحدات، الإشارات، وتطابق النتيجة مع المنهج السوداني المعتمد.' }
    ],
    steps: answerType === 'خطوات الحل' ? ['تحديد المعطيات', 'كتابة القانون', 'التعويض والتبسيط', 'كتابة النتيجة'] : []
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[char]));
}

function renderAnswer(result) {
  $('answer').innerHTML = `<h3>${escapeHtml(result.title || 'الحل')}</h3>` +
    (result.sections || []).map((section) => `<h3>${escapeHtml(section.heading)}</h3><p>${escapeHtml(section.text)}</p>`).join('');

  const video = $('videoLesson');
  video.innerHTML = '';
  if ($('videoMode').checked && result.steps?.length) {
    video.hidden = false;
    video.innerHTML = '<h3>شرح مرئي بالخطوات</h3>' + result.steps.map((step, index) =>
      `<div class="lesson-step"><div class="step-no">${index + 1}</div><div><b>${escapeHtml(step)}</b></div></div>`
    ).join('');
  } else {
    video.hidden = true;
  }
}

$('copyBtn').addEventListener('click', async () => {
  await navigator.clipboard.writeText($('answer').innerText + '\n\n' + $('videoLesson').innerText);
  $('copyBtn').textContent = 'تم النسخ';
  setTimeout(() => $('copyBtn').textContent = 'نسخ الإجابة', 1500);
});
