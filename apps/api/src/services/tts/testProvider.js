export function createTestProvider() {
  return {
    name: "test",
    fileExtension: "mp3",
    async synthesize({ text }) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return Buffer.from(`AudioDoc CI test audio\n${text}`);
    }
  };
}
