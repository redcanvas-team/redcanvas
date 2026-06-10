// Red Canvas — Anthropic API 프록시
// 브라우저의 검수 요청을 받아 API 키를 붙여 Anthropic으로 중계합니다.
// 키는 Netlify 환경변수 ANTHROPIC_API_KEY 에만 존재하며 브라우저에 노출되지 않습니다.

const ALLOWED_MODELS = ['claude-sonnet-4-20250514'];
const MAX_TOKENS_CAP = 8000;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'POST만 허용됩니다.' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: '서버에 ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다. Netlify 사이트 설정에서 등록 후 재배포해주세요.' })
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: '잘못된 요청 형식입니다.' }) };
  }

  // 간단한 남용 방지: 허용된 모델만, 토큰 상한 적용
  if (!ALLOWED_MODELS.includes(payload.model)) payload.model = ALLOWED_MODELS[0];
  if (!payload.max_tokens || payload.max_tokens > MAX_TOKENS_CAP) payload.max_tokens = MAX_TOKENS_CAP;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(payload)
    });
    const text = await resp.text();
    return {
      statusCode: resp.status,
      headers: { 'content-type': 'application/json' },
      body: text
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Anthropic API 연결 실패: ' + e.message })
    };
  }
};
