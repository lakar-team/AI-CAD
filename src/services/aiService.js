/**
 * AI Service: Production-grade multi-provider support.
 * Supports OpenAI, Anthropic (via CORS proxy), Ollama, LM Studio.
 */

export const PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  OLLAMA: 'ollama',
  LMSTUDIO: 'lmstudio',
};

export const PROVIDER_LABELS = {
  [PROVIDERS.OPENAI]: 'OpenAI',
  [PROVIDERS.ANTHROPIC]: 'Anthropic',
  [PROVIDERS.OLLAMA]: 'Ollama (Local)',
  [PROVIDERS.LMSTUDIO]: 'LM Studio (Local)',
};

export const DEFAULT_MODELS = {
  [PROVIDERS.OPENAI]: 'gpt-4o',
  [PROVIDERS.ANTHROPIC]: 'claude-sonnet-4-20250514',
  [PROVIDERS.OLLAMA]: 'llama3',
  [PROVIDERS.LMSTUDIO]: 'local-model',
};

const SYSTEM_PROMPT = `
You are a SketchUp-style Architectural AI. You design 3D parts using real-world scaling.
UNITS: 1 unit = 1 meter (1.0 = 1m, 0.1 = 100mm, 0.001 = 1mm).

You must ONLY output valid JSON. No markdown, no explanation, no code fences.

--- CURRENT SCENE CONTEXT ---
{scene_context}
-----------------------------

AVAILABLE TOOLS:

1. create_box(size: [w, h, d], color: hex, position: [x, y, z])
   - A simple rectangular box.
2. create_sphere(radius: float, color: hex, position: [x, y, z])
3. sketch_extrude(shapeType: "rect"|"circle", dims: [w, l], height: float, color: hex, position: [x, y, z])
   - Extrudes a 2D sketch into 3D. For rect dims=[width,length]. For circle dims=[radius].
4. create_gear(teeth: int, module: float, thickness: float, color: hex, position: [x, y, z])
5. apply_boolean(targetId: string, operation: "subtract", type: "hole", dims: [radius], position: [x, y, z])
   - Cuts a hole into an existing object. Requires the target object's ID from the scene context.
6. create_pattern(sourceId: string, type: "linear"|"circular", count: int, spacing: float)
   - Duplicates an existing object in a pattern. Requires the source object's ID.

SCALE REFERENCE:
- A human is 1.8m tall. A dining table is ~0.75m high. A door is ~2m tall, ~0.9m wide.

RESPONSE FORMAT (strict JSON, nothing else):
{
  "tool": "tool_name",
  "params": { ... all parameters ... }
}
`;

export async function callAI(provider, config, userPrompt, sceneContext = "The scene is currently empty.") {
  const { apiKey, baseUrl, model } = config;
  const fullSystemPrompt = SYSTEM_PROMPT.replace('{scene_context}', sceneContext);

  switch (provider) {
    case PROVIDERS.OPENAI:
    case PROVIDERS.LMSTUDIO:
      return await callOpenAICompatible(
        baseUrl || 'https://api.openai.com/v1',
        apiKey,
        model || DEFAULT_MODELS[provider],
        userPrompt,
        fullSystemPrompt
      );
    case PROVIDERS.OLLAMA:
      return await callOllama(
        baseUrl || 'http://localhost:11434',
        model || DEFAULT_MODELS[PROVIDERS.OLLAMA],
        userPrompt,
        fullSystemPrompt
      );
    case PROVIDERS.ANTHROPIC:
      return await callAnthropic(
        apiKey,
        model || DEFAULT_MODELS[PROVIDERS.ANTHROPIC],
        userPrompt,
        fullSystemPrompt
      );
    default:
      throw new Error(`Unsupported provider: "${provider}". Go to Settings and choose a valid provider.`);
  }
}

async function callOpenAICompatible(url, key, model, prompt, systemPrompt) {
  if (!key) throw new Error('API Key is missing. Please enter your OpenAI key in Settings.');

  const response = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`
    },
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('No response content from AI.');

  return JSON.parse(content);
}

async function callOllama(url, model, prompt, systemPrompt) {
  let response;
  try {
    response = await fetch(`${url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model,
        prompt: `${systemPrompt}\n\nUser request: ${prompt}\n\nRespond with ONLY valid JSON:`,
        stream: false,
        format: 'json'
      })
    });
  } catch (e) {
    throw new Error(`Cannot connect to Ollama at ${url}. Is Ollama running? (${e.message})`);
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Ollama error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (!data.response) throw new Error('Empty response from Ollama. Is the model downloaded?');

  return JSON.parse(data.response);
}

async function callAnthropic(key, model, prompt, systemPrompt) {
  if (!key) throw new Error('API Key is missing. Please enter your Anthropic key in Settings.');

  // Direct browser fetch to Anthropic will fail due to CORS.
  // We attempt it, and if CORS blocks it, we give a clear error.
  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: prompt }]
      })
    });
  } catch (e) {
    throw new Error(
      'Anthropic API blocked by CORS. Direct browser calls to Anthropic are not supported. ' +
      'Use OpenAI or a local model (Ollama/LM Studio) instead, or set up a CORS proxy.'
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Anthropic API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  if (data.error) throw new Error(data.error.message);

  const content = data.content?.[0]?.text;
  if (!content) throw new Error('No response content from Anthropic.');

  return JSON.parse(content);
}
