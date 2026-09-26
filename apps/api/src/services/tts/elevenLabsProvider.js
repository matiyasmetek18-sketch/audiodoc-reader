export function createElevenLabsProvider(env) {
  return {
    name: "elevenlabs",
    async synthesize({ text, voice, speed, settings }) {
      const apiKey = settings?.elevenLabsApiKey || env.elevenLabsApiKey;
      if (!apiKey) throw missingKey("ELEVENLABS_API_KEY");
      const voiceId = voice || settings?.elevenLabsVoiceId || env.elevenLabsVoiceId;
      if (!voiceId) throw missingKey("ELEVENLABS_VOICE_ID");

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text,
          model_id: settings?.elevenLabsModelId || env.elevenLabsModelId,
          voice_settings: {
            stability: 0.6,
            similarity_boost: 0.78,
            style: 0.15,
            use_speaker_boost: true,
            speed: Math.min(1.2, Math.max(0.8, Number(speed) || 1))
          }
        })
      });

      if (!response.ok) throw await providerError("ElevenLabs TTS", response);
      return Buffer.from(await response.arrayBuffer());
    }
  };
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
