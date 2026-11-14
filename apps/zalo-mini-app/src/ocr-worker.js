// Zalo packages JSON assets. Reconstruct the compressed language model inside
// the worker so Tesseract can keep its standard model-loading path.
const fetchAsset = self.fetch.bind(self);
self.fetch = async (resource, options) => {
  const url = new URL(resource, self.location.href);
  if (url.pathname.split("/").pop() !== "eng.traineddata.gz") {
    return fetchAsset(resource, options);
  }

  const parts = await Promise.all(
    [0, 1].map(async (index) => {
      const response = await fetchAsset(
        new URL(`eng-model-${index}.json`, url),
      );
      if (!response.ok) throw new Error("Unable to load OCR language model");
      return Uint8Array.from(atob(await response.json()), (character) =>
        character.charCodeAt(0),
      );
    }),
  );
  return new Response(new Blob(parts));
};

importScripts("worker.min.js");
