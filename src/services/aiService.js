/**
 * AI Service: Core Six CAD & Context Loop Edition
 */

export const PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
  OLLAMA: 'ollama',
  LMSTUDIO: 'lmstudio',
};

const SYSTEM_PROMPT = `
You are a Senior CAD Engineer AI. You design 3D parts using the "Core Six" CAD tools.
You must ONLY output valid JSON. No other text.

--- CURRENT SCENE CONTEXT ---
{scene_context}
-----------------------------

CORE SIX TOOLS:

1. sketch_extrude(shapeType: "rect"|"circle", dims: [w,l], height, color, position)
2. apply_boolean(targetId: string, operation: "subtract", type: "hole", dims: [r], position)
   - Use this to put holes or cuts into existing objects.
3. create_pattern(sourceId: string, type: "linear"|"circular", count: int, spacing: float)
4. create_box(size, color, position)
5. create_gear(teeth, module, thickness, color, position)

REFERENCING OBJECTS:
- Look at the SCENE CONTEXT above. Every object has an "id".
- To modify an object (e.g. add a hole), you MUST use its "id" as the "targetId".

RESPONSE FORMAT:
{
  "tool": "tool_name",
  "params": { ... }
}

Example: "Add a hole to the center of the plate (obj_123)"
Output: {"tool": "apply_boolean", "params": {"targetId": "obj_123", "operation": "subtract", "type": "hole", "dims": [0.2], "position": [0,0,0]}}
`;

export async function callAI(provider, config, userPrompt, sceneContext = "The scene is currently empty.") {
  const { apiKey, baseUrl, model } = config;
  
  // Inject the scene context into the system prompt
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
