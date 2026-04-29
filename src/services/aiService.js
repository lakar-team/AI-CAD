/**
 * AI Service to handle multiple providers (OpenAI, Anthropic, Gemini, Local)
 * Updated with MCP-style Geometry Tools for accurate shape generation.
 */

export const PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
  OLLAMA: 'ollama',
  LMSTUDIO: 'lmstudio',
};

const SYSTEM_PROMPT = `
You are an AI CAD assistant. Your job is to translate natural language into 3D CAD tool calls.
You must ONLY output valid JSON. No other text.

GEOMETRY TOOL LIBRARY:

1. create_box(size: [w, h, d], color: hex, position: [x, y, z])
2. create_sphere(radius: float, color: hex, position: [x, y, z])
3. create_gear(teeth: int, module: float, thickness: float, color: hex, position: [x, y, z])
   - Default: teeth=12, module=0.2, thickness=0.1
4. create_slotted_plate(length, width, thickness, slotWidth, slotLength, color, position)
   - Default: length=2, width=1, thickness=0.1

RESPONSE FORMAT:
{
  "tool": "tool_name",
  "params": { ... }
}

Example user: "Add a 20 tooth gear"
Example output: {"tool": "create_gear", "params": {"teeth": 20, "module": 0.2, "thickness": 0.1, "color": "#f8f9fa", "position": [0, 0.1, 0]}}
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
  if (data.error) throw new Error(data.error.message);
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
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'dangerouslyAllowBrowser': 'true'
    },
    body: JSON.stringify({
      model: model || 'claude-3-5-sonnet-20240620',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }]
    })
  });

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return JSON.parse(data.content[0].text);
}
