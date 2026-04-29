/**
 * AI Service: Production-grade multi-provider support.
 * Supports OpenAI, OpenRouter, Google Gemini, Anthropic, Ollama, LM Studio.
 */

export const PROVIDERS = {
  OPENAI: 'openai',
  OPENROUTER: 'openrouter',
  GEMINI: 'gemini',
  ANTHROPIC: 'anthropic',
  OLLAMA: 'ollama',
  LMSTUDIO: 'lmstudio',
};

export const PROVIDER_LABELS = {
  [PROVIDERS.OPENAI]: 'OpenAI',
  [PROVIDERS.OPENROUTER]: 'OpenRouter',
  [PROVIDERS.GEMINI]: 'Google Gemini',
  [PROVIDERS.ANTHROPIC]: 'Anthropic',
  [PROVIDERS.OLLAMA]: 'Ollama (Local)',
  [PROVIDERS.LMSTUDIO]: 'LM Studio (Local)',
};

export const DEFAULT_MODELS = {
  [PROVIDERS.OPENAI]: 'gpt-4o',
  [PROVIDERS.OPENROUTER]: 'google/gemini-2.5-flash',
  [PROVIDERS.GEMINI]: 'gemini-2.5-flash',
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

1. create_box(size: [w, h, d], color: hex, position: [x, y, z], rotation: [x, y, z])
   - A simple rectangular box. Great for walls, tables, and blocks. Rotation is in degrees.
2. create_sphere(radius: float, color: hex, position: [x, y, z])
3. create_cylinder(radius: float, height: float, color: hex, position: [x, y, z], rotation: [x, y, z])
4. create_cone(radius: float, height: float, color: hex, position: [x, y, z], rotation: [x, y, z])
5. create_torus(radius: float, tube: float, color: hex, position: [x, y, z], rotation: [x, y, z])
6. sketch_extrude(shapeType: "rect"|"circle"|"triangle", dims: [w, l], height: float, color: hex, position: [x, y, z], rotation: [x, y, z])
   - Extrudes a 2D sketch into 3D. For rect/triangle dims=[width,length]. For circle dims=[radius].
7. apply_boolean(targetId: string, operation: "subtract"|"union"|"intersect", dims: [radius], position: [x, y, z])
   - Constructive Solid Geometry (CSG). To "push" a surface, subtract a shape. To "pull" a surface, union a shape.
8. duplicate_object(sourceId: string, position: [x, y, z], rotation: [x, y, z])
   - Creates a copy of an existing object.
9. transform_object(targetId: string, position: [x, y, z], rotation: [x, y, z], scale: [x, y, z])
   - Moves, rotates, or scales an existing object.

SCALE REFERENCE:
- A human is 1.8m tall. A dining table is ~0.75m high. A door is ~2m tall, ~0.9m wide.

--- 3D POSITIONING MATH & ANCHOR POINTS (CRITICAL) ---
The position [x, y, z] defines the CENTER of the object.
Objects have "Anchor Points" (corners, face centers). When an object is selected, you receive its Anchor names and their LOCAL coordinates.
PRECISE ATTACHMENT: To attach Object B to Object A's anchor (e.g., "Top-Right-Back"), calculate:
Object B position = Object A World Position + Anchor Local Position + (Object B offset relative to its own center).

Example: To put a 0.2m sphere on top of a 2m high box (Y=1.0) using the "Center-Top" anchor [0, 1, 0]:
Sphere Y = Box Y (1.0) + Anchor Y (1.0) + Sphere Radius (0.1) = 2.1.
Always prefer using provided Anchor coordinates for pixel-perfect CAD assemblies.

--- MULTI-PART ASSEMBLIES ---
If the user asks for something complex (e.g., "a house", "a table with chairs"), you SHOULD output MULTIPLE tool calls in the "tools" array to build the entire assembly.

RESPONSE FORMAT (Strict JSON Object):
{
  "message": "A conversational response explaining what you did, or answering the user's question.",
  "tools": [
    { "tool": "create_box", "params": { "size": [4, 3, 4], "color": "#8B4513", "position": [0, 1.5, 0] } },
    { "tool": "sketch_extrude", "params": { "shapeType": "triangle", "dims": [4.2, 4.2], "height": 2.0, "color": "#AA0000", "position": [0, 4, 0] } }
  ]
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
    case PROVIDERS.OPENROUTER:
      return await callOpenAICompatible(
        'https://openrouter.ai/api/v1',
        apiKey,
        model || DEFAULT_MODELS[PROVIDERS.OPENROUTER],
        userPrompt,
        fullSystemPrompt
      );
    case PROVIDERS.GEMINI:
      return await callGemini(
        apiKey,
        model || DEFAULT_MODELS[PROVIDERS.GEMINI],
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

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`
  };

  if (url.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://lakar-cad.local';
    headers['X-Title'] = 'Lakar CAD';
  }

  const response = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: headers,
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

async function callGemini(key, model, prompt, systemPrompt) {
  if (!key) throw new Error('API Key is missing. Please enter your Gemini key in Settings.');

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('No response from Gemini. Check your API key and model name.');

  return JSON.parse(content);
}
