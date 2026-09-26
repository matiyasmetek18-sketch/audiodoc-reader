export function createBrowserProvider() {
  return {
    name: "browser",
    async synthesize() {
      const error = new Error("Browser TTS is handled by the frontend and does not create server audio.");
      error.status = 409;
      error.code = "BROWSER_TTS";
      throw error;
    }
  };
}
