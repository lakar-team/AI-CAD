/**
 * AI Service to handle multiple providers (OpenAI, Anthropic, Gemini, Local)
 */

export const PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
  OLLAMA: 'ollama',
  LMSTUDIO: 'lmstudio',
};

const SYSTEM_PROMPT = `
You are an AI CAD assistant. Your job is to translate natural language into 3D CAD actions.
You must ONLY output valid JSON. No other text.

The JSON schema is:
{
  "type": "box" | "sphere" | "cylinder",
  "color": "hex_color",
  "size": [width, height, depth], // For cylinder: [topRadius, bottomRadius, height, radialSegments]
  "position": [x, y, z]
}

Defaults:
- Box size: [1, 1, 1]
- Sphere size: [0.5, 32, 32]
- Cylinder size: [0.5, 0.5, 1, 32]
- Position: [0, height/2, 0] to rest on the grid.

Example user: "Add a red cube"
Example output: {"type": "box", "color": "#ef4444", "size": [1,1,1], "position": [0, 0.5, 0]}
`;

export async function callAI(provider, config, userPrompt) {
  const { apiKey, baseUrl, model } = config;

  switch (provider) {
    case PROVIDERS.OPENAI:
    case PROVIDERS.LMSTUDIO:
      return await callOpenAICompatible(baseUrl || 'https://api.openai.com/v1', apiKey, model, userPrompt);
    case PROVIDERS.OLLAMA:
      return await callOllama(baseUrl || 'http://localhost:11434', model, userPrompt);
    case PROVIDERS.ANTHROPIC:
      return await callAnthropic(apiKey, model, userPrompt);
    default:
      throw new Error('Unsupported provider');
  }
}

async function callOpenAICompatible(url, key, model, prompt) {
  const response = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: prompt }
      ],
      response_format: { type: "json_object" }
    })
  });

  const data = await response.json();
  return JSON.parse(data.choices[0].message.content);
}

async function callOllama(url, model, prompt) {
  const response = await fetch(`${url}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({
      model: model || 'llama3',
      prompt: `${SYSTEM_PROMPT}\n\nUser: ${prompt}`,
      stream: false,
      format: 'json'
    })
  });

  const data = await response.json();
  return JSON.parse(data.response);
}

async function callAnthropic(key, model, prompt) {
  // Note: Anthropic usually requires a proxy for CORS, but here's the logic
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'dangerouslyAllowBrowser': 'true' // Some providers allow this for local dev
    },
    body: JSON.stringify({
      model: model || 'claude-3-5-sonnet-20240620',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  return JSON.parse(data.content[0].text);
}
