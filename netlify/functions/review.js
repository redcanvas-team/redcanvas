// Red Canvas — Gemini API 프록시 (무료 등급)
// 브라우저의 검수 요청(Anthropic 형식)을 받아 Google Gemini API로 변환해 호출합니다.
// 키는 Netlify 환경변수 GEMINI_API_KEY 에만 존재하며 브라우저에 노출되지 않습니다.

const MODEL = 'gemini-2.5-flash';

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'POST만 허용됩니다.' }) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: '서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다. Netlify 사이트 설정에서 등록 후 재배포(Trigger deploy)해주세요.' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: '잘못된 요청 형식입니다.' }) };
  }

  // ── Anthropic 형식 → Gemini 형식 변환 ──
  const parts = [];
  try {
    const content = payload.messages?.[0]?.content;
    if (Array.isArray(content)) {
      for (const c of content) {
        if (c.type === 'document' && c.source?.data) {
          parts.push({ inline_data: { mime_type: c.source.media_type || 'application/pdf', data: c.source.data } });
        } else if (c.type === 'text') {
          parts.push({ text: c.text });
        }
      }
    } else if (typeof content === 'string') {
      parts.push({ text: content });
    }
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: '요청 내용을 해석할 수 없습니다.' }) };
  }
  if (!parts.length) {
    return { statusCode: 400, body: JSON.stringify({ error: '분석할 내용이 없습니다.' }) };
  }

  const geminiBody = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      maxOutputTokens: Math.min(payload.max_tokens || 6000, 8192),
      temperature: 0.2
    }
  };
  if (payload.system) {
    geminiBody.systemInstruction = { parts: [{ text: payload.system }] };
  }

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(geminiBody)
      }
    );

    const raw = await resp.text();

    if (!resp.ok) {
      // Gemini 오류를 사람이 읽을 수 있는 메시지로 전달
      let msg = raw.slice(0, 300);
      try { msg = JSON.parse(raw)?.error?.message || msg; } catch {}
      if (resp.status === 429) msg = '오늘의 무료 사용량을 모두 사용했습니다. 내일 다시 시도하거나, 잠시 후 재검수해주세요. (' + msg + ')';
      return {
        statusCode: resp.status,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Gemini API 오류: ' + msg })
      };
    }

    // ── Gemini 응답 → Anthropic 형식으로 변환 (index.html 수정 불필요) ──
    let text = '';
    try {
      const data = JSON.parse(raw);
      const cParts = data.candidates?.[0]?.content?.parts || [];
      text = cParts.map(p => p.text || '').join('');
    } catch {}
    if (!text) {
      return {
        statusCode: 502,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: 'Gemini 응답이 비어 있습니다. 잠시 후 재검수해주세요.' })
      };
    }

    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: [{ type: 'text', text }] })
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Gemini API 연결 실패: ' + e.message })
    };
  }
};
