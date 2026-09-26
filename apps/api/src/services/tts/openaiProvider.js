export function createOpenAiProvider(env) {
  return {
    name: "openai",
    async synthesize({ text, voice, speed, settings }) {
      const apiKey = settings?.openaiApiKey || env.openaiApiKey;
      if (!apiKey) throw missingKey("OPENAI_API_KEY");
      const response = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: settings?.openaiTtsModel || env.openaiTtsModel,
          voice: voice || settings?.openaiTtsVoice || env.openaiTtsVoice,
          input: text,
          instructions: "Speak with a masculine, deep, calm, steady narration style. Keep the pacing relaxed and clear.",
          speed: clamp(speed, 0.75, 2),
          response_format: "mp3"
        })
      });

      if (!response.ok) throw await providerError("OpenAI TTS", response);
      return Buffer.from(await response.arrayBuffer());
    }
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 1));
}

function missingKey(name) {
  const error = new Error(`${name} is required for this TTS provider.`);
  error.status = 400;
  return error;
}

async function providerError(provider, response) {
  const error = new Error(`${provider} request failed: ${response.status} ${await response.text()}`);
  error.status = 502;
  return error;
}
