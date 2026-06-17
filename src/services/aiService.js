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
You are a professional SketchUp-style CAD assistant. You help the user build precise 3D models.
UNITS: 1 unit = 1 meter.

You must ONLY output valid JSON. No markdown.

--- HIERARCHICAL SCENE CONTEXT ---
{scene_context}
-----------------------------

MODEL ORGANIZATION:
The model is a tree of nodes. Nodes can be Groups, Components, or Primitives.
Groups are containers. Primitives are the actual geometry.

AVAILABLE COMMANDS (via JSON tools):

1. create_primitive(type: "box", name: string, params: object, parentId: string, position: [x,y,z])
2. create_group(name: string, childrenIds: string[], parentId: string)
3. transform_node(id: string, position: [x,y,z], rotation: [x,y,z], scale: [x,y,z])
4. delete_node(id: string)

PRECISION:
If the user says "move it 5m to the right", update its position relative to its current position.
If the user says "make a 2m wide table", create a group with a box of [2, 0.05, 1] for the top.

RESPONSE FORMAT:
{
  "message": "Conversational explanation.",
  "tools": [
    { "tool": "create_primitive", "params": { "type": "box", "name": "Table Top", "params": { "w": 2, "h": 0.05, "d": 1 }, "position": [0, 0.75, 0] } }
  ]
}
`;

export async function callAI(provider, config, userPrompt, sceneContext = "The scene is currently empty.", imageUrl = null) {
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
        fullSystemPrompt,
        imageUrl
      );
    case PROVIDERS.OPENROUTER:
      return await callOpenAICompatible(
        'https://openrouter.ai/api/v1',
        apiKey,
        model || DEFAULT_MODELS[PROVIDERS.OPENROUTER],
        userPrompt,
        fullSystemPrompt,
        imageUrl
      );
    case PROVIDERS.GEMINI:
      return await callGemini(
        apiKey,
        model || DEFAULT_MODELS[PROVIDERS.GEMINI],
        userPrompt,
        fullSystemPrompt,
        imageUrl
      );
    case PROVIDERS.OLLAMA:
      return await callOllama(
        baseUrl || 'http://localhost:11434',
        model || DEFAULT_MODELS[PROVIDERS.OLLAMA],
        userPrompt,
        fullSystemPrompt,
        imageUrl
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

async function callOpenAICompatible(url, key, model, prompt, systemPrompt, imageUrl) {
  if (!key) throw new Error('API Key is missing. Please enter your OpenAI key in Settings.');

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`
  };

  if (url.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://lakar-cad.local';
    headers['X-Title'] = 'Lakar CAD';
  }

  const userContent = imageUrl 
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    : prompt;

  const response = await fetch(`${url}/chat/completions`, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
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

async function callOllama(url, model, prompt, systemPrompt, imageUrl) {
  let response;
  try {
    // Note: Ollama expects images as an array of base64 strings in the 'images' field
    const requestBody = {
      model: model,
      prompt: `${systemPrompt}\n\nUser request: ${prompt}\n\nRespond with ONLY valid JSON:`,
      stream: false,
      format: 'json'
    };
    
    if (imageUrl) {
      // Strip the data:image/jpeg;base64, prefix
      const base64Data = imageUrl.split(',')[1];
      if (base64Data) {
        requestBody.images = [base64Data];
      }
    }

    response = await fetch(`${url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });
  } catch (e) {
    throw new Error(`Cannot connect to Ollama at ${url}. Is Ollama running? (${e.message})`, { cause: e });
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
      'Use OpenAI or a local model (Ollama/LM Studio) instead, or set up a CORS proxy.',
      { cause: e },
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

// ─── Bone mapping AI call ─────────────────────────────────────────────────────
// Returns a parsed { mixamorigName: sourceBodyName, ... } object.
export async function callAIBoneMapping(config, unmappedMixamo, sourceBones) {
  const { provider, apiKey, baseUrl, model } = config;

  const systemPrompt =
    'You are a 3D rigging assistant. Your only job is to match bone names.\n' +
    'Return ONLY a JSON object with Mixamo joint names as keys and source bone names as values.\n' +
    'No explanation, no markdown, just raw JSON.';

  const userPrompt =
    'TARGET joints (Mixamo standard — fill these):\n' +
    unmappedMixamo.join(', ') +
    '\n\nSOURCE bones from the loaded model:\n' +
    sourceBones.join(', ') +
    '\n\nRules:\n' +
    '- Match each TARGET to the most likely SOURCE using name similarity.\n' +
    '- "UpperArm_L" → mixamorigLeftArm, "Thigh.R" → mixamorigRightUpLeg, "Bip01 L Calf" → mixamorigLeftLeg\n' +
    '- L/Left/_l/.l all mean Left; R/Right/_r/.r all mean Right.\n' +
    '- If no reasonable match exists, omit that joint — do not guess wildly.\n' +
    'Return ONLY a JSON object: { "mixamorigLeftArm": "UpperArm_L", ... }';

  const parseResult = (text) => {
    const clean = text.replace(/```json|```/g, '').trim();
    const obj = JSON.parse(clean);
    if (typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Expected a JSON object');
    return obj;
  };

  switch (provider) {
    case 'openai':
    case 'lmstudio':
    case 'openrouter': {
      const url = provider === 'openrouter'
        ? 'https://openrouter.ai/api/v1'
        : (baseUrl || 'https://api.openai.com/v1');
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://lakar-cad.local';
        headers['X-Title'] = 'Lakar CAD';
      }
      const res = await fetch(`${url}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model || (provider === 'openrouter' ? 'google/gemini-2.5-flash' : 'gpt-4o'),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return parseResult(data.choices?.[0]?.message?.content || '{}');
    }
    case 'gemini': {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model || 'gemini-2.5-flash'}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
            generationConfig: { response_mime_type: 'application/json', temperature: 0.1 },
          }),
        },
      );
      if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return parseResult(data.candidates?.[0]?.content?.parts?.[0]?.text || '{}');
    }
    case 'ollama': {
      const res = await fetch(`${baseUrl || 'http://localhost:11434'}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llama3',
          prompt: `${systemPrompt}\n\n${userPrompt}\n\nRespond with ONLY valid JSON:`,
          stream: false,
          format: 'json',
        }),
      }).catch((e) => { throw new Error(`Cannot connect to Ollama: ${e.message}`); });
      if (!res.ok) throw new Error(`Ollama error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return parseResult(data.response || '{}');
    }
    case 'anthropic': {
      let res;
      try {
        res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: model || 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        });
      } catch (e) {
        throw new Error('Anthropic API blocked by CORS. Use OpenAI or a local model instead.');
      }
      if (!res.ok) throw new Error(`Anthropic error ${res.status}: ${await res.text()}`);
      const data = await res.json();
      return parseResult(data.content?.[0]?.text || '{}');
    }
    default:
      throw new Error(`Unsupported provider: "${provider}"`);
  }
}

async function callGemini(key, model, prompt, systemPrompt, imageUrl) {
  if (!key) throw new Error('API Key is missing. Please enter your Gemini key in Settings.');

  // Extract base64 and mime type if image exists
  let parts = [{ text: prompt }];
  
  if (imageUrl) {
    const matches = imageUrl.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
    if (matches && matches.length === 3) {
      parts.push({
        inline_data: {
          mime_type: matches[1],
          data: matches[2]
        }
      });
    }
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: {
        parts: [{ text: systemPrompt }]
      },
      contents: [{
        role: "user",
        parts: parts
      }],
      generationConfig: {
        response_mime_type: "application/json",
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('No response from Gemini. Check your API key and model name.');

  return JSON.parse(content);
}
