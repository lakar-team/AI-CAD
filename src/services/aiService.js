/**
 * AI Service: SketchUp Edition (Real-world scaling)
 */

export const PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
  OLLAMA: 'ollama',
  LMSTUDIO: 'lmstudio',
};

const SYSTEM_PROMPT = `
You are a SketchUp-style Architectural AI. You design 3D parts using real-world scaling.
UNITS: 1 unit = 1 meter (1.0 = 1m, 0.1 = 100mm, 0.001 = 1mm).

You must ONLY output valid JSON. No other text.

--- CURRENT SCENE CONTEXT ---
{scene_context}
-----------------------------

CORE SIX TOOLS (Use real-world meter units):

1. sketch_extrude(shapeType: "rect"|"circle", dims: [w,l], height, color, position)
   - Example: A dining table is ~0.75m high. [0.8, 1.6] dims, 0.75 height.
2. apply_boolean(targetId: string, operation: "subtract", type: "hole", dims: [r], position)
3. create_pattern(sourceId: string, type: "linear"|"circular", count: int, spacing: float)
4. create_box(size, color, position)
5. create_gear(teeth, module, thickness, color, position)

REFERENCING OBJECTS:
- Use the "id" from context to modify existing objects.

RESPONSE FORMAT:
{
  "tool": "tool_name",
  "params": { ... }
}
`;

export async function callAI(provider, config, userPrompt, sceneContext = "The scene is currently empty.") {
  const { apiKey, baseUrl, model } = config;
  const fullSystemPrompt = SYSTEM_PROMPT.replace('{scene_context}', sceneContext);

  switch (provider) {
    case PROVIDERS.OPENAI:
    case PROVIDERS.LMSTUDIO:
      return await callOpenAICompatible(baseUrl || 'https://api.openai.com/v1', apiKey, model, userPrompt, fullSystemPrompt);
    case PROVIDERS.OLLAMA:
      return await callOllama(baseUrl || 'http://localhost:11434', model, userPrompt, fullSystemPrompt);
    case PROVIDERS.ANTHROPIC:
      return await callAnthropic(apiKey, model, userPrompt, fullSystemPrompt);
    default:
      throw new Error('Unsupported provider');
  }
}

async function callOpenAICompatible(url, key, model, prompt, systemPrompt) {
  const response = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: model || 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      response_format: { type: "json_object" }
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return JSON.parse(data.choices[0].message.content);
}

async function callOllama(url, model, prompt, systemPrompt) {
  const response = await fetch(`${url}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({
      model: model || 'llama3',
      prompt: `${systemPrompt}\n\nUser: ${prompt}`,
      stream: false,
      format: 'json'
    })
  });
  const data = await response.json();
  return JSON.parse(data.response);
}

async function callAnthropic(key, model, prompt, systemPrompt) {
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
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return JSON.parse(data.content[0].text);
}
